import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { count, distance, duration, hearts, killDeathRatio } from '../lib/statsFormat.js';

interface Stats {
  online: boolean;
  playTicks: number;
  travelledCm: number;
  blocksMined: number;
  itemsCrafted: number;
  diamondOreMined: number;
  mobKills: number;
  playerKills: number;
  deaths: number;
  timeSinceDeathTicks: number;
  damageDealtTenths: number;
  damageTakenTenths: number;
  jumps: number;
  fishCaught: number;
  animalsBred: number;
  villagerTrades: number;
  itemsEnchanted: number;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-gray-50 rounded p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-800 mt-0.5">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

/**
 * The same numbers `/stats` shows in game.
 *
 * They live in Minecraft's player data rather than the database, so this asks
 * the game server through the API. When the server is down or too busy the
 * panel says so instead of the page failing.
 */
export function MinecraftStats({ username }: { username: string }) {
  const { data, isLoading } = useQuery<{ available: boolean; stats: Stats | null }>({
    queryKey: ['minecraft-stats', username],
    queryFn: () => api.get(`/players/${username}/minecraft-stats`).then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading statistics…</p>;
  }
  if (!data?.available || !data.stats) {
    return (
      <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2">
        Game statistics are unavailable — the Minecraft server could not be reached.
        Everything else on this page still works.
      </p>
    );
  }

  const s = data.stats;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Time played" value={duration(s.playTicks)} />
        <Tile label="Blocks mined" value={count(s.blocksMined)} />
        <Tile label="Mobs killed" value={count(s.mobKills)} />
        <Tile
          label="Deaths"
          value={count(s.deaths)}
          hint={`K/D ${killDeathRatio(s.mobKills, s.deaths)}`}
        />
        <Tile label="Diamond ore" value={count(s.diamondOreMined)} />
        <Tile label="Distance" value={distance(s.travelledCm)} />
        <Tile label="Items crafted" value={count(s.itemsCrafted)} />
        <Tile label="Since last death" value={duration(s.timeSinceDeathTicks)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Damage dealt" value={`${hearts(s.damageDealtTenths)} ♥`} />
        <Tile label="Damage taken" value={`${hearts(s.damageTakenTenths)} ♥`} />
        <Tile label="Jumps" value={count(s.jumps)} />
        {s.playerKills > 0 && <Tile label="Players killed" value={count(s.playerKills)} />}
        {s.fishCaught > 0 && <Tile label="Fish caught" value={count(s.fishCaught)} />}
        {s.animalsBred > 0 && <Tile label="Animals bred" value={count(s.animalsBred)} />}
        {s.villagerTrades > 0 && <Tile label="Villager trades" value={count(s.villagerTrades)} />}
        {s.itemsEnchanted > 0 && <Tile label="Items enchanted" value={count(s.itemsEnchanted)} />}
      </div>

      <p className="text-xs text-gray-400">
        Read live from the Minecraft server — the same numbers{' '}
        <span className="font-mono">/stats</span> shows in game.
      </p>
    </div>
  );
}
