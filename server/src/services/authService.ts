import { db } from '../db/index.js';
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Password Hashing (Node.js built-in scrypt — zero dependencies)
// ---------------------------------------------------------------------------
const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST }).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST });
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

// ---------------------------------------------------------------------------
// Avatar generation from initials
// ---------------------------------------------------------------------------
const AVATAR_COLORS = [
  '#ff2d75', '#9d4edd', '#00f0ff', '#00ff88', '#ff6b35',
  '#e040fb', '#448aff', '#69f0ae', '#ffd740', '#ff5252',
];

function generateAvatarUrl(name: string): string {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const colorIdx = Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % AVATAR_COLORS.length;
  const bg = AVATAR_COLORS[colorIdx].replace('#', '');
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${bg}&color=fff&size=150&bold=true&format=svg`;
}

// ---------------------------------------------------------------------------
// Auth Service
// ---------------------------------------------------------------------------
export class AuthService {
  /**
   * Sign up a new user (attendee or organizer).
   * First user with email admin@evnt.live gets auto-promoted to admin.
   */
  signup(params: {
    email: string;
    password: string;
    name: string;
    role?: 'attendee' | 'organizer';
    organizationName?: string;
    phone?: string;
  }) {
    const cleanEmail = params.email.toLowerCase().trim();
    const cleanName = params.name.trim();

    if (!cleanEmail || !params.password || !cleanName) {
      throw Object.assign(new Error('Email, password, and name are required'), { statusCode: 400 });
    }

    if (params.password.length < 6) {
      throw Object.assign(new Error('Password must be at least 6 characters'), { statusCode: 400 });
    }

    // Check for existing email
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail) as any;
    if (existing) {
      throw Object.assign(new Error('An account with this email already exists. Please log in.'), { statusCode: 409 });
    }

    const userId = `usr_${randomUUID().substring(0, 12)}`;
    const passwordHash = hashPassword(params.password);
    const avatar = generateAvatarUrl(cleanName);

    // Admin bootstrap: first user with admin@evnt.live gets admin role
    let role = params.role || 'attendee';
    if (cleanEmail === 'admin@evnt.live') {
      role = 'admin' as any;
    }

    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, phone, avatar, role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, cleanEmail, passwordHash, cleanName, params.phone || null, avatar, role);

    // If organizer, also create organizer_profiles row
    if (role === 'organizer') {
      const orgName = params.organizationName?.trim() || `${cleanName}'s Events`;
      db.prepare(`
        INSERT INTO organizer_profiles (user_id, organization_name, verification_status, trust_tier, completed_events_count)
        VALUES (?, ?, 'unverified', 1, 0)
      `).run(userId, orgName);
    }

    const user = db.prepare('SELECT id, email, name, phone, avatar, role, created_at FROM users WHERE id = ?').get(userId) as any;
    const profile = role === 'organizer'
      ? db.prepare('SELECT * FROM organizer_profiles WHERE user_id = ?').get(userId)
      : undefined;

    return {
      success: true,
      user,
      profile,
    };
  }

  /**
   * Log in with email + password.
   */
  login(email: string, password: string) {
    const cleanEmail = email.toLowerCase().trim();

    if (!cleanEmail || !password) {
      throw Object.assign(new Error('Email and password are required'), { statusCode: 400 });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as any;
    if (!user) {
      throw Object.assign(new Error('No account found with this email'), { statusCode: 401 });
    }

    if (!user.password_hash) {
      throw Object.assign(
        new Error('This account was created via guest checkout. Please sign up with a password to continue.'),
        { statusCode: 401 }
      );
    }

    if (!verifyPassword(password, user.password_hash)) {
      throw Object.assign(new Error('Incorrect password'), { statusCode: 401 });
    }

    // Return sanitized user (no password_hash)
    const { password_hash, ...safeUser } = user;
    const profile = user.role === 'organizer'
      ? db.prepare('SELECT * FROM organizer_profiles WHERE user_id = ?').get(user.id)
      : undefined;

    return {
      success: true,
      user: safeUser,
      profile,
    };
  }

  /**
   * Validate a session by user ID. Returns user or null.
   */
  getSession(userId: string) {
    if (!userId) return null;
    const user = db.prepare('SELECT id, email, name, phone, avatar, role, created_at FROM users WHERE id = ?').get(userId) as any;
    if (!user) return null;

    const profile = user.role === 'organizer'
      ? db.prepare('SELECT * FROM organizer_profiles WHERE user_id = ?').get(user.id)
      : undefined;

    return { user, profile };
  }
}

export const authService = new AuthService();
