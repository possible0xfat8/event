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
    const res = await fetch(`${API_BASE}/checkout`, {
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
    const res = await fetch(`${API_BASE}/events/${eventId}/going`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, visibility }),
    });
    return await res.json();
  },

  async getGoingStatus(eventId: string, userId?: string) {
    const res = await fetch(`${API_BASE}/events/${eventId}/going/status${userId ? `?userId=${userId}` : ''}`);
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
  async scanTicketOnline(signedToken: string, scannerDeviceId: string, gateEventId?: string) {
    const res = await fetch(`${API_BASE}/verify/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedToken, scannerDeviceId, gateEventId }),
    });
    return await res.json();
  },

  async getOfflineManifest(eventId: string): Promise<OfflineManifest | null> {
    const res = await fetch(`${API_BASE}/verify/manifest/${eventId}`);
    const data = await res.json();
    return data.manifest || null;
  },

  async syncOfflineScans(offlineScans: QueuedOfflineScan[]) {
    const res = await fetch(`${API_BASE}/verify/sync-offline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offlineScans }),
    });
    return await res.json();
  },

  // Organizer Analytics, Staff, Broadcast, Readiness & CSV Export
  async getOrganizerAnalytics(organizerId: string, viewerRole: string = 'organizer', force: boolean = false) {
    const res = await fetch(`${API_BASE}/organizer/analytics/${organizerId}?viewerRole=${viewerRole}${force ? '&force=true' : ''}`);
    return await res.json();
  },

  async getEventReadiness(organizerId: string, eventId: string) {
    const res = await fetch(`${API_BASE}/organizer/${organizerId}/events/${eventId}/readiness`);
    return await res.json();
  },

  async refundTicket(ticketId: string, organizerId: string, idempotencyKey?: string) {
    const res = await fetch(`${API_BASE}/organizer/refund-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId, organizerId, idempotencyKey }),
    });
    return await res.json();
  },

  async refundEvent(eventId: string, organizerId: string, idempotencyKey?: string) {
    const res = await fetch(`${API_BASE}/organizer/refund-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, organizerId, idempotencyKey }),
    });
    return await res.json();
  },

  async assignOrganizerStaff(organizerId: string, data: { staffUserId: string; eventId?: string; roleTitle?: string }) {
    const res = await fetch(`${API_BASE}/organizer/${organizerId}/staff/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await res.json();
  },

  async revokeOrganizerStaff(organizerId: string, assignmentId: string) {
    const res = await fetch(`${API_BASE}/organizer/${organizerId}/staff/${assignmentId}/revoke`, {
      method: 'POST',
    });
    return await res.json();
  },

  async sendEventBroadcast(organizerId: string, eventId: string, data: { title: string; message: string }) {
    const res = await fetch(`${API_BASE}/organizer/${organizerId}/events/${eventId}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await res.json();
  },

  async updateEventSettings(organizerId: string, eventId: string, settings: { resaleAllowed?: boolean; resalePriceCap?: number; capacity?: number }) {
    const res = await fetch(`${API_BASE}/organizer/${organizerId}/events/${eventId}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return await res.json();
  },

  async getEventGuestlist(organizerId: string, eventId: string) {
    const res = await fetch(`${API_BASE}/organizer/${organizerId}/events/${eventId}/guestlist`);
    return await res.json();
  },

  // CSV Export helper (triggers browser file download)
  downloadSalesCsv(organizerId: string, eventId?: string) {
    const url = eventId 
      ? `${API_BASE}/organizer/${organizerId}/events/${eventId}/export-csv`
      : `${API_BASE}/organizer/${organizerId}/export-csv`;
    window.open(url, '_blank');
  },

  // Super Admin API
  async getAdminOverview() {
    const res = await fetch(`${API_BASE}/admin/overview`);
    return await res.json();
  },

  async updateUserRole(userId: string, role: string) {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    return await res.json();
  },

  async updateEventStatus(eventId: string, status: string) {
    const res = await fetch(`${API_BASE}/admin/events/${eventId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return await res.json();
  },

  async broadcastNotification(title: string, message: string, type?: string) {
    const res = await fetch(`${API_BASE}/admin/system/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, type }),
    });
    return await res.json();
  },
};
