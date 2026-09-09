/**
 * What players have been doing lately, as a few dozen tokens.
 *
 * ServerGod needs to know what is happening in the world to say anything funny
 * about it, but sending it logs would be expensive, slow, and would hand a
 * language model every private thing the children typed. It is also unnecessary:
 * Minecraft already counts everything.
 *
 * So this takes a snapshot of the vanilla counters every tick and diffs it
 * against the previous one. The difference *is* the activity — 200 stone mined,
 * one death, 800 metres walked — with no log parsing anywhere, no chat text, and
 * no coordinates. A four-player digest is roughly 60 tokens per player.
 */

/** One player's counters at a moment in time, as the bridge reports them. */
export interface PlayerSnapshot {
  username: string;
  playTicks: number;
  travelledCm: number;
  blocksMined: number;
  itemsCrafted: number;
  diamondOreMined: number;
  mobKills: number;
  deaths: number;
  fishCaught: number;
  animalsBred: number;
  villagerTrades: number;
  itemsEnchanted: number;
  damageTakenTenths: number;
}

/** What one player did between two snapshots. Only non-zero fields are kept. */
export interface ActivityDelta {
  player: string;
  minutes: number;
  mined?: number;
  crafted?: number;
  diamonds?: number;
  kills?: number;
  deaths?: number;
  metres?: number;
  fish?: number;
  bred?: number;
  trades?: number;
  enchants?: number;
}

const TICKS_PER_MINUTE = 1200;

/** Counters that only ever go up, and the delta field each one feeds. */
const COUNTERS: Array<[keyof PlayerSnapshot, keyof ActivityDelta]> = [
  ['blocksMined', 'mined'],
  ['itemsCrafted', 'crafted'],
  ['diamondOreMined', 'diamonds'],
  ['mobKills', 'kills'],
  ['deaths', 'deaths'],
  ['fishCaught', 'fish'],
  ['animalsBred', 'bred'],
  ['villagerTrades', 'trades'],
  ['itemsEnchanted', 'enchants'],
];

/**
 * The change between two snapshots of the same player.
 *
 * Returns null when nothing at all happened, so an idle or AFK player costs
 * nothing further downstream.
 */
export function diffSnapshot(before: PlayerSnapshot, after: PlayerSnapshot): ActivityDelta | null {
  const delta: ActivityDelta = {
    player: after.username,
    minutes: Math.max(0, Math.round((after.playTicks - before.playTicks) / TICKS_PER_MINUTE)),
  };

  let any = false;
  for (const [from, to] of COUNTERS) {
    // Statistics only ever increase, so a negative difference means the file was
    // reset or the player is new here. Treat it as no activity rather than
    // reporting a nonsense number.
    const change = (after[from] as number) - (before[from] as number);
    if (change > 0) {
      (delta[to] as number) = change;
      any = true;
    }
  }

  const metres = Math.round((after.travelledCm - before.travelledCm) / 100);
  if (metres > 0) {
    delta.metres = metres;
    any = true;
  }

  return any ? delta : null;
}

/** The change for every player present in both snapshots. */
export function diffSnapshots(
  before: Map<string, PlayerSnapshot>,
  after: Map<string, PlayerSnapshot>
): ActivityDelta[] {
  const out: ActivityDelta[] = [];
  for (const [username, now] of after) {
    const then = before.get(username);
    // A player who was not in the previous snapshot has just joined. There is
    // nothing to compare against, so this tick establishes their baseline.
    if (!then) continue;
    const delta = diffSnapshot(then, now);
    if (delta) out.push(delta);
  }
  return out;
}

/**
 * Whether anything here is worth interrupting the game for.
 *
 * Decided in code rather than by the model: a language model asked "is this
 * interesting?" says yes, and the point of the cadence is that ServerGod stays
 * funny by staying rare. No notable activity means no LLM call at all.
 */
export function isNotable(deltas: ActivityDelta[]): boolean {
  return deltas.some((d) =>
    (d.deaths ?? 0) > 0            // dying is always funny
    || (d.diamonds ?? 0) > 0       // a diamond is an event
    || (d.mined ?? 0) >= 150       // a proper grinding session
    || (d.kills ?? 0) >= 10
    || (d.crafted ?? 0) >= 40
    || (d.trades ?? 0) >= 5
    || (d.enchants ?? 0) > 0
    || (d.metres ?? 0) >= 1500     // gone properly exploring
  );
}

/**
 * The digest as it is handed to the model — and the only world data it ever sees.
 *
 * Compact on purpose. Field names are short, zero values are already absent, and
 * there is no chat text, no coordinates and no identifiers beyond the display
 * name the other players can see anyway.
 */
export function digestForPrompt(deltas: ActivityDelta[]): string {
  return JSON.stringify(deltas);
}
