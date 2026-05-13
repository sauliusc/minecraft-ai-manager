package io.craftcontrol.clan.war;

import java.util.concurrent.atomic.AtomicLong;

public class ActiveWar {
    public final String warId;
    public final String clan1Id;
    public final String clan2Id;
    public final WarType type;
    public final long endsAtMs;
    public volatile WarState state;

    // Scores: clan1Score vs clan2Score
    public final AtomicLong clan1Score = new AtomicLong(0);
    public final AtomicLong clan2Score = new AtomicLong(0);

    // For TERRITORY_CONTROL: accumulated seconds in zone
    // For RESOURCE_RACE: items collected
    // For KILL_COUNT: PvP kills

    // Target count for RESOURCE_RACE (from config/API)
    public final long targetCount;
    // Resource material for RESOURCE_RACE
    public final String targetMaterial;
    // Arena region for TERRITORY_CONTROL and KILL_COUNT
    public final org.bukkit.Location zoneCenter;
    public final double zoneRadius;

    public ActiveWar(String warId, String clan1Id, String clan2Id, WarType type,
                     long durationMs, long targetCount, String targetMaterial,
                     org.bukkit.Location zoneCenter, double zoneRadius) {
        this.warId = warId;
        this.clan1Id = clan1Id;
        this.clan2Id = clan2Id;
        this.type = type;
        this.endsAtMs = System.currentTimeMillis() + durationMs;
        this.state = WarState.ACTIVE;
        this.targetCount = targetCount;
        this.targetMaterial = targetMaterial;
        this.zoneCenter = zoneCenter;
        this.zoneRadius = zoneRadius;
    }

    public boolean isExpired() { return System.currentTimeMillis() >= endsAtMs; }

    public String getLeadingClan() {
        return clan1Score.get() >= clan2Score.get() ? clan1Id : clan2Id;
    }
}
