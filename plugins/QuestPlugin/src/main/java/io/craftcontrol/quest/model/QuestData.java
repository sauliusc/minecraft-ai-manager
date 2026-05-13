package io.craftcontrol.quest.model;

public record QuestData(
    String id,
    String title,
    String description,
    QuestCategory category,
    String type,           // BLOCK_BREAK, KILL_MOB, CRAFT_ITEM, TRAVEL, CUSTOM
    String targetMaterial,
    String targetEntity,
    int targetCount,
    int currentProgress,
    boolean completed
) {}
