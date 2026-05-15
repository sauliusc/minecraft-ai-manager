package io.craftcontrol.event;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerInteractEvent;

import java.util.UUID;

public class EventListener implements Listener {
    private final BossRaidHandler bossRaidHandler;
    private final TreasureHuntHandler treasureHuntHandler;
    private final BuildBattleHandler buildBattleHandler;

    public EventListener(BossRaidHandler bossRaidHandler, TreasureHuntHandler treasureHuntHandler, BuildBattleHandler buildBattleHandler) {
        this.bossRaidHandler = bossRaidHandler;
        this.treasureHuntHandler = treasureHuntHandler;
        this.buildBattleHandler = buildBattleHandler;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onEntityDamage(EntityDamageByEntityEvent event) {
        if (bossRaidHandler.getActiveEventId() == null) return;
        if (!(event.getDamager() instanceof Player damager)) return;
        if (!(event.getEntity() instanceof org.bukkit.entity.LivingEntity le)) return;
        if (!bossRaidHandler.isActiveBoss(le)) return;
        bossRaidHandler.recordDamage(damager.getUniqueId(), event.getFinalDamage());
    }

    @EventHandler(priority = EventPriority.NORMAL)
    public void onPlayerInteract(PlayerInteractEvent event) {
        if (!treasureHuntHandler.isActive()) return;
        if (event.getAction() != Action.RIGHT_CLICK_BLOCK && event.getAction() != Action.LEFT_CLICK_BLOCK) return;
        if (event.getClickedBlock() == null) return;
        if (event.getClickedBlock().getType() != Material.CHEST) return;
        Location loc = event.getClickedBlock().getLocation();
        if (treasureHuntHandler.tryClaimChest(event.getPlayer(), loc)) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
    public void onBlockPlace(BlockPlaceEvent event) {
        if (!buildBattleHandler.isActive()) return;
        if (!buildBattleHandler.isInOwnPlot(event.getPlayer().getUniqueId(), event.getBlock().getLocation())) {
            event.setCancelled(true);
            event.getPlayer().sendMessage("§cYou can only build within your assigned plot!");
        }
    }

    @EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent event) {
        if (!buildBattleHandler.isActive()) return;
        if (!buildBattleHandler.isInOwnPlot(event.getPlayer().getUniqueId(), event.getBlock().getLocation())) {
            event.setCancelled(true);
            event.getPlayer().sendMessage("§cYou can only break blocks within your assigned plot!");
        }
    }

    @EventHandler(priority = EventPriority.NORMAL)
    public void onPlayerCommand(PlayerCommandPreprocessEvent event) {
        if (!buildBattleHandler.isActive()) return;
        String msg = event.getMessage();
        if (!msg.toLowerCase().startsWith("/buildvote ")) return;
        event.setCancelled(true);
        Player player = event.getPlayer();
        String[] parts = msg.split(" ");
        if (parts.length < 2) {
            player.sendMessage("§cUsage: /buildvote <1-5>");
            return;
        }
        int score;
        try {
            score = Integer.parseInt(parts[1]);
        } catch (NumberFormatException e) {
            player.sendMessage("§cUsage: /buildvote <1-5>");
            return;
        }
        UUID currentBuilder = buildBattleHandler.getCurrentBuilder();
        if (currentBuilder == null) {
            player.sendMessage("§cNo build is currently being voted on.");
            return;
        }
        buildBattleHandler.submitVote(player, currentBuilder, score);
    }
}
