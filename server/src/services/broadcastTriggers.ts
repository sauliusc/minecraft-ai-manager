import { prisma } from '../lib/prisma.js';
import { deliverBroadcast, deliverToPlayer } from './broadcast.js';
import { withRcon } from '../lib/rcon.js';

/**
 * Evaluation of the automated broadcast triggers.
 *
 * The dashboard has let admins enable these and edit their JSON config since the
 * Broadcast page was built, and stored the result in `BroadcastTrigger`. Nothing
 * ever read that table (#308) — the UI carried a "not yet executed" badge.
 *
 * Two of the three are evaluated here on the broadcast scheduler's tick.
 * DAILY_LOGIN is per-player and fires from the join path instead, in
 * `routes/players.ts`, because that is the only place that knows a player just
 * logged in.
 */

/** Substitutes {player}, {count} and {value} into a configured message. */
export function renderMessage(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

/** Milestone thresholds a config may declare, cleaned up and ordered. */
export function parseMilestones(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((n) => Number.isFinite(n) && n > 0))].sort(
    (a, b) => a - b
  );
}

/**
 * The highest milestone at or below `current` that has not been announced yet.
 *
 * Returns only the highest rather than every crossed threshold: if the server
 * jumps from 8 to 60 players, one "we hit 50" message is the useful one, and
 * announcing 10/25/50 in a burst is not.
 */
export function nextMilestone(
  milestones: number[],
  current: number,
  announced: number[]
): number | null {
  const due = milestones.filter((m) => current >= m && !announced.includes(m));
  return due.length > 0 ? due[due.length - 1] : null;
}

export function isCoolingDown(
  lastFiredAt: Date | null | undefined,
  cooldownMinutes: number,
  now: Date
): boolean {
  if (!lastFiredAt) return false;
  return now.getTime() - lastFiredAt.getTime() < cooldownMinutes * 60_000;
}

/** Online player count via RCON `list`, or null when the server cannot be reached. */
export async function onlinePlayerCount(): Promise<number | null> {
  try {
    const response = await withRcon(async (rcon) => rcon.send('list'));
    // "There are 3 of a max of 20 players online: a, b, c"
    const match = /There are (\d+)/i.exec(response ?? '');
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

interface TriggerRow {
  id: string;
  type: string;
  enabled: boolean;
  config: unknown;
  lastFiredAt: Date | null;
  state: unknown;
}

async function markFired(id: string, now: Date, state?: Record<string, unknown>): Promise<void> {
  await prisma.broadcastTrigger.update({
    where: { id },
    data: { lastFiredAt: now, ...(state ? { state: state as any } : {}) },
  });
}

/**
 * MILESTONE — announce to everyone when registered players cross a threshold.
 * Config: { message, playerMilestones: [10, 25, 50, 100] }
 */
async function evaluateMilestone(trigger: TriggerRow, now: Date): Promise<boolean> {
  const config = asRecord(trigger.config);
  const milestones = parseMilestones(config.playerMilestones);
  if (milestones.length === 0) return false;

  const state = asRecord(trigger.state);
  const announced = parseMilestones(state.announced);
  const total = await prisma.player.count();

  const due = nextMilestone(milestones, total, announced);
  if (due === null) return false;

  const message = renderMessage(
    asString(config.message, 'We just reached {value} players! Thanks for playing.'),
    { value: due, count: total }
  );

  await deliverBroadcast(['CHAT'], message, 'ALL');
  // Record every threshold at or below this one, so skipped-over milestones do
  // not fire later if the count dips and recovers.
  await markFired(trigger.id, now, {
    ...state,
    announced: [...new Set([...announced, ...milestones.filter((m) => m <= due)])],
  });
  return true;
}

/**
 * LOW_ACTIVITY — tell staff when the server is quiet.
 * Config: { message, threshold: 2, cooldownMinutes: 120 }
 */
async function evaluateLowActivity(trigger: TriggerRow, now: Date): Promise<boolean> {
  const config = asRecord(trigger.config);
  const threshold = asNumber(config.threshold, 1);
  const cooldownMinutes = asNumber(config.cooldownMinutes, 120);

  // Without a cooldown this would fire on every tick of a quiet night.
  if (isCoolingDown(trigger.lastFiredAt, cooldownMinutes, now)) return false;

  const online = await onlinePlayerCount();
  // Unreachable server is a different problem, and not one to alert on here.
  if (online === null || online >= threshold) return false;

  const message = renderMessage(
    asString(config.message, 'Only {count} player(s) online right now.'),
    { count: online, value: threshold }
  );

  await deliverBroadcast(['CHAT'], message, 'MODS');
  await markFired(trigger.id, now);
  return true;
}

/**
 * Evaluates the timer-driven triggers. Returns how many fired.
 *
 * One trigger failing must not stop the others, and a failure must not mark the
 * trigger as fired — otherwise an outage would silently consume a milestone.
 */
export async function evaluateTriggers(now: Date = new Date()): Promise<number> {
  const triggers = (await prisma.broadcastTrigger.findMany({
    where: { enabled: true, type: { in: ['MILESTONE', 'LOW_ACTIVITY'] } },
  })) as unknown as TriggerRow[];

  let fired = 0;
  for (const trigger of triggers) {
    try {
      const didFire =
        trigger.type === 'MILESTONE'
          ? await evaluateMilestone(trigger, now)
          : await evaluateLowActivity(trigger, now);
      if (didFire) fired++;
    } catch (err) {
      console.error(
        `[broadcast] trigger ${trigger.type} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return fired;
}

/**
 * DAILY_LOGIN — greet a player the first time they log in on a given day.
 *
 * Called from the join path rather than the timer: only that knows a player has
 * just connected. `previousSeenAt` is the player's lastSeenAt from *before* this
 * join, so a same-day reconnect does not re-greet.
 */
export async function fireDailyLoginTrigger(
  username: string,
  previousSeenAt: Date | null,
  now: Date = new Date()
): Promise<boolean> {
  const trigger = (await prisma.broadcastTrigger.findFirst({
    where: { type: 'DAILY_LOGIN' as any, enabled: true },
  })) as unknown as TriggerRow | null;
  if (!trigger) return false;

  if (previousSeenAt && isSameUtcDay(previousSeenAt, now)) return false;

  const config = asRecord(trigger.config);
  const message = renderMessage(
    asString(config.message, 'Welcome back, {player}!'),
    { player: username }
  );

  // Targeted at the one player: this is a greeting, not an announcement.
  await deliverToPlayer(['CHAT'], message, username);
  return true;
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
