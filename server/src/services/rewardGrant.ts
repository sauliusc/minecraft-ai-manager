/**
 * Granting a reward to a player.
 *
 * Lifted out of the admin route so challenge completions can pay out through
 * exactly the same path (#383). Everything awkward about granting lives here —
 * the idempotency lock, crediting currency in Postgres before the bridge call,
 * resolving a mystery box to something the plugin can actually deliver, and
 * queueing for next login when the player is offline. A second implementation
 * of any of that would drift.
 */

import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

async function callBridge(path: string, body: object): Promise<boolean> {
  try {
    const url = process.env.MINECRAFT_BRIDGE_URL;
    const secret = process.env.BRIDGE_SECRET;
    if (!url || !secret) return false;
    const res = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-secret': secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Picks a weighted-random reward from a mystery box loot table.
 *
 * Returns null when the box cannot produce anything deliverable: no loot table,
 * an empty one, or every entry pointing at a reward that has since been deleted
 * (or at another MYSTERY_BOX, which the plugin cannot deliver either). Callers
 * must treat null as an error rather than falling back to granting the box
 * itself — the delivery plugin has no MYSTERY_BOX case and would drop it.
 */
export async function rollLootTable(
  lootTable: unknown
): Promise<{ id: string; type: string; rarity: string | null; config: unknown } | null> {
  if (!Array.isArray(lootTable) || lootTable.length === 0) return null;

  const entries = (lootTable as Array<{ rewardId?: string; weight?: number }>).filter(
    (e) => typeof e?.rewardId === 'string' && Number(e.weight) > 0
  ) as Array<{ rewardId: string; weight: number }>;
  if (entries.length === 0) return null;

  // Only entries that resolve to a deliverable reward are eligible, so a deleted
  // or nested-box entry costs that roll nothing instead of voiding the grant.
  const candidates = await prisma.reward.findMany({
    where: { id: { in: entries.map((e) => e.rewardId) }, type: { not: 'MYSTERY_BOX' as never } },
  });
  const byId = new Map(candidates.map((r: { id: string }) => [r.id, r]));
  const eligible = entries.filter((e) => byId.has(e.rewardId));
  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  let wonEntry = eligible[0]!;
  for (const entry of eligible) {
    roll -= entry.weight;
    if (roll <= 0) { wonEntry = entry; break; }
  }
  return byId.get(wonEntry.rewardId) as never;
}

export type GrantFailure =
  | 'REWARD_NOT_FOUND'
  | 'PLAYER_NOT_FOUND'
  | 'DUPLICATE'
  | 'UNDELIVERABLE_BOX';

export type GrantResult =
  | { ok: true; grantId: string; queued: boolean }
  | { ok: false; error: GrantFailure; message: string };

export interface GrantOptions {
  playerId: string;
  rewardId: string;
  /** Who to record as the grantor — a user id, or something like 'challenge'. */
  grantedBy: string;
  reason?: string;
  /**
   * Distinguishes one grant from another for the idempotency lock. Two different
   * challenges awarding the same reward to the same player are different grants
   * and must both go through; a retry of one is not.
   */
  lockKeySuffix?: string;
}

export async function grantReward(opts: GrantOptions): Promise<GrantResult> {
  const { rewardId, grantedBy, reason, lockKeySuffix } = opts;

  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
  if (!reward) return { ok: false, error: 'REWARD_NOT_FOUND', message: 'Reward not found' };

  // PlayerReward.playerId is a foreign key onto Player.username, so a name with no
  // row makes the grant insert throw a raw FK error. Resolve it up front, and
  // case-insensitively: usernames are stored case-preserved but Minecraft treats
  // them case-insensitively.
  const player = await prisma.player.findFirst({
    where: { username: { equals: opts.playerId, mode: 'insensitive' } },
  });
  if (!player) {
    return {
      ok: false, error: 'PLAYER_NOT_FOUND',
      message: `No player named "${opts.playerId}" — they must join the server at least once first`,
    };
  }
  const playerId = player.username;

  // Redis idempotency lock — 60s covers bridge timeout plus DB write, so a retry
  // cannot double-grant.
  const lockKey = `bridge:lock:grant:${playerId}:${rewardId}${lockKeySuffix ? `:${lockKeySuffix}` : ''}`;
  const lockResult = await redis.set(lockKey, '1', 'EX', 60, 'NX');
  if (lockResult === null) {
    return { ok: false, error: 'DUPLICATE', message: 'Duplicate grant in progress' };
  }

  // MYSTERY_BOX must never reach the bridge — the plugin has no case for it and
  // would drop the grant silently, so an unresolvable box is a hard error.
  let bridgeReward: { rewardType: string; rarity: string | null; config: unknown } = {
    rewardType: (reward as { type: string }).type,
    rarity: (reward as { rarity: string | null }).rarity ?? null,
    config: reward.config,
  };
  let innerGrantId: string | null = null;

  if (bridgeReward.rewardType === 'MYSTERY_BOX') {
    const wonReward = await rollLootTable((reward as { lootTable: unknown }).lootTable);
    if (!wonReward) {
      await redis.del(lockKey);
      return {
        ok: false, error: 'UNDELIVERABLE_BOX',
        message: 'Mystery box has no usable loot table — it cannot be granted',
      };
    }
    bridgeReward = {
      rewardType: wonReward.type,
      rarity: wonReward.rarity ?? null,
      config: wonReward.config,
    };
    const innerGrant = await prisma.playerReward.create({
      data: { playerId, rewardId: wonReward.id, grantedBy, grantedAt: new Date() },
    });
    innerGrantId = innerGrant.id;
  }

  // CURRENCY is credited in Postgres, not by the plugin: every balance check —
  // the shop, clan costs — reads from here.
  if (bridgeReward.rewardType === 'CURRENCY') {
    const cfg = bridgeReward.config as Record<string, number>;
    const updates: Record<string, unknown> = {};
    if (cfg.coins) updates.coins = { increment: cfg.coins };
    if (cfg.crystals) updates.crystals = { increment: cfg.crystals };
    if (Object.keys(updates).length > 0) {
      await prisma.player.update({ where: { username: playerId }, data: updates });
    }
  }

  // Live delivery first; failure means the player is offline and the plugin will
  // collect it on their next login.
  const bridgeOk = await callBridge('/bridge/rewards/grant', {
    playerId,
    rewardId,
    ...bridgeReward,
    ...(reason ? { reason } : {}),
  });

  const grant = await prisma.playerReward.create({
    data: {
      playerId,
      rewardId,
      grantedBy,
      grantedAt: new Date(),
      // Stamped now when delivery already happened. The pending path only returns
      // rows with deliveredAt IS NULL; without this the won inner reward of a
      // mystery box would be handed out again on the player's next login.
      ...(bridgeOk ? { deliveredAt: new Date() } : {}),
    },
  });

  if (bridgeOk && innerGrantId) {
    await prisma.playerReward.update({
      where: { id: innerGrantId },
      data: { deliveredAt: new Date() },
    });
  }

  return { ok: true, grantId: grant.id, queued: !bridgeOk };
}
