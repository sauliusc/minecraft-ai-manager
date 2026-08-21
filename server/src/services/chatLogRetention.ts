import { prisma } from '../lib/prisma.js';

/**
 * How long chat log entries are kept.
 *
 * The chat log had no producer until the plugin started shipping to it (#309),
 * so it never grew and nobody had to pick a retention policy. Now that it does
 * grow — one row per message, forever — it needs one: CT102 keeps Postgres, the
 * Minecraft world and every pulled image on a single volume (#317), so an
 * unbounded table is a real operational risk.
 */
const DEFAULT_RETENTION_DAYS = 30;

export function retentionDays(): number {
  const configured = Number(process.env.CHAT_LOG_RETENTION_DAYS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RETENTION_DAYS;
}

/** How often to sweep. Daily is plenty for a day-granularity policy. */
export const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

export async function pruneChatLog(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays() * 24 * 60 * 60 * 1000);
  const { count } = await prisma.chatLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (count > 0) {
    console.log(`[chat-log] pruned ${count} entries older than ${retentionDays()} days`);
  }
  return count;
}

export function startChatLogRetention(intervalMs: number = SWEEP_INTERVAL_MS): void {
  if (timer) return;
  const sweep = () => {
    pruneChatLog().catch((err) => console.error('[chat-log] retention sweep failed:', err));
  };
  sweep(); // Once at boot, so a restart is not a way to postpone retention forever.
  timer = setInterval(sweep, intervalMs);
  timer.unref?.();
  console.log(`[chat-log] retention started (${retentionDays()} day window)`);
}

export function stopChatLogRetention(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
