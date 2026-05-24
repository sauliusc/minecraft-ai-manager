import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const usersRouter = Router();

const BCRYPT_ROUNDS = 12;

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().default(''),
  password: z.string().min(8),
  role: z.enum(['SUPER_ADMIN', 'MODERATOR']).default('MODERATOR'),
  autoConfirm: z.boolean().default(false),
});

const updateUserSchema = z.object({
  name: z.string().optional(),
  role: z.enum(['SUPER_ADMIN', 'MODERATOR']).optional(),
  autoConfirm: z.boolean().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

function omitHash({ passwordHash: _pw, ...rest }: any) {
  void _pw;
  return rest;
}

function requireSuperAdmin(req: Request, res: Response): boolean {
  const user = (req as AuthenticatedRequest).user;
  if (user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'SUPER_ADMIN required', statusCode: 403 });
    return false;
  }
  return true;
}

// GET /api/users/me — current user profile
usersRouter.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
    if (!dbUser) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'User not found', statusCode: 404 });
      return;
    }
    res.json(omitHash(dbUser));
  } catch (err) {
    next(err);
  }
});

// GET /api/users — list users (SUPER_ADMIN only)
usersRouter.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const roleFilter = req.query.role as string | undefined;
    const isActiveFilter = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

    const where: Record<string, unknown> = {};
    if (roleFilter) where.role = roleFilter;
    if (isActiveFilter !== undefined) where.isActive = isActiveFilter;

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      data: users.map(omitHash),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/users — create user (SUPER_ADMIN only)
usersRouter.post('/', authMiddleware, validateBody(createUserSchema), async (req: Request, res: Response, next: NextFunction) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const data = req.body as z.infer<typeof createUserSchema>;
    const creator = (req as AuthenticatedRequest).user;
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        role: data.role,
        autoConfirm: data.autoConfirm,
        isActive: true,
        createdBy: creator.sub,
      },
    });
    res.status(201).json(omitHash(user));
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'CONFLICT', message: 'Email already in use', statusCode: 409 });
      return;
    }
    next(err);
  }
});

// PATCH /api/users/:id — update user
usersRouter.patch('/:id', authMiddleware, validateBody(updateUserSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestingUser = (req as AuthenticatedRequest).user;
    const targetId = req.params.id as string;
    const isSelf = requestingUser.sub === targetId;
    const isSuperAdmin = requestingUser.role === 'SUPER_ADMIN';

    if (!isSelf && !isSuperAdmin) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot update another user', statusCode: 403 });
      return;
    }

    const data = req.body as z.infer<typeof updateUserSchema>;
    const update: Record<string, unknown> = {};

    // Fields any user can update for themselves
    if (data.name !== undefined) update.name = data.name;
    if (data.password !== undefined) update.passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    // Fields only SUPER_ADMIN can update
    if (isSuperAdmin) {
      if (data.role !== undefined) update.role = data.role;
      if (data.autoConfirm !== undefined) update.autoConfirm = data.autoConfirm;
      if (data.isActive !== undefined) update.isActive = data.isActive;
    } else {
      // Non-admins cannot update admin-only fields
      if (data.role !== undefined || data.autoConfirm !== undefined || data.isActive !== undefined) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot update role, autoConfirm or isActive', statusCode: 403 });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id: targetId },
      data: update,
    });
    res.json(omitHash(user));
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'User not found', statusCode: 404 });
      return;
    }
    next(err);
  }
});

// DELETE /api/users/:id — deactivate (SUPER_ADMIN only)
usersRouter.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const requestingUser = (req as AuthenticatedRequest).user;
    const targetId = req.params.id as string;

    if (requestingUser.sub === targetId) {
      res.status(400).json({ error: 'INVALID', message: 'Cannot deactivate yourself', statusCode: 400 });
      return;
    }

    // Ensure there is at least one other active SUPER_ADMIN with autoConfirm=true
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'User not found', statusCode: 404 });
      return;
    }

    if (target.role === 'SUPER_ADMIN' && target.autoConfirm) {
      const activeAdmins = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', autoConfirm: true, isActive: true, id: { not: targetId } },
      });
      if (activeAdmins === 0) {
        res.status(400).json({ error: 'INVALID', message: 'Cannot deactivate the last active SUPER_ADMIN with autoConfirm', statusCode: 400 });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id: targetId },
      data: { isActive: false },
    });
    res.json(omitHash(user));
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'User not found', statusCode: 404 });
      return;
    }
    next(err);
  }
});
