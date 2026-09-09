import { describe, it, expect } from 'vitest';
import {
  diffSnapshot, diffSnapshots, isNotable, digestForPrompt,
  PlayerSnapshot, ActivityDelta,
} from '../services/serverGod/activityDigest.js';

function snap(over: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    username: 'bladrobe', playTicks: 0, travelledCm: 0, blocksMined: 0, itemsCrafted: 0,
    diamondOreMined: 0, mobKills: 0, deaths: 0, fishCaught: 0, animalsBred: 0,
    villagerTrades: 0, itemsEnchanted: 0, damageTakenTenths: 0, ...over,
  };
}

describe('diffSnapshot', () => {
  it('reports what changed, not the running totals', () => {
    // The player has mined 5000 blocks in their life; in these ten minutes, 210.
    const before = snap({ blocksMined: 4790, playTicks: 100_000 });
    const after = snap({ blocksMined: 5000, playTicks: 112_000 });

    expect(diffSnapshot(before, after)).toEqual({
      player: 'bladrobe', minutes: 10, mined: 210,
    });
  });

  it('leaves out everything that did not happen', () => {
    // Keeps the digest small, which is the entire point of not sending logs.
    const d = diffSnapshot(snap(), snap({ mobKills: 3 }))!;
    expect(Object.keys(d).sort()).toEqual(['kills', 'minutes', 'player']);
  });

  it('returns nothing at all for an idle player', () => {
    // An AFK player must not reach the model, or cost anything.
    expect(diffSnapshot(snap({ playTicks: 1000 }), snap({ playTicks: 13000 }))).toBeNull();
  });

  it('converts travel to metres', () => {
    expect(diffSnapshot(snap(), snap({ travelledCm: 82_000 }))).toMatchObject({ metres: 820 });
  });

  it('ignores a counter that went backwards', () => {
    // Statistics only ever increase, so this means the file was reset. Reporting
    // "-4000 blocks mined" would be worse than reporting nothing.
    expect(diffSnapshot(snap({ blocksMined: 5000 }), snap({ blocksMined: 1000 }))).toBeNull();
  });

  it('never reports negative playtime', () => {
    expect(diffSnapshot(snap({ playTicks: 5000 }), snap({ playTicks: 0, mobKills: 1 })))
      .toMatchObject({ minutes: 0 });
  });
});

describe('diffSnapshots', () => {
  it('skips a player who just joined, since there is nothing to compare', () => {
    // Their first tick establishes a baseline; otherwise their entire lifetime
    // of statistics would read as ten minutes of frantic activity.
    const before = new Map<string, PlayerSnapshot>();
    const after = new Map([['adas', snap({ username: 'adas', blocksMined: 9000 })]]);

    expect(diffSnapshots(before, after)).toEqual([]);
  });

  it('reports each player who did something', () => {
    const before = new Map([
      ['adas', snap({ username: 'adas' })],
      ['bladrobe', snap({ username: 'bladrobe' })],
    ]);
    const after = new Map([
      ['adas', snap({ username: 'adas', deaths: 1 })],
      ['bladrobe', snap({ username: 'bladrobe' })],   // idle, must not appear
    ]);

    expect(diffSnapshots(before, after)).toEqual([
      { player: 'adas', minutes: 0, deaths: 1 },
    ]);
  });
});

describe('isNotable', () => {
  it('treats dying as worth a comment', () => {
    expect(isNotable([{ player: 'adas', minutes: 8, deaths: 1 }])).toBe(true);
  });

  it('ignores a quiet ten minutes of pottering about', () => {
    // ServerGod stays funny by staying rare — this is what keeps it quiet.
    expect(isNotable([{ player: 'adas', minutes: 10, mined: 12, metres: 200 }])).toBe(false);
  });

  it('notices a serious grind but not a casual one', () => {
    expect(isNotable([{ player: 'adas', minutes: 10, mined: 200 }])).toBe(true);
    expect(isNotable([{ player: 'adas', minutes: 10, mined: 40 }])).toBe(false);
  });

  it('says nothing when nobody did anything', () => {
    expect(isNotable([])).toBe(false);
  });
});

describe('digestForPrompt', () => {
  it('stays tiny — this is the whole reason for not sending logs', () => {
    const deltas: ActivityDelta[] = [
      { player: 'bladrobe', minutes: 34, mined: 210, diamonds: 3, kills: 4, deaths: 1, metres: 820 },
      { player: 'adas', minutes: 12, crafted: 64 },
    ];
    const out = digestForPrompt(deltas);

    expect(out.length).toBeLessThan(250);
    expect(out).toContain('bladrobe');
  });

  it('carries no chat text, coordinates or identifiers', () => {
    // The children's messages and locations must never reach the model.
    const out = digestForPrompt([{ player: 'adas', minutes: 5, deaths: 1 }]);
    expect(out).not.toMatch(/uuid|message|chat|[xyz]:|coord/i);
  });
});
