/**
 * Pays out challenge completions that happened before payouts existed.
 *
 * Seven completions across five players finished challenges and received
 * nothing, because no code granted anything (#383). They earned them.
 *
 * Safe to run more than once: payOutCompletion checks the economy log for an
 * existing payout for that player and challenge, so anyone already paid is
 * skipped rather than paid twice.
 *
 *   docker compose exec -T api node dist/scripts/backfillChallengePayouts.js
 */

import { prisma } from '../lib/prisma.js';
import { payOutCompletion } from '../services/challengeRewards.js';

async function main(): Promise<void> {
  const completed = await prisma.challengeProgress.findMany({
    where: { completed: true },
    include: { challenge: true },
    orderBy: { completedAt: 'asc' },
  });

  console.log(`Found ${completed.length} completed challenge(s).`);
  let paid = 0;
  let skipped = 0;

  for (const progress of completed) {
    const c = progress.challenge;
    const payout = await payOutCompletion(
      { id: c.id, difficulty: c.difficulty, rewardId: c.rewardId, questCategory: c.questCategory },
      progress.playerId
    );

    if (payout.alreadyPaid) {
      skipped++;
      console.log(`  = ${progress.playerId} — "${c.title}" already paid`);
      continue;
    }
    paid++;
    const extra = payout.rewardGranted ? ' + reward'
      : payout.rewardError ? ` (reward failed: ${payout.rewardError})` : '';
    console.log(`  + ${progress.playerId} — "${c.title}": ${payout.coins} coins${extra}`);
  }

  console.log(`\nPaid ${paid}, skipped ${skipped} already paid.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Backfill failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
