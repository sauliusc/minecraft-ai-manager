import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    economyAuditLog: { findFirst: vi.fn(), create: vi.fn() },
    player: { update: vi.fn() },
    reward: { findFirst: vi.fn(), create: vi.fn() },
    playerReward: { create: vi.fn() },
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
  vi.mocked(prisma.reward.findFirst).mockResolvedValue({ id: 'coin35' } as never);
  vi.mocked(prisma.playerReward.create).mockResolvedValue({} as never);
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

describe('coin payouts as visible records', () => {
  it('records the coins as a granted reward', async () => {
    // The balance changing and an economy log row are both invisible to a player
    // looking at their rewards.
    await payOutCompletion(daily, 'LukasBa');

    expect(prisma.playerReward.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ playerId: 'LukasBa', rewardId: 'coin35' }),
      })
    );
  });

  it('marks it delivered, so the plugin cannot pay the coins again', async () => {
    // The pending queue returns rows with no deliveredAt. An unstamped row would
    // be handed to the plugin on next login and credited a second time.
    await payOutCompletion(daily, 'LukasBa');
    const row = vi.mocked(prisma.playerReward.create).mock.calls[0]![0] as { data: { deliveredAt?: Date } };
    expect(row.data.deliveredAt).toBeInstanceOf(Date);
  });

  it('creates the coin reward once, then reuses it', async () => {
    vi.mocked(prisma.reward.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.reward.create).mockResolvedValueOnce({ id: 'coin35' } as never);

    await payOutCompletion(daily, 'LukasBa');
    expect(prisma.reward.create).toHaveBeenCalledOnce();

    await payOutCompletion(daily, 'Meinis');
    expect(prisma.reward.create).toHaveBeenCalledOnce();   // found, not created again
  });

  it('still pays the coins when the record cannot be written', async () => {
    // The record is a nicety. The coins are already paid and the challenge is
    // still complete; neither may depend on this.
    vi.mocked(prisma.reward.findFirst).mockRejectedValue(new Error('db down'));
    expect(await payOutCompletion(daily, 'LukasBa')).toMatchObject({ coins: 35 });
  });
});
