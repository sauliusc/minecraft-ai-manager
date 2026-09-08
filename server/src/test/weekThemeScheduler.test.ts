import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    challenge: { count: vi.fn() },
    weekTheme: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('../routes/weekTheme.js', () => ({
  activateWeekTheme: vi.fn(),
}));

import { prisma } from '../lib/prisma.js';
import { activateWeekTheme } from '../routes/weekTheme.js';
import { nextWindow, publishIfContentRunningOut, isEnabled } from '../services/weekThemeScheduler.js';

const draft = { id: 'theme-1', theme: 'Welcome Back to Horror School', status: 'DRAFT' };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AUTO_PUBLISH_WEEK_THEME;
  (prisma.weekTheme.update as any).mockResolvedValue(draft);
  (activateWeekTheme as any).mockResolvedValue({ ok: true, theme: draft });
});

describe('nextWindow', () => {
  it('starts at the next 16:00 UTC and runs a week', () => {
    const { startDate, endDate } = nextWindow(new Date('2026-09-08T06:00:00Z'));

    expect(startDate.toISOString()).toBe('2026-09-08T16:00:00.000Z');
    expect(endDate.toISOString()).toBe('2026-09-15T16:00:00.000Z');
  });

  it('rolls to tomorrow once today’s slot has passed', () => {
    // 16:00 has gone, so starting today would create an already-expired day one.
    const { startDate } = nextWindow(new Date('2026-09-08T18:30:00Z'));
    expect(startDate.toISOString()).toBe('2026-09-09T16:00:00.000Z');
  });

  it('treats exactly 16:00 as gone rather than starting in the same minute', () => {
    const { startDate } = nextWindow(new Date('2026-09-08T16:00:00Z'));
    expect(startDate.toISOString()).toBe('2026-09-09T16:00:00.000Z');
  });

  it('never produces a start date in the past', () => {
    // The whole point: activation derives every challenge window and the event
    // time from startDate, so a past date creates dead content silently.
    for (const hour of [0, 8, 15, 16, 17, 23]) {
      const now = new Date(`2026-09-08T${String(hour).padStart(2, '0')}:30:00Z`);
      expect(nextWindow(now).startDate.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});

describe('publishIfContentRunningOut', () => {
  it('does nothing while challenges are still running', async () => {
    (prisma.challenge.count as any).mockResolvedValue(3);

    const result = await publishIfContentRunningOut();

    expect(result).toEqual({ action: 'none', activeChallenges: 3 });
    expect(activateWeekTheme).not.toHaveBeenCalled();
  });

  it('publishes the oldest draft when nothing is active', async () => {
    (prisma.challenge.count as any).mockResolvedValue(0);
    (prisma.weekTheme.findFirst as any).mockResolvedValue(draft);

    const result = await publishIfContentRunningOut();

    expect(result).toMatchObject({ action: 'published', themeId: 'theme-1' });
    expect(prisma.weekTheme.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'DRAFT' }, orderBy: { createdAt: 'asc' } })
    );
    expect(activateWeekTheme).toHaveBeenCalledWith('theme-1', 'auto-publish');
  });

  it('rolls the dates forward before publishing', async () => {
    // Publishing a draft dated in the past is exactly how a theme ends up with
    // expired challenges and an event that never fires.
    (prisma.challenge.count as any).mockResolvedValue(0);
    (prisma.weekTheme.findFirst as any).mockResolvedValue(draft);

    await publishIfContentRunningOut(new Date('2026-09-08T06:00:00Z'));

    const update = (prisma.weekTheme.update as any).mock.calls[0][0];
    expect(update.where).toEqual({ id: 'theme-1' });
    expect(update.data.startDate.toISOString()).toBe('2026-09-08T16:00:00.000Z');
    expect(update.data.endDate.toISOString()).toBe('2026-09-15T16:00:00.000Z');
  });

  it('reports when there is nothing to publish, rather than staying silent', async () => {
    (prisma.challenge.count as any).mockResolvedValue(0);
    (prisma.weekTheme.findFirst as any).mockResolvedValue(null);

    expect(await publishIfContentRunningOut()).toEqual({ action: 'no-draft' });
  });

  it('reports a failed activation instead of swallowing it', async () => {
    (prisma.challenge.count as any).mockResolvedValue(0);
    (prisma.weekTheme.findFirst as any).mockResolvedValue(draft);
    (activateWeekTheme as any).mockResolvedValue({
      ok: false, status: 422, error: 'UNPROCESSABLE', message: 'payload invalid',
    });

    expect(await publishIfContentRunningOut()).toEqual({
      action: 'failed', themeId: 'theme-1', message: 'payload invalid',
    });
  });
});

describe('isEnabled', () => {
  it('is on unless explicitly turned off', () => {
    // Opting out rather than in: the failure it prevents is silent.
    expect(isEnabled()).toBe(true);
    process.env.AUTO_PUBLISH_WEEK_THEME = 'true';
    expect(isEnabled()).toBe(true);
    process.env.AUTO_PUBLISH_WEEK_THEME = 'false';
    expect(isEnabled()).toBe(false);
  });
});
