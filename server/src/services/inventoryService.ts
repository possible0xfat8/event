import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { notificationsService } from './notificationsService.js';

export interface EventRecord {
  id: string;
  organizer_id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  venue_name: string;
  venue_address: string;
  start_time: string;
  end_time: string;
  category: string;
  capacity: number;
  tickets_remaining: number;
  price: number;
  resale_allowed: number;
  resale_price_cap: number;
  status: string;
  image_url: string;
  vibe_tags: string;
  created_at: string;
}

class InventoryService {
  /**
   * Attempts an atomic inventory reservation / decrement at the database level.
   * Guarantees ZERO OVERSELL even under massive parallel spikes (evnt.pdf §5).
   */
  atomicDecrement(eventId: string, quantity: number): boolean {
    if (quantity <= 0) return false;

    // Use strict atomic UPDATE with row-count check
    const stmt = db.prepare(`
      UPDATE events
      SET tickets_remaining = tickets_remaining - ?
      WHERE id = ? AND tickets_remaining >= ? AND status = 'published'
    `);

    const result = stmt.run(quantity, eventId, quantity);
    return result.changes === 1;
  }

  /**
   * Restores inventory (on order failure / refund) and alerts waitlisted users.
   */
  atomicIncrement(eventId: string, quantity: number) {
    if (quantity <= 0) return;

    const stmt = db.prepare(`
      UPDATE events
      SET tickets_remaining = tickets_remaining + ?
      WHERE id = ?
    `);
    stmt.run(quantity, eventId);

    // Process waitlist auto-allocation / alert
    this.checkAndNotifyWaitlist(eventId, quantity);
  }

  /**
   * Adds a user to the event waitlist if sold out
   */
  joinWaitlist(eventId: string, userId: string): { success: boolean; position: number; error?: string } {
    const event = this.getEventById(eventId);
    if (!event) {
      return { success: false, position: 0, error: 'Event not found' };
    }

    const existing = db.prepare(`SELECT id FROM waitlist WHERE event_id = ? AND user_id = ? AND status = 'waiting'`).get(eventId, userId) as any;
    if (existing) {
      const pos = (db.prepare(`SELECT COUNT(*) as count FROM waitlist WHERE event_id = ? AND status = 'waiting' AND created_at <= (SELECT created_at FROM waitlist WHERE id = ?)`).get(eventId, existing.id) as any).count;
      return { success: true, position: pos };
    }

    const waitlistId = `wtl_${uuidv4()}`;
    db.prepare(`
      INSERT INTO waitlist (id, event_id, user_id, status)
      VALUES (?, ?, ?, 'waiting')
    `).run(waitlistId, eventId, userId);

    const pos = (db.prepare(`SELECT COUNT(*) as count FROM waitlist WHERE event_id = ? AND status = 'waiting'`).get(eventId) as any).count;
    return { success: true, position: pos };
  }

  /**
   * Notifies waitlist users when tickets become available
   */
  private checkAndNotifyWaitlist(eventId: string, countAvailable: number) {
    const event = this.getEventById(eventId);
    if (!event) return;

    const waitingUsers = db.prepare(`
      SELECT id, user_id
      FROM waitlist
      WHERE event_id = ? AND status = 'waiting'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(eventId, countAvailable) as unknown as { id: string; user_id: string }[];

    for (const entry of waitingUsers) {
      db.prepare(`UPDATE waitlist SET status = 'offered' WHERE id = ?`).run(entry.id);
      notificationsService.notify(
        entry.user_id,
        'waitlist_alert',
        `Ticket Available: ${event.title}`,
        `Good news! A ticket opened up for ${event.title}. Grab it before it sells out!`
      );
    }
  }

  getEventById(eventId: string): EventRecord | null {
    const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId);
    return (row as unknown as EventRecord) || null;
  }

  getAllEvents(): EventRecord[] {
    return db.prepare(`SELECT * FROM events ORDER BY start_time ASC`).all() as unknown as EventRecord[];
  }

  createEvent(data: Omit<EventRecord, 'id' | 'tickets_remaining' | 'created_at'>): EventRecord {
    const id = `evt_${uuidv4().slice(0, 8)}`;
    const stmt = db.prepare(`
      INSERT INTO events (
        id, organizer_id, title, description, lat, lng, venue_name, venue_address,
        start_time, end_time, category, capacity, tickets_remaining, price,
        resale_allowed, resale_price_cap, status, image_url, vibe_tags
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      id, data.organizer_id, data.title, data.description, data.lat, data.lng,
      data.venue_name, data.venue_address, data.start_time, data.end_time,
      data.category, data.capacity, data.capacity, data.price,
      data.resale_allowed ?? 1, data.resale_price_cap ?? 1.20,
      data.status || 'published', data.image_url, data.vibe_tags || '[]'
    );

    return this.getEventById(id)!;
  }
}

export const inventoryService = new InventoryService();
