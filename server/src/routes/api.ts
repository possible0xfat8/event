import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { discoveryService } from '../services/discoveryService.js';
import { inventoryService } from '../services/inventoryService.js';
import { paymentsService } from '../services/paymentsService.js';
import { cryptoService } from '../services/cryptoService.js';
import { verificationService } from '../services/verificationService.js';
import { resaleService } from '../services/resaleService.js';
import { socialService, GoingVisibility } from '../services/socialService.js';
import { notificationsService } from '../services/notificationsService.js';

export const apiRouter = Router();

// ==========================================
// 1. Users & Identity (Switching for demo)
// ==========================================
apiRouter.get('/users', (_req: Request, res: Response) => {
  const users = db.prepare(`SELECT * FROM users ORDER BY name ASC`).all();
  res.json({ success: true, users });
});

apiRouter.get('/users/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true, user });
});

apiRouter.get('/users/:id/tickets', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const tickets = db.prepare(`
    SELECT t.*, e.title as eventTitle, e.start_time as eventStartTime, e.end_time as eventEndTime,
           e.venue_name as venueName, e.venue_address as venueAddress, e.price as originalPrice,
           e.image_url as imageUrl, e.category, e.resale_allowed as resaleAllowed, e.resale_price_cap as resalePriceCap
    FROM tickets t
    JOIN events e ON t.event_id = e.id
    WHERE t.owner_user_id = ?
    ORDER BY t.created_at DESC
  `).all(id);

  res.json({ success: true, tickets });
});

apiRouter.get('/users/:id/notifications', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const notifs = notificationsService.getUserNotifications(id);
  res.json({ success: true, notifications: notifs });
});

apiRouter.post('/users/:id/notifications/:notifId/read', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const notifId = String(req.params.notifId);
  notificationsService.markAsRead(notifId, id);
  res.json({ success: true });
});

// ==========================================
// 2. Discovery & Listings
// ==========================================
apiRouter.get('/events', (req: Request, res: Response) => {
  const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
  const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
  const radiusKm = req.query.radiusKm ? parseFloat(req.query.radiusKm as string) : undefined;
  const category = req.query.category as string | undefined;
  const timeFilter = req.query.timeFilter as any;
  const searchQuery = req.query.q as string | undefined;
  const viewerUserId = req.query.viewerUserId as string | undefined;

  const events = discoveryService.searchEvents({
    lat,
    lng,
    radiusKm,
    category,
    timeFilter,
    searchQuery,
    viewerUserId,
  });

  res.json({ success: true, events, count: events.length });
});

apiRouter.get('/events/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const viewerUserId = req.query.viewerUserId as string | undefined;
  const event = inventoryService.getEventById(id);
  if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

  const socialInfo = socialService.getFriendsAttendingEvent(viewerUserId || null, event.id);
  const reviews = socialService.getPostEventReviews(event.id);

  let parsedTags: string[] = [];
  try {
    parsedTags = JSON.parse(event.vibe_tags || '[]');
  } catch (_) {}

  res.json({
    success: true,
    event: {
      ...event,
      vibe_tags: parsedTags,
      friendsGoingCount: socialInfo.friendsGoingCount,
      friendsGoingPreview: socialInfo.friends,
      totalPublicGoingCount: socialInfo.publicCount,
      reviews,
    },
  });
});

apiRouter.post('/events', (req: Request, res: Response) => {
  try {
    const newEvent = inventoryService.createEvent(req.body);
    res.status(201).json({ success: true, event: newEvent });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/events/:id/reviews', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { userId, reaction, comment, photoUrl } = req.body;
  const result = socialService.addPostEventReview(id, userId, reaction, comment, photoUrl);
  res.json({ success: true, id: result.id });
});

// ==========================================
// 3. Purchase & Orders & Waitlist
// ==========================================
apiRouter.post('/orders/purchase', (req: Request, res: Response) => {
  const { eventId, buyerUserId, quantity, idempotencyKey, simulateIssuanceFailure } = req.body;

  const result = paymentsService.purchaseTickets({
    eventId,
    buyerUserId,
    quantity: Number(quantity || 1),
    idempotencyKey,
    simulateIssuanceFailure: Boolean(simulateIssuanceFailure),
  });

  if (!result.success) {
    const statusCode = result.isSoldOut ? 409 : 400;
    return res.status(statusCode).json(result);
  }

  res.status(200).json(result);
});

apiRouter.post('/events/:id/waitlist', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { userId } = req.body;
  const result = inventoryService.joinWaitlist(id, userId);
  res.json(result);
});

// ==========================================
// 4. Cryptographic Verification & Staff Gates
// ==========================================
apiRouter.get('/verify/public-key', (_req: Request, res: Response) => {
  res.json({ success: true, ...cryptoService.getPublicKeyInfo() });
});

apiRouter.post('/verify/scan', (req: Request, res: Response) => {
  const { token, scannerDeviceId, targetEventId } = req.body;
  const result = verificationService.verifyOnline({
    token,
    scannerDeviceId: scannerDeviceId || 'gate_online_scanner_1',
    targetEventId,
  });

  if (!result.valid) {
    const statusCode = result.status === 'already_used' ? 409 : 400;
    return res.status(statusCode).json(result);
  }

  res.json(result);
});

apiRouter.get('/verify/manifest/:eventId', (req: Request, res: Response) => {
  const eventId = String(req.params.eventId);
  const manifest = verificationService.getEventManifestForOfflineScanner(eventId);
  if (!manifest) return res.status(404).json({ success: false, error: 'Event not found' });
  res.json({ success: true, manifest });
});

apiRouter.post('/verify/sync-offline', (req: Request, res: Response) => {
  const { scans } = req.body;
  if (!Array.isArray(scans)) {
    return res.status(400).json({ success: false, error: 'Expected scans array' });
  }

  const result = verificationService.syncOfflineScans(scans);
  res.json({ success: true, ...result });
});

apiRouter.get('/verify/fraud-logs', (req: Request, res: Response) => {
  const eventId = req.query.eventId as string | undefined;
  const logs = verificationService.getFraudAuditLog(eventId);
  res.json({ success: true, logs });
});

// ==========================================
// 5. Peer-to-Peer Resale
// ==========================================
apiRouter.post('/resale/transfer', (req: Request, res: Response) => {
  const { ticketId, sellerId, buyerId, resalePrice } = req.body;
  const result = resaleService.transferTicket({
    ticketId,
    sellerId,
    buyerId,
    resalePrice: Number(resalePrice),
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

apiRouter.get('/resale/history', (req: Request, res: Response) => {
  const eventId = req.query.eventId as string | undefined;
  const history = resaleService.getResaleHistory(eventId);
  res.json({ success: true, history });
});

// ==========================================
// 6. Social / "Going" Layer
// ==========================================
apiRouter.post('/social/going', (req: Request, res: Response) => {
  const { userId, eventId, visibility } = req.body;
  const result = socialService.setGoingStatus(userId, eventId, (visibility as GoingVisibility) || 'private');
  res.json({ success: true, going: result });
});

apiRouter.get('/social/going/:eventId', (req: Request, res: Response) => {
  const eventId = String(req.params.eventId);
  const userId = req.query.userId as string | undefined;
  const going = userId ? socialService.getGoingStatus(userId, eventId) : null;
  const attending = socialService.getFriendsAttendingEvent(userId || null, eventId);

  res.json({
    success: true,
    userGoing: going,
    friendsAttending: attending,
  });
});

// ==========================================
// 7. Organizer Dashboard & Analytics
// ==========================================
apiRouter.get('/organizer/analytics/:organizerId', (req: Request, res: Response) => {
  const organizerId = String(req.params.organizerId);

  const events = db.prepare(`SELECT * FROM events WHERE organizer_id = ? ORDER BY start_time DESC`).all(organizerId) as any[];

  // Compute aggregate numbers
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

  // Recent scans for check-in velocity calculation (last 10 minutes)
  const recentScans = db.prepare(`
    SELECT osl.*, t.owner_user_id, u.name as attendeeName
    FROM offline_scans_log osl
    JOIN tickets t ON osl.ticket_id = t.id
    JOIN users u ON t.owner_user_id = u.id
    ORDER BY osl.scanned_at DESC
    LIMIT 30
  `).all() as any[];

  const fraudAlerts = verificationService.getFraudAuditLog();

  res.json({
    success: true,
    summary: {
      totalRevenue,
      totalTicketsSold,
      totalAdmitted,
      totalCapacity,
      admissionRatePercent: totalTicketsSold > 0 ? Number(((totalAdmitted / totalTicketsSold) * 100).toFixed(1)) : 0,
    },
    events,
    recentScans,
    fraudAlerts,
  });
});

apiRouter.post('/organizer/refund-ticket', (req: Request, res: Response) => {
  const { ticketId, organizerId } = req.body;
  const result = paymentsService.refundTicket(ticketId, organizerId || 'admin');
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});
