/**
 * Paying out a completed challenge.
 *
 * Until #360 no challenge had ever been completed here, so this path had never
 * run. When completion started working, seven completions across five players
 * produced nothing at all (#383): challenges were never linked to a reward, and
 * nothing granted one anyway. A challenge that visibly completes and pays
 * nothing is worse than one that cannot be completed, because the player can see
 * that it worked and still got them nothing.
 *
 * Every completion pays coins, so no completion is ever empty. The weekly
 * challenge additionally hands over the theme's own reward, which is the one
 * worth playing for.
 */

import { prisma } from '../lib/prisma.js';
import { grantReward } from './rewardGrant.js';

/** Coins per completion, by the challenge's own difficulty rating. */
export const COINS_BY_DIFFICULTY: Record<number, number> = {
  1: 20, 2: 35, 3: 50, 4: 75, 5: 100,
};

export function coinsFor(difficulty: number): number {
  return COINS_BY_DIFFICULTY[difficulty] ?? COINS_BY_DIFFICULTY[1]!;
}

/**
 * The audit reason for a challenge payout.
 *
 * Also the idempotency key: the economy log is the record of whether this player
 * has already been paid for this challenge, so a replayed completion — or the
 * backfill of completions that predate this code — cannot pay twice.
 */
export function payoutReason(challengeId: string): string {
  return `challenge_complete:${challengeId}`;
}

export interface Payout {
  coins: number;
  /** Set when the challenge also carried a reward, and it was granted. */
  rewardGranted?: string;
  /** Set when a reward was attached but could not be handed over. */
  rewardError?: string;
  /** True when this player had already been paid for this challenge. */
  alreadyPaid?: boolean;
}

/**
 * Pays a player for completing a challenge. Safe to call more than once.
 *
 * Never throws: a challenge the player genuinely finished must stay completed
 * even if the payout fails, so problems are reported in the result rather than
 * unwinding the completion.
 */
export async function payOutCompletion(
  challenge: { id: string; difficulty: number; rewardId: string | null; questCategory?: string | null },
  playerId: string
): Promise<Payout> {
  const reason = payoutReason(challenge.id);

  const already = await prisma.economyAuditLog.findFirst({
    where: { targetId: playerId, reason },
  });
  if (already) return { coins: 0, alreadyPaid: true };

  const coins = coinsFor(challenge.difficulty);

  // Balance and audit row move together: a credit nothing recorded would be
  // invisible to this check and could be paid again.
  await prisma.$transaction([
    prisma.player.update({
      where: { username: playerId },
      data: { coins: { increment: coins } },
    }),
    prisma.economyAuditLog.create({
      data: { adminId: 'challenge', targetId: playerId, delta: coins, currency: 'coins', reason },
    }),
  ]);

  const payout: Payout = { coins };

  if (challenge.rewardId) {
    const result = await grantReward({
      playerId,
      rewardId: challenge.rewardId,
      grantedBy: 'challenge',
      reason,
      // Two challenges can carry the same reward; they are different grants.
      lockKeySuffix: challenge.id,
    });
    if (result.ok) {
      payout.rewardGranted = challenge.rewardId;
    } else {
      // The coins are already paid and the challenge is still complete. Losing
      // the item is worth reporting, not worth undoing the rest over.
      payout.rewardError = result.error;
      console.warn(`[challenge] reward ${challenge.rewardId} for ${playerId} failed: ${result.error}`);
    }
  }

  return payout;
}
