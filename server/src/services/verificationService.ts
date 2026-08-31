import { db } from '../db/index.js';
import { cryptoService } from './cryptoService.js';
import { v4 as uuidv4 } from 'uuid';

export interface VerifyOnlineRequest {
  token: string;
  scannerDeviceId: string;
  targetEventId?: string;
}

export interface VerifyOnlineResponse {
  valid: boolean;
  status: 'admitted' | 'already_used' | 'revoked' | 'refunded' | 'invalid_signature' | 'wrong_event' | 'expired';
  ticketId?: string;
  ownerName?: string;
  eventTitle?: string;
  usedAt?: string;
  error?: string;
}

export interface OfflineManifest {
  eventId: string;
  eventTitle: string;
  publicKeyPem: string;
  validTicketIds: string[]; // Set of all issued valid tickets for this event
  syncedAt: string;
}

export interface OfflineScanEntry {
  ticketId: string;
  token: string;
  scannerDeviceId: string;
  scannedAt: string;
}

export interface SyncOfflineResult {
  totalSynced: number;
  admittedCount: number;
  duplicateFraudCount: number;
  fraudAlerts: Array<{
    ticketId: string;
    eventTitle: string;
    scannersInvolved: string[];
    scannedTimes: string[];
  }>;
}

class VerificationService {
  /**
   * Online Atomic Verification:
   * 1. Cryptographically verify the Ed25519 signature
   * 2. Atomically check and mark ticket status = 'used' in a single SQL operation
   * Guarantees that two online scanners hitting the same ticket will have exactly one succeed and one fail.
   */
  verifyOnline(req: VerifyOnlineRequest): VerifyOnlineResponse {
    const { token, scannerDeviceId, targetEventId } = req;

    // 1. Signature Verification
    const cryptoResult = cryptoService.verifyTicketToken(token);
    if (!cryptoResult.valid || !cryptoResult.payload) {
      return {
        valid: false,
        status: 'invalid_signature',
        error: cryptoResult.error || 'Invalid cryptographic signature',
      };
    }

    const { ticketId, eventId } = cryptoResult.payload;

    if (targetEventId && targetEventId !== eventId) {
      return {
        valid: false,
        status: 'wrong_event',
        ticketId,
        error: 'Ticket is for a different event',
      };
    }

    // 2. Fetch ticket & event metadata for staff feedback
    const ticket = db.prepare(`
      SELECT t.*, u.name as ownerName, e.title as eventTitle
      FROM tickets t
      JOIN users u ON t.owner_user_id = u.id
      JOIN events e ON t.event_id = e.id
      WHERE t.id = ?
    `).get(ticketId) as any;

    if (!ticket) {
      return { valid: false, status: 'invalid_signature', error: 'Ticket record not found in system' };
    }

    if (ticket.status === 'revoked') {
      return { valid: false, status: 'revoked', ticketId, ownerName: ticket.ownerName, error: 'Ticket was revoked (e.g. resold)' };
    }

    if (ticket.status === 'refunded') {
      return { valid: false, status: 'refunded', ticketId, ownerName: ticket.ownerName, error: 'Ticket was refunded' };
    }

    if (ticket.status === 'used') {
      return {
        valid: false,
        status: 'already_used',
        ticketId,
        ownerName: ticket.ownerName,
        usedAt: ticket.used_at,
        error: `Ticket already scanned at ${ticket.used_at || 'earlier'} by ${ticket.used_by_device_id || 'another door'}`,
      };
    }

    // 3. ATOMIC CHECK-AND-MARK:
    // Update WHERE status = 'valid' and check affected rows
    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE tickets
      SET status = 'used', used_at = ?, used_by_device_id = ?
      WHERE id = ? AND status = 'valid'
    `);

    const result = updateStmt.run(now, scannerDeviceId || 'scanner_gate_default', ticketId);

    if (result.changes === 1) {
      // Record scan audit log
      db.prepare(`
        INSERT INTO offline_scans_log (id, ticket_id, event_id, scanner_device_id, scanned_at, synced_at, sync_status, is_flagged_duplicate)
        VALUES (?, ?, ?, ?, ?, ?, 'synced', 0)
      `).run(`scan_${uuidv4()}`, ticketId, eventId, scannerDeviceId || 'scanner_gate_default', now, now);

      return {
        valid: true,
        status: 'admitted',
        ticketId,
        ownerName: ticket.ownerName,
        eventTitle: ticket.eventTitle,
        usedAt: now,
      };
    } else {
      // Another concurrent scanner checked it in during the microsecond window!
      return {
        valid: false,
        status: 'already_used',
        ticketId,
        ownerName: ticket.ownerName,
        error: 'Ticket was just scanned at another gate concurrently!',
      };
    }
  }

  /**
   * Pre-sync download manifest for offline staff gates before doors open.
   */
  getEventManifestForOfflineScanner(eventId: string): OfflineManifest | null {
    const event = db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId) as any;
    if (!event) return null;

    const validTickets = db.prepare(`
      SELECT id FROM tickets WHERE event_id = ? AND status = 'valid'
    `).all(eventId) as { id: string }[];

    const pubKey = cryptoService.getPublicKeyInfo();

    return {
      eventId,
      eventTitle: event.title,
      publicKeyPem: pubKey.pem,
      validTicketIds: validTickets.map(t => t.id),
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * Reconciles batch scans collected while scanner devices were offline.
   * Detects multi-scanner duplicate races and flags fraud for staff review (§6).
   */
  syncOfflineScans(scans: OfflineScanEntry[]): SyncOfflineResult {
    let admittedCount = 0;
    let duplicateFraudCount = 0;
    const fraudAlerts: SyncOfflineResult['fraudAlerts'] = [];

    const reconcileTransaction = db.transaction(() => {
      for (const scan of scans) {
        const cryptoResult = cryptoService.verifyTicketToken(scan.token);
        if (!cryptoResult.valid || !cryptoResult.payload) continue;

        const ticketId = cryptoResult.payload.ticketId;
        const eventId = cryptoResult.payload.eventId;

        const existingTicket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as any;
        if (!existingTicket) continue;

        const isAlreadyUsed = existingTicket.status === 'used';

        // Check if there are already prior scan logs for this ticket
        const existingLogs = db.prepare(`
          SELECT * FROM offline_scans_log WHERE ticket_id = ?
        `).all(ticketId) as any[];

        const isDuplicate = isAlreadyUsed || existingLogs.length > 0;

        if (isDuplicate) {
          // Flag as duplicate fraud entry!
          duplicateFraudCount++;
          const scanLogId = `scan_${uuidv4()}`;
          db.prepare(`
            INSERT INTO offline_scans_log (id, ticket_id, event_id, scanner_device_id, scanned_at, synced_at, sync_status, is_flagged_duplicate)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'duplicate_flagged', 1)
          `).run(scanLogId, ticketId, eventId, scan.scannerDeviceId, scan.scannedAt);

          // Mark previous logs for this ticket as duplicate as well
          db.prepare(`UPDATE offline_scans_log SET is_flagged_duplicate = 1 WHERE ticket_id = ?`).run(ticketId);

          const event = db.prepare(`SELECT title FROM events WHERE id = ?`).get(eventId) as any;
          const allScanners = [
            ...existingLogs.map(l => l.scanner_device_id),
            scan.scannerDeviceId
          ];
          const allTimes = [
            ...existingLogs.map(l => l.scanned_at),
            scan.scannedAt
          ];

          fraudAlerts.push({
            ticketId,
            eventTitle: event?.title || 'Event',
            scannersInvolved: Array.from(new Set(allScanners)),
            scannedTimes: allTimes,
          });
        } else {
          // Mark ticket used
          db.prepare(`
            UPDATE tickets
            SET status = 'used', used_at = ?, used_by_device_id = ?
            WHERE id = ?
          `).run(scan.scannedAt, scan.scannerDeviceId, ticketId);

          const scanLogId = `scan_${uuidv4()}`;
          db.prepare(`
            INSERT INTO offline_scans_log (id, ticket_id, event_id, scanner_device_id, scanned_at, synced_at, sync_status, is_flagged_duplicate)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'synced', 0)
          `).run(scanLogId, ticketId, eventId, scan.scannerDeviceId, scan.scannedAt);

          admittedCount++;
        }
      }
    });

    reconcileTransaction();

    return {
      totalSynced: scans.length,
      admittedCount,
      duplicateFraudCount,
      fraudAlerts,
    };
  }

  /**
   * Retrieves all flagged duplicate scans for the Organizer Security Dashboard
   */
  getFraudAuditLog(eventId?: string) {
    const query = eventId
      ? `SELECT osl.*, t.owner_user_id, u.name as ownerName, e.title as eventTitle
         FROM offline_scans_log osl
         JOIN tickets t ON osl.ticket_id = t.id
         JOIN users u ON t.owner_user_id = u.id
         JOIN events e ON osl.event_id = e.id
         WHERE osl.is_flagged_duplicate = 1 AND osl.event_id = ?
         ORDER BY osl.scanned_at DESC`
      : `SELECT osl.*, t.owner_user_id, u.name as ownerName, e.title as eventTitle
         FROM offline_scans_log osl
         JOIN tickets t ON osl.ticket_id = t.id
         JOIN users u ON t.owner_user_id = u.id
         JOIN events e ON osl.event_id = e.id
         WHERE osl.is_flagged_duplicate = 1
         ORDER BY osl.scanned_at DESC`;

    return eventId ? db.prepare(query).all(eventId) : db.prepare(query).all();
  }
}

export const verificationService = new VerificationService();
