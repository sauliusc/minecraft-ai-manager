package io.craftcontrol.event;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;

public class EventListener implements Listener {
    private final BossRaidHandler bossRaidHandler;
    private final TreasureHuntHandler treasureHuntHandler;

    public EventListener(BossRaidHandler bossRaidHandler, TreasureHuntHandler treasureHuntHandler) {
        this.bossRaidHandler = bossRaidHandler;
        this.treasureHuntHandler = treasureHuntHandler;
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
}
