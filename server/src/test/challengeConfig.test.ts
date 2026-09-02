import { describe, it, expect } from 'vitest';
import {
  normalizeChallengeConfig,
  isTrackableChallengeConfig,
  normalizeRewardConfig,
} from '../lib/challengeConfig.js';

describe('normalizeChallengeConfig', () => {
  it('rewrites the generator shape that made challenges untrackable', () => {
    // Exactly what was found in the database for every generated challenge.
    expect(normalizeChallengeConfig('KILL_MOB', { mob: 'SKELETON', amount: 15 }))
      .toMatchObject({ target_entity: 'SKELETON', target_count: 15 });

    expect(normalizeChallengeConfig('BLOCK_BREAK', { block: 'COBBLESTONE', amount: 200 }))
      .toMatchObject({ target_material: 'COBBLESTONE', target_count: 200 });

    expect(normalizeChallengeConfig('CRAFT_ITEM', { result: 'TORCH', amount: 64 }))
      .toMatchObject({ target_material: 'TORCH', target_count: 64 });
  });

  it('leaves an already correct config alone', () => {
    const cfg = { target_material: 'SUGAR_CANE', target_count: 32 };
    expect(normalizeChallengeConfig('BLOCK_BREAK', cfg)).toMatchObject(cfg);
  });

  it('prefers the canonical key when both are present', () => {
    expect(normalizeChallengeConfig('KILL_MOB', { target_entity: 'CREEPER', mob: 'ZOMBIE', amount: 5 }))
      .toMatchObject({ target_entity: 'CREEPER' });
  });

  it('upper-cases identifiers so matching against the game succeeds', () => {
    // The plugin compares case-insensitively, but storing them consistently
    // keeps the dashboard readable.
    expect(normalizeChallengeConfig('BLOCK_BREAK', { block: 'sugar_cane', amount: 4 }))
      .toMatchObject({ target_material: 'SUGAR_CANE' });
  });

  it('puts TRAVEL distance into target_count as well', () => {
    // Progress accumulates metres against target_count. Without this the
    // challenge completes after a single metre.
    expect(normalizeChallengeConfig('TRAVEL', { distance_blocks: 1000 }))
      .toMatchObject({ target_distance: 1000, target_count: 1000 });
    expect(normalizeChallengeConfig('TRAVEL', { distance: 500 }))
      .toMatchObject({ target_distance: 500, target_count: 500 });
  });

  it('keeps unknown keys, which CUSTOM challenges rely on', () => {
    expect(normalizeChallengeConfig('CUSTOM', { puzzles_completed: 5, target: 5 }))
      .toMatchObject({ puzzles_completed: 5, target_count: 5 });
  });

  it('ignores counts that are zero, negative or unparseable', () => {
    expect(normalizeChallengeConfig('KILL_MOB', { mob: 'ZOMBIE', amount: 0 }).target_count).toBeUndefined();
    expect(normalizeChallengeConfig('KILL_MOB', { mob: 'ZOMBIE', amount: -3 }).target_count).toBeUndefined();
    expect(normalizeChallengeConfig('KILL_MOB', { mob: 'ZOMBIE', amount: 'lots' }).target_count).toBeUndefined();
  });

  it('accepts a numeric string count', () => {
    expect(normalizeChallengeConfig('KILL_MOB', { mob: 'ZOMBIE', amount: '20' }))
      .toMatchObject({ target_count: 20 });
  });
});

describe('isTrackableChallengeConfig', () => {
  it('rejects the shapes that silently did nothing', () => {
    expect(isTrackableChallengeConfig('KILL_MOB', { mob: 'ZOMBIE', amount: 15 })).toBe(false);
    expect(isTrackableChallengeConfig('BLOCK_BREAK', { block: 'STONE', amount: 10 })).toBe(false);
  });

  it('accepts a normalised config', () => {
    expect(isTrackableChallengeConfig('KILL_MOB',
      normalizeChallengeConfig('KILL_MOB', { mob: 'ZOMBIE', amount: 15 }))).toBe(true);
    expect(isTrackableChallengeConfig('TRAVEL',
      normalizeChallengeConfig('TRAVEL', { distance: 100 }))).toBe(true);
  });

  it('requires both a target and a count', () => {
    expect(isTrackableChallengeConfig('KILL_MOB', { target_entity: 'ZOMBIE' })).toBe(false);
    expect(isTrackableChallengeConfig('KILL_MOB', { target_count: 5 })).toBe(false);
  });

  it('lets CUSTOM through, since whatever fires it defines the shape', () => {
    expect(isTrackableChallengeConfig('CUSTOM', { anything: true })).toBe(true);
  });
});

describe('normalizeRewardConfig', () => {
  it('fixes XP rewards that handed out the default instead of their amount', () => {
    // deliverXp reads `amount`; `xp` was never read, so this gave 100.
    expect(normalizeRewardConfig('XP', { xp: 500 })).toMatchObject({ amount: 500 });
  });

  it('fixes currency rewards that credited nothing', () => {
    // The API credits `coins`; {"amount":100,"currency":"ENERGY_COINS"} paid out 0.
    expect(normalizeRewardConfig('CURRENCY', { amount: 100, currency: 'ENERGY_COINS' }))
      .toMatchObject({ coins: 100 });
  });

  it('routes crystals when they are actually asked for', () => {
    expect(normalizeRewardConfig('CURRENCY', { amount: 5, currency: 'crystals' }))
      .toMatchObject({ crystals: 5 });
    expect(normalizeRewardConfig('CURRENCY', { crystals: 7 })).toMatchObject({ crystals: 7 });
  });

  it('leaves correct configs alone', () => {
    expect(normalizeRewardConfig('CURRENCY', { coins: 150 })).toMatchObject({ coins: 150 });
    expect(normalizeRewardConfig('XP', { amount: 500 })).toMatchObject({ amount: 500 });
  });

  it('defaults an item reward to one when no amount is given', () => {
    expect(normalizeRewardConfig('ITEM', { material: 'DIAMOND' }))
      .toMatchObject({ material: 'DIAMOND', amount: 1 });
  });
});
