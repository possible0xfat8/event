import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { db } from '../src/db/index.js';
import { cryptoService } from '../src/services/cryptoService.js';
import { inventoryService } from '../src/services/inventoryService.js';
import { v4 as uuidv4 } from 'uuid';

describe('EVNT Acceptance Criteria Test Suite (evnt.pdf §12)', () => {
  beforeAll(() => {
    // Ensure DB is initialized
  });

  // =========================================================================
  // 1. Concurrency Stress Test: Oversell Prevention Under High Spike Load (§5, §12)
  // =========================================================================
  it('Criterion 1: Cannot oversell an event under simulated concurrent load', async () => {
    // Create an event with exactly 5 tickets remaining
    const testEventId = `evt_stress_test_${Date.now()}`;
    db.prepare(`
      INSERT INTO events (
        id, organizer_id, title, description, lat, lng, venue_name, venue_address,
        start_time, end_time, category, capacity, tickets_remaining, price,
        resale_allowed, resale_price_cap, status
      ) VALUES (
        ?, 'usr_organizer_maya', 'Flash Secret Rave (Limited 5)', 'Ultra limited tickets',
        40.7128, -74.006, 'Secret Loft', '100 Broadway, NY',
        datetime('now', '+2 hours'), datetime('now', '+6 hours'),
        'club', 5, 5, 20.00, 1, 1.20, 'published'
      )
    `).run(testEventId);

    // Simulate 40 concurrent buyers hammering the purchase endpoint simultaneously
    const totalConcurrentAttempts = 40;
    const purchasePromises: Promise<any>[] = [];

    for (let i = 0; i < totalConcurrentAttempts; i++) {
      const buyerId = `usr_buyer_concurrency_${i}`;
      const idempotencyKey = `idem_stress_${testEventId}_${i}`;

      purchasePromises.push(
        request(app)
          .post('/api/orders/purchase')
          .send({
            eventId: testEventId,
            buyerUserId: buyerId,
            quantity: 1,
            idempotencyKey,
          })
      );
    }

    const responses = await Promise.all(purchasePromises);

    const successfulPurchases = responses.filter(r => r.status === 200 && r.body.success === true);
    const failedPurchases = responses.filter(r => r.status === 409 || (r.body && r.body.isSoldOut === true));

    // Verify exactly 5 tickets were sold
    expect(successfulPurchases.length).toBe(5);
    expect(failedPurchases.length).toBe(35);

    // Verify DB inventory is exactly 0 and no negative tickets exist
    const updatedEvent = db.prepare(`SELECT tickets_remaining FROM events WHERE id = ?`).get(testEventId) as any;
    expect(updatedEvent.tickets_remaining).toBe(0);

    const issuedTickets = db.prepare(`SELECT COUNT(*) as count FROM tickets WHERE event_id = ?`).get(testEventId) as any;
    expect(issuedTickets.count).toBe(5);
  });

  // =========================================================================
  // 2. Double-Scan Prevention: Online Atomic Check Enforced at DB Level (§6, §12)
  // =========================================================================
  it('Criterion 2: Cannot scan the same ticket twice for entry in the online path', async () => {
    const testTicketId = `tkt_double_scan_${Date.now()}`;
    const testOrderId = `ord_test_double_${Date.now()}`;
    const token = cryptoService.signTicket(testTicketId, 'evt_boiler_room_bushwick', 'usr_alex');

    db.prepare(`
      INSERT INTO orders (id, buyer_user_id, event_id, quantity, total_amount, payment_intent_id, idempotency_key, status)
      VALUES (?, 'usr_alex', 'evt_boiler_room_bushwick', 1, 25.00, ?, ?, 'confirmed')
    `).run(testOrderId, `pi_${testOrderId}`, `idem_${testOrderId}`);

    db.prepare(`
      INSERT INTO tickets (id, event_id, owner_user_id, order_id, status, signed_token)
      VALUES (?, 'evt_boiler_room_bushwick', 'usr_alex', ?, 'valid', ?)
    `).run(testTicketId, testOrderId, token);

    // Fire 2 concurrent scan requests at two different door gates
    const [scanGate1, scanGate2] = await Promise.all([
      request(app)
        .post('/api/verify/scan')
        .send({ token, scannerDeviceId: 'gate_north_scanner' }),
      request(app)
        .post('/api/verify/scan')
        .send({ token, scannerDeviceId: 'gate_south_scanner' }),
    ]);

    const results = [scanGate1, scanGate2];
    const admitted = results.filter(r => r.status === 200 && r.body.status === 'admitted');
    const rejected = results.filter(r => r.status === 409 && r.body.status === 'already_used');

    expect(admitted.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Verify ticket status in DB is used
    const ticketInDb = db.prepare(`SELECT status, used_by_device_id FROM tickets WHERE id = ?`).get(testTicketId) as any;
    expect(ticketInDb.status).toBe('used');
    expect(['gate_north_scanner', 'gate_south_scanner']).toContain(ticketInDb.used_by_device_id);
  });

  // =========================================================================
  // 3. Offline Scan Path & Duplicate Reconciliation (§6, §12)
  // =========================================================================
  it('Criterion 3: Offline scan works with local crypto and flags duplicate offline scans upon sync', async () => {
    const testTicketId = `tkt_offline_dup_${Date.now()}`;
    const testOrderId = `ord_test_offline_${Date.now()}`;
    const token = cryptoService.signTicket(testTicketId, 'evt_boiler_room_bushwick', 'usr_sarah');

    db.prepare(`
      INSERT INTO orders (id, buyer_user_id, event_id, quantity, total_amount, payment_intent_id, idempotency_key, status)
      VALUES (?, 'usr_sarah', 'evt_boiler_room_bushwick', 1, 25.00, ?, ?, 'confirmed')
    `).run(testOrderId, `pi_${testOrderId}`, `idem_${testOrderId}`);

    db.prepare(`
      INSERT INTO tickets (id, event_id, owner_user_id, order_id, status, signed_token)
      VALUES (?, 'evt_boiler_room_bushwick', 'usr_sarah', ?, 'valid', ?)
    `).run(testTicketId, testOrderId, token);

    // 1. Offline Scanner verifies local Ed25519 signature with zero network call
    const localCryptoResult = cryptoService.verifyTicketToken(token);
    expect(localCryptoResult.valid).toBe(true);
    expect(localCryptoResult.payload?.ticketId).toBe(testTicketId);

    // 2. Simulate two offline scanner devices both admitting this ticket while disconnected
    const offlineScansBatch = [
      {
        ticketId: testTicketId,
        token,
        scannerDeviceId: 'offline_scanner_handheld_A',
        scannedAt: new Date(Date.now() - 30000).toISOString(),
      },
      {
        ticketId: testTicketId,
        token,
        scannerDeviceId: 'offline_scanner_handheld_B',
        scannedAt: new Date(Date.now() - 10000).toISOString(),
      },
    ];

    // 3. Sync offline scans to server
    const syncRes = await request(app)
      .post('/api/verify/sync-offline')
      .send({ scans: offlineScansBatch });

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.totalSynced).toBe(2);
    expect(syncRes.body.admittedCount).toBe(1);
    expect(syncRes.body.duplicateFraudCount).toBe(1);
    expect(syncRes.body.fraudAlerts.length).toBeGreaterThanOrEqual(1);

    // Verify duplicate flag in DB for staff review
    const fraudLogs = db.prepare(`SELECT * FROM offline_scans_log WHERE ticket_id = ? AND is_flagged_duplicate = 1`).all(testTicketId);
    expect(fraudLogs.length).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // 4. Resale Token Revocation & Reissue (§8, §12)
  // =========================================================================
  it('Criterion 4: Resale reissues a new signed token and permanently invalidates the old one', async () => {
    // 1. Alex owns a valid ticket
    const originalTicketId = `tkt_resale_orig_${Date.now()}`;
    const testOrderId = `ord_resale_test_${Date.now()}`;
    const originalToken = cryptoService.signTicket(originalTicketId, 'evt_rooftop_sunset_sessions', 'usr_alex');

    db.prepare(`
      INSERT INTO orders (id, buyer_user_id, event_id, quantity, total_amount, payment_intent_id, idempotency_key, status)
      VALUES (?, 'usr_alex', 'evt_rooftop_sunset_sessions', 1, 30.00, ?, ?, 'confirmed')
    `).run(testOrderId, `pi_${testOrderId}`, `idem_${testOrderId}`);

    db.prepare(`
      INSERT INTO tickets (id, event_id, owner_user_id, order_id, status, signed_token)
      VALUES (?, 'evt_rooftop_sunset_sessions', 'usr_alex', ?, 'valid', ?)
    `).run(originalTicketId, testOrderId, originalToken);

    // 2. Alex resells ticket to Sarah
    const resaleRes = await request(app)
      .post('/api/resale/transfer')
      .send({
        ticketId: originalTicketId,
        sellerId: 'usr_alex',
        buyerId: 'usr_sarah',
        resalePrice: 30.00,
      });

    expect(resaleRes.status).toBe(200);
    expect(resaleRes.body.success).toBe(true);
    const newTicketId = resaleRes.body.newTicketId;
    const newToken = resaleRes.body.newSignedToken;

    // 3. Try to scan the OLD ticket token -> MUST FAIL (status revoked)
    const oldScanRes = await request(app)
      .post('/api/verify/scan')
      .send({ token: originalToken, scannerDeviceId: 'gate_scanner' });

    expect(oldScanRes.status).toBe(400);
    expect(oldScanRes.body.valid).toBe(false);
    expect(oldScanRes.body.status).toBe('revoked');

    // 4. Scan the NEW ticket token -> MUST SUCCEED (admitted)
    const newScanRes = await request(app)
      .post('/api/verify/scan')
      .send({ token: newToken, scannerDeviceId: 'gate_scanner' });

    expect(newScanRes.status).toBe(200);
    expect(newScanRes.body.valid).toBe(true);
    expect(newScanRes.body.status).toBe('admitted');
  });

  // =========================================================================
  // 5. Privacy-First "Going" Social Graph (§9, §12)
  // =========================================================================
  it('Criterion 5: "Going" status is private by default; no attendance data is leaked without opt-in', async () => {
    const testEventId = 'evt_immersive_ambient_dome';

    // Marcus sets his status as 'private'
    await request(app)
      .post('/api/social/going')
      .send({
        userId: 'usr_marcus',
        eventId: testEventId,
        visibility: 'private',
      });

    // Sarah (Marcus's friend) queries discovery for this event
    const sarahDiscovery = await request(app)
      .get(`/api/events/${testEventId}?viewerUserId=usr_sarah`);

    expect(sarahDiscovery.status).toBe(200);
    // Marcus must NOT appear in Sarah's friends list
    const foundMarcus = sarahDiscovery.body.event.friendsGoingPreview.some((f: any) => f.friendId === 'usr_marcus');
    expect(foundMarcus).toBe(false);

    // Now Marcus explicitly switches to 'friends_only'
    await request(app)
      .post('/api/social/going')
      .send({
        userId: 'usr_marcus',
        eventId: testEventId,
        visibility: 'friends_only',
      });

    // Sarah queries again
    const sarahDiscoveryAfter = await request(app)
      .get(`/api/events/${testEventId}?viewerUserId=usr_sarah`);

    const foundMarcusAfter = sarahDiscoveryAfter.body.event.friendsGoingPreview.some((f: any) => f.friendId === 'usr_marcus');
    expect(foundMarcusAfter).toBe(true);
    expect(sarahDiscoveryAfter.body.event.friendsGoingCount).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // 6. Payment Compensation on Partial Failure (§5, §12)
  // =========================================================================
  it('Criterion 6: Payment failure or ticket issuance exception triggers compensation and inventory restoration', async () => {
    const testEventId = 'evt_rooftop_sunset_sessions';
    const beforeEvent = inventoryService.getEventById(testEventId)!;
    const initialTicketsRemaining = beforeEvent.tickets_remaining;

    // Simulate failure during ticket issuance
    const failureRes = await request(app)
      .post('/api/orders/purchase')
      .send({
        eventId: testEventId,
        buyerUserId: 'usr_alex',
        quantity: 2,
        idempotencyKey: `idem_fail_test_${Date.now()}`,
        simulateIssuanceFailure: true,
      });

    expect(failureRes.status).toBe(400);
    expect(failureRes.body.success).toBe(false);
    expect(failureRes.body.compensated).toBe(true);

    // Verify inventory was cleanly restored and no orphaned tickets remain
    const afterEvent = inventoryService.getEventById(testEventId)!;
    expect(afterEvent.tickets_remaining).toBe(initialTicketsRemaining);
  });

  // =========================================================================
  // 7. Geospatial Discovery Radius Query Performance (§12)
  // =========================================================================
  it('Criterion 7: Geospatial discovery returns accurate nearby listings within low latency', async () => {
    const startTime = Date.now();

    // Query events near Brooklyn (40.7128, -73.95) within 10 km
    const res = await request(app)
      .get('/api/events')
      .query({
        lat: 40.7128,
        lng: -73.95,
        radiusKm: 10,
        viewerUserId: 'usr_alex',
      });

    const duration = Date.now() - startTime;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.events.length).toBeGreaterThan(0);
    // Verified events are sorted by distance
    for (let i = 1; i < res.body.events.length; i++) {
      expect(res.body.events[i].distanceKm).toBeGreaterThanOrEqual(res.body.events[i - 1].distanceKm);
    }
    // Execution should be well under 100ms
    expect(duration).toBeLessThan(100);
  });

  // =========================================================================
  // 8. Idempotent Refund Action
  // =========================================================================
  it('Criterion 8: Refund action is idempotent — double-submitting never issues double refunds', async () => {
    const testTicketId = `tkt_idemp_refund_${Date.now()}`;
    const testOrderId = `ord_idemp_refund_${Date.now()}`;
    const token = cryptoService.signTicket(testTicketId, 'evt_boiler_room_bushwick', 'usr_alex');

    const initialEvent = db.prepare(`SELECT tickets_remaining FROM events WHERE id = 'evt_boiler_room_bushwick'`).get() as any;
    const initialRemaining = initialEvent.tickets_remaining;

    db.prepare(`
      INSERT INTO orders (id, buyer_user_id, event_id, quantity, total_amount, payment_intent_id, idempotency_key, status)
      VALUES (?, 'usr_alex', 'evt_boiler_room_bushwick', 1, 25.00, ?, ?, 'confirmed')
    `).run(testOrderId, `pi_${testOrderId}`, `idem_${testOrderId}`);

    db.prepare(`
      INSERT INTO tickets (id, event_id, owner_user_id, order_id, status, signed_token)
      VALUES (?, 'evt_boiler_room_bushwick', 'usr_alex', ?, 'valid', ?)
    `).run(testTicketId, testOrderId, token);

    // Call refund 1st time with idempotency key
    const refund1 = await request(app)
      .post('/api/organizer/refund-ticket')
      .send({
        ticketId: testTicketId,
        organizerId: 'usr_organizer_maya',
        idempotencyKey: `idem_refund_${testTicketId}`,
      });

    expect(refund1.status).toBe(200);
    expect(refund1.body.success).toBe(true);
    expect(refund1.body.alreadyRefunded).toBe(false);

    // Call refund 2nd time with SAME idempotency key (simulating fast double click)
    const refund2 = await request(app)
      .post('/api/organizer/refund-ticket')
      .send({
        ticketId: testTicketId,
        organizerId: 'usr_organizer_maya',
        idempotencyKey: `idem_refund_${testTicketId}`,
      });

    expect(refund2.status).toBe(200);
    expect(refund2.body.success).toBe(true);

    // Verify inventory only incremented by exactly 1, not 2!
    const afterEvent = db.prepare(`SELECT tickets_remaining FROM events WHERE id = 'evt_boiler_room_bushwick'`).get() as any;
    expect(afterEvent.tickets_remaining).toBe(initialRemaining + 1);
  });

  // =========================================================================
  // 9. Pre-Event Readiness Checklist Real State Verification
  // =========================================================================
  it('Criterion 9: Readiness checklist scanner item only turns green after an actual scan', async () => {
    const testEventId = `evt_readiness_test_${Date.now()}`;
    db.prepare(`
      INSERT INTO events (
        id, organizer_id, title, description, lat, lng, venue_name, venue_address,
        start_time, end_time, category, capacity, tickets_remaining, price,
        resale_allowed, resale_price_cap, status
      ) VALUES (
        ?, 'usr_organizer_maya', 'Readiness Demo Gig', 'Readiness test',
        6.4281, 3.4219, 'Victoria Island Club', 'Lagos',
        datetime('now', '+2 days'), datetime('now', '+3 days'),
        'club', 100, 100, 30.00, 1, 1.20, 'published'
      )
    `).run(testEventId);

    // 1. Initial checklist: scannerTested MUST be false because 0 scans exist
    const res1 = await request(app)
      .get(`/api/organizer/usr_organizer_maya/events/${testEventId}/readiness`);

    expect(res1.status).toBe(200);
    expect(res1.body.checklist.scannerTested).toBe(false);
    expect(res1.body.checklist.overallReady).toBe(false);

    // 2. Perform a test scan for this event
    const ticketId = `tkt_test_scan_${Date.now()}`;
    const token = cryptoService.signTicket(ticketId, testEventId, 'usr_alex');
    db.prepare(`
      INSERT INTO orders (id, buyer_user_id, event_id, quantity, total_amount, payment_intent_id, idempotency_key, status)
      VALUES (?, 'usr_alex', ?, 1, 30.00, ?, ?, 'confirmed')
    `).run(`ord_readiness_${Date.now()}`, testEventId, `pi_readiness_${Date.now()}`, `idem_readiness_${Date.now()}`);
    db.prepare(`
      INSERT INTO tickets (id, event_id, owner_user_id, order_id, status, signed_token)
      VALUES (?, ?, 'usr_alex', ?, 'valid', ?)
    `).run(ticketId, testEventId, `ord_readiness_${Date.now()}`, token);

    await request(app)
      .post('/api/verify/scan')
      .send({ token, scannerDeviceId: 'test_gate_scanner_1', targetEventId: testEventId });

    // 3. Re-query checklist: scannerTested MUST NOW be true!
    const res2 = await request(app)
      .get(`/api/organizer/usr_organizer_maya/events/${testEventId}/readiness`);

    expect(res2.status).toBe(200);
    expect(res2.body.checklist.scannerTested).toBe(true);
    expect(res2.body.checklist.overallReady).toBe(true);
  });

  // =========================================================================
  // 10. Server-Side RBAC Enforcement: Revenue Masked for Staff
  // =========================================================================
  it('Criterion 10: Door staff accounts are strictly forbidden from fetching revenue data at the API layer', async () => {
    // 1. Query analytics as staff
    const staffRes = await request(app)
      .get('/api/organizer/analytics/usr_organizer_maya?viewerRole=staff');

    expect(staffRes.status).toBe(200);
    expect(staffRes.body.isStaff).toBe(true);
    expect(staffRes.body.summary.totalRevenue).toBeUndefined();
    // Verify individual event prices are also omitted
    for (const evt of staffRes.body.events) {
      expect(evt.price).toBeUndefined();
    }

    // 2. Query analytics as organizer
    const organizerRes = await request(app)
      .get('/api/organizer/analytics/usr_organizer_maya?viewerRole=organizer');

    expect(organizerRes.status).toBe(200);
    expect(organizerRes.body.isStaff).toBe(false);
    expect(organizerRes.body.summary.totalRevenue).toBeDefined();
    expect(typeof organizerRes.body.summary.totalRevenue).toBe('number');
  });

  // =========================================================================
  // 11. CSV Reporting & Export
  // =========================================================================
  it('Criterion 11: CSV export generates RFC 4180 formatted file with accurate sales data', async () => {
    const csvRes = await request(app)
      .get('/api/organizer/usr_organizer_maya/export-csv');

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.headers['content-disposition']).toContain('attachment');
    expect(csvRes.text).toContain('Order ID,Ticket ID,Event Title');
    expect(csvRes.text).toContain('Platform Fee ($)');
  });
});
