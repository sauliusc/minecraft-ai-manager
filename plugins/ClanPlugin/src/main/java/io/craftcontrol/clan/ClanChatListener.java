package io.craftcontrol.clan;

import io.craftcontrol.clan.model.ClanData;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.entity.Player;
import org.bukkit.event.*;
import org.bukkit.event.player.*;

public class ClanChatListener implements Listener {
    private final ClanPlugin plugin;
    private final ClanManager manager;

    public ClanChatListener(ClanPlugin plugin, ClanManager manager) {
        this.plugin = plugin;
        this.manager = manager;
    }

    @EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
    public void onChat(AsyncPlayerChatEvent event) {
        Player player = event.getPlayer();
        String uuid = player.getName();
        if (!manager.isClanChatEnabled(uuid)) return;

        ClanData clan = manager.getClanByPlayer(uuid);
        if (clan == null) return;

        event.setCancelled(true);
        String message = event.getMessage();
        String prefix = plugin.getConfig().getString("clan.chat_prefix", "[CLAN]");
        Component clanMsg = Component.text(prefix + " [" + clan.tag() + "] " + player.getName() + ": " + message, NamedTextColor.GREEN);

        // Send to all online clan members
        for (String memberId : clan.memberIds()) {
            try {
                Player member = plugin.getServer().getPlayer(java.util.UUID.fromString(memberId));
                if (member != null && member.isOnline()) {
                    member.sendMessage(clanMsg);
                }
            } catch (IllegalArgumentException ignored) {}
        }
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        String uuid = event.getPlayer().getName();
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> manager.fetchClan(uuid));
    }
}
