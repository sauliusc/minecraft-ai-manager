import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    player: { count: vi.fn() },
    user: { findMany: vi.fn() },
    broadcastTrigger: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('../lib/rcon.js', () => ({ withRcon: vi.fn() }));

import { prisma } from '../lib/prisma.js';
import { withRcon } from '../lib/rcon.js';
import {
  renderMessage,
  parseMilestones,
  nextMilestone,
  isCoolingDown,
  isSameUtcDay,
  onlinePlayerCount,
  evaluateTriggers,
  fireDailyLoginTrigger,
} from '../services/broadcastTriggers.js';

function captureCommands() {
  const sent: string[] = [];
  (withRcon as any).mockImplementation(async (fn: any) =>
    fn({ send: async (cmd: string) => { sent.push(cmd); return ''; } })
  );
  return sent;
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.broadcastTrigger.findMany as any).mockResolvedValue([]);
  (prisma.broadcastTrigger.findFirst as any).mockResolvedValue(null);
  (prisma.broadcastTrigger.update as any).mockResolvedValue({});
});

describe('renderMessage', () => {
  it('substitutes known placeholders', () => {
    expect(renderMessage('Welcome back, {player}!', { player: 'Steve' })).toBe('Welcome back, Steve!');
    expect(renderMessage('{count} of {value}', { count: 1, value: 5 })).toBe('1 of 5');
  });

  it('leaves unknown placeholders alone rather than printing undefined', () => {
    expect(renderMessage('hi {nope}', { player: 'Steve' })).toBe('hi {nope}');
  });
});

describe('parseMilestones', () => {
  it('sorts, dedupes and drops nonsense', () => {
    expect(parseMilestones([50, 10, 10, 'x', -5, 0, 25])).toEqual([10, 25, 50]);
  });

  it('returns empty for a non-array', () => {
    expect(parseMilestones('10,25')).toEqual([]);
    expect(parseMilestones(undefined)).toEqual([]);
  });
});

describe('nextMilestone', () => {
  it('returns the highest crossed threshold not yet announced', () => {
    // A jump from 8 to 60 should say "50", not spam 10, 25 and 50.
    expect(nextMilestone([10, 25, 50, 100], 60, [])).toBe(50);
  });

  it('returns null when everything crossed is already announced', () => {
    expect(nextMilestone([10, 25], 30, [10, 25])).toBeNull();
  });

  it('returns null before any threshold is reached', () => {
    expect(nextMilestone([10, 25], 4, [])).toBeNull();
  });
});

describe('isCoolingDown', () => {
  const now = new Date('2026-08-21T12:00:00Z');

  it('is not cooling down when it has never fired', () => {
    expect(isCoolingDown(null, 120, now)).toBe(false);
  });

  it('blocks a re-fire inside the window and allows it after', () => {
    expect(isCoolingDown(new Date('2026-08-21T11:00:00Z'), 120, now)).toBe(true);
    expect(isCoolingDown(new Date('2026-08-21T09:00:00Z'), 120, now)).toBe(false);
  });
});

describe('isSameUtcDay', () => {
  it('separates days across a UTC midnight', () => {
    expect(isSameUtcDay(new Date('2026-08-21T23:59:00Z'), new Date('2026-08-22T00:01:00Z'))).toBe(false);
    expect(isSameUtcDay(new Date('2026-08-21T00:01:00Z'), new Date('2026-08-21T23:59:00Z'))).toBe(true);
  });
});

describe('onlinePlayerCount', () => {
  it('parses the vanilla list response', async () => {
    (withRcon as any).mockResolvedValue('There are 3 of a max of 20 players online: a, b, c');
    expect(await onlinePlayerCount()).toBe(3);
  });

  it('returns null when the server cannot be reached', async () => {
    (withRcon as any).mockRejectedValue(new Error('connection refused'));
    expect(await onlinePlayerCount()).toBeNull();
  });

  it('returns null for an unparseable response', async () => {
    (withRcon as any).mockResolvedValue('???');
    expect(await onlinePlayerCount()).toBeNull();
  });
});

describe('evaluateTriggers — MILESTONE', () => {
  const milestone = {
    id: 't1',
    type: 'MILESTONE',
    enabled: true,
    config: { message: 'We hit {value}!', playerMilestones: [10, 25] },
    lastFiredAt: null,
    state: {},
  };

  it('announces a crossed milestone and records every threshold below it', async () => {
    const sent = captureCommands();
    (prisma.broadcastTrigger.findMany as any).mockResolvedValue([milestone]);
    (prisma.player.count as any).mockResolvedValue(30);

    expect(await evaluateTriggers()).toBe(1);
    expect(sent).toEqual(['say We hit 25!']);
    expect(prisma.broadcastTrigger.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ state: { announced: [10, 25] } }),
      })
    );
  });

  it('does not re-announce an already recorded milestone', async () => {
    (prisma.broadcastTrigger.findMany as any).mockResolvedValue([
      { ...milestone, state: { announced: [10, 25] } },
    ]);
    (prisma.player.count as any).mockResolvedValue(30);

    expect(await evaluateTriggers()).toBe(0);
    expect(withRcon).not.toHaveBeenCalled();
  });

  it('does nothing when no thresholds are configured', async () => {
    (prisma.broadcastTrigger.findMany as any).mockResolvedValue([{ ...milestone, config: {} }]);

    expect(await evaluateTriggers()).toBe(0);
    expect(prisma.player.count).not.toHaveBeenCalled();
  });
});

describe('evaluateTriggers — LOW_ACTIVITY', () => {
  const lowActivity = {
    id: 't2',
    type: 'LOW_ACTIVITY',
    enabled: true,
    config: { message: 'Only {count} online.', threshold: 2, cooldownMinutes: 120 },
    lastFiredAt: null,
    state: {},
  };

  it('warns moderators, not the whole server', async () => {
    const sent = captureCommands();
    (prisma.broadcastTrigger.findMany as any).mockResolvedValue([lowActivity]);
    (withRcon as any).mockImplementation(async (fn: any) =>
      fn({ send: async (cmd: string) => { sent.push(cmd); return 'There are 1 of a max of 20 players online: a'; } })
    );
    (prisma.user.findMany as any).mockResolvedValue([{ name: 'ModSteve' }]);
    (prisma.player as any).findMany = vi.fn().mockResolvedValue([{ username: 'ModSteve' }]);

    expect(await evaluateTriggers()).toBe(1);
    expect(sent).toContain('tellraw ModSteve {"text":"Only 1 online."}');
    expect(sent.some((c) => c.startsWith('say '))).toBe(false);
  });

  it('stays quiet while cooling down', async () => {
    const now = new Date('2026-08-21T12:00:00Z');
    (prisma.broadcastTrigger.findMany as any).mockResolvedValue([
      { ...lowActivity, lastFiredAt: new Date('2026-08-21T11:00:00Z') },
    ]);

    expect(await evaluateTriggers(now)).toBe(0);
    expect(withRcon).not.toHaveBeenCalled();
  });

  it('stays quiet when the server is above the threshold', async () => {
    (prisma.broadcastTrigger.findMany as any).mockResolvedValue([lowActivity]);
    (withRcon as any).mockResolvedValue('There are 8 of a max of 20 players online: a');

    expect(await evaluateTriggers()).toBe(0);
    expect(prisma.broadcastTrigger.update).not.toHaveBeenCalled();
  });

  it('does not alert when the server is unreachable', async () => {
    // That is an outage, a different problem, and not what this trigger is for.
    (prisma.broadcastTrigger.findMany as any).mockResolvedValue([lowActivity]);
    (withRcon as any).mockRejectedValue(new Error('down'));

    expect(await evaluateTriggers()).toBe(0);
    expect(prisma.broadcastTrigger.update).not.toHaveBeenCalled();
  });
});

describe('evaluateTriggers — isolation', () => {
  it('keeps evaluating after one trigger throws, and does not mark it fired', async () => {
    (prisma.broadcastTrigger.findMany as any).mockResolvedValue([
      { id: 'bad', type: 'MILESTONE', enabled: true, config: { playerMilestones: [1] }, lastFiredAt: null, state: {} },
      { id: 'ok', type: 'MILESTONE', enabled: true, config: { playerMilestones: [1] }, lastFiredAt: null, state: {} },
    ]);
    let call = 0;
    (prisma.player.count as any).mockImplementation(async () => {
      call++;
      if (call === 1) throw new Error('db blip');
      return 5;
    });
    (withRcon as any).mockImplementation(async (fn: any) => fn({ send: async () => '' }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await evaluateTriggers()).toBe(1);
    expect(prisma.broadcastTrigger.update).toHaveBeenCalledTimes(1);
    expect(prisma.broadcastTrigger.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ok' } })
    );
    consoleError.mockRestore();
  });
});

describe('fireDailyLoginTrigger', () => {
  const trigger = {
    id: 't3',
    type: 'DAILY_LOGIN',
    enabled: true,
    config: { message: 'Welcome back, {player}!' },
    lastFiredAt: null,
    state: {},
  };

  it('greets the player privately, not the whole server', async () => {
    const sent = captureCommands();
    (prisma.broadcastTrigger.findFirst as any).mockResolvedValue(trigger);

    expect(await fireDailyLoginTrigger('Steve', null)).toBe(true);
    expect(sent).toEqual(['tellraw Steve {"text":"Welcome back, Steve!"}']);
  });

  it('does not greet twice on the same day', async () => {
    (prisma.broadcastTrigger.findFirst as any).mockResolvedValue(trigger);
    const now = new Date('2026-08-21T18:00:00Z');

    expect(await fireDailyLoginTrigger('Steve', new Date('2026-08-21T09:00:00Z'), now)).toBe(false);
    expect(withRcon).not.toHaveBeenCalled();
  });

  it('greets again the next day', async () => {
    captureCommands();
    (prisma.broadcastTrigger.findFirst as any).mockResolvedValue(trigger);
    const now = new Date('2026-08-22T09:00:00Z');

    expect(await fireDailyLoginTrigger('Steve', new Date('2026-08-21T23:00:00Z'), now)).toBe(true);
  });

  it('does nothing when the trigger is absent or disabled', async () => {
    (prisma.broadcastTrigger.findFirst as any).mockResolvedValue(null);

    expect(await fireDailyLoginTrigger('Steve', null)).toBe(false);
    expect(withRcon).not.toHaveBeenCalled();
  });
});
