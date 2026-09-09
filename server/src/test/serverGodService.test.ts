import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/ai.js', () => ({
  getAiConfig: vi.fn(),
  generateShortReply: vi.fn(),
}));
vi.mock('../services/broadcast.js', () => ({ deliverBroadcast: vi.fn() }));
vi.mock('../lib/prisma.js', () => ({ prisma: { chatLog: { create: vi.fn() } } }));

import { getAiConfig, generateShortReply } from '../services/ai.js';
import { deliverBroadcast } from '../services/broadcast.js';
import { prisma } from '../lib/prisma.js';
import { tick, handleMention, loadPersona, isEnabled, resetState } from '../services/serverGod/index.js';
import { DEFAULT_SLANG } from '../services/serverGod/prompt.js';

function player(over: Record<string, number> = {}) {
  return {
    username: 'adas', playTicks: 0, travelledCm: 0, blocksMined: 0, itemsCrafted: 0,
    diamondOreMined: 0, mobKills: 0, deaths: 0, fishCaught: 0, animalsBred: 0,
    villagerTrades: 0, itemsEnchanted: 0, damageTakenTenths: 0, ...over,
  };
}

function bridgeReturns(players: unknown[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ players }),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  process.env.MINECRAFT_BRIDGE_URL = 'http://mc:25580';
  process.env.BRIDGE_SECRET = 'secret';
  vi.mocked(getAiConfig).mockResolvedValue({});
  vi.mocked(generateShortReply).mockResolvedValue('adas vel numire, zero rizz fr');
  vi.mocked(prisma.chatLog.create).mockResolvedValue({} as never);
});

describe('tick', () => {
  it('says nothing, and calls no model, when nobody is online', async () => {
    // The server is empty most of the day. This is the case that keeps a
    // ten-minute schedule from costing anything.
    bridgeReturns([]);

    expect(await tick()).toEqual({ spoke: false, reason: 'NOBODY_ONLINE' });
    expect(generateShortReply).not.toHaveBeenCalled();
  });

  it('stays quiet on the first tick after a restart', async () => {
    // Nothing to compare against yet. Without this the player's whole lifetime
    // of statistics would read as ten minutes of activity.
    bridgeReturns([player({ deaths: 40, blocksMined: 9000 })]);

    expect(await tick()).toMatchObject({ spoke: false, reason: 'NOTHING_NOTABLE' });
    expect(generateShortReply).not.toHaveBeenCalled();
  });

  it('speaks when something notable happens', async () => {
    bridgeReturns([player()]);
    await tick();                                    // baseline
    bridgeReturns([player({ deaths: 1, playTicks: 12000 })]);

    const result = await tick();

    expect(result).toMatchObject({ spoke: true });
    expect(deliverBroadcast).toHaveBeenCalledWith(['CHAT'], expect.stringContaining('ServerGod'), 'ALL');
  });

  it('calls no model for a quiet ten minutes', async () => {
    bridgeReturns([player()]);
    await tick();
    bridgeReturns([player({ blocksMined: 20, playTicks: 12000 })]);

    expect(await tick()).toMatchObject({ reason: 'NOTHING_NOTABLE' });
    expect(generateShortReply).not.toHaveBeenCalled();
  });

  it('holds its tongue for half an hour after speaking', async () => {
    bridgeReturns([player()]);
    await tick();
    bridgeReturns([player({ deaths: 1 })]);
    await tick();
    bridgeReturns([player({ deaths: 2 })]);

    expect(await tick()).toMatchObject({ spoke: false, reason: 'COOLDOWN' });
  });

  it('says nothing when the game server cannot be reached', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never;
    expect(await tick()).toEqual({ spoke: false, reason: 'NO_BRIDGE' });
  });

  it('can be switched off entirely', async () => {
    vi.mocked(getAiConfig).mockResolvedValue({ servergod_enabled: 'false' });
    expect(await tick()).toEqual({ spoke: false, reason: 'DISABLED' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not broadcast, or spend its cooldown, when the model fails', async () => {
    bridgeReturns([player()]);
    await tick();
    vi.mocked(generateShortReply).mockRejectedValue(new Error('overloaded'));
    bridgeReturns([player({ deaths: 1 })]);

    expect(await tick()).toMatchObject({ spoke: false, reason: 'FAILED' });
    expect(deliverBroadcast).not.toHaveBeenCalled();

    // The next notable thing must still get a reaction.
    vi.mocked(generateShortReply).mockResolvedValue('back again');
    bridgeReturns([player({ deaths: 2 })]);
    expect(await tick()).toMatchObject({ spoke: true });
  });
});

describe('handleMention', () => {
  it('replies to a player who said its name', async () => {
    const result = await handleMention('adas', 'ServerGod tu geras?');
    expect(result).toMatchObject({ spoke: true, reply: 'adas vel numire, zero rizz fr' });
  });

  it('logs what it said so it can be reviewed later', async () => {
    await handleMention('adas', 'ServerGod?');
    expect(prisma.chatLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ username: 'ServerGod' }) })
    );
  });

  it('still replies when logging fails', async () => {
    // Bookkeeping must never be the reason a child gets no answer.
    vi.mocked(prisma.chatLog.create).mockRejectedValue(new Error('db down'));
    expect(await handleMention('adas', 'ServerGod?')).toMatchObject({ spoke: true });
  });

  it('makes a spamming player wait', async () => {
    await handleMention('adas', 'ServerGod');
    expect(await handleMention('adas', 'ServerGod')).toMatchObject({ reason: 'PLAYER_COOLDOWN' });
  });

  it('does not put a player on cooldown for a reply they never got', async () => {
    vi.mocked(generateShortReply).mockRejectedValue(new Error('overloaded'));
    expect(await handleMention('adas', 'ServerGod')).toMatchObject({ reason: 'FAILED' });

    vi.mocked(generateShortReply).mockResolvedValue('labas');
    expect(await handleMention('adas', 'ServerGod')).toMatchObject({ spoke: true });
  });

  it('treats a blank reply as nothing to say', async () => {
    vi.mocked(generateShortReply).mockResolvedValue('   ');
    expect(await handleMention('adas', 'ServerGod')).toMatchObject({ reason: 'EMPTY' });
  });
});

describe('loadPersona', () => {
  it('falls back to the built-in slang rather than to none', async () => {
    // An empty list would leave the model to invent its own idea of brainrot,
    // which is exactly what the curated list exists to prevent.
    expect(loadPersona({ servergod_slang: '' }).slang).toEqual(DEFAULT_SLANG);
    expect(loadPersona({ servergod_slang: 'skibidi, rizz' }).slang).toEqual(['skibidi', 'rizz']);
  });

  it('is on unless explicitly disabled', () => {
    expect(isEnabled({})).toBe(true);
    expect(isEnabled({ servergod_enabled: 'false' })).toBe(false);
  });
});
