import { db } from '../db/index.js';
import { verificationService } from './verificationService.js';

export interface ReadinessChecklist {
  eventId: string;
  eventTitle: string;
  capacityPricingSet: boolean;
  resalePolicyConfigured: boolean;
  payoutAccountConnected: boolean;
  scannerTested: boolean;
  testScanCount: number;
  overallReady: boolean;
  scorePercentage: number;
}

export interface CachedDashboardMetrics {
  totalRevenue: number;
  totalTicketsSold: number;
  totalAdmitted: number;
  totalCapacity: number;
  admissionRatePercent: number;
  events: any[];
  recentScans: any[];
  fraudAlerts: any[];
  assignedStaff: any[];
  salesVelocityTimeline: Array<{ timeLabel: string; cumulativeSales: number; cumulativeAdmissions: number; hourlyRate: number }>;
}

// In-memory read-isolated dashboard cache (Short TTL cache layer)
const dashboardCache = new Map<string, { data: CachedDashboardMetrics; timestamp: number }>();
const CACHE_TTL_MS = 1500; // 1.5 second high-performance cache to isolate checkout write path

class OrganizerAnalyticsService {
  /**
   * Evaluates dynamic Pre-Event Readiness Checklist
   * Scanner item ONLY turns green after an actual verified scan is recorded in the system.
   */
  getEventReadiness(eventId: string): ReadinessChecklist | null {
    const event = db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId) as any;
    if (!event) return null;

    // 1. Capacity & Pricing set
    const capacityPricingSet = event.capacity > 0 && event.price !== null && event.price !== undefined;

    // 2. Resale policy configured
    const resalePolicyConfigured = event.resale_allowed !== null && event.resale_price_cap >= 1.0;

    // 3. Payout account connected & verified
    const orgProfile = db.prepare(`SELECT * FROM organizer_profiles WHERE user_id = ?`).get(event.organizer_id) as any;
    const payoutAccountConnected = Boolean(orgProfile && orgProfile.verification_status === 'verified' && orgProfile.payout_account_id);

    // 4. Scanner devices tested (MUST have at least 1 actual scan recorded in offline_scans_log)
    const scanCountRow = db.prepare(`
      SELECT COUNT(*) as count FROM offline_scans_log WHERE event_id = ?
    `).get(eventId) as any;

    const testScanCount = scanCountRow ? Number(scanCountRow.count) : 0;
    const scannerTested = testScanCount > 0;

    const checks = [capacityPricingSet, resalePolicyConfigured, payoutAccountConnected, scannerTested];
    const passedCount = checks.filter(Boolean).length;
    const scorePercentage = Math.round((passedCount / checks.length) * 100);

    return {
      eventId,
      eventTitle: event.title,
      capacityPricingSet,
      resalePolicyConfigured,
      payoutAccountConnected,
      scannerTested,
      testScanCount,
      overallReady: passedCount === checks.length,
      scorePercentage,
    };
  }

  /**
   * Retrieves dashboard telemetry from an isolated read query layer.
   * Enforces strict server-side RBAC: Staff accounts have revenue metrics completely stripped!
   */
  getOrganizerDashboard(organizerId: string, viewerRole: string = 'organizer', forceRefresh: boolean = false) {
    const isStaff = viewerRole === 'staff';
    const cacheKey = `${organizerId}_raw`;
    const now = Date.now();

    let cached = dashboardCache.get(cacheKey);

    if (!cached || forceRefresh || now - cached.timestamp > CACHE_TTL_MS) {
      // Execute isolated read-only queries
      const events = db.prepare(`SELECT * FROM events WHERE organizer_id = ? ORDER BY start_time DESC`).all(organizerId) as any[];

      let totalRevenue = 0;
      let totalTicketsSold = 0;
      let totalAdmitted = 0;
      let totalCapacity = 0;

      for (const evt of events) {
        totalCapacity += evt.capacity;
        const sold = evt.capacity - evt.tickets_remaining;
        totalTicketsSold += sold;
        totalRevenue += sold * evt.price;

        const admittedCount = (db.prepare(`
          SELECT COUNT(*) as count FROM tickets WHERE event_id = ? AND status = 'used'
        `).get(evt.id) as any).count;
        totalAdmitted += admittedCount;
      }

      // Recent scans feed
      const recentScans = db.prepare(`
        SELECT osl.*, t.owner_user_id, u.name as attendeeName, e.title as eventTitle
        FROM offline_scans_log osl
        JOIN tickets t ON osl.ticket_id = t.id
        JOIN users u ON t.owner_user_id = u.id
        JOIN events e ON osl.event_id = e.id
        WHERE e.organizer_id = ?
        ORDER BY osl.scanned_at DESC
        LIMIT 30
      `).all(organizerId) as any[];

      // Duplicate / Flagged fraud alerts with full actionable detail
      const fraudAlerts = db.prepare(`
        SELECT osl.*, t.owner_user_id, u.name as attendeeName, u.email as attendeeEmail, e.title as eventTitle, t.order_id
        FROM offline_scans_log osl
        JOIN tickets t ON osl.ticket_id = t.id
        JOIN users u ON t.owner_user_id = u.id
        JOIN events e ON osl.event_id = e.id
        WHERE e.organizer_id = ? AND osl.is_flagged_duplicate = 1
        ORDER BY osl.scanned_at DESC
      `).all(organizerId) as any[];

      // Assigned Staff
      const assignedStaff = db.prepare(`
        SELECT os.id as assignmentId, os.role_title, os.status as assignmentStatus, os.created_at as assignedAt,
               u.id as userId, u.name as staffName, u.email as staffEmail, u.avatar as staffAvatar, u.role as userRole,
               e.id as eventId, e.title as eventTitle
        FROM organizer_staff os
        JOIN users u ON os.staff_user_id = u.id
        LEFT JOIN events e ON os.event_id = e.id
        WHERE os.organizer_id = ? AND os.status = 'active'
        ORDER BY os.created_at DESC
      `).all(organizerId) as any[];

      // Build simulated live sales and check-in timeline for charts
      const salesVelocityTimeline = this.generateSalesCurve(events, totalTicketsSold, totalAdmitted);

      const computed: CachedDashboardMetrics = {
        totalRevenue,
        totalTicketsSold,
        totalAdmitted,
        totalCapacity,
        admissionRatePercent: totalTicketsSold > 0 ? Number(((totalAdmitted / totalTicketsSold) * 100).toFixed(1)) : 0,
        events,
        recentScans,
        fraudAlerts,
        assignedStaff,
        salesVelocityTimeline,
      };

      cached = { data: computed, timestamp: now };
      dashboardCache.set(cacheKey, cached);
    }

    const data = cached.data;

    // Strict Server-side RBAC Enforcement:
    // If user is staff, STRIP ALL REVENUE and PRICE values completely from output!
    if (isStaff) {
      return {
        success: true,
        isStaff: true,
        summary: {
          totalTicketsSold: data.totalTicketsSold,
          totalAdmitted: data.totalAdmitted,
          totalCapacity: data.totalCapacity,
          admissionRatePercent: data.admissionRatePercent,
          totalRevenue: undefined, // Stripped server-side
        },
        events: data.events.map(e => ({
          ...e,
          price: undefined, // Stripped server-side
        })),
        recentScans: data.recentScans,
        fraudAlerts: data.fraudAlerts,
        assignedStaff: data.assignedStaff,
        salesVelocityTimeline: data.salesVelocityTimeline,
      };
    }

    return {
      success: true,
      isStaff: false,
      summary: {
        totalRevenue: data.totalRevenue,
        totalTicketsSold: data.totalTicketsSold,
        totalAdmitted: data.totalAdmitted,
        totalCapacity: data.totalCapacity,
        admissionRatePercent: data.admissionRatePercent,
      },
      events: data.events,
      recentScans: data.recentScans,
      fraudAlerts: data.fraudAlerts,
      assignedStaff: data.assignedStaff,
      salesVelocityTimeline: data.salesVelocityTimeline,
    };
  }

  /**
   * Generates hourly sales curve for live sales chart
   */
  private generateSalesCurve(events: any[], totalSold: number, totalAdmitted: number) {
    const points = [];
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const fraction = i / steps;
      const hour = 18 + i; // 18:00 to 24:00
      points.push({
        timeLabel: `${hour}:00`,
        cumulativeSales: Math.round(totalSold * (0.3 + fraction * 0.7)),
        cumulativeAdmissions: Math.round(totalAdmitted * (fraction * fraction)),
        hourlyRate: Math.round((totalSold / steps) * (0.8 + Math.random() * 0.4)),
      });
    }
    return points;
  }

  /**
   * Generates RFC 4180 compliant CSV of orders, tickets, and fees
   */
  generateSalesCsv(organizerId: string, eventId?: string): string {
    let query = `
      SELECT o.id as orderId, t.id as ticketId, e.title as eventTitle, e.price as ticketPrice,
             e.category, e.venue_name as venueName, u.name as buyerName, u.email as buyerEmail,
             t.status as ticketStatus, t.created_at as purchasedAt, t.used_at as checkedInAt,
             t.used_by_device_id as scannerDeviceId, o.payment_intent_id as paymentRef
      FROM tickets t
      JOIN orders o ON t.order_id = o.id
      JOIN events e ON t.event_id = e.id
      JOIN users u ON t.owner_user_id = u.id
      WHERE e.organizer_id = ?
    `;

    const params: any[] = [organizerId];
    if (eventId) {
      query += ` AND e.id = ?`;
      params.push(eventId);
    }
    query += ` ORDER BY t.created_at DESC`;

    const rows = db.prepare(query).all(...params) as any[];

    // CSV Headers
    const headers = [
      'Order ID',
      'Ticket ID',
      'Event Title',
      'Category',
      'Venue',
      'Buyer Name',
      'Buyer Email',
      'Face Value ($)',
      'Platform Fee ($)',
      'Net Payout ($)',
      'Ticket Status',
      'Purchased At',
      'Admitted At',
      'Scanner Device',
      'Payment Reference',
    ];

    const csvLines = [headers.join(',')];

    for (const r of rows) {
      const price = Number(r.ticketPrice || 0);
      const fee = Number((price * 0.05).toFixed(2)); // 5% platform fee
      const net = Number((price - fee).toFixed(2));

      const line = [
        `"${r.orderId}"`,
        `"${r.ticketId}"`,
        `"${(r.eventTitle || '').replace(/"/g, '""')}"`,
        `"${r.category || ''}"`,
        `"${(r.venueName || '').replace(/"/g, '""')}"`,
        `"${(r.buyerName || '').replace(/"/g, '""')}"`,
        `"${(r.buyerEmail || '').replace(/"/g, '""')}"`,
        price.toFixed(2),
        fee.toFixed(2),
        net.toFixed(2),
        `"${r.ticketStatus}"`,
        `"${r.purchasedAt || ''}"`,
        `"${r.checkedInAt || ''}"`,
        `"${r.scannerDeviceId || ''}"`,
        `"${r.paymentRef || ''}"`,
      ];
      csvLines.push(line.join(','));
    }

    return csvLines.join('\r\n');
  }
}

export const organizerAnalyticsService = new OrganizerAnalyticsService();
