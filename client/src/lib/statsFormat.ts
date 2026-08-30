/**
 * Formatting for the vanilla Minecraft statistics shown on a player's page.
 *
 * The plugin sends raw counters so there is one source of truth for the numbers
 * themselves. Their units are not obvious and are the easy thing to get wrong:
 * play time is in **ticks** (20 per second) despite Minecraft calling the
 * statistic PLAY_ONE_MINUTE, distances are in **centimetres**, and damage is in
 * **tenths of a heart**. These mirror StatsFormat.java on the plugin side.
 */

export const TICKS_PER_SECOND = 20;

export function duration(ticks: number): string {
  const totalMinutes = Math.floor(ticks / TICKS_PER_SECOND / 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function distance(centimetres: number): string {
  const metres = centimetres / 100;
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres)} m`;
}

/**
 * Kills per death. Someone who has killed plenty and never died has not got a
 * ratio of zero, and dividing by zero deaths is not a number at all.
 */
export function killDeathRatio(kills: number, deaths: number): string {
  if (deaths <= 0) return kills === 0 ? '—' : `${kills}.0`;
  return (kills / deaths).toFixed(2);
}

export function hearts(damageTenths: number): string {
  return (damageTenths / 10).toFixed(1);
}

export function count(value: number): string {
  return value.toLocaleString('en-US');
}
