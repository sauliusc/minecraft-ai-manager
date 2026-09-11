import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    economyAuditLog: { findFirst: vi.fn(), create: vi.fn() },
    player: { update: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../services/rewardGrant.js', () => ({ grantReward: vi.fn() }));

import { prisma } from '../lib/prisma.js';
import { grantReward } from '../services/rewardGrant.js';
import { payOutCompletion, coinsFor, payoutReason } from '../services/challengeRewards.js';

const daily = { id: 'ch1', difficulty: 2, rewardId: null, questCategory: 'DAILY' };
const weekly = { id: 'ch2', difficulty: 5, rewardId: 'rw1', questCategory: 'WEEKLY' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.economyAuditLog.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
  vi.mocked(grantReward).mockResolvedValue({ ok: true, grantId: 'g1', queued: false });
});

describe('coinsFor', () => {
  it('pays more for a harder challenge', () => {
    expect(coinsFor(1)).toBe(20);
    expect(coinsFor(5)).toBe(100);
  });

  it('falls back rather than paying nothing for an odd difficulty', () => {
    // A challenge with a difficulty outside 1-5 should still be worth finishing.
    expect(coinsFor(0)).toBe(20);
    expect(coinsFor(99)).toBe(20);
  });
});

describe('payOutCompletion', () => {
  it('pays coins for a daily', async () => {
    expect(await payOutCompletion(daily, 'LukasBa')).toEqual({ coins: 35 });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('pays coins and hands over the reward for the weekly', async () => {
    const payout = await payOutCompletion(weekly, 'LukasBa');

    expect(payout).toMatchObject({ coins: 100, rewardGranted: 'rw1' });
    expect(grantReward).toHaveBeenCalledWith(expect.objectContaining({
      playerId: 'LukasBa', rewardId: 'rw1', grantedBy: 'challenge', lockKeySuffix: 'ch2',
    }));
  });

  it('never pays the same player twice for the same challenge', async () => {
    // The economy log is the record of payment, which is what makes replaying a
    // completion — or backfilling old ones — safe.
    vi.mocked(prisma.economyAuditLog.findFirst).mockResolvedValue({ id: 'e1' } as never);

    expect(await payOutCompletion(daily, 'LukasBa')).toEqual({ coins: 0, alreadyPaid: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(grantReward).not.toHaveBeenCalled();
  });

  it('keeps the coins when the item cannot be delivered', async () => {
    // The player finished it. Losing the item is worth reporting; it is not worth
    // taking back the coins or un-completing the challenge.
    vi.mocked(grantReward).mockResolvedValue({
      ok: false, error: 'PLAYER_NOT_FOUND', message: 'no such player',
    });

    expect(await payOutCompletion(weekly, 'LukasBa'))
      .toMatchObject({ coins: 100, rewardError: 'PLAYER_NOT_FOUND' });
  });

  it('writes the balance and the audit row together', async () => {
    // A credit with nothing recorded would be invisible to the paid-already
    // check, and could then be paid again.
    await payOutCompletion(daily, 'LukasBa');
    const ops = vi.mocked(prisma.$transaction).mock.calls[0]![0] as unknown as unknown[];
    expect(ops).toHaveLength(2);
    expect(prisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { coins: { increment: 35 } } })
    );
    expect(prisma.economyAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: payoutReason('ch1') }) })
    );
  });

  it('ties the audit reason to the challenge', () => {
    expect(payoutReason('abc')).toBe('challenge_complete:abc');
  });
});
