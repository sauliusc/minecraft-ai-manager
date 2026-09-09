import { describe, it, expect } from 'vitest';
import { RateLimiter, DEFAULT_LIMITS } from '../services/serverGod/limits.js';

const T = 1_000_000;

describe('RateLimiter mentions', () => {
  it('answers the first mention', () => {
    expect(new RateLimiter().checkMention('adas', T)).toEqual({ allowed: true });
  });

  it('makes a spamming player wait', () => {
    const rl = new RateLimiter();
    rl.recordMention('adas', T);
    expect(rl.checkMention('adas', T + 5_000)).toMatchObject({ reason: 'PLAYER_COOLDOWN' });
    expect(rl.checkMention('adas', T + 31_000)).toEqual({ allowed: true });
  });

  it('does not punish a different player for the first one spamming', () => {
    const rl = new RateLimiter();
    rl.recordMention('adas', T);
    expect(rl.checkMention('bladrobe', T + 1_000)).toEqual({ allowed: true });
  });

  it('caps the hour, because players take turns', () => {
    // Per-player cooldowns alone do not hold: four kids alternating can keep it
    // talking forever, and every reply is a generator-model call.
    const rl = new RateLimiter({ ...DEFAULT_LIMITS, hourlyMentionCap: 3 });
    for (let i = 0; i < 3; i++) rl.recordMention(`p${i}`, T + i);
    expect(rl.checkMention('p9', T + 10)).toMatchObject({ reason: 'HOURLY_CAP' });
  });

  it('lets the hourly cap roll off', () => {
    const rl = new RateLimiter({ ...DEFAULT_LIMITS, hourlyMentionCap: 2 });
    rl.recordMention('a', T);
    rl.recordMention('b', T + 1000);
    expect(rl.checkMention('c', T + 2000)).toMatchObject({ reason: 'HOURLY_CAP' });
    expect(rl.checkMention('c', T + 3_600_001)).toEqual({ allowed: true });
  });

  it('does not spend quota on a reply that was never sent', () => {
    // recordMention is only called on success, so an LLM failure must not
    // silence the bot for the next half hour.
    const rl = new RateLimiter();
    expect(rl.checkMention('adas', T)).toEqual({ allowed: true });
    expect(rl.checkMention('adas', T + 100)).toEqual({ allowed: true });
  });
});

describe('RateLimiter proactive', () => {
  it('keeps unprompted messages half an hour apart', () => {
    const rl = new RateLimiter();
    expect(rl.checkProactive(T)).toEqual({ allowed: true });
    rl.recordProactive(T);
    expect(rl.checkProactive(T + 10 * 60_000)).toMatchObject({ reason: 'PROACTIVE_COOLDOWN' });
    expect(rl.checkProactive(T + 31 * 60_000)).toEqual({ allowed: true });
  });

  it('keeps mention and proactive budgets separate', () => {
    // Being teased by the server should not stop it answering when spoken to.
    const rl = new RateLimiter();
    rl.recordProactive(T);
    expect(rl.checkMention('adas', T + 1000)).toEqual({ allowed: true });
  });
});
