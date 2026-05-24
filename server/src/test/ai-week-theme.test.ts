import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the shared prisma lib (which ai.ts now uses)
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    aiConfig: {
      findMany: vi.fn(),
    },
    challenge: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// We need to mock Anthropic and OpenAI modules used by the AI service
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}));

import { prisma } from '../lib/prisma.js';
import { generateWeekTheme } from '../services/ai.js';
import Anthropic from '@anthropic-ai/sdk';

const VALID_WEEK_THEME_PAYLOAD = {
  description: 'A thrilling dragon invasion sweeps across the server this week. Ancient beasts have awakened from their slumber. Band together to survive the onslaught!',
  event: {
    type: 'BOSS_RAID',
    title: 'Dragon Invasion Boss Raid',
    config: { bossName: 'Elder Dragon', difficulty: 'HARD' },
  },
  dailyChallenges: [
    { dayOffset: 0, title: 'Dragon Slayer I', description: 'Slay 5 dragons', type: 'KILL_MOB', difficulty: 2, config: { mob: 'ENDER_DRAGON', amount: 5 } },
    { dayOffset: 1, title: 'Dragon Scales', description: 'Mine 50 obsidian', type: 'BLOCK_BREAK', difficulty: 1, config: { block: 'OBSIDIAN', amount: 50 } },
    { dayOffset: 2, title: 'Fire Forger', description: 'Craft fire resistance potions', type: 'CRAFT_ITEM', difficulty: 2, config: { item: 'FIRE_RESISTANCE_POTION', amount: 5 } },
    { dayOffset: 3, title: 'Dragon Hunter', description: 'Travel to the End', type: 'TRAVEL', difficulty: 3, config: { distance: 2000 } },
    { dayOffset: 4, title: 'Scale Collector', description: 'Collect dragon drops', type: 'CUSTOM', difficulty: 2, config: { metric: 'dragon_drops', target: 10 } },
    { dayOffset: 5, title: 'Dragon Rider', description: 'Tame a dragon mount', type: 'CUSTOM', difficulty: 3, config: { metric: 'dragon_tame', target: 1 } },
    { dayOffset: 6, title: 'Dragon Master', description: 'Defeat the Dragon Boss', type: 'KILL_MOB', difficulty: 4, config: { mob: 'BOSS_DRAGON', amount: 1 } },
  ],
  weeklyChallenge: {
    title: 'Dragon Invasion Champion',
    description: 'Complete all dragon-themed challenges this week',
    type: 'CUSTOM',
    difficulty: 5,
    config: { metric: 'dragon_challenges', target: 7 },
  },
  npc: {
    name: 'Drakon',
    title: 'Dragon Lore Keeper',
    type: 'QUEST_GIVER',
    dialogueLines: [
      'The dragons have returned! We must prepare.',
      'Seek the ancient tomes in the End dimension.',
      'Only the brave can stand against the Elder Dragon.',
      'Forge your weapons well — dragonfire burns hot.',
      'Return to me when the invasion is repelled.',
    ],
  },
  rewards: [
    { name: 'Dragon Scale Helmet', type: 'ITEM', rarity: 'LEGENDARY', config: { material: 'NETHERITE_HELMET' } },
    { name: 'Dragon Hunter XP', type: 'XP', rarity: 'EPIC', config: { amount: 5000 } },
    { name: 'Dragon Coins', type: 'CURRENCY', rarity: 'RARE', config: { coins: 1000 } },
    { name: 'Dragon Mystery Box', type: 'MYSTERY_BOX', rarity: 'COMMON', config: {} },
  ],
  announcementText: '/say *** DRAGON INVASION WEEK HAS BEGUN! Prepare yourselves, brave adventurers! ***',
};

function makeAiConfigRows() {
  return [
    { key: 'provider', value: 'anthropic' },
    { key: 'api_key', value: 'test-key' },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.aiConfig.findMany).mockResolvedValue(makeAiConfigRows() as any);
});

describe('generateWeekTheme', () => {
  it('returns a valid WeekThemePayload with correct structure', async () => {
    const mockAnthropicCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(VALID_WEEK_THEME_PAYLOAD) }],
    });

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: mockAnthropicCreate },
    }) as any);

    const startDate = new Date('2026-05-25T00:00:00.000Z');
    const result = await generateWeekTheme('Dragon Invasion', startDate, []);

    expect(result.description).toBeTruthy();
    expect(result.event.type).toMatch(/^(BOSS_RAID|TREASURE_HUNT|BUILD_BATTLE|CLAN_WAR)$/);
    expect(result.event.title).toBeTruthy();
  });

  it('returns exactly 7 daily challenges', async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(VALID_WEEK_THEME_PAYLOAD) }],
        }),
      },
    }) as any);

    const result = await generateWeekTheme('Dragon Invasion', new Date(), []);

    expect(result.dailyChallenges).toHaveLength(7);
    // dayOffsets should cover 0-6
    const dayOffsets = result.dailyChallenges.map((c) => c.dayOffset).sort((a, b) => a - b);
    expect(dayOffsets).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('returns exactly 4 rewards', async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(VALID_WEEK_THEME_PAYLOAD) }],
        }),
      },
    }) as any);

    const result = await generateWeekTheme('Dragon Invasion', new Date(), []);

    expect(result.rewards).toHaveLength(4);
  });

  it('returns NPC with exactly 5 dialogue lines', async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(VALID_WEEK_THEME_PAYLOAD) }],
        }),
      },
    }) as any);

    const result = await generateWeekTheme('Dragon Invasion', new Date(), []);

    expect(result.npc.dialogueLines).toHaveLength(5);
    expect(result.npc.name).toBeTruthy();
    expect(result.npc.title).toBeTruthy();
  });

  it('throws on invalid JSON from LLM', async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'This is not JSON at all' }],
        }),
      },
    }) as any);

    await expect(generateWeekTheme('Test', new Date(), [])).rejects.toThrow('Failed to parse LLM response as JSON');
  });

  it('throws when daily challenges count is wrong', async () => {
    const badPayload = {
      ...VALID_WEEK_THEME_PAYLOAD,
      dailyChallenges: VALID_WEEK_THEME_PAYLOAD.dailyChallenges.slice(0, 5), // only 5
    };

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(badPayload) }],
        }),
      },
    }) as any);

    await expect(generateWeekTheme('Test', new Date(), [])).rejects.toThrow('Expected 7 daily challenges');
  });

  it('throws when rewards count is wrong', async () => {
    const badPayload = {
      ...VALID_WEEK_THEME_PAYLOAD,
      rewards: VALID_WEEK_THEME_PAYLOAD.rewards.slice(0, 2), // only 2
    };

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(badPayload) }],
        }),
      },
    }) as any);

    await expect(generateWeekTheme('Test', new Date(), [])).rejects.toThrow('Expected 4 rewards');
  });

  it('throws when NPC dialogue lines count is wrong', async () => {
    const badPayload = {
      ...VALID_WEEK_THEME_PAYLOAD,
      npc: {
        ...VALID_WEEK_THEME_PAYLOAD.npc,
        dialogueLines: ['Only one line'],
      },
    };

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(badPayload) }],
        }),
      },
    }) as any);

    await expect(generateWeekTheme('Test', new Date(), [])).rejects.toThrow('Expected 5 NPC dialogue lines');
  });

  it('strips markdown code fences from LLM response', async () => {
    const wrappedJson = '```json\n' + JSON.stringify(VALID_WEEK_THEME_PAYLOAD) + '\n```';

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: wrappedJson }],
        }),
      },
    }) as any);

    const result = await generateWeekTheme('Dragon Invasion', new Date(), []);
    expect(result.dailyChallenges).toHaveLength(7);
  });

  it('passes existing challenge titles to callLLM to avoid duplication', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(VALID_WEEK_THEME_PAYLOAD) }],
    });

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: mockCreate },
    }) as any);

    const existingTitles = ['Old Challenge 1', 'Old Challenge 2'];
    await generateWeekTheme('Dragon Invasion', new Date(), existingTitles);

    const callArgs = mockCreate.mock.calls[0][0];
    const userPrompt: string = callArgs.messages[0].content;
    expect(userPrompt).toContain('Old Challenge 1');
    expect(userPrompt).toContain('Old Challenge 2');
  });
});
