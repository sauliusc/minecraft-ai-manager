/**
 * Canonical shapes for challenge and reward config, and normalisation of the
 * variants that have been written into the database over time.
 *
 * ChallengePlugin reads exactly these keys:
 *
 *   target_material   BLOCK_BREAK / CRAFT_ITEM
 *   target_entity     KILL_MOB
 *   target_count      all types — the number progress is compared against
 *   target_distance   TRAVEL, informational; target_count is what completes it
 *
 * The AI generator was asked for `block` / `mob` / `item` / `amount` instead, so
 * every challenge it produced was untrackable: the material never matched and
 * the count silently fell back to 1. `ChallengeProgress` had no rows for the
 * entire history of the server (#360). Normalising here means a badly shaped
 * config becomes a working challenge rather than a silent dud.
 */

export type ChallengeType = 'BLOCK_BREAK' | 'KILL_MOB' | 'CRAFT_ITEM' | 'TRAVEL' | 'CUSTOM';

type Cfg = Record<string, unknown>;

/** Keys that have meant "which block or item", in the order they are preferred. */
const MATERIAL_KEYS = ['target_material', 'material', 'block', 'item', 'result'];
const ENTITY_KEYS = ['target_entity', 'entity', 'mob'];
const COUNT_KEYS = ['target_count', 'count', 'amount', 'target'];
const DISTANCE_KEYS = ['target_distance', 'distance', 'distance_blocks', 'blocks'];

function firstString(cfg: Cfg, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = cfg[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim().toUpperCase();
  }
  return undefined;
}

function firstNumber(cfg: Cfg, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = cfg[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return undefined;
}

/**
 * Rewrites a challenge config into the shape the plugin reads.
 *
 * Unknown keys are preserved — CUSTOM challenges carry their own fields and
 * dropping them would lose information — but the canonical keys always win.
 */
export function normalizeChallengeConfig(type: string, config: Cfg): Cfg {
  const out: Cfg = { ...config };
  const material = firstString(config, MATERIAL_KEYS);
  const entity = firstString(config, ENTITY_KEYS);
  const count = firstNumber(config, COUNT_KEYS);
  const distance = firstNumber(config, DISTANCE_KEYS);

  switch (type) {
    case 'BLOCK_BREAK':
    case 'CRAFT_ITEM':
      if (material) out.target_material = material;
      if (count) out.target_count = count;
      break;
    case 'KILL_MOB':
      if (entity) out.target_entity = entity;
      if (count) out.target_count = count;
      break;
    case 'TRAVEL': {
      // Progress is metres accumulated against target_count, so the distance has
      // to land there as well or the challenge completes after one metre.
      const metres = distance ?? count;
      if (metres) {
        out.target_distance = metres;
        out.target_count = metres;
      }
      break;
    }
    default:
      if (count) out.target_count = count;
      break;
  }
  return out;
}

/** True when a config will actually track for its type. */
export function isTrackableChallengeConfig(type: string, config: Cfg): boolean {
  const count = typeof config.target_count === 'number' && config.target_count > 0;
  switch (type) {
    case 'BLOCK_BREAK':
    case 'CRAFT_ITEM':
      return count && typeof config.target_material === 'string' && config.target_material !== '';
    case 'KILL_MOB':
      return count && typeof config.target_entity === 'string' && config.target_entity !== '';
    case 'TRAVEL':
      return count;
    default:
      return true;   // CUSTOM is tracked by whatever fires it
  }
}

/**
 * Rewrites a reward config into the shape the delivery code reads.
 *
 * RewardDelivery.deliverXp reads `amount`, and the API credits `coins` /
 * `crystals`. Generated rewards used `xp` and `{currency: "ENERGY_COINS"}`,
 * neither of which is read — so those rewards handed out the 100 XP default and
 * no coins at all.
 */
export function normalizeRewardConfig(type: string, config: Cfg): Cfg {
  const out: Cfg = { ...config };
  switch (type) {
    case 'XP': {
      const amount = firstNumber(config, ['amount', 'xp', 'experience']);
      if (amount) out.amount = amount;
      break;
    }
    case 'CURRENCY': {
      const currency = typeof config.currency === 'string' ? config.currency.toLowerCase() : '';
      const amount = firstNumber(config, ['coins', 'amount', 'value']);
      if (amount) {
        // Anything that is not explicitly crystals is coins: ENERGY_COINS and
        // friends were invented by the generator and no code reads them.
        if (currency === 'crystals' || typeof config.crystals === 'number') {
          out.crystals = firstNumber(config, ['crystals', 'amount', 'value']) ?? amount;
        } else {
          out.coins = amount;
        }
      }
      break;
    }
    case 'ITEM': {
      const material = firstString(config, ['material', 'item', 'block']);
      const amount = firstNumber(config, ['amount', 'count']);
      if (material) out.material = material;
      out.amount = amount ?? 1;
      break;
    }
    default:
      break;
  }
  return out;
}
