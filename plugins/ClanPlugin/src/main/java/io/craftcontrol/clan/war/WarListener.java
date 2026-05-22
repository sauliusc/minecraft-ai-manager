package io.craftcontrol.clan.war;

import io.craftcontrol.clan.ClanManager;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.*;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerMoveEvent;

public class WarListener implements Listener {
    private final ClanManager clanManager;
    private final WarManager warManager;

    public WarListener(ClanManager clanManager, WarManager warManager) {
        this.clanManager = clanManager;
        this.warManager = warManager;
    }

    // TERRITORY_CONTROL: check every move if player is in zone
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        // Only process on block change (performance)
        if (event.getFrom().getBlockX() == event.getTo().getBlockX()
            && event.getFrom().getBlockY() == event.getTo().getBlockY()
            && event.getFrom().getBlockZ() == event.getTo().getBlockZ()) return;

        Player player = event.getPlayer();
        String clanId = clanManager.getClanId(player.getName());
        if (clanId == null) return;
        ActiveWar war = warManager.getWarForClan(clanId);
        if (war == null || war.type != WarType.TERRITORY_CONTROL || war.zoneCenter == null) return;
        if (war.state != WarState.ACTIVE || war.isExpired()) return;

        Location loc = player.getLocation();
        if (!loc.getWorld().equals(war.zoneCenter.getWorld())) return;
        double dist = loc.distance(war.zoneCenter);
        if (dist <= war.zoneRadius) {
            // Player is in zone — score 1 second (this fires on block change only, rough approximation)
            warManager.recordScore(war, clanId, 1);
        }
    }

    // RESOURCE_RACE: track block breaks
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent event) {
        Player player = event.getPlayer();
        String clanId = clanManager.getClanId(player.getName());
        if (clanId == null) return;
        ActiveWar war = warManager.getWarForClan(clanId);
        if (war == null || war.type != WarType.RESOURCE_RACE) return;
        if (war.state != WarState.ACTIVE || war.isExpired()) return;

        String material = event.getBlock().getType().name();
        if (material.equalsIgnoreCase(war.targetMaterial)) {
            warManager.recordScore(war, clanId, 1);
        }
    }

    // KILL_COUNT: track PvP kills in arena
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlayerDeath(PlayerDeathEvent event) {
        Player killed = event.getEntity();
        Player killer = killed.getKiller();
        if (killer == null) return;

        String killerClanId = clanManager.getClanId(killer.getName());
        String killedClanId = clanManager.getClanId(killed.getName());
        if (killerClanId == null || killedClanId == null) return;
        if (killerClanId.equals(killedClanId)) return; // No friendly kills

        ActiveWar war = warManager.getWarForClan(killerClanId);
        if (war == null || war.type != WarType.KILL_COUNT) return;
        if (war.state != WarState.ACTIVE || war.isExpired()) return;

        // Verify both clans are in this war
        if (!(war.clan1Id.equals(killedClanId) || war.clan2Id.equals(killedClanId))) return;

        // Optionally check arena bounds
        if (war.zoneCenter != null && war.zoneRadius > 0) {
            Location loc = killer.getLocation();
            if (!loc.getWorld().equals(war.zoneCenter.getWorld())) return;
            if (loc.distance(war.zoneCenter) > war.zoneRadius) return;
        }

        warManager.recordScore(war, killerClanId, 1);
    }
}
