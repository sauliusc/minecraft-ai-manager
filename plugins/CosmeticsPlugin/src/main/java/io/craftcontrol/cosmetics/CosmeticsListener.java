package io.craftcontrol.cosmetics;

import io.craftcontrol.cosmetics.model.CosmeticsProfile;
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.UUID;

public class CosmeticsListener implements Listener {
    private final CosmeticsPlugin plugin;
    private final CosmeticsManager manager;
    private final PetManager petManager;

    public CosmeticsListener(CosmeticsPlugin plugin, CosmeticsManager manager, PetManager petManager) {
        this.plugin = plugin;
        this.manager = manager;
        this.petManager = petManager;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        UUID uuid = event.getPlayer().getUniqueId();
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            manager.loadProfile(uuid);
            plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
                Player player = plugin.getServer().getPlayer(uuid);
                if (player == null) return;
                CosmeticsProfile profile = manager.getProfile(uuid);
                applyTabListName(player, profile);
            }, 20L);
        });
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        UUID uuid = event.getPlayer().getUniqueId();
        petManager.dismiss(uuid);
        manager.unloadProfile(uuid);
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onChat(AsyncChatEvent event) {
        Player player = event.getPlayer();
        CosmeticsProfile profile = manager.getProfile(player.getUniqueId());

        // Apply title prefix to the rendered chat format
        String titleId = profile.getTitleId();
        if (titleId != null && !titleId.isEmpty()) {
            Component titlePrefix = Component.text("[" + titleId + "] ", NamedTextColor.GOLD);
            event.renderer((source, sourceDisplayName, message, viewer) ->
                titlePrefix.append(sourceDisplayName).append(Component.text(": ")).append(message));
        }

        // Apply chat color to the message body
        String colorName = profile.getChatColor();
        if (colorName == null) return;
        TextColor color = resolveColor(colorName);
        if (color == null) return;
        Component original = event.message();
        event.message(Component.empty().color(color).append(original));
    }

    @EventHandler
    public void onMove(PlayerMoveEvent event) {
        if (!event.hasChangedBlock()) return;
        Player player = event.getPlayer();
        CosmeticsProfile profile = manager.getProfile(player.getUniqueId());
        String trailType = profile.getTrailType();
        if (trailType == null) return;
        try {
            Particle particle = Particle.valueOf(trailType);
            Location loc = player.getLocation();
            player.getWorld().spawnParticle(particle, loc, 3, 0.1, 0.1, 0.1, 0);
        } catch (IllegalArgumentException ignored) {}
    }

    public void applyTabListName(Player player, CosmeticsProfile profile) {
        String titleId = profile.getTitleId();
        if (titleId != null && !titleId.isEmpty()) {
            Component name = Component.text("[" + titleId + "] ", NamedTextColor.GOLD)
                    .append(player.displayName());
            player.playerListName(name);
        } else {
            player.playerListName(player.displayName());
        }
    }

    private TextColor resolveColor(String name) {
        return switch (name.toUpperCase()) {
            case "BLACK" -> NamedTextColor.BLACK;
            case "DARK_BLUE" -> NamedTextColor.DARK_BLUE;
            case "DARK_GREEN" -> NamedTextColor.DARK_GREEN;
            case "DARK_AQUA" -> NamedTextColor.DARK_AQUA;
            case "DARK_RED" -> NamedTextColor.DARK_RED;
            case "DARK_PURPLE" -> NamedTextColor.DARK_PURPLE;
            case "GOLD" -> NamedTextColor.GOLD;
            case "GRAY" -> NamedTextColor.GRAY;
            case "DARK_GRAY" -> NamedTextColor.DARK_GRAY;
            case "BLUE" -> NamedTextColor.BLUE;
            case "GREEN" -> NamedTextColor.GREEN;
            case "AQUA" -> NamedTextColor.AQUA;
            case "RED" -> NamedTextColor.RED;
            case "LIGHT_PURPLE" -> NamedTextColor.LIGHT_PURPLE;
            case "YELLOW" -> NamedTextColor.YELLOW;
            case "WHITE" -> NamedTextColor.WHITE;
            default -> null;
        };
    }
}
