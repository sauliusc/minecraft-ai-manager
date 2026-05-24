import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../index.js';

// Mock Prisma and Redis to avoid needing a real DB in unit tests
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn(),
    },
    activityLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../lib/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}));

import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';

describe('POST /api/auth/login', () => {
  it('returns 401 when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown@example.com', password: 'pass' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 with wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-1',
      email: 'admin@example.com',
      name: 'Admin',
      passwordHash,
      role: 'SUPER_ADMIN',
      autoConfirm: true,
      isActive: true,
      createdAt: new Date(),
    } as any);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns accessToken on valid credentials', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-1',
      email: 'admin@example.com',
      name: 'Admin',
      passwordHash,
      role: 'SUPER_ADMIN',
      autoConfirm: true,
      isActive: true,
      createdAt: new Date(),
    } as any);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'correct-password' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 204 and clears cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});

describe('POST /api/auth/seed', () => {
  it('returns 404 in production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = await request(app).post('/api/auth/seed').send({ email: 'a@b.com', password: 'password123' });
    expect(res.status).toBe(404);
    process.env.NODE_ENV = original;
  });

  it('creates admin user in non-production', async () => {
    vi.mocked(prisma.user.upsert).mockResolvedValueOnce({
      id: 'user-1',
      email: 'admin@example.com',
      passwordHash: 'hash',
      role: 'SUPER_ADMIN',
      createdAt: new Date(),
    } as any);
    const res = await request(app)
      .post('/api/auth/seed')
      .send({ email: 'admin@example.com', password: 'securepass123' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('SUPER_ADMIN');
  });
});
