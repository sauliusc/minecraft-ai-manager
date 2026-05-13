package io.craftcontrol.reward.model;

public record RewardGrant(
    String grantId,
    String playerId,
    String rewardId,
    String rewardType,   // ITEM, XP, COMMAND, MYSTERY_BOX
    String rarity,       // COMMON, RARE, EPIC, LEGENDARY
    Object config        // parsed from JSON by caller
) {}
