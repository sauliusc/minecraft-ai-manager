import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { signAccess, signRefresh, verifyRefresh, JwtPayload } from '../lib/jwt.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const authRouter = Router();

const REFRESH_COOKIE = 'refreshToken';
const BCRYPT_ROUNDS = 12;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const seedSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Too many login attempts', statusCode: 429 },
});

// POST /api/auth/login
authRouter.post('/login', loginLimiter, validateBody(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password', statusCode: 401 });
      return;
    }
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = signAccess(payload);
    const refreshToken = signRefresh(payload);
    res.cookie(REFRESH_COOKIE, refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'No refresh token', statusCode: 401 });
      return;
    }
    let payload: JwtPayload;
    try {
      payload = verifyRefresh(token);
    } catch {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid refresh token', statusCode: 401 });
      return;
    }
    const revoked = await redis.get(`revoked:${token}`);
    if (revoked) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token revoked', statusCode: 401 });
      return;
    }
    // Rotate: revoke old token
    const ttl = (payload as JwtPayload & { exp?: number }).exp
      ? Math.max(0, ((payload as JwtPayload & { exp?: number }).exp! - Math.floor(Date.now() / 1000)))
      : 604800;
    await redis.setex(`revoked:${token}`, ttl, '1');

    const newPayload: JwtPayload = { sub: payload.sub, email: payload.email, role: payload.role };
    const accessToken = signAccess(newPayload);
    const newRefresh = signRefresh(newPayload);
    res.cookie(REFRESH_COOKIE, newRefresh, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
authRouter.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      let ttl = 604800;
      try {
        const p = verifyRefresh(token) as JwtPayload & { exp?: number };
        ttl = p.exp ? Math.max(0, p.exp - Math.floor(Date.now() / 1000)) : 604800;
      } catch {
        // expired token — still revoke it
      }
      await redis.setex(`revoked:${token}`, ttl, '1');
    }
    res.clearCookie(REFRESH_COOKIE);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/seed  (dev only)
authRouter.post('/seed', async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found', statusCode: 404 });
    return;
  }
  try {
    const parsed = seedSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.errors, statusCode: 400 });
      return;
    }
    const { email, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, role: 'SUPER_ADMIN' },
      create: { email, passwordHash, role: 'SUPER_ADMIN' },
    });
    res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});
