import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
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
// 1. Users & Identity
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

// ==========================================
// 3. Purchase & Reservation Flow
// ==========================================
const handlePurchase = (req: Request, res: Response) => {
  const { eventId, buyerUserId, quantity, idempotencyKey, simulateIssuanceFailure } = req.body;

  if (!eventId || !buyerUserId || !quantity || !idempotencyKey) {
    return res.status(400).json({ success: false, error: 'Missing required purchase parameters' });
  }

  const result = paymentsService.purchaseTickets({
    eventId,
    buyerUserId,
    quantity: Number(quantity),
    idempotencyKey,
    simulateIssuanceFailure: Boolean(simulateIssuanceFailure),
  });

  if (!result.success) {
    if (result.isSoldOut) {
      return res.status(409).json(result); // 409 Conflict / Sold out
    }
    return res.status(400).json(result); // 400 Failed with compensation
  }

  res.status(200).json(result);
};

apiRouter.post('/orders/purchase', handlePurchase);
apiRouter.post('/checkout', handlePurchase);

// ==========================================
// 4. Waitlist Queue
// ==========================================
apiRouter.post('/events/:id/waitlist', (req: Request, res: Response) => {
  const eventId = String(req.params.id);
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

  const result = inventoryService.joinWaitlist(eventId, userId);
  res.json(result);
});

// ==========================================
// 5. Verification & Gate Scanning
// ==========================================
apiRouter.get('/verify/public-key', (_req: Request, res: Response) => {
  const info = cryptoService.getPublicKeyInfo();
  res.json({
    success: true,
    pem: info.pem,
    rawBase64: info.rawBase64,
  });
});

apiRouter.post('/verify/scan', (req: Request, res: Response) => {
  const token = req.body.token || req.body.signedToken;
  const scannerDeviceId = req.body.scannerDeviceId || 'scanner_handheld_default';
  const targetEventId = req.body.targetEventId || req.body.gateEventId;

  if (!token) return res.status(400).json({ valid: false, error: 'token or signedToken required' });

  const result = verificationService.verifyOnline({
    token,
    scannerDeviceId,
    targetEventId,
  });

  if (!result.valid) {
    if (result.status === 'already_used') {
      return res.status(409).json(result);
    }
    return res.status(400).json(result);
  }

  res.status(200).json(result);
});

apiRouter.get('/verify/manifest/:eventId', (req: Request, res: Response) => {
  const eventId = String(req.params.eventId);
  const manifest = verificationService.getEventManifestForOfflineScanner(eventId);
  if (!manifest) return res.status(404).json({ success: false, error: 'Event not found for manifest' });
  res.json({ success: true, manifest });
});

apiRouter.post('/verify/sync-offline', (req: Request, res: Response) => {
  const scans = req.body.scans || req.body.offlineScans;
  if (!Array.isArray(scans)) {
    return res.status(400).json({ success: false, error: 'scans array expected' });
  }

  const summary = verificationService.syncOfflineScans(scans);
  res.json({ success: true, ...summary });
});

// ==========================================
// 6. Verified P2P Resale Transfers
// ==========================================
apiRouter.post('/resale/transfer', (req: Request, res: Response) => {
  const { ticketId, sellerId, buyerId, resalePrice } = req.body;
  if (!ticketId || !sellerId || !buyerId || resalePrice === undefined) {
    return res.status(400).json({ success: false, error: 'Missing transfer parameters' });
  }

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

// ==========================================
// 7. Privacy-First "Going" Social Graph
// ==========================================
const handleSetGoing = (req: Request, res: Response) => {
  const eventId = String(req.params.id || req.body.eventId);
  const { userId, visibility } = req.body;

  if (!userId || !visibility || !eventId) {
    return res.status(400).json({ success: false, error: 'userId, eventId, and visibility required' });
  }

  socialService.setGoingStatus(userId, eventId, visibility as GoingVisibility);
  res.json({ success: true, eventId, visibility });
};

apiRouter.post('/social/going', handleSetGoing);
apiRouter.post('/events/:id/going', handleSetGoing);

apiRouter.get('/social/going/:eventId', (req: Request, res: Response) => {
  const eventId = String(req.params.eventId);
  const userId = req.query.userId as string;
  const status = socialService.getGoingStatus(userId || '', eventId);
  res.json({ success: true, userGoing: status });
});

apiRouter.get('/events/:id/going/status', (req: Request, res: Response) => {
  const eventId = String(req.params.id);
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ success: false, error: 'userId query param required' });

  const status = socialService.getGoingStatus(userId, eventId);
  res.json({ success: true, userGoing: status });
});

// ==========================================
// 8. Post-Event Reviews & Memory Loops
// ==========================================
apiRouter.post('/events/:id/reviews', (req: Request, res: Response) => {
  const eventId = String(req.params.id);
  const { userId, reaction, comment, photoUrl } = req.body;

  if (!userId || !reaction) {
    return res.status(400).json({ success: false, error: 'userId and reaction required' });
  }

  const result = socialService.addPostEventReview(eventId, userId, reaction, comment, photoUrl);
  res.status(201).json(result);
});

// ==========================================
// 9. Organizer Real-Time Operations, Staff & Telemetry
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

  // Assigned Staff Members for this Organizer
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
    assignedStaff,
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

// Organizer: Assign Staff Role to User
apiRouter.post('/organizer/:organizerId/staff/assign', (req: Request, res: Response) => {
  const organizerId = String(req.params.organizerId);
  const { staffUserId, eventId, roleTitle } = req.body;

  if (!staffUserId) {
    return res.status(400).json({ success: false, error: 'staffUserId is required' });
  }

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(staffUserId) as any;
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found to assign staff role' });
  }

  // Grant 'staff' role if currently 'attendee'
  if (user.role === 'attendee') {
    db.prepare(`UPDATE users SET role = 'staff' WHERE id = ?`).run(staffUserId);
  }

  const assignmentId = `stf_${uuidv4()}`;
  db.prepare(`
    INSERT INTO organizer_staff (id, organizer_id, staff_user_id, event_id, role_title, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(
    assignmentId,
    organizerId,
    staffUserId,
    eventId || null,
    roleTitle || 'Door Gate Scanner'
  );

  // Notify the assigned staff user
  const organizer = db.prepare(`SELECT name FROM users WHERE id = ?`).get(organizerId) as any;
  const event = eventId ? db.prepare(`SELECT title FROM events WHERE id = ?`).get(eventId) as any : null;
  
  notificationsService.notify(
    staffUserId,
    'gate_update',
    '🎉 You were assigned as Door Staff!',
    `Organizer ${organizer?.name || 'an event organizer'} assigned you as "${roleTitle || 'Gate Scanner'}" for ${event?.title || 'all team events'}. You now have scanner access.`
  );

  res.json({
    success: true,
    assignmentId,
    staffUserId,
    roleTitle: roleTitle || 'Door Gate Scanner',
  });
});

// Organizer: Revoke Staff Role
apiRouter.post('/organizer/:organizerId/staff/:assignmentId/revoke', (req: Request, res: Response) => {
  const organizerId = String(req.params.organizerId);
  const assignmentId = String(req.params.assignmentId);

  const assignment = db.prepare(`
    SELECT * FROM organizer_staff WHERE id = ? AND organizer_id = ?
  `).get(assignmentId, organizerId) as any;

  if (!assignment) {
    return res.status(404).json({ success: false, error: 'Staff assignment not found' });
  }

  // Mark assignment revoked
  db.prepare(`UPDATE organizer_staff SET status = 'revoked' WHERE id = ?`).run(assignmentId);

  // Check if staff user has any other active staff assignments
  const remainingActive = db.prepare(`
    SELECT COUNT(*) as count FROM organizer_staff WHERE staff_user_id = ? AND status = 'active'
  `).get(assignment.staff_user_id) as any;

  if (remainingActive.count === 0) {
    // Revert role to attendee if they are not super admin or organizer
    const targetUser = db.prepare(`SELECT role FROM users WHERE id = ?`).get(assignment.staff_user_id) as any;
    if (targetUser && targetUser.role === 'staff') {
      db.prepare(`UPDATE users SET role = 'attendee' WHERE id = ?`).run(assignment.staff_user_id);
    }
  }

  res.json({ success: true, assignmentId, revoked: true });
});

// Organizer: Targeted Broadcast to Event Attendees
apiRouter.post('/organizer/:organizerId/events/:eventId/broadcast', (req: Request, res: Response) => {
  const organizerId = String(req.params.organizerId);
  const eventId = String(req.params.eventId);
  const { title, message } = req.body;

  if (!title || !message) {
    return res.status(400).json({ success: false, error: 'title and message required' });
  }

  const event = db.prepare(`SELECT * FROM events WHERE id = ? AND organizer_id = ?`).get(eventId, organizerId) as any;
  if (!event) {
    return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });
  }

  // Find all ticket holders for this event
  const ticketHolders = db.prepare(`
    SELECT DISTINCT owner_user_id as userId FROM tickets WHERE event_id = ? AND status = 'valid'
  `).all(eventId) as { userId: string }[];

  for (const holder of ticketHolders) {
    notificationsService.notify(
      holder.userId,
      'gate_update',
      title,
      `[${event.title}] ${message}`
    );
  }

  res.json({
    success: true,
    eventId,
    eventTitle: event.title,
    sentCount: ticketHolders.length,
  });
});

// Organizer: Update Event Resale Rules & Capacity
apiRouter.post('/organizer/:organizerId/events/:eventId/settings', (req: Request, res: Response) => {
  const organizerId = String(req.params.organizerId);
  const eventId = String(req.params.eventId);
  const { resaleAllowed, resalePriceCap, capacity } = req.body;

  const event = db.prepare(`SELECT * FROM events WHERE id = ? AND organizer_id = ?`).get(eventId, organizerId) as any;
  if (!event) {
    return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });
  }

  if (resaleAllowed !== undefined) {
    db.prepare(`UPDATE events SET resale_allowed = ? WHERE id = ?`).run(resaleAllowed ? 1 : 0, eventId);
  }

  if (resalePriceCap !== undefined && Number(resalePriceCap) >= 1.0) {
    db.prepare(`UPDATE events SET resale_price_cap = ? WHERE id = ?`).run(Number(resalePriceCap), eventId);
  }

  if (capacity !== undefined && Number(capacity) >= event.capacity) {
    const diff = Number(capacity) - event.capacity;
    db.prepare(`
      UPDATE events 
      SET capacity = ?, tickets_remaining = tickets_remaining + ?
      WHERE id = ?
    `).run(Number(capacity), diff, eventId);
  }

  const updated = db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId);
  res.json({ success: true, event: updated });
});

// Organizer: Attendee Guestlist Inspection
apiRouter.get('/organizer/:organizerId/events/:eventId/guestlist', (req: Request, res: Response) => {
  const organizerId = String(req.params.organizerId);
  const eventId = String(req.params.eventId);

  const event = db.prepare(`SELECT * FROM events WHERE id = ? AND organizer_id = ?`).get(eventId, organizerId) as any;
  if (!event) {
    return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });
  }

  const guestlist = db.prepare(`
    SELECT t.id as ticketId, t.status, t.used_at, t.used_by_device_id, t.created_at,
           u.id as userId, u.name as userName, u.email as userEmail, u.avatar as userAvatar
    FROM tickets t
    JOIN users u ON t.owner_user_id = u.id
    WHERE t.event_id = ?
    ORDER BY t.created_at DESC
  `).all(eventId) as any[];

  res.json({ success: true, eventTitle: event.title, guestlist });
});

// ==========================================
// 10. Super Admin Panel & Platform Oversight
// ==========================================
apiRouter.get('/admin/overview', (_req: Request, res: Response) => {
  const totalUsers = (db.prepare(`SELECT COUNT(*) as count FROM users`).get() as any).count;
  const totalEvents = (db.prepare(`SELECT COUNT(*) as count FROM events`).get() as any).count;
  const totalTickets = (db.prepare(`SELECT COUNT(*) as count FROM tickets`).get() as any).count;
  const totalOrders = (db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'confirmed'`).get() as any).count;
  const grossVolume = (db.prepare(`SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = 'confirmed'`).get() as any).total;
  const totalUsedTickets = (db.prepare(`SELECT COUNT(*) as count FROM tickets WHERE status = 'used'`).get() as any).count;
  const totalRevokedTickets = (db.prepare(`SELECT COUNT(*) as count FROM tickets WHERE status IN ('revoked', 'refunded')`).get() as any).count;
  const totalFraudAlerts = (db.prepare(`SELECT COUNT(*) as count FROM offline_scans_log WHERE is_flagged_duplicate = 1`).get() as any).count;

  const users = db.prepare(`SELECT * FROM users ORDER BY created_at DESC`).all() as any[];
  const events = db.prepare(`SELECT * FROM events ORDER BY created_at DESC`).all() as any[];
  const recentOrders = db.prepare(`
    SELECT o.*, u.name as buyerName, e.title as eventTitle
    FROM orders o
    JOIN users u ON o.buyer_user_id = u.id
    JOIN events e ON o.event_id = e.id
    ORDER BY o.created_at DESC
    LIMIT 15
  `).all() as any[];

  const fraudAuditLogs = verificationService.getFraudAuditLog();

  res.json({
    success: true,
    platformMetrics: {
      totalUsers,
      totalEvents,
      totalTickets,
      totalOrders,
      grossVolume: Number(grossVolume.toFixed(2)),
      totalUsedTickets,
      totalRevokedTickets,
      totalFraudAlerts,
      cryptoStatus: {
        algorithm: 'Ed25519 (Edwards-curve 25519)',
        keyId: 'evnt_root_ed25519_v1',
        status: 'ACTIVE_HEALTHY',
        offlineManifestCache: true,
      },
    },
    users,
    events,
    recentOrders,
    fraudAuditLogs,
  });
});

apiRouter.post('/admin/users/:userId/role', (req: Request, res: Response) => {
  const userId = String(req.params.userId);
  const { role } = req.body;

  if (!['attendee', 'staff', 'organizer', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }

  db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, userId);
  res.json({ success: true, userId, role });
});

apiRouter.post('/admin/events/:eventId/status', (req: Request, res: Response) => {
  const eventId = String(req.params.eventId);
  const { status } = req.body;

  if (!['published', 'cancelled', 'ended', 'draft'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }

  db.prepare(`UPDATE events SET status = ? WHERE id = ?`).run(status, eventId);
  res.json({ success: true, eventId, status });
});

apiRouter.post('/admin/system/broadcast', (req: Request, res: Response) => {
  const { title, message, type } = req.body;
  if (!title || !message) {
    return res.status(400).json({ success: false, error: 'title and message required' });
  }

  const allUsers = db.prepare(`SELECT id FROM users`).all() as { id: string }[];
  for (const u of allUsers) {
    notificationsService.notify(
      u.id,
      (type as any) || 'gate_update',
      title,
      message
    );
  }

  res.json({ success: true, broadcastCount: allUsers.length });
});
