/**
 * How often ServerGod is allowed to speak.
 *
 * Players will work out within a day that mentioning it produces a reaction, and
 * then mention it constantly. Since replies use the generator model — the same
 * one that writes a whole week of challenges — the limits, not a cheaper model,
 * are what keep the bill sane.
 *
 * All of it is in memory. A restart forgets the counters, which is fine: the
 * worst case is a handful of extra replies right after a deploy.
 */

export interface Limits {
  /** Minimum gap between replies to the same player. */
  perPlayerCooldownMs: number;
  /** Ceiling on mention replies in any rolling hour, across everyone. */
  hourlyMentionCap: number;
  /** Minimum gap between unprompted messages. */
  proactiveCooldownMs: number;
}

export const DEFAULT_LIMITS: Limits = {
  perPlayerCooldownMs: 30_000,
  hourlyMentionCap: 40,
  proactiveCooldownMs: 30 * 60_000,
};

export type Decision =
  | { allowed: true }
  | { allowed: false; reason: 'PLAYER_COOLDOWN' | 'HOURLY_CAP' | 'PROACTIVE_COOLDOWN' | 'IN_FLIGHT' };

const ALLOWED: Decision = { allowed: true };

export class RateLimiter {
  private lastReplyAt = new Map<string, number>();
  /**
   * Players with a reply being generated right now.
   *
   * The cooldown is only written once a reply exists, so two requests arriving
   * together both passed the check and both asked the model. That is exactly
   * what happened when the plugin timed out and retried: one question, two
   * replies, twelve seconds apart, inside a thirty second cooldown (#393).
   *
   * Tracked separately from the cooldown rather than by recording early,
   * because a generation that fails must not silence the player for half a
   * minute over an answer they never received.
   */
  private inFlight = new Set<string>();
  private mentionTimes: number[] = [];
  // Negative infinity rather than 0: with a zero the first check compares
  // against the epoch, which only happens to pass because real timestamps are
  // large. A fresh instance should simply be allowed to speak.
  private lastProactiveAt = Number.NEGATIVE_INFINITY;

  constructor(private limits: Limits = DEFAULT_LIMITS) {}

  /** Whether to answer a mention from this player now. */
  checkMention(username: string, now: number = Date.now()): Decision {
    if (this.inFlight.has(username)) return { allowed: false, reason: 'IN_FLIGHT' };

    const last = this.lastReplyAt.get(username);
    if (last !== undefined && now - last < this.limits.perPlayerCooldownMs) {
      return { allowed: false, reason: 'PLAYER_COOLDOWN' };
    }
    // Per-player cooldowns alone would not hold: four players taking turns can
    // still keep it talking indefinitely.
    this.mentionTimes = this.mentionTimes.filter((t) => now - t < 3_600_000);
    if (this.mentionTimes.length >= this.limits.hourlyMentionCap) {
      return { allowed: false, reason: 'HOURLY_CAP' };
    }
    return ALLOWED;
  }

  /** Marks a reply as being generated for this player. Must be paired with {@link finishMention}. */
  beginMention(username: string): void {
    this.inFlight.add(username);
  }

  /** Clears the in-flight mark, whether or not a reply was produced. */
  finishMention(username: string): void {
    this.inFlight.delete(username);
  }

  /** Records a reply actually sent. Only called on success, so a failed call does not burn quota. */
  recordMention(username: string, now: number = Date.now()): void {
    this.lastReplyAt.set(username, now);
    this.mentionTimes.push(now);
  }

  checkProactive(now: number = Date.now()): Decision {
    if (now - this.lastProactiveAt < this.limits.proactiveCooldownMs) {
      return { allowed: false, reason: 'PROACTIVE_COOLDOWN' };
    }
    return ALLOWED;
  }

  recordProactive(now: number = Date.now()): void {
    this.lastProactiveAt = now;
  }
}
