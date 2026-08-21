import { prisma } from '../lib/prisma.js';
import { withRcon } from '../lib/rcon.js';

export const BROADCAST_AUDIENCES = ['ALL', 'VIP', 'MODS', 'NEW'] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

export const BROADCAST_CHANNELS = ['CHAT', 'TITLE', 'ACTION_BAR', 'DISCORD'] as const;
export type BroadcastChannel = (typeof BROADCAST_CHANNELS)[number];

/** Veteran and Legend tiers, i.e. 30+ joins. Matches the tiers in the user guide. */
const VIP_MIN_JOIN_COUNT = 30;
/** The "New" tier: fewer than 5 joins. */
const NEW_MAX_JOIN_COUNT = 5;

export type Recipients =
  | { kind: 'ALL' }
  | { kind: 'TARGETED'; usernames: string[] };

/**
 * Works out who a broadcast is for.
 *
 * Returns `ALL` only for the ALL audience — every other audience returns an
 * explicit username list, and an empty list means "send to nobody". Falling back
 * to everyone when a targeted audience resolves to no one is exactly the bug in
 * #307: an operator picks MODS, and the message lands in public chat.
 */
export async function resolveRecipients(audience: string): Promise<Recipients> {
  switch (audience) {
    case 'ALL':
      return { kind: 'ALL' };

    case 'VIP': {
      const players = await prisma.player.findMany({
        where: { joinCount: { gte: VIP_MIN_JOIN_COUNT } },
        select: { username: true },
      });
      return { kind: 'TARGETED', usernames: players.map((p) => p.username) };
    }

    case 'NEW': {
      const players = await prisma.player.findMany({
        where: { joinCount: { lt: NEW_MAX_JOIN_COUNT } },
        select: { username: true },
      });
      return { kind: 'TARGETED', usernames: players.map((p) => p.username) };
    }

    case 'MODS': {
      // There is no column linking a dashboard User to a Minecraft account, so
      // staff are matched by display name. Anyone whose dashboard name does not
      // match their in-game name simply is not targeted — which is the safe way
      // to be wrong here.
      const staff = await prisma.user.findMany({
        where: { role: { in: ['MODERATOR', 'SUPER_ADMIN'] }, isActive: true },
        select: { name: true },
      });
      const names = staff.map((u) => u.name).filter((n): n is string => !!n && n.trim() !== '');
      if (names.length === 0) return { kind: 'TARGETED', usernames: [] };

      const players = await prisma.player.findMany({
        where: { username: { in: names, mode: 'insensitive' } },
        select: { username: true },
      });
      return { kind: 'TARGETED', usernames: players.map((p) => p.username) };
    }

    default:
      // An unknown audience targets nobody rather than everybody.
      return { kind: 'TARGETED', usernames: [] };
  }
}

/** Minecraft commands are newline-delimited; a newline would inject a second command. */
function sanitize(content: string): string {
  return content.replace(/[\r\n]+/g, ' ');
}

/**
 * Builds the RCON commands for one delivery. Split out from sending so the
 * targeting rules can be tested without a live server.
 */
export function buildCommands(
  channels: string[],
  content: string,
  recipients: Recipients
): string[] {
  const safe = sanitize(content);
  const textJson = JSON.stringify({ text: safe });
  const cmds: string[] = [];

  if (recipients.kind === 'ALL') {
    if (channels.includes('CHAT')) cmds.push(`say ${safe}`);
    if (channels.includes('TITLE')) cmds.push(`title @a title ${textJson}`);
    if (channels.includes('ACTION_BAR')) cmds.push(`title @a actionbar ${textJson}`);
    return cmds;
  }

  for (const username of recipients.usernames) {
    // tellraw rather than `say`, which has no per-player form and would go
    // server-wide.
    if (channels.includes('CHAT')) cmds.push(`tellraw ${username} ${textJson}`);
    if (channels.includes('TITLE')) cmds.push(`title ${username} title ${textJson}`);
    if (channels.includes('ACTION_BAR')) cmds.push(`title ${username} actionbar ${textJson}`);
  }
  return cmds;
}

/**
 * Sends to exactly one player. Used for per-player messages such as the daily
 * login greeting, which must not go to the whole server.
 */
export async function deliverToPlayer(
  channels: string[],
  content: string,
  username: string
): Promise<DeliveryResult> {
  const recipients: Recipients = { kind: 'TARGETED', usernames: [username] };
  const cmds = buildCommands(channels, content, recipients);
  if (cmds.length === 0) return { targeted: 1, commandsSent: 0 };

  await withRcon(async (rcon) => {
    for (const cmd of cmds) {
      await rcon.send(cmd);
    }
  });
  return { targeted: 1, commandsSent: cmds.length };
}

export interface DeliveryResult {
  /** Number of players targeted; null for a server-wide send. */
  targeted: number | null;
  commandsSent: number;
}

/**
 * Delivers a broadcast to its audience over RCON.
 *
 * Throws if RCON itself is unreachable — callers decide whether that should fail
 * the request or just be logged.
 */
export async function deliverBroadcast(
  channels: string[],
  content: string,
  audience: string
): Promise<DeliveryResult> {
  const recipients = await resolveRecipients(audience);
  const cmds = buildCommands(channels, content, recipients);
  const targeted = recipients.kind === 'ALL' ? null : recipients.usernames.length;

  if (cmds.length === 0) return { targeted, commandsSent: 0 };

  await withRcon(async (rcon) => {
    for (const cmd of cmds) {
      await rcon.send(cmd);
    }
  });

  return { targeted, commandsSent: cmds.length };
}
