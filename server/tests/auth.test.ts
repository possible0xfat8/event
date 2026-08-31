import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { db } from '../src/db/index.js';

describe('EVNT Auth & Signup Suite', () => {
  const timestamp = Date.now();

  it('signs up a new attendee gracefully', async () => {
    const email = `attendee_${timestamp}@test.com`;
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        email,
        password: 'securePassword123',
        name: 'Chioma Okafor',
        role: 'attendee',
        phone: '+2348012345678',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role).toBe('attendee');
    expect(res.body.user.name).toBe('Chioma Okafor');
    expect(res.body.user.phone).toBe('+2348012345678');
    expect(res.body.user.password_hash).toBeUndefined(); // never expose password hash
  });

  it('signs up a new organizer with instant profile and unverified status', async () => {
    const email = `organizer_${timestamp}@test.com`;
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        email,
        password: 'organizerPass456',
        name: 'Babatunde Adeleke',
        role: 'organizer',
        organizationName: 'Lagos Night Vibes',
        phone: '+2348098765432',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('organizer');
    expect(res.body.profile).toBeDefined();
    expect(res.body.profile.organization_name).toBe('Lagos Night Vibes');
    expect(res.body.profile.verification_status).toBe('unverified');
    expect(res.body.profile.trust_tier).toBe(1);
  });

  it('rejects duplicate email signup', async () => {
    const email = `duplicate_${timestamp}@test.com`;
    // First signup
    await request(app)
      .post('/api/auth/signup')
      .send({
        email,
        password: 'password123',
        name: 'First User',
      });

    // Duplicate signup attempt
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        email,
        password: 'password456',
        name: 'Duplicate Attempt',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('already exists');
  });

  it('logs in successfully with correct credentials', async () => {
    const email = `login_test_${timestamp}@test.com`;
    await request(app)
      .post('/api/auth/signup')
      .send({
        email,
        password: 'correctPassword',
        name: 'Login Tester',
      });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email,
        password: 'correctPassword',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(email);
  });

  it('rejects login with incorrect password', async () => {
    const email = `login_fail_${timestamp}@test.com`;
    await request(app)
      .post('/api/auth/signup')
      .send({
        email,
        password: 'realPassword',
        name: 'Fail Tester',
      });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email,
        password: 'wrongPassword',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Incorrect password');
  });

  it('fetches session with x-user-id header', async () => {
    const email = `session_test_${timestamp}@test.com`;
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        email,
        password: 'sessionPassword',
        name: 'Session Tester',
      });

    const userId = signupRes.body.user.id;

    const sessionRes = await request(app)
      .get('/api/auth/session')
      .set('x-user-id', userId);

    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.success).toBe(true);
    expect(sessionRes.body.user.id).toBe(userId);
    expect(sessionRes.body.user.name).toBe('Session Tester');
  });

  it('automatically grants admin role to admin@evnt.live bootstrap email', async () => {
    const email = `admin@evnt.live`;
    // If it exists in test fixtures, delete it first to test signup bootstrap
    db.prepare('DELETE FROM users WHERE email = ?').run(email);

    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        email,
        password: 'superSecretAdminPassword',
        name: 'Platform Super Admin',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('admin');
  });
});
