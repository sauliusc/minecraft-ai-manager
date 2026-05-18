import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Config helpers ─────────────────────────────────────────────────────────────

export async function getAiConfig(): Promise<Record<string, string>> {
  const rows = await prisma.aiConfig.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setAiConfig(updates: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(updates).map(([key, value]) =>
      prisma.aiConfig.upsert({ where: { key }, create: { key, value }, update: { value } })
    )
  );
}

function isEnabled(cfg: Record<string, string>, feature: string): boolean {
  return cfg[`enable_${feature}`] !== 'false';
}

// ── Provider defaults ──────────────────────────────────────────────────────────

const PROVIDER_DEFAULTS: Record<string, { generator: string; inference: string }> = {
  anthropic:   { generator: 'claude-sonnet-4-6',            inference: 'claude-haiku-4-5' },
  openrouter:  { generator: 'anthropic/claude-sonnet-4-6',  inference: 'anthropic/claude-haiku-4-5' },
  gemini:      { generator: 'gemini-2.5-pro',               inference: 'gemini-2.0-flash' },
};

function resolveModel(cfg: Record<string, string>, role: 'generator' | 'inference'): string {
  if (cfg[`${role}_model`]) return cfg[`${role}_model`];
  const provider = cfg['provider'] ?? 'anthropic';
  return PROVIDER_DEFAULTS[provider]?.[role] ?? (role === 'generator' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5');
}

// ── Unified LLM caller ─────────────────────────────────────────────────────────

async function callLLM(
  cfg: Record<string, string>,
  opts: { system: string; user: string; model: string; maxTokens: number }
): Promise<string> {
  const provider = cfg['provider'] ?? 'anthropic';
  const { system, user, model, maxTokens } = opts;

  if (provider === 'anthropic') {
    const apiKey = cfg['api_key'] ?? process.env.ANTHROPIC_API_KEY ?? '';
    if (!apiKey) throw new Error('Anthropic API key not configured');
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return (response.content[0] as { type: string; text: string }).text.trim();
  }

  if (provider === 'openrouter') {
    const apiKey = cfg['openrouter_api_key'] ?? '';
    if (!apiKey) throw new Error('OpenRouter API key not configured');
    const client = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    return (response.choices[0].message.content ?? '').trim();
  }

  if (provider === 'gemini') {
    const apiKey = cfg['gemini_api_key'] ?? '';
    if (!apiKey) throw new Error('Gemini API key not configured');
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    return (response.choices[0].message.content ?? '').trim();
  }

  throw new Error(`Unknown AI provider: "${provider}"`);
}

function stripJsonFences(raw: string): string {
  return raw.replace(/^```json\n?/, '').replace(/\n?```$/, '');
}

// ── Challenge Generator ────────────────────────────────────────────────────────

export interface ChallengeDraftPayload {
  title: string;
  description: string;
  type: string;
  difficulty: number;
  config: Record<string, unknown>;
  questCategory: string;
  activeFrom: string;
  activeUntil: string;
}

export async function generateChallengeDrafts(
  themeHint: string,
  existingTitles: string[],
  analyticsSnapshot: string
): Promise<{ payload: ChallengeDraftPayload; confidence: number; reasoning: string }[]> {
  const cfg = await getAiConfig();
  if (!isEnabled(cfg, 'challenges')) throw new Error('Challenge generator is disabled');

  const model = resolveModel(cfg, 'generator');
  const count = parseInt(cfg['challenge_count'] ?? '3');

  const raw = await callLLM(cfg, {
    model,
    maxTokens: 2000,
    system: `You are a Minecraft challenge designer for a Paper 1.21 server management system.
Generate creative, balanced challenges that fit the server's current engagement patterns.
Always respond with valid JSON only — no markdown, no explanation outside the JSON array.`,
    user: `Generate exactly ${count} Minecraft challenge objects as a JSON array.

Challenge types available: BLOCK_BREAK, KILL_MOB, CRAFT_ITEM, TRAVEL, CUSTOM
Quest categories: DAILY, WEEKLY, SIDE
Difficulty: 1 (easiest) to 5 (hardest)

Config shape per type:
- BLOCK_BREAK: { "block": "STONE", "amount": 100 }
- KILL_MOB: { "mob": "ZOMBIE", "amount": 20 }
- CRAFT_ITEM: { "item": "IRON_SWORD", "amount": 1 }
- TRAVEL: { "distance": 1000 }
- CUSTOM: { "metric": "string", "target": 1 }

Active windows: DAILY challenges last 24h, WEEKLY last 7 days, SIDE last 30 days.
Set activeFrom to now (ISO string) and activeUntil accordingly.

${themeHint ? `Theme hint from admin: "${themeHint}"` : ''}

Recent challenge titles to AVOID duplicating:
${existingTitles.slice(0, 30).join(', ')}

Server analytics context:
${analyticsSnapshot}

Return a JSON array of exactly ${count} objects, each with these fields:
{
  "title": string,
  "description": string,
  "type": ChallengeType,
  "difficulty": 1-5,
  "config": object,
  "questCategory": "DAILY"|"WEEKLY"|"SIDE",
  "activeFrom": ISO string,
  "activeUntil": ISO string,
  "confidence": 0.0-1.0,
  "reasoning": string (1 sentence why this challenge fits)
}`,
  });

  const parsed = JSON.parse(stripJsonFences(raw));
  const items = Array.isArray(parsed) ? parsed : parsed.challenges ?? [];

  return items.map((item: ChallengeDraftPayload & { confidence: number; reasoning: string }) => ({
    payload: {
      title: item.title,
      description: item.description,
      type: item.type,
      difficulty: item.difficulty,
      config: item.config,
      questCategory: item.questCategory,
      activeFrom: item.activeFrom,
      activeUntil: item.activeUntil,
    },
    confidence: item.confidence ?? 0.75,
    reasoning: item.reasoning ?? '',
  }));
}

// ── Engagement / Churn Analysis ────────────────────────────────────────────────

export interface EngagementResult {
  playerUuid: string;
  username: string;
  riskScore: number;
  reasoning: string;
  recommendedAction: string;
}

export async function runEngagementScan(
  players: {
    uuid: string;
    username: string;
    recentLogins: number;
    baselineLogins: number;
    recentCompletions: number;
    priorCompletions: number;
    currentStreak: number;
    longestStreak: number;
    daysSinceReward: number;
  }[]
): Promise<EngagementResult[]> {
  const cfg = await getAiConfig();
  if (!isEnabled(cfg, 'engagement')) throw new Error('Engagement analysis is disabled');

  const model = resolveModel(cfg, 'generator');

  const playerData = players
    .map(
      (p) =>
        `${p.username} (${p.uuid.slice(0, 8)}): logins ${p.recentLogins}/${p.baselineLogins} baseline, ` +
        `completions ${p.recentCompletions} vs ${p.priorCompletions} prior week, ` +
        `streak ${p.currentStreak}/${p.longestStreak} best, ` +
        `${p.daysSinceReward}d since last reward`
    )
    .join('\n');

  const raw = await callLLM(cfg, {
    model,
    maxTokens: 4000,
    system:
      "You are a player retention analyst for a Minecraft server. Score each player's churn risk 0.0–1.0. " +
      'Return only a JSON array, no markdown.',
    user: `Score these ${players.length} players for churn risk. For each return:
{ "playerUuid": string, "username": string, "riskScore": 0.0-1.0, "reasoning": string (1 sentence), "recommendedAction": string (1 short action) }

Players:
${playerData}

Return JSON array only.`,
  });

  const results = JSON.parse(stripJsonFences(raw));
  return Array.isArray(results) ? results : results.players ?? [];
}

// ── Reward Suggestions ─────────────────────────────────────────────────────────

export interface RewardSuggestion {
  rewardId: string;
  name: string;
  type: string;
  rarity: string;
  reason: string;
}

export async function suggestRewards(
  player: {
    uuid: string;
    username: string;
    tier: string;
    currentStreak: number;
    coins: number;
    crystals: number;
    topChallengeTypes: string[];
    recentRewardTypes: string[];
    equippedCosmetics: string[];
  },
  catalogue: { id: string; name: string; type: string; rarity: string }[]
): Promise<RewardSuggestion[]> {
  const cfg = await getAiConfig();
  if (!isEnabled(cfg, 'rewards')) throw new Error('Reward suggestions are disabled');

  const model = resolveModel(cfg, 'inference');

  const raw = await callLLM(cfg, {
    model,
    maxTokens: 800,
    system: 'You are a reward recommendation engine for a Minecraft server. Return only JSON, no markdown.',
    user: `Recommend exactly 3 rewards for this player from the catalogue below.

Player: ${player.username} (${player.tier} tier)
- Streak: ${player.currentStreak} days
- Economy: ${player.coins} coins, ${player.crystals} crystals
- Favourite challenge types: ${player.topChallengeTypes.join(', ')}
- Recent rewards received: ${player.recentRewardTypes.join(', ')}
- Cosmetics equipped: ${player.equippedCosmetics.join(', ')}

Reward catalogue (id | name | type | rarity):
${catalogue.map((r) => `${r.id} | ${r.name} | ${r.type} | ${r.rarity}`).join('\n')}

Return JSON array of exactly 3:
[{ "rewardId": string, "name": string, "type": string, "rarity": string, "reason": string }]`,
  });

  return JSON.parse(stripJsonFences(raw));
}

// ── Chat Moderation Scanner ────────────────────────────────────────────────────

export type ChatCategory = 'CLEAN' | 'MILD_TOXICITY' | 'HATE_SPEECH' | 'PERSONAL_THREAT' | 'SPAM';

export interface ChatScanResult {
  logId: string;
  playerId: string;
  username: string;
  message: string;
  category: ChatCategory;
  reasoning: string;
}

export async function scanChatMessages(
  messages: { id: string; playerId: string; username: string; message: string; context: string[] }[]
): Promise<ChatScanResult[]> {
  const cfg = await getAiConfig();
  if (!isEnabled(cfg, 'moderation')) throw new Error('Chat moderation scanner is disabled');

  const model = resolveModel(cfg, 'inference');

  const formatted = messages
    .map(
      (m) =>
        `ID:${m.id} | ${m.username}: "${m.message}"` +
        (m.context.length ? ` [prior: ${m.context.slice(-2).join(' | ')}]` : '')
    )
    .join('\n');

  const raw = await callLLM(cfg, {
    model,
    maxTokens: 3000,
    system:
      'You are a Minecraft chat moderation classifier. Categories: CLEAN, MILD_TOXICITY, HATE_SPEECH, PERSONAL_THREAT, SPAM. ' +
      'Return only a JSON array, no markdown.',
    user: `Classify each message. Return JSON array:
[{ "logId": string, "playerId": string, "username": string, "message": string, "category": string, "reasoning": string }]

Messages:
${formatted}`,
  });

  return JSON.parse(stripJsonFences(raw));
}
