package io.craftcontrol.reward.model;

public record RewardGrant(
    String grantId,
    String playerId,
    String rewardId,
    String rewardName,    // human-readable name from DB (e.g. "Daily Login Bonus")
    String rewardType,    // ITEM, XP, COMMAND, CURRENCY
    String rarity,        // COMMON, RARE, EPIC, LEGENDARY
    Object config         // parsed from JSON by caller
) {}
