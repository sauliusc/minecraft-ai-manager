import { prisma } from '../lib/prisma.js';
import { deliverBroadcast } from './broadcast.js';
import { evaluateTriggers } from './broadcastTriggers.js';

/**
 * How often to look for broadcasts that have come due. A scheduled broadcast is
 * therefore delivered within a minute of its time, which is as precise as the
 * dashboard's minute-granularity picker can express anyway.
 */
export const TICK_INTERVAL_MS = 60_000;

let timer: NodeJS.Timeout | null = null;

/**
 * Delivers every SCHEDULED broadcast whose time has passed.
 *
 * Each message is delivered *before* it is marked SENT, and one that fails to
 * deliver is left SCHEDULED so the next tick retries it. The endpoint this
 * replaces did the opposite — it marked a batch SENT as a side effect of a GET
 * and trusted an unspecified caller to deliver them, so anything that went wrong
 * downstream lost the message silently (#305).
 */
export async function deliverDueBroadcasts(now: Date = new Date()): Promise<number> {
  const due = await prisma.broadcastMessage.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
    orderBy: { scheduledAt: 'asc' },
  });

  let delivered = 0;
  for (const msg of due) {
    try {
      await deliverBroadcast(msg.channels as string[], msg.content, msg.audience);
      await prisma.broadcastMessage.update({
        where: { id: msg.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      delivered++;
    } catch (err) {
      // Left SCHEDULED on purpose: the next tick retries it.
      console.error(
        `[broadcast] delivery failed for ${msg.id}, will retry next tick:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return delivered;
}

export function startBroadcastScheduler(intervalMs: number = TICK_INTERVAL_MS): void {
  if (timer) return;
  timer = setInterval(() => {
    // Independent of each other: a failing trigger must not stop scheduled
    // messages going out, and vice versa.
    deliverDueBroadcasts().catch((err) => {
      console.error('[broadcast] scheduler tick failed:', err);
    });
    evaluateTriggers().catch((err) => {
      console.error('[broadcast] trigger evaluation failed:', err);
    });
  }, intervalMs);
  // Do not hold the process open just for this timer.
  timer.unref?.();
  console.log(`[broadcast] scheduler started (every ${intervalMs / 1000}s)`);
}

export function stopBroadcastScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
