import { EventItem, TicketItem, User, NotificationItem, FraudAlertLog, OfflineManifest, QueuedOfflineScan } from '../types';

const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Session persistence helpers
// ---------------------------------------------------------------------------
const SESSION_KEY = 'evnt_session_user_id';

export function getStoredUserId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setStoredUserId(userId: string) {
  localStorage.setItem(SESSION_KEY, userId);
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
}

// Fetch wrapper that auto-injects the x-user-id header for session auth
function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const userId = getStoredUserId();
  const headers = new Headers(init?.headers || {});
  if (userId) {
    headers.set('x-user-id', userId);
  }
  return fetch(url, { ...init, headers });
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------
export const api = {
  // =========== Authentication ===========
  async signup(data: {
    email: string;
    password: string;
    name: string;
    role?: 'attendee' | 'organizer';
    organizationName?: string;
    phone?: string;
  }): Promise<{ success: boolean; user?: User; profile?: any; error?: string }> {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success && result.user) {
      setStoredUserId(result.user.id);
    }
    return result;
  },

  async login(email: string, password: string): Promise<{ success: boolean; user?: User; profile?: any; error?: string }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const result = await res.json();
    if (result.success && result.user) {
      setStoredUserId(result.user.id);
    }
    return result;
  },

  async getSession(): Promise<{ success: boolean; user?: User; profile?: any }> {
    const userId = getStoredUserId();
    if (!userId) return { success: false };
    try {
      const res = await authFetch(`${API_BASE}/auth/session`);
      const data = await res.json();
      return data;
    } catch (_) {
      return { success: false };
    }
  },

  logout() {
    clearStoredSession();
  },

  // =========== User Data ===========
  async getUserTickets(userId: string): Promise<TicketItem[]> {
    try {
      const res = await authFetch(`${API_BASE}/users/${userId}/tickets`);
      const data = await res.json();
      if (data.success && data.tickets) {
        localStorage.setItem(`evnt_cached_tickets_${userId}`, JSON.stringify(data.tickets));
        return data.tickets;
      }
    } catch (_) {
      const cached = localStorage.getItem(`evnt_cached_tickets_${userId}`);
      if (cached) return JSON.parse(cached);
    }
    const cached = localStorage.getItem(`evnt_cached_tickets_${userId}`);
    return cached ? JSON.parse(cached) : [];
  },

  async getUserNotifications(userId: string): Promise<NotificationItem[]> {
    try {
      const res = await authFetch(`${API_BASE}/users/${userId}/notifications`);
      const data = await res.json();
      return data.notifications || [];
    } catch (_) {
      return [];
    }
  },

  async markNotificationRead(userId: string, notifId: string): Promise<void> {
    await authFetch(`${API_BASE}/users/${userId}/notifications/${notifId}/read`, { method: 'POST' });
  },

  // =========== Events & Discovery ===========
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

    const res = await authFetch(`${API_BASE}/events?${query.toString()}`);
    const data = await res.json();
    return data.events || [];
  },

  async getEventDetails(eventId: string, viewerUserId?: string): Promise<EventItem | null> {
    const query = viewerUserId ? `?viewerUserId=${viewerUserId}` : '';
    const res = await authFetch(`${API_BASE}/events/${eventId}${query}`);
    const data = await res.json();
    return data.event || null;
  },

  async createEvent(eventData: any): Promise<EventItem> {
    const res = await authFetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to create event');
    return data.event;
  },

  // =========== Purchases & Waitlist ===========
  async purchaseTicket(params: {
    eventId: string;
    buyerUserId: string;
    quantity: number;
    idempotencyKey: string;
  }): Promise<{ success: boolean; orderId?: string; tickets?: TicketItem[]; error?: string; isSoldOut?: boolean }> {
    const res = await authFetch(`${API_BASE}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  },

  async joinWaitlist(eventId: string, userId: string): Promise<{ success: boolean; position: number; error?: string }> {
    const res = await authFetch(`${API_BASE}/events/${eventId}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return await res.json();
  },

  // =========== Social "Going" ===========
  async setGoingStatus(userId: string, eventId: string, visibility: 'private' | 'friends_only' | 'public') {
    const res = await authFetch(`${API_BASE}/events/${eventId}/going`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, visibility }),
    });
    return await res.json();
  },

  async getGoingStatus(eventId: string, userId?: string) {
    const res = await authFetch(`${API_BASE}/events/${eventId}/going/status${userId ? `?userId=${userId}` : ''}`);
    return await res.json();
  },

  async submitEventReview(eventId: string, userId: string, reaction: string, comment?: string, photoUrl?: string) {
    const res = await authFetch(`${API_BASE}/events/${eventId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reaction, comment, photoUrl }),
    });
    return await res.json();
  },

  // =========== Peer-to-Peer Resale ===========
  async transferResaleTicket(params: {
    ticketId: string;
    sellerId: string;
    buyerId: string;
    resalePrice: number;
  }) {
    const res = await authFetch(`${API_BASE}/resale/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  },

  // =========== Cryptographic Verification & Offline Scanner ===========
  async scanTicketOnline(signedToken: string, scannerDeviceId: string, gateEventId?: string) {
    const res = await authFetch(`${API_BASE}/verify/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedToken, scannerDeviceId, gateEventId }),
    });
    return await res.json();
  },

  async getOfflineManifest(eventId: string): Promise<OfflineManifest | null> {
    const res = await authFetch(`${API_BASE}/verify/manifest/${eventId}`);
    const data = await res.json();
    return data.manifest || null;
  },

  async syncOfflineScans(offlineScans: QueuedOfflineScan[]) {
    const res = await authFetch(`${API_BASE}/verify/sync-offline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offlineScans }),
    });
    return await res.json();
  },

  // =========== Organizer Analytics, Staff, Broadcast, Readiness & CSV Export ===========
  async getOrganizerAnalytics(organizerId: string, viewerRole: string = 'organizer', force: boolean = false) {
    const res = await authFetch(`${API_BASE}/organizer/analytics/${organizerId}?viewerRole=${viewerRole}${force ? '&force=true' : ''}`);
    return await res.json();
  },

  async getEventReadiness(organizerId: string, eventId: string) {
    const res = await authFetch(`${API_BASE}/organizer/${organizerId}/events/${eventId}/readiness`);
    return await res.json();
  },

  async refundTicket(ticketId: string, organizerId: string, idempotencyKey?: string) {
    const res = await authFetch(`${API_BASE}/organizer/refund-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId, organizerId, idempotencyKey }),
    });
    return await res.json();
  },

  async refundEvent(eventId: string, organizerId: string, idempotencyKey?: string) {
    const res = await authFetch(`${API_BASE}/organizer/refund-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, organizerId, idempotencyKey }),
    });
    return await res.json();
  },

  async assignOrganizerStaff(organizerId: string, data: { staffUserId: string; eventId?: string; roleTitle?: string }) {
    const res = await authFetch(`${API_BASE}/organizer/${organizerId}/staff/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await res.json();
  },

  async revokeOrganizerStaff(organizerId: string, assignmentId: string) {
    const res = await authFetch(`${API_BASE}/organizer/${organizerId}/staff/${assignmentId}/revoke`, {
      method: 'POST',
    });
    return await res.json();
  },

  async sendEventBroadcast(organizerId: string, eventId: string, data: { title: string; message: string }) {
    const res = await authFetch(`${API_BASE}/organizer/${organizerId}/events/${eventId}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await res.json();
  },

  async updateEventSettings(organizerId: string, eventId: string, settings: { resaleAllowed?: boolean; resalePriceCap?: number; capacity?: number }) {
    const res = await authFetch(`${API_BASE}/organizer/${organizerId}/events/${eventId}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return await res.json();
  },

  async getEventGuestlist(organizerId: string, eventId: string) {
    const res = await authFetch(`${API_BASE}/organizer/${organizerId}/events/${eventId}/guestlist`);
    return await res.json();
  },

  downloadSalesCsv(organizerId: string, eventId?: string) {
    const url = eventId 
      ? `${API_BASE}/organizer/${organizerId}/events/${eventId}/export-csv`
      : `${API_BASE}/organizer/${organizerId}/export-csv`;
    window.open(url, '_blank');
  },

  // =========== Super Admin API ===========
  async getAdminOverview() {
    const res = await authFetch(`${API_BASE}/admin/overview`);
    return await res.json();
  },

  async updateUserRole(userId: string, role: string) {
    const res = await authFetch(`${API_BASE}/admin/users/${userId}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    return await res.json();
  },

  async updateEventStatus(eventId: string, status: string) {
    const res = await authFetch(`${API_BASE}/admin/events/${eventId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return await res.json();
  },

  async broadcastNotification(title: string, message: string, type?: string) {
    const res = await authFetch(`${API_BASE}/admin/system/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, type }),
    });
    return await res.json();
  },

  // =========== Onboarding & Verification ===========
  async guestCheckout(data: { email: string; name?: string; eventId: string; quantity: number; idempotencyKey?: string }) {
    const res = await fetch(`${API_BASE}/checkout/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await res.json();
  },

  async getOrganizerProfile(organizerId: string) {
    const res = await authFetch(`${API_BASE}/organizer/${organizerId}/profile`);
    return await res.json();
  },

  async initiateVerification(organizerId: string) {
    const res = await authFetch(`${API_BASE}/organizer/${organizerId}/verify/initiate`, {
      method: 'POST',
    });
    return await res.json();
  },

  async completeVerification(organizerId: string, outcome: 'approved' | 'rejected' | 'flagged' = 'approved') {
    const res = await authFetch(`${API_BASE}/organizer/${organizerId}/verify/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome }),
    });
    return await res.json();
  },

  async publishOrganizerEvent(organizerId: string, eventId: string) {
    const res = await authFetch(`${API_BASE}/organizer/${organizerId}/events/${eventId}/publish`, {
      method: 'POST',
    });
    return await res.json();
  },

  async getAdminVerificationQueue() {
    const res = await authFetch(`${API_BASE}/admin/verification-queue`);
    return await res.json();
  },

  async resolveAdminVerification(organizerId: string, action: 'approve' | 'reject') {
    const res = await authFetch(`${API_BASE}/admin/verification-queue/${organizerId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    return await res.json();
  },
};
