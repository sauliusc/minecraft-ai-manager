package io.craftcontrol.economy;

import org.bukkit.event.*;
import org.bukkit.event.player.PlayerJoinEvent;

public class EconomyListener implements Listener {
    private final EconomyPlugin plugin;
    private final EconomyManager economy;

    public EconomyListener(EconomyPlugin plugin, EconomyManager economy) {
        this.plugin = plugin;
        this.economy = economy;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        String uuid = event.getPlayer().getUniqueId().toString();
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> economy.fetchBalance(uuid));
    }
}
