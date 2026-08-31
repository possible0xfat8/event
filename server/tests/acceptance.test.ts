import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { db } from '../src/db/index.js';
import { cryptoService } from '../src/services/cryptoService.js';
import { inventoryService } from '../src/services/inventoryService.js';
import { v4 as uuidv4 } from 'uuid';

describe('EVNT Acceptance Criteria Test Suite (evnt.pdf §12)', () => {
  beforeAll(() => {
    // Ensure test fixtures exist for isolated acceptance testing
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (id, email, name, avatar, role)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertUser.run('usr_alex', 'alex@example.com', 'Alex Rivera', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150', 'attendee');
    insertUser.run('usr_sarah', 'sarah@example.com', 'Sarah Chen', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', 'attendee');
    insertUser.run('usr_marcus', 'marcus@example.com', 'Marcus Adebayo', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150', 'attendee');
    insertUser.run('usr_staff_dave', 'dave@example.com', 'Dave Gate Lead', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'staff');
    insertUser.run('usr_organizer_maya', 'maya@soundwave.events', 'Maya Lin (SoundWave)', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150', 'organizer');
    insertUser.run('usr_admin_elena', 'admin@evnt.live', 'Elena Rostova (SuperAdmin)', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150', 'admin');

    db.prepare(`
      INSERT OR IGNORE INTO organizer_profiles (user_id, organization_name, verification_status, payout_account_id, trust_tier, completed_events_count, verified_at)
      VALUES ('usr_organizer_maya', 'SoundWave Productions', 'verified', 'acct_stripe_express_test_123', 2, 8, datetime('now', '-30 days'))
    `).run();

    // Friendships for social graph tests
    const insertFriend = db.prepare(`INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')`);
    insertFriend.run('usr_sarah', 'usr_marcus');
    insertFriend.run('usr_marcus', 'usr_sarah');
    insertFriend.run('usr_alex', 'usr_sarah');
    insertFriend.run('usr_sarah', 'usr_alex');

    // Test event for Criterion 5
    db.prepare(`
      INSERT OR IGNORE INTO events (
        id, organizer_id, title, description, lat, lng, venue_name, venue_address,
        start_time, end_time, category, capacity, tickets_remaining, price,
        resale_allowed, resale_price_cap, status
      ) VALUES (
        'evt_immersive_ambient_dome', 'usr_organizer_maya', 'Immersive Ambient Dome', '360 visuals',
        40.7128, -74.006, 'The Dome', 'Brooklyn',
        datetime('now', '+2 hours'), datetime('now', '+6 hours'),
        'art', 100, 100, 15.00, 1, 1.20, 'published'
      )
    `).run();
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
    const readinessOrderId = `ord_readiness_${Date.now()}`;
    const token = cryptoService.signTicket(ticketId, testEventId, 'usr_alex');
    db.prepare(`
      INSERT INTO orders (id, buyer_user_id, event_id, quantity, total_amount, payment_intent_id, idempotency_key, status)
      VALUES (?, 'usr_alex', ?, 1, 30.00, ?, ?, 'confirmed')
    `).run(readinessOrderId, testEventId, `pi_readiness_${Date.now()}`, `idem_readiness_${Date.now()}`);
    db.prepare(`
      INSERT INTO tickets (id, event_id, owner_user_id, order_id, status, signed_token)
      VALUES (?, ?, 'usr_alex', ?, 'valid', ?)
    `).run(ticketId, testEventId, readinessOrderId, token);

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

  // =========================================================================
  // 12. Attendee Guest Checkout (§A)
  // =========================================================================
  it('Criterion 12: Attendee can complete ticket purchase via guest checkout without prior account creation', async () => {
    const guestEmail = `guest_${Date.now()}@gmail.com`;
    const res = await request(app)
      .post('/api/checkout/guest')
      .send({
        email: guestEmail,
        name: 'Guest FestGoer',
        eventId: 'evt_boiler_room_bushwick',
        quantity: 1,
        idempotencyKey: `idem_guest_test_${Date.now()}`,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isGuestCheckout).toBe(true);
    expect(res.body.tickets.length).toBe(1);
    expect(res.body.tickets[0].signedToken).toBeDefined();
    expect(res.body.claimAccountUrl).toContain(encodeURIComponent(guestEmail));

    // Verify cryptographic token is valid for gate entry
    const scanRes = await request(app)
      .post('/api/verify/scan')
      .send({
        token: res.body.tickets[0].signedToken,
        scannerDeviceId: 'gate_test_scanner',
        targetEventId: 'evt_boiler_room_bushwick',
      });
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.valid).toBe(true);
  });

  // =========================================================================
  // 13. Instant Organizer Signup & Free Drafting (§B.1)
  // =========================================================================
  it('Criterion 13: Organizer can sign up and build a complete draft event with zero identity verification required', async () => {
    const orgEmail = `neworg_${Date.now()}@soundwave.live`;
    const signupRes = await request(app)
      .post('/api/auth/signup/organizer')
      .send({
        email: orgEmail,
        name: 'Chioma Ade',
        organizationName: 'SoundWave Lagos',
      });

    expect(signupRes.status).toBe(200);
    expect(signupRes.body.success).toBe(true);
    expect(signupRes.body.profile.verification_status).toBe('unverified');

    const organizerId = signupRes.body.user.id;

    // Create a full draft event immediately with zero KYC
    const draftEventRes = await request(app)
      .post('/api/events')
      .send({
        organizer_id: organizerId,
        title: 'SoundWave Sunset Beach Party',
        description: 'Underground beach party in Lekki',
        lat: 6.4474,
        lng: 3.4735,
        venue_name: 'Elegushi Beach',
        venue_address: 'Lekki Phase 1, Lagos',
        start_time: '2026-10-10T18:00:00Z',
        end_time: '2026-10-11T02:00:00Z',
        category: 'club',
        capacity: 200,
        price: 20.00,
        status: 'draft',
      });

    expect(draftEventRes.status).toBe(201);
    expect(draftEventRes.body.success).toBe(true);
    expect(draftEventRes.body.event.status).toBe('draft');
  });

  // =========================================================================
  // 14. Server-Side Publishing Gate (§B.7 & §C)
  // =========================================================================
  it('Criterion 14: Publishing an event is hard-blocked server-side until verification_status = verified', async () => {
    const orgEmail = `blocked_org_${Date.now()}@gmail.com`;
    const signup = await request(app)
      .post('/api/auth/signup/organizer')
      .send({
        email: orgEmail,
        name: 'Fola B',
        organizationName: 'Unverified Promos',
      });

    const organizerId = signup.body.user.id;

    const draftEvent = await request(app)
      .post('/api/events')
      .send({
        organizer_id: organizerId,
        title: 'Unverified Gig',
        description: 'Test',
        lat: 6.44,
        lng: 3.47,
        venue_name: 'Lagos Spot',
        venue_address: 'Lagos',
        start_time: '2026-11-01T18:00:00Z',
        end_time: '2026-11-01T23:00:00Z',
        category: 'gig',
        capacity: 100,
        price: 10.00,
        status: 'draft',
      });

    const eventId = draftEvent.body.event.id;

    // 1. Attempt to publish while unverified -> MUST RETURN 403 Forbidden with clear reason!
    const publishAttempt1 = await request(app)
      .post(`/api/organizer/${organizerId}/events/${eventId}/publish`);

    expect(publishAttempt1.status).toBe(403);
    expect(publishAttempt1.body.success).toBe(false);
    expect(publishAttempt1.body.requiresVerification).toBe(true);
    expect(publishAttempt1.body.error).toContain('Complete payout verification to publish events');

    // 2. Initiate processor hosted onboarding flow (§B.2)
    const initiateRes = await request(app)
      .post(`/api/organizer/${organizerId}/verify/initiate`);

    expect(initiateRes.status).toBe(200);
    expect(initiateRes.body.payoutAccountId).toContain('acct_stripe_express_');
    expect(initiateRes.body.hostedOnboardingUrl).toContain('connect.stripe.com');

    // 3. Complete verification webhook simulation
    await request(app)
      .post(`/api/organizer/${organizerId}/verify/complete`)
      .send({ outcome: 'approved' });

    // 4. Now publishing MUST SUCCEED!
    const publishAttempt2 = await request(app)
      .post(`/api/organizer/${organizerId}/events/${eventId}/publish`);

    expect(publishAttempt2.status).toBe(200);
    expect(publishAttempt2.body.success).toBe(true);
    expect(publishAttempt2.body.status).toBe('published');
  });

  // =========================================================================
  // 15. Trust Tier Volume Cap Enforcement (§B.6)
  // =========================================================================
  it('Criterion 15: New organizers in Trust Tier 1 are subject to volume cap (max 250 tickets)', async () => {
    const orgEmail = `tier1_org_${Date.now()}@gmail.com`;
    const signup = await request(app)
      .post('/api/auth/signup/organizer')
      .send({
        email: orgEmail,
        name: 'Tunde O',
        organizationName: 'Tier 1 Fest',
      });

    const organizerId = signup.body.user.id;

    // Verify organizer
    await request(app).post(`/api/organizer/${organizerId}/verify/initiate`);
    await request(app).post(`/api/organizer/${organizerId}/verify/complete`).send({ outcome: 'approved' });

    // Attempt to publish an event with 500 capacity (exceeding Tier 1 cap of 250)
    const largeEvent = await request(app)
      .post('/api/events')
      .send({
        organizer_id: organizerId,
        title: 'Huge 500 Capacity Event',
        description: 'Cap test',
        lat: 6.44,
        lng: 3.47,
        venue_name: 'Lekki Arena',
        venue_address: 'Lagos',
        start_time: '2026-11-01T18:00:00Z',
        end_time: '2026-11-01T23:00:00Z',
        category: 'club',
        capacity: 500,
        price: 15.00,
        status: 'draft',
      });

    const eventId = largeEvent.body.event.id;

    const publishRes = await request(app)
      .post(`/api/organizer/${organizerId}/events/${eventId}/publish`);

    expect(publishRes.status).toBe(400);
    expect(publishRes.body.success).toBe(false);
    expect(publishRes.body.error).toContain('Trust Tier 1 volume cap exceeded');
    expect(publishRes.body.maxAllowedCapacity).toBe(250);
  });

  // =========================================================================
  // 16. Platform Admin Verification Review Queue (§D)
  // =========================================================================
  it('Criterion 16: Flagged verification edge cases appear in platform admin review queue and can be resolved', async () => {
    const orgEmail = `flagged_org_${Date.now()}@gmail.com`;
    const signup = await request(app)
      .post('/api/auth/signup/organizer')
      .send({
        email: orgEmail,
        name: 'Kelechi M',
        organizationName: 'Flagged Raves Ltd',
      });

    const organizerId = signup.body.user.id;

    // Simulate processor flagging the account for review
    await request(app).post(`/api/organizer/${organizerId}/verify/initiate`);
    await request(app).post(`/api/organizer/${organizerId}/verify/complete`).send({ outcome: 'flagged' });

    // 1. Check Platform Admin Review Queue
    const queueRes = await request(app).get('/api/admin/verification-queue');
    expect(queueRes.status).toBe(200);
    expect(queueRes.body.success).toBe(true);

    const flaggedItem = queueRes.body.queue.find((q: any) => q.user_id === organizerId);
    expect(flaggedItem).toBeDefined();
    expect(flaggedItem.verification_status).toBe('flagged');

    // 2. Platform Admin approves the item
    const resolveRes = await request(app)
      .post(`/api/admin/verification-queue/${organizerId}/resolve`)
      .send({ action: 'approve' });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.newStatus).toBe('verified');

    // 3. Verify organizer profile is now verified
    const profileRes = await request(app).get(`/api/organizer/${organizerId}/profile`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.profile.verification_status).toBe('verified');
  });
});
