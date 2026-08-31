import { db } from '../db/index.js';
import { notificationsService } from './notificationsService.js';

export type GoingVisibility = 'private' | 'friends_only' | 'public';

export interface GoingRecord {
  userId: string;
  eventId: string;
  visibility: GoingVisibility;
  createdAt: string;
}

export interface FriendGoingInfo {
  friendId: string;
  friendName: string;
  avatar: string;
  visibility: GoingVisibility;
}

class SocialService {
  /**
   * Sets or updates attendance status for an event with strict privacy controls.
   * Default visibility is strictly 'private' per evnt.pdf §9.
   */
  setGoingStatus(userId: string, eventId: string, visibility: GoingVisibility = 'private') {
    const stmt = db.prepare(`
      INSERT INTO going (user_id, event_id, visibility, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, event_id) DO UPDATE SET
        visibility = excluded.visibility,
        created_at = CURRENT_TIMESTAMP
    `);

    stmt.run(userId, eventId, visibility);

    // If opted in as 'friends_only' or 'public', notify mutual friends who might be interested
    if (visibility !== 'private') {
      const user = db.prepare(`SELECT name FROM users WHERE id = ?`).get(userId) as any;
      const event = db.prepare(`SELECT title FROM events WHERE id = ?`).get(eventId) as any;

      const friends = this.getMutualFriends(userId);
      for (const friend of friends) {
        notificationsService.notify(
          friend.friendId,
          'friend_going',
          `Friend Going: ${event?.title || 'Event'}`,
          `${user?.name || 'Your friend'} is going to ${event?.title || 'an event'}!`
        );
      }
    }

    return this.getGoingStatus(userId, eventId);
  }

  /**
   * Retrieves the current user's going status for a specific event
   */
  getGoingStatus(userId: string, eventId: string): GoingRecord | null {
    const row = db.prepare(`
      SELECT user_id as userId, event_id as eventId, visibility, created_at as createdAt
      FROM going
      WHERE user_id = ? AND event_id = ?
    `).get(userId, eventId) as any;

    return row || null;
  }

  /**
   * Retrieves mutual friends for a user
   */
  getMutualFriends(userId: string): { friendId: string; friendName: string; avatar: string }[] {
    const rows = db.prepare(`
      SELECT f.friend_id as friendId, u.name as friendName, u.avatar
      FROM friends f
      JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ?
    `).all(userId) as any[];

    return rows;
  }

  /**
   * Queries which friends of the viewer are attending an event, strictly respecting privacy rules:
   * 1. If viewer is viewing, only friends with 'friends_only' or 'public' are returned.
   * 2. Friends who marked 'private' are NEVER revealed or counted for friends.
   * 3. Public attendees are visible to anyone.
   */
  getFriendsAttendingEvent(viewerUserId: string | null, eventId: string): {
    friendsGoingCount: number;
    friends: FriendGoingInfo[];
    publicCount: number;
  } {
    // 1. Calculate public attendance count
    const publicRow = db.prepare(`
      SELECT COUNT(*) as count
      FROM going
      WHERE event_id = ? AND visibility = 'public'
    `).get(eventId) as any;
    const publicCount = publicRow?.count || 0;

    if (!viewerUserId) {
      return { friendsGoingCount: 0, friends: [], publicCount };
    }

    // 2. Fetch mutual friends of viewer who have opted in to 'friends_only' or 'public'
    const friendRows = db.prepare(`
      SELECT g.user_id as friendId, u.name as friendName, u.avatar, g.visibility
      FROM going g
      JOIN friends f ON g.user_id = f.friend_id
      JOIN users u ON g.user_id = u.id
      WHERE f.user_id = ?
        AND g.event_id = ?
        AND (g.visibility = 'friends_only' OR g.visibility = 'public')
    `).all(viewerUserId, eventId) as any[];

    return {
      friendsGoingCount: friendRows.length,
      friends: friendRows,
      publicCount,
    };
  }

  /**
   * Adds a post-event photo or reaction (evnt.pdf §10.6 post-event loop)
   */
  addPostEventReview(eventId: string, userId: string, reaction: string, comment?: string, photoUrl?: string) {
    const id = `rev_${Date.now()}`;
    db.prepare(`
      INSERT INTO post_event_reviews (id, event_id, user_id, photo_url, reaction, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, eventId, userId, photoUrl || null, reaction, comment || null);

    return { success: true, id };
  }

  getPostEventReviews(eventId: string) {
    return db.prepare(`
      SELECT r.*, u.name as userName, u.avatar as userAvatar
      FROM post_event_reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.event_id = ?
      ORDER BY r.created_at DESC
    `).all(eventId);
  }
}

export const socialService = new SocialService();
