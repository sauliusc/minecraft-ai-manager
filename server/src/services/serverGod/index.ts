/**
 * ServerGod: decides whether to speak, and what with.
 *
 * The parts that could go wrong quietly live here — whether the feature is on,
 * whether the rate limits allow it, whether anything happened worth mentioning.
 * The persona, the digest and the limits are separate modules so each can be
 * tested without a language model in the loop.
 */

import { getAiConfig, generateShortReply } from '../ai.js';
import { deliverBroadcast } from '../broadcast.js';
import { prisma } from '../../lib/prisma.js';
import {
  PlayerSnapshot, ActivityDelta, diffSnapshots, isNotable, digestForPrompt,
} from './activityDigest.js';
import {
  PersonaConfig, DEFAULT_SLANG, buildSystemPrompt, buildMentionPrompt,
  buildProactivePrompt, extractReply, scoreReply,
} from './prompt.js';
import { RateLimiter } from './limits.js';

export const TICK_INTERVAL_MS = 10 * 60 * 1000;

let limiter = new RateLimiter();

/**
 * The counters as of the previous tick.
 *
 * In memory: after a restart the first tick simply re-establishes the baseline
 * and says nothing, which is the right behaviour anyway — ten minutes of
 * activity spanning a deploy is not worth a joke.
 */
let previous = new Map<string, PlayerSnapshot>();

/** The most recent deltas, so a mention can be answered in context. */
let latestDeltas: ActivityDelta[] = [];

let timer: NodeJS.Timeout | null = null;

export function isEnabled(cfg: Record<string, string>): boolean {
  return cfg['servergod_enabled'] !== 'false';
}

export function loadPersona(cfg: Record<string, string>): PersonaConfig {
  const slang = (cfg['servergod_slang'] ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return {
    name: cfg['servergod_name'] ?? 'ServerGod',
    // Falls back to the built-in list rather than to nothing: an empty list
    // would leave the model to invent its own idea of brainrot, which is the
    // thing the curated list exists to prevent.
    slang: slang.length > 0 ? slang : DEFAULT_SLANG,
    extraInstructions: cfg['servergod_instructions'] || undefined,
  };
}

/** Counters for everyone online, or null when the game server cannot be reached. */
export async function fetchActivity(): Promise<Map<string, PlayerSnapshot> | null> {
  const url = process.env.MINECRAFT_BRIDGE_URL;
  const secret = process.env.BRIDGE_SECRET;
  if (!url || !secret) return null;
  try {
    const res = await fetch(`${url}/bridge/activity`, {
      headers: { 'x-bridge-secret': secret },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { players?: PlayerSnapshot[] };
    return new Map((body.players ?? []).map((p) => [p.username, p]));
  } catch {
    return null;
  }
}

/** Keeps a record of everything ServerGod said, so it can be reviewed later. */
async function record(reply: string): Promise<void> {
  try {
    await prisma.chatLog.create({
      data: { playerId: 'servergod', username: 'ServerGod', message: reply },
    });
  } catch {
    // Never let bookkeeping stop the bot replying.
  }
}

/**
 * The last few things it said, so the prompt can tell it not to repeat them.
 *
 * Read from the same log the dashboard shows. Failure is not worth interrupting
 * a reply over — the worst case is that it repeats itself once.
 */
async function recentLines(limit = 5): Promise<string[]> {
  try {
    const rows = await prisma.chatLog.findMany({
      where: { playerId: 'servergod' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { message: true },
    });
    return rows.map((r) => r.message);
  } catch {
    return [];
  }
}


/**
 * Model preference order for ServerGod, measured rather than assumed.
 *
 * Benchmarked against the real persona prompt, four calls each:
 *
 *   nex-agi/nex-n2.5-pro:free            4/4, ~3s, best Lithuanian
 *   inclusionai/ling-3.0-flash-fin:free  4/4, ~1s, weaker grammar
 *   nvidia/nemotron-3-super-120b:free    3/4, one call 58s, one returned " and "
 *
 * Pinned instead of using openrouter/free, which routes to a different random
 * free model every call — including ones that never produce a usable reply.
 * Pinning costs nothing: these are free models either way.
 */
export const DEFAULT_MODELS = [
  'nex-agi/nex-n2.5-pro:free',
  'inclusionai/ling-3.0-flash-fin:free',
];

export function loadModels(cfg: Record<string, string>): string[] {
  const configured = (cfg['servergod_models'] ?? '')
    .split(',').map((m) => m.trim()).filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_MODELS;
}

/**
 * Produces one usable reply, or null.
 *
 * `samples` controls how hard it tries for a *good* line rather than merely a
 * valid one. Sampling more costs calls, and free models are rate limited, so it
 * is only worth it where nobody is waiting:
 *
 *   mentions   samples=1  a player is watching chat; answer quickly
 *   proactive  samples=3  fires at most twice an hour, so pick the best of three
 *
 * Falls through the model list on failure. In the normal case that is one call:
 * the cost is only paid when something actually went wrong, unlike generating N
 * every time and discarding the rest.
 */
async function bestReply(
  system: string, user: string, models: string[],
  scoreOpts: { player?: string; slang?: string[]; recent?: string[] },
  samples: number
): Promise<{ text: string | null; errored: boolean }> {
  let best: { text: string; score: number } | null = null;
  // Tracked separately so "every model is unreachable" stays distinguishable
  // from "the models answered, but with nothing usable". They need different
  // fixes, and collapsing them hides an outage behind a quality problem.
  let calls = 0;
  let errors = 0;

  for (const model of models) {
    for (let i = 0; i < samples; i++) {
      let raw: string;
      calls++;
      try {
        raw = await generateShortReply(system, user, model);
      } catch (err) {
        errors++;
        console.warn(`[servergod] ${model} failed: ${err instanceof Error ? err.message : err}`);
        break;   // this model is unavailable; move to the next one
      }

      const reply = extractReply(raw);
      if (!reply) continue;

      const score = scoreReply(reply, scoreOpts);
      if (score === 0) continue;   // well-formed but not a sentence
      if (!best || score > best.score) best = { text: reply, score };
    }
    // Good enough to stop looking: a further model will not beat this by much,
    // and every extra call spends a rate limit these free models enforce.
    if (best && best.score >= 6) return { text: best.text, errored: false };
  }

  return { text: best?.text ?? null, errored: best === null && calls > 0 && errors === calls };
}

export type MentionResult =
  | { spoke: true; reply: string }
  | { spoke: false; reason: 'DISABLED' | 'PLAYER_COOLDOWN' | 'HOURLY_CAP' | 'EMPTY' | 'FAILED' };

/**
 * Answers a player who said the bot's name.
 *
 * Quota is spent only when a reply is actually produced, so a model failure does
 * not leave the player on cooldown for something they never got.
 */
export async function handleMention(username: string, message: string): Promise<MentionResult> {
  const cfg = await getAiConfig();
  if (!isEnabled(cfg)) return { spoke: false, reason: 'DISABLED' };

  const check = limiter.checkMention(username);
  if (!check.allowed) {
    // checkMention only ever returns the two mention reasons; the cast keeps the
    // caller's union honest rather than widening it to include proactive ones.
    return { spoke: false, reason: check.reason as 'PLAYER_COOLDOWN' | 'HOURLY_CAP' };
  }

  try {
    const persona = loadPersona(cfg);
    const recent = await recentLines();
    // One sample: a player is watching chat and a slow answer is a worse answer.
    const attempt = await bestReply(
      buildSystemPrompt(persona),
      buildMentionPrompt(username, message, digestForPrompt(latestDeltas), recent),
      loadModels(cfg),
      { player: username, slang: persona.slang, recent },
      1
    );
    if (attempt.errored) return { spoke: false, reason: 'FAILED' };
    const reply = attempt.text;
    if (!reply) {
      // Nothing usable from any model — reasoning notes, an empty string, or a
      // fragment. Staying quiet beats broadcasting it.
      console.warn('[servergod] no usable reply from any model, staying quiet');
      return { spoke: false, reason: 'EMPTY' };
    }

    limiter.recordMention(username);
    await record(reply);
    return { spoke: true, reply };
  } catch (err) {
    console.warn('[servergod] reply failed:', err instanceof Error ? err.message : err);
    return { spoke: false, reason: 'FAILED' };
  }
}

export type TickResult =
  | { spoke: true; reply: string }
  | { spoke: false; reason: 'DISABLED' | 'NO_BRIDGE' | 'NOBODY_ONLINE' | 'NOTHING_NOTABLE' | 'COOLDOWN' | 'EMPTY' | 'FAILED' };

/**
 * The ten-minute check.
 *
 * Ordered cheapest-first on purpose: nobody online and nothing notable are the
 * common cases, and both return before any model is called. The server is empty
 * most of the day, so most ticks cost one HTTP request to the game server.
 */
export async function tick(): Promise<TickResult> {
  const cfg = await getAiConfig();
  if (!isEnabled(cfg)) return { spoke: false, reason: 'DISABLED' };

  const current = await fetchActivity();
  if (!current) return { spoke: false, reason: 'NO_BRIDGE' };
  if (current.size === 0) {
    // Nobody to talk to, and nobody to compare against next time either.
    previous = current;
    return { spoke: false, reason: 'NOBODY_ONLINE' };
  }

  const deltas = diffSnapshots(previous, current);
  previous = current;
  latestDeltas = deltas;

  if (!isNotable(deltas)) return { spoke: false, reason: 'NOTHING_NOTABLE' };

  // Checked after the digest so the deltas are still recorded for context, but
  // before the model, so a cooldown costs nothing.
  if (!limiter.checkProactive().allowed) return { spoke: false, reason: 'COOLDOWN' };

  try {
    const persona = loadPersona(cfg);
    const recent = await recentLines();
    // Three samples: this fires at most twice an hour with nobody waiting, so
    // the extra calls buy quality where they cost nothing anyone notices.
    const attempt = await bestReply(
      buildSystemPrompt(persona),
      buildProactivePrompt(digestForPrompt(deltas), recent),
      loadModels(cfg),
      { player: deltas[0]?.player, slang: persona.slang, recent },
      3
    );
    if (attempt.errored) return { spoke: false, reason: 'FAILED' };
    const reply = attempt.text;
    if (!reply) {
      console.warn('[servergod] no usable reply from any model, staying quiet');
      return { spoke: false, reason: 'EMPTY' };
    }

    limiter.recordProactive();
    await record(reply);
    await deliverBroadcast(['CHAT'], `[${persona.name}] ${reply}`, 'ALL');
    return { spoke: true, reply };
  } catch (err) {
    console.warn('[servergod] proactive failed:', err instanceof Error ? err.message : err);
    return { spoke: false, reason: 'FAILED' };
  }
}

export function startServerGod(intervalMs: number = TICK_INTERVAL_MS): void {
  if (timer) return;
  const run = () => {
    tick().catch((err) => console.error('[servergod] tick failed:', err));
  };
  timer = setInterval(run, intervalMs);
  timer.unref?.();
  console.log(`[servergod] watching for something worth saying (every ${intervalMs / 60000}m)`);
}

export function stopServerGod(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

/** Test seam: forgets the baseline, the cached deltas and every cooldown. */
export function resetState(): void {
  previous = new Map();
  latestDeltas = [];
  limiter = new RateLimiter();
}
