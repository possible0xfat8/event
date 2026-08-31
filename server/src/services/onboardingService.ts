import { db } from '../db/index.js';
import { randomUUID } from 'node:crypto';
import { paymentsService } from './paymentsService.js';

export interface OrganizerProfile {
  user_id: string;
  organization_name: string;
  verification_status: 'unverified' | 'pending' | 'verified' | 'rejected' | 'flagged';
  payout_account_id?: string;
  trust_tier: number; // 1 = Tier 1 (New, 3-day hold, 250 cap), 2 = Tier 2 (1000 cap), 3 = Tier 3 (Unlimited)
  completed_events_count: number;
  verified_at?: string;
  created_at: string;
}

export class OnboardingService {
  /**
   * Attendee Fast Signup (Email/Password or Social OAuth)
   */
  signupAttendee(params: {
    email: string;
    name: string;
    phone?: string;
    avatar?: string;
    socialProvider?: 'google' | 'apple' | 'email';
  }) {
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(params.email) as any;
    if (existing) {
      return { success: true, user: existing, isNew: false };
    }

    const userId = `usr_att_${randomUUID().substring(0, 8)}`;
    const avatar = params.avatar || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150`;

    db.prepare(`
      INSERT INTO users (id, email, name, avatar, role)
      VALUES (?, ?, ?, ?, 'attendee')
    `).run(userId, params.email.toLowerCase().trim(), params.name.trim(), avatar);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return { success: true, user, isNew: true };
  }

  /**
   * Guest Checkout Flow (§A):
   * Purchase tickets with just an email in sub-second time without prior signup.
   */
  async guestCheckout(params: {
    email: string;
    name?: string;
    eventId: string;
    quantity: number;
    idempotencyKey: string;
  }) {
    const cleanEmail = params.email.toLowerCase().trim();
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as any;
    let isGuestCreated = false;

    if (!user) {
      const guestId = `usr_guest_${randomUUID().substring(0, 8)}`;
      const displayName = params.name?.trim() || cleanEmail.split('@')[0];
      const avatar = `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150`;

      db.prepare(`
        INSERT INTO users (id, email, name, avatar, role)
        VALUES (?, ?, ?, ?, 'attendee')
      `).run(guestId, cleanEmail, displayName, avatar);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(guestId);
      isGuestCreated = true;
    }

    // Execute standard atomic purchase
    const purchaseResult = await paymentsService.purchaseTickets({
      eventId: params.eventId,
      buyerUserId: user.id,
      quantity: params.quantity,
      idempotencyKey: params.idempotencyKey,
    });

    return {
      ...purchaseResult,
      buyer: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      isGuestCheckout: isGuestCreated,
      claimAccountUrl: `/claim-ticket?email=${encodeURIComponent(cleanEmail)}&orderId=${purchaseResult.orderId}`,
    };
  }

  /**
   * Organizer Instant Signup (§B.1):
   * Immediate registration with draft capabilities. Zero KYC upfront.
   */
  signupOrganizer(params: {
    email: string;
    name: string;
    organizationName: string;
    phone?: string;
  }) {
    const cleanEmail = params.email.toLowerCase().trim();
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as any;

    if (user) {
      // Upgrade existing attendee to also hold organizer capabilities
      db.prepare(`UPDATE users SET role = 'organizer' WHERE id = ?`).run(user.id);
    } else {
      const orgUserId = `usr_org_${randomUUID().substring(0, 8)}`;
      const avatar = `https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150`;

      db.prepare(`
        INSERT INTO users (id, email, name, avatar, role)
        VALUES (?, ?, ?, ?, 'organizer')
      `).run(orgUserId, cleanEmail, params.name.trim(), avatar);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(orgUserId);
    }

    // Create or update organizer profile with unverified status
    const existingProfile = db.prepare('SELECT * FROM organizer_profiles WHERE user_id = ?').get(user.id);
    if (!existingProfile) {
      db.prepare(`
        INSERT INTO organizer_profiles (user_id, organization_name, verification_status, trust_tier, completed_events_count)
        VALUES (?, ?, 'unverified', 1, 0)
      `).run(user.id, params.organizationName.trim());
    }

    const profile = db.prepare('SELECT * FROM organizer_profiles WHERE user_id = ?').get(user.id);
    return {
      success: true,
      user,
      profile,
      message: 'Organizer account created. You can now build full draft events immediately with zero identity verification.',
    };
  }

  /**
   * Get Organizer Profile & Verification State
   */
  getOrganizerProfile(organizerUserId: string): OrganizerProfile | null {
    const profile = db.prepare('SELECT * FROM organizer_profiles WHERE user_id = ?').get(organizerUserId) as any;
    return profile || null;
  }

  /**
   * Initiate Hosted Processor Onboarding (§B.2):
   * Generates hosted URL (e.g. Stripe Connect Express) without storing raw ID documents.
   */
  initiateVerification(organizerUserId: string) {
    const profile = this.getOrganizerProfile(organizerUserId);
    if (!profile) {
      throw new Error('Organizer profile not found');
    }

    // Generate processor account reference (never raw bank info)
    const processorAccountId = profile.payout_account_id || `acct_stripe_express_${randomUUID().substring(0, 12)}`;

    db.prepare(`
      UPDATE organizer_profiles
      SET verification_status = 'pending', payout_account_id = ?
      WHERE user_id = ?
    `).run(processorAccountId, organizerUserId);

    return {
      success: true,
      payoutAccountId: processorAccountId,
      hostedOnboardingUrl: `https://connect.stripe.com/setup/s/${processorAccountId}?return_url=https://evnt.live/organizer/onboarding-return`,
      message: 'Redirecting to payment processor hosted identity verification.',
    };
  }

  /**
   * Simulate Processor Webhook / Onboarding Completion (§B.4 & §B.5)
   */
  completeVerification(organizerUserId: string, outcome: 'approved' | 'rejected' | 'flagged' = 'approved') {
    const profile = this.getOrganizerProfile(organizerUserId);
    if (!profile) throw new Error('Organizer profile not found');

    const statusMap = {
      approved: 'verified',
      rejected: 'rejected',
      flagged: 'flagged',
    };

    const newStatus = statusMap[outcome] || 'verified';
    const verifiedAt = outcome === 'approved' ? new Date().toISOString() : null;

    db.prepare(`
      UPDATE organizer_profiles
      SET verification_status = ?, verified_at = ?
      WHERE user_id = ?
    `).run(newStatus, verifiedAt, organizerUserId);

    return {
      success: true,
      verificationStatus: newStatus,
      verifiedAt,
    };
  }

  /**
   * Publish Event (§B.7 & §C):
   * Hard-blocked server-side until verification_status = 'verified'.
   * Enforces trust tier ticket capacity caps (§B.6).
   */
  publishEvent(organizerUserId: string, eventId: string) {
    const profile = this.getOrganizerProfile(organizerUserId);
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as any;

    if (!event) {
      throw new Error('Event not found');
    }

    // Enforce organizer ownership
    if (event.organizer_id !== organizerUserId) {
      const err: any = new Error('Unauthorized: You do not own this event');
      err.statusCode = 403;
      throw err;
    }

    // Server-Side Verification Gating (§B.7)
    if (!profile || profile.verification_status !== 'verified') {
      const err: any = new Error(
        'Complete payout verification to publish events. Your account is currently unverified.'
      );
      err.statusCode = 403;
      err.verificationStatus = profile?.verification_status || 'unverified';
      err.requiresVerification = true;
      throw err;
    }

    // Trust Tier Capacity Enforcement (§B.6)
    // Tier 1 (New): 250 tickets max cap
    // Tier 2 (Established): 1000 tickets max cap
    // Tier 3 (VIP): Unlimited
    const tierCaps: Record<number, number> = {
      1: 250,
      2: 1000,
      3: 100000,
    };

    const maxCap = tierCaps[profile.trust_tier] || 250;
    if (event.capacity > maxCap) {
      const err: any = new Error(
        `Trust Tier ${profile.trust_tier} volume cap exceeded: Maximum allowable capacity is ${maxCap} tickets for new organizers. Complete clean events to unlock higher tiers.`
      );
      err.statusCode = 400;
      err.trustTier = profile.trust_tier;
      err.maxAllowedCapacity = maxCap;
      throw err;
    }

    // Publish event
    db.prepare(`UPDATE events SET status = 'published' WHERE id = ?`).run(eventId);

    return {
      success: true,
      eventId,
      status: 'published',
      trustTier: profile.trust_tier,
      message: 'Event published successfully and live on explore map.',
    };
  }

  /**
   * Platform Admin Review Queue (§D):
   * For processor-flagged verification edge cases.
   */
  getAdminVerificationQueue() {
    const queue = db.prepare(`
      SELECT 
        op.user_id,
        op.organization_name,
        op.verification_status,
        op.payout_account_id,
        op.trust_tier,
        op.completed_events_count,
        op.created_at,
        u.email as organizer_email,
        u.name as organizer_name,
        u.avatar as organizer_avatar
      FROM organizer_profiles op
      JOIN users u ON op.user_id = u.id
      WHERE op.verification_status IN ('pending', 'flagged', 'rejected', 'unverified')
      ORDER BY op.created_at DESC
    `).all();

    return queue;
  }

  /**
   * Platform Admin Resolve Queue Item (§D)
   */
  adminResolveVerification(organizerUserId: string, action: 'approve' | 'reject') {
    const newStatus = action === 'approve' ? 'verified' : 'rejected';
    const verifiedAt = action === 'approve' ? new Date().toISOString() : null;

    db.prepare(`
      UPDATE organizer_profiles
      SET verification_status = ?, verified_at = ?
      WHERE user_id = ?
    `).run(newStatus, verifiedAt, organizerUserId);

    return {
      success: true,
      organizerUserId,
      newStatus,
      verifiedAt,
    };
  }
}

export const onboardingService = new OnboardingService();
