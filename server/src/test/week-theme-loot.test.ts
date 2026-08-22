import { describe, it, expect } from 'vitest';
import { buildLootTable } from '../routes/weekTheme.js';

describe('buildLootTable', () => {
  it('produces weights summing to exactly 100', () => {
    for (const size of [1, 2, 3, 4, 6, 7]) {
      const ids = Array.from({ length: size }, (_, i) => `reward-${i}`);
      const total = buildLootTable(ids).reduce((sum, e) => sum + e.weight, 0);
      expect(total, `size ${size}`).toBe(100);
    }
  });

  it('gives the remainder to the first entry', () => {
    // 3 rewards -> 34/33/33, not 33/33/33 which the reward API would reject
    expect(buildLootTable(['a', 'b', 'c'])).toEqual([
      { rewardId: 'a', weight: 34 },
      { rewardId: 'b', weight: 33 },
      { rewardId: 'c', weight: 33 },
    ]);
  });

  it('spreads evenly when the count divides 100', () => {
    expect(buildLootTable(['a', 'b', 'c', 'd'])).toEqual([
      { rewardId: 'a', weight: 25 },
      { rewardId: 'b', weight: 25 },
      { rewardId: 'c', weight: 25 },
      { rewardId: 'd', weight: 25 },
    ]);
  });

  it('gives a single reward the full weight', () => {
    expect(buildLootTable(['a'])).toEqual([{ rewardId: 'a', weight: 100 }]);
  });

  it('keeps every weight within the 1..100 range the reward schema allows', () => {
    for (const entry of buildLootTable(['a', 'b', 'c', 'd', 'e', 'f', 'g'])) {
      expect(entry.weight).toBeGreaterThanOrEqual(1);
      expect(entry.weight).toBeLessThanOrEqual(100);
    }
  });
});
