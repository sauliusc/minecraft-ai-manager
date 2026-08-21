import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    player: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    broadcastMessage: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('../lib/rcon.js', () => ({
  withRcon: vi.fn(),
}));

import { prisma } from '../lib/prisma.js';
import { withRcon } from '../lib/rcon.js';
import { resolveRecipients, buildCommands, deliverBroadcast } from '../services/broadcast.js';
import { deliverDueBroadcasts } from '../services/broadcastScheduler.js';

/** Collects the commands a delivery would send. */
function captureCommands() {
  const sent: string[] = [];
  (withRcon as any).mockImplementation(async (fn: any) =>
    fn({ send: async (cmd: string) => { sent.push(cmd); } })
  );
  return sent;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveRecipients', () => {
  it('treats ALL as a server-wide send', async () => {
    expect(await resolveRecipients('ALL')).toEqual({ kind: 'ALL' });
    expect(prisma.player.findMany).not.toHaveBeenCalled();
  });

  it('resolves VIP to players with 30+ joins', async () => {
    (prisma.player.findMany as any).mockResolvedValue([{ username: 'Veteran1' }]);

    expect(await resolveRecipients('VIP')).toEqual({ kind: 'TARGETED', usernames: ['Veteran1'] });
    expect(prisma.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { joinCount: { gte: 30 } } })
    );
  });

  it('resolves NEW to players under 5 joins', async () => {
    (prisma.player.findMany as any).mockResolvedValue([{ username: 'Newbie' }]);

    expect(await resolveRecipients('NEW')).toEqual({ kind: 'TARGETED', usernames: ['Newbie'] });
    expect(prisma.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { joinCount: { lt: 5 } } })
    );
  });

  it('resolves MODS by matching active staff names to player names', async () => {
    (prisma.user.findMany as any).mockResolvedValue([{ name: 'ModSteve' }, { name: '' }]);
    (prisma.player.findMany as any).mockResolvedValue([{ username: 'ModSteve' }]);

    expect(await resolveRecipients('MODS')).toEqual({ kind: 'TARGETED', usernames: ['ModSteve'] });
    expect(prisma.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: { in: ['ModSteve'], mode: 'insensitive' } } })
    );
  });

  it('targets nobody when no staff account has a name set', async () => {
    (prisma.user.findMany as any).mockResolvedValue([{ name: '' }, { name: '  ' }]);

    expect(await resolveRecipients('MODS')).toEqual({ kind: 'TARGETED', usernames: [] });
    expect(prisma.player.findMany).not.toHaveBeenCalled();
  });

  it('targets nobody for an unrecognised audience rather than everybody', async () => {
    expect(await resolveRecipients('SOMETHING_ELSE')).toEqual({ kind: 'TARGETED', usernames: [] });
  });
});

describe('buildCommands', () => {
  it('uses server-wide commands for ALL', () => {
    const cmds = buildCommands(['CHAT', 'TITLE', 'ACTION_BAR'], 'hi', { kind: 'ALL' });
    expect(cmds).toEqual([
      'say hi',
      'title @a title {"text":"hi"}',
      'title @a actionbar {"text":"hi"}',
    ]);
  });

  it('uses per-player commands for a targeted audience', () => {
    const cmds = buildCommands(['CHAT'], 'hi', { kind: 'TARGETED', usernames: ['A', 'B'] });
    // tellraw, not `say` — `say` has no per-player form and goes server-wide.
    expect(cmds).toEqual(['tellraw A {"text":"hi"}', 'tellraw B {"text":"hi"}']);
  });

  it('sends nothing when a targeted audience resolves to nobody', () => {
    // The #307 bug: this used to fall through to a server-wide `say`.
    expect(buildCommands(['CHAT'], 'staff only', { kind: 'TARGETED', usernames: [] })).toEqual([]);
  });

  it('sends nothing for a DISCORD-only broadcast rather than leaking it to chat', () => {
    expect(buildCommands(['DISCORD'], 'hi', { kind: 'ALL' })).toEqual([]);
  });

  it('strips newlines so content cannot inject a second command', () => {
    const cmds = buildCommands(['CHAT'], 'hi\nop @a', { kind: 'ALL' });
    expect(cmds).toEqual(['say hi op @a']);
  });
});

describe('deliverBroadcast', () => {
  it('does not open an RCON connection when there is nothing to send', async () => {
    (prisma.user.findMany as any).mockResolvedValue([]);

    const result = await deliverBroadcast(['CHAT'], 'staff only', 'MODS');

    expect(result).toEqual({ targeted: 0, commandsSent: 0 });
    expect(withRcon).not.toHaveBeenCalled();
  });

  it('sends one command per targeted player', async () => {
    const sent = captureCommands();
    (prisma.player.findMany as any).mockResolvedValue([{ username: 'A' }, { username: 'B' }]);

    const result = await deliverBroadcast(['CHAT'], 'hello', 'NEW');

    expect(result).toEqual({ targeted: 2, commandsSent: 2 });
    expect(sent).toEqual(['tellraw A {"text":"hello"}', 'tellraw B {"text":"hello"}']);
  });
});

describe('deliverDueBroadcasts', () => {
  const scheduled = {
    id: 'msg-1',
    content: 'scheduled hello',
    channels: ['CHAT'],
    audience: 'ALL',
    status: 'SCHEDULED',
  };

  it('delivers a due message and only then marks it SENT', async () => {
    const sent = captureCommands();
    (prisma.broadcastMessage.findMany as any).mockResolvedValue([scheduled]);

    const delivered = await deliverDueBroadcasts();

    expect(delivered).toBe(1);
    expect(sent).toEqual(['say scheduled hello']);
    expect(prisma.broadcastMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'msg-1' },
        data: expect.objectContaining({ status: 'SENT' }),
      })
    );
  });

  it('leaves a message SCHEDULED when delivery fails, so the next tick retries', async () => {
    (prisma.broadcastMessage.findMany as any).mockResolvedValue([scheduled]);
    (withRcon as any).mockRejectedValue(new Error('minecraft is down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const delivered = await deliverDueBroadcasts();

    expect(delivered).toBe(0);
    expect(prisma.broadcastMessage.update).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('only picks up messages whose time has passed', async () => {
    (prisma.broadcastMessage.findMany as any).mockResolvedValue([]);
    const now = new Date('2026-08-21T12:00:00Z');

    await deliverDueBroadcasts(now);

    expect(prisma.broadcastMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      })
    );
  });

  it('keeps going when one message in the batch fails', async () => {
    (prisma.broadcastMessage.findMany as any).mockResolvedValue([
      { ...scheduled, id: 'bad' },
      { ...scheduled, id: 'good' },
    ]);
    let call = 0;
    (withRcon as any).mockImplementation(async (fn: any) => {
      call++;
      if (call === 1) throw new Error('transient');
      return fn({ send: async () => {} });
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await deliverDueBroadcasts()).toBe(1);
    expect(prisma.broadcastMessage.update).toHaveBeenCalledTimes(1);
    expect(prisma.broadcastMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'good' } })
    );
    consoleError.mockRestore();
  });
});
