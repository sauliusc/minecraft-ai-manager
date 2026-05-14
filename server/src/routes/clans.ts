import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, serviceTokenMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

export const clansRouter = Router();

const INVITE_EXPIRY_HOURS = 24;
const CLAN_CREATION_COST = 500;

function requireAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'SUPER_ADMIN required', statusCode: 403 });
    return false;
  }
  return true;
}

function clanLevel(xp: number): number {
  // Level up every 1000 XP, max level 10
  return Math.min(10, Math.floor(xp / 1000) + 1);
}

async function buildClanResponse(clan: any) {
  const members = clan.members ?? [];
  return {
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    leaderId: clan.leaderId,
    xp: clan.xp,
    level: clan.level,
    homeWorld: clan.homeWorld,
    homeX: clan.homeX,
    homeY: clan.homeY,
    homeZ: clan.homeZ,
    createdAt: clan.createdAt,
    members: members.map((m: any) => m.playerId),
  };
}

// GET /api/clans/member/:playerId — service token, get the clan a player belongs to
clansRouter.get('/member/:playerId', serviceTokenMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { playerId } = req.params as { playerId: string };
    const member = await prisma.clanMember.findUnique({
      where: { playerId },
      include: { clan: { include: { members: true } } },
    });
    if (!member) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Player is not in a clan', statusCode: 404 });
      return;
    }
    res.json(await buildClanResponse(member.clan));
  } catch (err) {
    next(err);
  }
});

// GET /api/clans/:id — JWT
clansRouter.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const clan = await prisma.clan.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!clan) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Clan not found', statusCode: 404 });
      return;
    }
    res.json(await buildClanResponse(clan));
  } catch (err) {
    next(err);
  }
});

// GET /api/clans/:id/home — service token
clansRouter.get('/:id/home', serviceTokenMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const clan = await prisma.clan.findUnique({ where: { id }, select: { homeWorld: true, homeX: true, homeY: true, homeZ: true } });
    if (!clan) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Clan not found', statusCode: 404 });
      return;
    }
    if (!clan.homeWorld) {
      res.status(404).json({ error: 'NOT_SET', message: 'Clan home not set', statusCode: 404 });
      return;
    }
    res.json({ world: clan.homeWorld, x: clan.homeX, y: clan.homeY, z: clan.homeZ });
  } catch (err) {
    next(err);
  }
});

// GET /api/clans/:id/wars — JWT (war history for a clan)
clansRouter.get('/:id/wars', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const clan = await prisma.clan.findUnique({ where: { id }, select: { id: true } });
    if (!clan) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Clan not found', statusCode: 404 });
      return;
    }
    const wars = await prisma.clanWar.findMany({
      where: { OR: [{ clan1Id: id }, { clan2Id: id }] },
      orderBy: { startedAt: 'desc' },
    });
    res.json({ clanId: id, wars });
  } catch (err) {
    next(err);
  }
});

const warStartSchema = z.object({
  warId: z.string().min(1),
  clan1Id: z.string().min(1),
  clan2Id: z.string().min(1),
  type: z.string().min(1),
  durationMs: z.number().int().positive(),
});

const warResultSchema = z.object({
  warId: z.string().min(1),
  winnerId: z.string().optional(),
  clan1Score: z.number().int().min(0),
  clan2Score: z.number().int().min(0),
});

// POST /api/clans/wars — service token (WarManager calls this on war start)
clansRouter.post('/wars', serviceTokenMiddleware, validateBody(warStartSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { warId, clan1Id, clan2Id, type, durationMs } = req.body as z.infer<typeof warStartSchema>;
    const war = await prisma.clanWar.create({
      data: { id: warId, clan1Id, clan2Id, type, durationMs },
    });
    res.status(201).json(war);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'CONFLICT', message: 'War already exists', statusCode: 409 });
      return;
    }
    next(err);
  }
});

// POST /api/clans/wars/:warId/result — service token (WarManager calls this on war resolution)
clansRouter.post('/wars/:warId/result', serviceTokenMiddleware, validateBody(warResultSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { warId } = req.params as { warId: string };
    const { winnerId, clan1Score, clan2Score } = req.body as z.infer<typeof warResultSchema>;
    const war = await prisma.clanWar.update({
      where: { id: warId },
      data: { winnerId: winnerId ?? null, clan1Score, clan2Score, endedAt: new Date() },
    });
    res.json(war);
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'War not found', statusCode: 404 });
      return;
    }
    next(err);
  }
});

const createClanSchema = z.object({
  name: z.string().min(1).max(32),
  tag: z.string().min(1).max(5),
  leaderId: z.string().min(1),
});

// POST /api/clans — service token
clansRouter.post('/', serviceTokenMiddleware, validateBody(createClanSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, tag, leaderId } = req.body as z.infer<typeof createClanSchema>;

    // Check existing membership
    const existing = await prisma.clanMember.findUnique({ where: { playerId: leaderId } });
    if (existing) {
      res.status(409).json({ error: 'CONFLICT', message: 'Player already in a clan', statusCode: 409 });
      return;
    }

    // Check coin balance
    const player = await prisma.player.findUnique({ where: { id: leaderId }, select: { coins: true } });
    if (!player) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found', statusCode: 404 });
      return;
    }
    if (player.coins < CLAN_CREATION_COST) {
      res.status(402).json({ error: 'PAYMENT_REQUIRED', message: `Requires ${CLAN_CREATION_COST} Coins`, statusCode: 402 });
      return;
    }

    const clan = await prisma.$transaction(async (tx) => {
      await tx.player.update({ where: { id: leaderId }, data: { coins: { decrement: CLAN_CREATION_COST } } });
      const c = await tx.clan.create({
        data: { name, tag, leaderId },
        include: { members: true },
      });
      await tx.clanMember.create({ data: { clanId: c.id, playerId: leaderId, role: 'LEADER' } });
      return tx.clan.findUnique({ where: { id: c.id }, include: { members: true } });
    });

    res.status(201).json(await buildClanResponse(clan));
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'CONFLICT', message: 'Clan name or tag already taken', statusCode: 409 });
      return;
    }
    next(err);
  }
});

const inviteSchema = z.object({
  clanId: z.string().min(1),
  inviterId: z.string().min(1),
  inviteeId: z.string().min(1),
});

// POST /api/clans/:id/invites — service token
clansRouter.post('/:id/invites', serviceTokenMiddleware, validateBody(inviteSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { inviterId, inviteeId } = req.body as z.infer<typeof inviteSchema>;

    // Verify inviter is leader/officer
    const inviter = await prisma.clanMember.findFirst({
      where: { clanId: id, playerId: inviterId, role: { in: ['LEADER', 'OFFICER'] } },
    });
    if (!inviter) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Only leader/officer can invite', statusCode: 403 });
      return;
    }

    // Check invitee not already in a clan
    const existingMembership = await prisma.clanMember.findUnique({ where: { playerId: inviteeId } });
    if (existingMembership) {
      res.status(409).json({ error: 'CONFLICT', message: 'Player already in a clan', statusCode: 409 });
      return;
    }

    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 3_600_000);
    const invite = await prisma.clanInvite.upsert({
      where: { clanId_inviteeId: { clanId: id, inviteeId } },
      create: { clanId: id, inviterId, inviteeId, expiresAt },
      update: { inviterId, expiresAt },
    });

    res.status(201).json(invite);
  } catch (err) {
    next(err);
  }
});

const joinSchema = z.object({
  playerId: z.string().min(1),
});

// POST /api/clans/:id/members — service token (join via invite)
clansRouter.post('/:id/members', serviceTokenMiddleware, validateBody(joinSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { playerId } = req.body as z.infer<typeof joinSchema>;

    // Must have a valid invite
    const invite = await prisma.clanInvite.findUnique({
      where: { clanId_inviteeId: { clanId: id, inviteeId: playerId } },
    });
    if (!invite || invite.expiresAt < new Date()) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'No valid invite for this clan', statusCode: 403 });
      return;
    }

    // Check not already in a clan
    const existing = await prisma.clanMember.findUnique({ where: { playerId } });
    if (existing) {
      res.status(409).json({ error: 'CONFLICT', message: 'Already in a clan', statusCode: 409 });
      return;
    }

    const member = await prisma.$transaction(async (tx) => {
      await tx.clanInvite.delete({ where: { id: invite.id } });
      return tx.clanMember.create({ data: { clanId: id, playerId, role: 'MEMBER' } });
    });

    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
});

const leaveSchema = z.object({
  playerId: z.string().min(1),
});

// POST /api/clans/:id/leave — service token
clansRouter.post('/:id/leave', serviceTokenMiddleware, validateBody(leaveSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { playerId } = req.body as z.infer<typeof leaveSchema>;

    const member = await prisma.clanMember.findFirst({ where: { clanId: id, playerId } });
    if (!member) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Player not in this clan', statusCode: 404 });
      return;
    }

    const clan = await prisma.clan.findUnique({ where: { id }, include: { members: true } });
    if (!clan) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Clan not found', statusCode: 404 });
      return;
    }

    if (clan.leaderId === playerId) {
      const otherMembers = clan.members.filter((m) => m.playerId !== playerId);
      if (otherMembers.length === 0) {
        // Disband clan
        await prisma.clan.delete({ where: { id } });
        res.json({ disbanded: true });
        return;
      }
      // Transfer leadership to oldest officer or member
      const officer = otherMembers.find((m) => m.role === 'OFFICER') ?? otherMembers[0];
      await prisma.$transaction([
        prisma.clan.update({ where: { id }, data: { leaderId: officer.playerId } }),
        prisma.clanMember.update({ where: { id: officer.id }, data: { role: 'LEADER' } }),
        prisma.clanMember.delete({ where: { id: member.id } }),
      ]);
    } else {
      await prisma.clanMember.delete({ where: { id: member.id } });
    }

    res.json({ left: true });
  } catch (err) {
    next(err);
  }
});

const setHomeSchema = z.object({
  world: z.string().min(1),
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

// POST /api/clans/:id/home — service token (leader only, enforced in plugin)
clansRouter.post('/:id/home', serviceTokenMiddleware, validateBody(setHomeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { world, x, y, z } = req.body as z.infer<typeof setHomeSchema>;

    const clan = await prisma.clan.update({
      where: { id },
      data: { homeWorld: world, homeX: x, homeY: y, homeZ: z },
    });

    res.json({ world: clan.homeWorld, x: clan.homeX, y: clan.homeY, z: clan.homeZ });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Clan not found', statusCode: 404 });
      return;
    }
    next(err);
  }
});

const addXpSchema = z.object({
  xp: z.number().int().positive(),
});

// POST /api/clans/:id/xp — service token (add XP from quest/war completion)
clansRouter.post('/:id/xp', serviceTokenMiddleware, validateBody(addXpSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { xp } = req.body as z.infer<typeof addXpSchema>;

    const updated = await prisma.clan.update({
      where: { id },
      data: { xp: { increment: xp }, level: clanLevel((await prisma.clan.findUnique({ where: { id }, select: { xp: true } }))!.xp + xp) },
    });

    res.json({ id: updated.id, xp: updated.xp, level: updated.level });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Clan not found', statusCode: 404 });
      return;
    }
    next(err);
  }
});

// GET /api/clans — JWT (list clans, admin)
clansRouter.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const [total, clans] = await Promise.all([
      prisma.clan.count(),
      prisma.clan.findMany({
        orderBy: { level: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { members: true },
      }),
    ]);
    res.json({
      data: await Promise.all(clans.map(buildClanResponse)),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/clans/:id — JWT + SUPER_ADMIN
clansRouter.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { id } = req.params as { id: string };
    await prisma.clan.delete({ where: { id } }).catch((e: any) => {
      if (e?.code === 'P2025') {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Clan not found', statusCode: 404 });
      } else throw e;
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
