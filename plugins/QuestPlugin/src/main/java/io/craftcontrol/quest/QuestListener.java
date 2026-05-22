package io.craftcontrol.quest;

import org.bukkit.event.*;
import org.bukkit.event.player.*;

public class QuestListener implements Listener {
    private final QuestPlugin plugin;
    private final QuestRepository repo;

    public QuestListener(QuestPlugin plugin, QuestRepository repo) {
        this.plugin = plugin;
        this.repo = repo;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        String uuid = event.getPlayer().getName();
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> repo.fetchQuests(uuid));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        repo.invalidate(event.getPlayer().getName());
    }
}
