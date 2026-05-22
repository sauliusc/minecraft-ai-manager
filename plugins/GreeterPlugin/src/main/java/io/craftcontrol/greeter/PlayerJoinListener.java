package io.craftcontrol.greeter;

import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.inventory.ItemStack;

import net.kyori.adventure.resource.ResourcePackInfo;
import net.kyori.adventure.resource.ResourcePackRequest;
import net.kyori.adventure.text.Component;

import java.io.IOException;
import java.net.URI;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class PlayerJoinListener implements Listener {

    private final GreeterPlugin plugin;

    public PlayerJoinListener(GreeterPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        FileConfiguration cfg = plugin.getConfig();

        sendResourcePack(player, cfg);

        if (!player.hasPlayedBefore()) {
            handleFirstJoin(player, cfg);
        } else {
            handleReturn(player, cfg);
        }
    }

    private void sendResourcePack(Player player, FileConfiguration cfg) {
        if (!cfg.getBoolean("resource_pack.enabled", false)) return;
        String url = cfg.getString("resource_pack.url", "");
        String sha1 = cfg.getString("resource_pack.sha1", "");
        if (url.isEmpty()) return;

        try {
            ResourcePackInfo info = ResourcePackInfo.resourcePackInfo()
                .id(UUID.nameUUIDFromBytes(url.getBytes()))
                .uri(URI.create(url))
                .hash(sha1.isEmpty() ? null : sha1)
                .build();

            String promptText = cfg.getString("resource_pack.prompt",
                "Download the CraftControl resource pack for the best experience!");
            boolean required = cfg.getBoolean("resource_pack.required", false);

            ResourcePackRequest request = ResourcePackRequest.resourcePackRequest()
                .packs(info)
                .required(required)
                .prompt(Component.text(promptText))
                .build();

            player.sendResourcePacks(request);
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to send resource pack to " + player.getName() + ": " + e.getMessage());
        }
    }

    private void handleFirstJoin(Player player, FileConfiguration cfg) {
        String message = cfg.getString("greeting.first_join_message", "Welcome, {player}!")
                .replace("{player}", player.getName());
        player.sendMessage(message);

        player.sendTitle(
                "§6" + player.getName(),
                "§eWelcome to the server!",
                10, 70, 20
        );

        try {
            player.playSound(player.getLocation(), Sound.ENTITY_FIREWORK_ROCKET_LAUNCH, 1.0f, 1.0f);
        } catch (Exception ignored) {
        }

        teleportToWelcomeZone(player, cfg);
        giveStarterKit(player, cfg);

        if (cfg.getBoolean("greeting.broadcast_first_join", true)) {
            String broadcast = cfg.getString("greeting.broadcast_message", "{player} joined for the first time!")
                    .replace("{player}", player.getName());
            plugin.getServer().broadcastMessage("§a" + broadcast);
        }

        postPlayerRecord(player);
    }

    private void handleReturn(Player player, FileConfiguration cfg) {
        Instant lastLogin = player.getLastLogin() > 0
                ? Instant.ofEpochMilli(player.getLastLogin())
                : Instant.now();
        long daysSince = ChronoUnit.DAYS.between(lastLogin, Instant.now());

        String message = cfg.getString("greeting.return_message", "Welcome back, {player}!")
                .replace("{player}", player.getName())
                .replace("{lastSeen}", daysSince + " days ago");
        player.sendMessage(message);

        int giftDays = cfg.getInt("greeting.return_gift_after_days", 7);
        if (daysSince >= giftDays) {
            player.sendTitle("§bWelcome Back!", "§fHere's a gift for returning!", 10, 60, 20);
            player.getInventory().addItem(new ItemStack(Material.DIAMOND, 1));
        }

        updatePlayerRecord(player);
    }

    private void teleportToWelcomeZone(Player player, FileConfiguration cfg) {
        String worldName = cfg.getString("welcome_zone.world", "world");
        World world = plugin.getServer().getWorld(worldName);
        if (world == null) return;
        double x = cfg.getDouble("welcome_zone.x", 0.5);
        double y = cfg.getDouble("welcome_zone.y", 64.0);
        double z = cfg.getDouble("welcome_zone.z", 0.5);
        player.teleport(new Location(world, x, y, z));
    }

    private void giveStarterKit(Player player, FileConfiguration cfg) {
        if (!cfg.getBoolean("starter_kit.enabled", true)) return;
        List<ItemStack> items = new ArrayList<>();
        for (var section : cfg.getMapList("starter_kit.items")) {
            try {
                Material mat = Material.valueOf(section.get("material").toString());
                Object rawAmount = section.get("amount");
                int amount = rawAmount != null ? Integer.parseInt(rawAmount.toString()) : 1;
                items.add(new ItemStack(mat, amount));
            } catch (Exception ignored) {
            }
        }
        for (ItemStack item : items) {
            player.getInventory().addItem(item);
        }
    }

    private void postPlayerRecord(Player player) {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        String json = "{\"username\":\"" + player.getName().replace("\"", "\\\"") + "\"}";
        api.post("/players", json, new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                response.close();
                if (!response.isSuccessful()) {
                    plugin.getLogger().warning("Failed to register player " + player.getName() + ": HTTP " + response.code());
                }
            }
            @Override
            public void onFailure(Call call, IOException e) {
                plugin.getLogger().warning("Failed to register player " + player.getName() + ": " + e.getMessage());
            }
        });
    }

    private void updatePlayerRecord(Player player) {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        // Use the same upsert endpoint as first-join so players are created if their
        // initial registration failed (e.g. server downtime or misconfigured secret).
        String name = player.getName().replace("\"", "\\\"");
        String json = "{\"username\":\"" + name + "\"}";
        api.post("/players", json, new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                response.close();
                if (!response.isSuccessful()) {
                    plugin.getLogger().warning("Failed to update player " + player.getName() + ": HTTP " + response.code());
                }
            }
            @Override
            public void onFailure(Call call, IOException e) {
                plugin.getLogger().warning("Failed to update player " + player.getName() + ": " + e.getMessage());
            }
        });
    }
}
