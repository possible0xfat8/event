import { EventItem, TicketItem, User, NotificationItem, FraudAlertLog, OfflineManifest, QueuedOfflineScan } from '../types';

const API_BASE = '/api';

export const api = {
  // Users
  async getUsers(): Promise<User[]> {
    const res = await fetch(`${API_BASE}/users`);
    const data = await res.json();
    return data.users || [];
  },

  async getUserTickets(userId: string): Promise<TicketItem[]> {
    try {
      const res = await fetch(`${API_BASE}/users/${userId}/tickets`);
      const data = await res.json();
      if (data.success && data.tickets) {
        // Cache tickets in localStorage for 100% offline gate entry!
        localStorage.setItem(`evnt_cached_tickets_${userId}`, JSON.stringify(data.tickets));
        return data.tickets;
      }
    } catch (_) {
      // Fallback to offline cached tickets
      const cached = localStorage.getItem(`evnt_cached_tickets_${userId}`);
      if (cached) return JSON.parse(cached);
    }
    const cached = localStorage.getItem(`evnt_cached_tickets_${userId}`);
    return cached ? JSON.parse(cached) : [];
  },

  async getUserNotifications(userId: string): Promise<NotificationItem[]> {
    try {
      const res = await fetch(`${API_BASE}/users/${userId}/notifications`);
      const data = await res.json();
      return data.notifications || [];
    } catch (_) {
      return [];
    }
  },

  async markNotificationRead(userId: string, notifId: string): Promise<void> {
    await fetch(`${API_BASE}/users/${userId}/notifications/${notifId}/read`, { method: 'POST' });
  },

  // Events & Discovery
  async searchEvents(params: {
    lat?: number;
    lng?: number;
    radiusKm?: number;
    category?: string;
    timeFilter?: string;
    q?: string;
    viewerUserId?: string;
  }): Promise<EventItem[]> {
    const query = new URLSearchParams();
    if (params.lat !== undefined) query.set('lat', params.lat.toString());
    if (params.lng !== undefined) query.set('lng', params.lng.toString());
    if (params.radiusKm !== undefined) query.set('radiusKm', params.radiusKm.toString());
    if (params.category && params.category !== 'all') query.set('category', params.category);
    if (params.timeFilter) query.set('timeFilter', params.timeFilter);
    if (params.q) query.set('q', params.q);
    if (params.viewerUserId) query.set('viewerUserId', params.viewerUserId);

    const res = await fetch(`${API_BASE}/events?${query.toString()}`);
    const data = await res.json();
    return data.events || [];
  },

  async getEventDetails(eventId: string, viewerUserId?: string): Promise<EventItem | null> {
    const query = viewerUserId ? `?viewerUserId=${viewerUserId}` : '';
    const res = await fetch(`${API_BASE}/events/${eventId}${query}`);
    const data = await res.json();
    return data.event || null;
  },

  async createEvent(eventData: any): Promise<EventItem> {
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to create event');
    return data.event;
  },

  // Purchases & Waitlist
  async purchaseTicket(params: {
    eventId: string;
    buyerUserId: string;
    quantity: number;
    idempotencyKey: string;
  }): Promise<{ success: boolean; orderId?: string; tickets?: TicketItem[]; error?: string; isSoldOut?: boolean }> {
    const res = await fetch(`${API_BASE}/orders/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  },

  async joinWaitlist(eventId: string, userId: string): Promise<{ success: boolean; position: number; error?: string }> {
    const res = await fetch(`${API_BASE}/events/${eventId}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return await res.json();
  },

  // Social "Going"
  async setGoingStatus(userId: string, eventId: string, visibility: 'private' | 'friends_only' | 'public') {
    const res = await fetch(`${API_BASE}/social/going`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, eventId, visibility }),
    });
    return await res.json();
  },

  async getGoingStatus(eventId: string, userId?: string) {
    const res = await fetch(`${API_BASE}/social/going/${eventId}${userId ? `?userId=${userId}` : ''}`);
    return await res.json();
  },

  async submitEventReview(eventId: string, userId: string, reaction: string, comment?: string, photoUrl?: string) {
    const res = await fetch(`${API_BASE}/events/${eventId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reaction, comment, photoUrl }),
    });
    return await res.json();
  },

  // Peer-to-Peer Resale
  async transferResaleTicket(params: {
    ticketId: string;
    sellerId: string;
    buyerId: string;
    resalePrice: number;
  }) {
    const res = await fetch(`${API_BASE}/resale/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  },

  // Cryptographic Verification & Offline Scanner
  async getPublicKey(): Promise<{ pem: string; rawBase64: string }> {
    const res = await fetch(`${API_BASE}/verify/public-key`);
    return await res.json();
  },

  async scanTicketOnline(token: string, scannerDeviceId: string, targetEventId?: string) {
    const res = await fetch(`${API_BASE}/verify/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, scannerDeviceId, targetEventId }),
    });
    return await res.json();
  },

  async getOfflineManifest(eventId: string): Promise<OfflineManifest | null> {
    const res = await fetch(`${API_BASE}/verify/manifest/${eventId}`);
    const data = await res.json();
    return data.manifest || null;
  },

  async syncOfflineScans(scans: QueuedOfflineScan[]) {
    const res = await fetch(`${API_BASE}/verify/sync-offline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scans }),
    });
    return await res.json();
  },

  // Organizer Analytics
  async getOrganizerAnalytics(organizerId: string) {
    const res = await fetch(`${API_BASE}/organizer/analytics/${organizerId}`);
    return await res.json();
  },

  async refundTicket(ticketId: string, organizerId: string) {
    const res = await fetch(`${API_BASE}/organizer/refund-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId, organizerId }),
    });
    return await res.json();
  },
};
