import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'ticket_issued' | 'resale_sold' | 'resale_purchased' | 'waitlist_alert' | 'gate_update' | 'friend_going';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

class NotificationsService {
  /**
   * Pushes a notification to the decoupled asynchronous queue and persists in DB
   */
  notify(userId: string, type: NotificationItem['type'], title: string, message: string) {
    const id = `notif_${uuidv4()}`;
    const stmt = db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, read)
      VALUES (?, ?, ?, ?, ?, 0)
    `);
    stmt.run(id, userId, type, title, message);
    return id;
  }

  getUserNotifications(userId: string): NotificationItem[] {
    const rows = db.prepare(`
      SELECT id, user_id as userId, type, title, message, read, created_at as createdAt
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(userId) as any[];

    return rows.map(r => ({
      ...r,
      read: Boolean(r.read),
    }));
  }

  markAsRead(notificationId: string, userId: string) {
    db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`).run(notificationId, userId);
  }
}

export const notificationsService = new NotificationsService();
