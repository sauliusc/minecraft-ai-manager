import { prisma } from '../lib/prisma.js';
import { activateWeekTheme } from '../routes/weekTheme.js';

/**
 * Publishes a drafted week theme when the server is about to run out of content.
 *
 * Challenges only exist because somebody remembered to press activate. When
 * nobody did, the server went quiet for two months without anything saying so
 * (#333). This closes that gap for the case where a draft already exists.
 *
 * Deliberately does **not** generate new content. Publishing something a human
 * wrote and reviewed is a different risk from putting AI output in front of
 * players unseen, and only the first is safe to do unattended.
 */

/** How often to look. Content runs out on a day scale, so hourly is plenty. */
export const TICK_INTERVAL_MS = 60 * 60 * 1000;

/** The hour (UTC) a rolled-forward theme starts — the observed peak play time. */
const START_HOUR_UTC = 16;

let timer: NodeJS.Timeout | null = null;

export function isEnabled(): boolean {
  // Opt out rather than in: the failure this prevents is silent, and a server
  // with no challenges is worse than one running a slightly stale theme.
  return process.env.AUTO_PUBLISH_WEEK_THEME !== 'false';
}

/** Challenges playable right now. */
export async function activeChallengeCount(now: Date = new Date()): Promise<number> {
  return prisma.challenge.count({
    where: { activeFrom: { lte: now }, activeUntil: { gte: now } },
  });
}

/**
 * Moves a theme's window so it starts at the next {@link START_HOUR_UTC} and
 * runs a week.
 *
 * Activation derives every challenge window and the event time from startDate,
 * so publishing a draft dated in the past creates challenges that are already
 * expired and an event that silently never fires. Rolling the dates forward is
 * what makes unattended publishing safe at all.
 */
export function nextWindow(now: Date = new Date()): { startDate: Date; endDate: Date } {
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  if (start.getUTCHours() >= START_HOUR_UTC) start.setUTCDate(start.getUTCDate() + 1);
  start.setUTCHours(START_HOUR_UTC);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { startDate: start, endDate: end };
}

/**
 * Publishes the oldest waiting draft when nothing is active.
 *
 * Returns what it did, so the caller can log something useful rather than
 * silence — silence is how the original problem lasted two months.
 */
export async function publishIfContentRunningOut(now: Date = new Date()): Promise<
  { action: 'none'; activeChallenges: number }
  | { action: 'published'; themeId: string; theme: string }
  | { action: 'no-draft' }
  | { action: 'failed'; themeId: string; message: string }
> {
  const active = await activeChallengeCount(now);
  if (active > 0) return { action: 'none', activeChallenges: active };

  const draft = await prisma.weekTheme.findFirst({
    where: { status: 'DRAFT' },
    orderBy: { createdAt: 'asc' },
  });
  if (!draft) return { action: 'no-draft' };

  const { startDate, endDate } = nextWindow(now);
  await prisma.weekTheme.update({ where: { id: draft.id }, data: { startDate, endDate } });

  const result = await activateWeekTheme(draft.id, 'auto-publish');
  if (!result.ok) {
    return { action: 'failed', themeId: draft.id, message: result.message };
  }
  return { action: 'published', themeId: draft.id, theme: draft.theme };
}

export async function tick(now: Date = new Date()): Promise<void> {
  const result = await publishIfContentRunningOut(now);
  switch (result.action) {
    case 'published':
      console.log(`[week-theme] no active challenges — published "${result.theme}" (${result.themeId})`);
      break;
    case 'no-draft':
      // The one case a human has to act on, so it must not be quiet.
      console.warn('[week-theme] no active challenges and no draft to publish — '
        + 'players have nothing to do. Generate a week theme in the dashboard.');
      break;
    case 'failed':
      console.error(`[week-theme] failed to publish ${result.themeId}: ${result.message}`);
      break;
    default:
      break;
  }
}

export function startWeekThemeScheduler(intervalMs: number = TICK_INTERVAL_MS): void {
  if (timer) return;
  if (!isEnabled()) {
    console.log('[week-theme] auto-publish disabled by AUTO_PUBLISH_WEEK_THEME=false');
    return;
  }
  const run = () => { tick().catch((err) => console.error('[week-theme] tick failed:', err)); };
  run();   // check at boot, so a restart is not a way to sit idle for an hour
  timer = setInterval(run, intervalMs);
  timer.unref?.();
  console.log(`[week-theme] auto-publish started (every ${intervalMs / 60000}m)`);
}

export function stopWeekThemeScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
