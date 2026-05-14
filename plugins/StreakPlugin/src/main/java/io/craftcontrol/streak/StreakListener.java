package io.craftcontrol.streak;

import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.title.Title;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

import java.io.File;
import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.logging.Logger;

public class StreakListener implements Listener {

    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private final StreakPlugin plugin;
    private final Logger log;
    private final File streaksFile;
    private final YamlConfiguration streaksData;

    public StreakListener(StreakPlugin plugin) {
        this.plugin = plugin;
        this.log = plugin.getLogger();
        this.streaksFile = new File(plugin.getDataFolder(), "streaks.yml");
        plugin.getDataFolder().mkdirs();
        this.streaksData = streaksFile.exists()
                ? YamlConfiguration.loadConfiguration(streaksFile)
                : new YamlConfiguration();
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        String uuid = player.getUniqueId().toString();
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> processStreak(player, uuid));
    }

    private synchronized void processStreak(Player player, String uuid) {
        long now = System.currentTimeMillis();
        long lastLogin = streaksData.getLong(uuid + ".lastLogin", 0L);
        int currentStreak = streaksData.getInt(uuid + ".current", 0);
        int longestStreak = streaksData.getInt(uuid + ".longest", 0);

        LocalDate today = LocalDate.ofInstant(Instant.ofEpochMilli(now), ZoneId.systemDefault());
        LocalDate lastDay = lastLogin == 0L
                ? null
                : LocalDate.ofInstant(Instant.ofEpochMilli(lastLogin), ZoneId.systemDefault());

        int graceHours = plugin.getConfig().getInt("streak.grace_hours", 24);
        long graceMs = (long) graceHours * 3_600_000L;

        if (lastDay == null) {
            // First ever login — start streak at 1
            currentStreak = 1;
        } else if (today.equals(lastDay)) {
            // Already logged in today — no streak change
            return;
        } else {
            long gapMs = now - lastLogin;
            if (gapMs <= graceMs) {
                // Within grace window — extend streak
                currentStreak++;
            } else {
                // Grace window expired — check for Streak Shield
                if (plugin.getConfig().getBoolean("streak.shields_enabled", true)
                        && hasStreakShield(player)) {
                    consumeStreakShield(player);
                    final int shieldedStreak = currentStreak;
                    plugin.getServer().getScheduler().runTask(plugin, () ->
                            player.sendMessage(Component.text(
                                    "Your Streak Shield saved your " + shieldedStreak + "-day streak!",
                                    NamedTextColor.AQUA)));
                } else {
                    currentStreak = 1;
                }
            }
        }

        if (currentStreak > longestStreak) longestStreak = currentStreak;

        // Persist streak data
        streaksData.set(uuid + ".lastLogin", now);
        streaksData.set(uuid + ".current", currentStreak);
        streaksData.set(uuid + ".longest", longestStreak);
        try {
            streaksData.save(streaksFile);
        } catch (IOException e) {
            log.warning("Failed to save streaks.yml: " + e.getMessage());
        }

        final int finalStreak = currentStreak;
        final int finalLongest = longestStreak;
        plugin.getServer().getScheduler().runTask(plugin, () ->
                deliverMilestoneIfAny(player, finalStreak, finalLongest));

        // PATCH streak data + lastSeenAt to the API (non-critical; fire-and-forget)
        patchPlayerData(uuid, now, finalStreak, finalLongest);
    }

    private boolean hasStreakShield(Player player) {
        return player.getInventory().all(org.bukkit.Material.NETHER_STAR).values().stream()
                .anyMatch(is -> is.getItemMeta() != null
                        && "Streak Shield".equals(is.getItemMeta().displayName()));
    }

    private void consumeStreakShield(Player player) {
        player.getInventory().all(org.bukkit.Material.NETHER_STAR).forEach((slot, is) -> {
            if (is.getItemMeta() != null && "Streak Shield".equals(is.getItemMeta().displayName())) {
                is.setAmount(is.getAmount() - 1);
                player.getInventory().setItem(slot, is.getAmount() <= 0 ? null : is);
            }
        });
    }

    private void deliverMilestoneIfAny(Player player, int streak, int longest) {
        MiniMessage mm = MiniMessage.miniMessage();

        for (var m : plugin.getConfig().getMapList("milestones")) {
            int day = ((Number) m.getOrDefault("day", 0)).intValue();
            if (day != streak) continue;

            // Message
            String msg = (String) m.getOrDefault("message", "");
            if (!msg.isEmpty()) {
                player.sendMessage(mm.deserialize(msg));
            }

            // Title
            String titleStr = (String) m.getOrDefault("title", null);
            if (titleStr != null) {
                player.showTitle(Title.title(
                        mm.deserialize(titleStr),
                        Component.text("Day " + streak + " Streak!", NamedTextColor.YELLOW)));
            }

            // Server-wide broadcast
            if (Boolean.TRUE.equals(m.get("broadcast"))) {
                plugin.getServer().broadcast(Component.text(
                        player.getName() + " reached a " + streak + "-day login streak!",
                        NamedTextColor.GOLD));
            }

            player.playSound(player.getLocation(), org.bukkit.Sound.UI_TOAST_CHALLENGE_COMPLETE, 1.0f, 1.0f);
            break;
        }

        // Always remind the player of their current streak
        player.sendMessage(Component.text(
                "Current login streak: " + streak + " days", NamedTextColor.GREEN));
    }

    private void patchPlayerData(String uuid, long nowMs, int currentStreak, int longestStreak) {
        BridgePlugin bridge = BridgePlugin.getInstance();
        if (bridge == null) return;
        ApiClient api = bridge.getApiClient();
        if (api == null) return;

        String nowIso = Instant.ofEpochMilli(nowMs).toString();
        String jsonBody = String.format(
            "{\"lastSeenAt\":\"%s\",\"currentStreak\":%d,\"longestStreak\":%d,\"lastLoginDate\":\"%s\"}",
            nowIso, currentStreak, longestStreak, nowIso);
        Request request = new Request.Builder()
                .url(api.getBaseUrl() + "/players/" + uuid)
                .header("Authorization", "Bearer " + api.getServiceToken())
                .patch(RequestBody.create(jsonBody, JSON))
                .build();
        api.newCall(request).enqueue(new Callback() {
            @Override
            public void onResponse(Call call, Response response) { response.close(); }
            @Override
            public void onFailure(Call call, IOException e) {
                log.fine("Failed to PATCH player data for " + uuid + ": " + e.getMessage());
            }
        });
    }
}
