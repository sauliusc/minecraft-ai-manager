package io.craftcontrol.moderation;

import com.google.gson.Gson;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.*;
import org.bukkit.BanList;
import org.bukkit.entity.Player;

import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class ModerationManager {

    private final ModerationPlugin plugin;
    private final Gson gson = new Gson();

    private final Map<UUID, Set<UUID>> blocked = new ConcurrentHashMap<>();
    private final Map<UUID, Boolean> safechatEnabled = new ConcurrentHashMap<>();
    private final Map<UUID, Long> muteExpiry = new ConcurrentHashMap<>();

    public ModerationManager(ModerationPlugin plugin) {
        this.plugin = plugin;
    }

    public void blockPlayer(Player blocker, Player target) {
        blocked.computeIfAbsent(blocker.getUniqueId(), k -> ConcurrentHashMap.newKeySet()).add(target.getUniqueId());
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        String json = String.format("{\"blockerId\":\"%s\",\"blockedId\":\"%s\"}", blocker.getUniqueId(), target.getUniqueId());
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/api/moderation/block", json, new Callback() {
                @Override public void onResponse(Call call, Response r) { r.close(); }
                @Override public void onFailure(Call call, IOException e) {}
            })
        );
    }

    public void unblockPlayer(Player blocker, Player target) {
        Set<UUID> set = blocked.get(blocker.getUniqueId());
        if (set != null) set.remove(target.getUniqueId());
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        String path = "/api/moderation/block?blockerId=" + blocker.getUniqueId() + "&blockedId=" + target.getUniqueId();
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            Request request = new Request.Builder()
                .url(api.getBaseUrl() + path)
                .header("Authorization", "Bearer " + api.getServiceToken())
                .delete()
                .build();
            api.newCall(request).enqueue(new Callback() {
                @Override public void onResponse(Call call, Response r) { r.close(); }
                @Override public void onFailure(Call call, IOException e) {}
            });
        });
    }

    public boolean isBlocked(UUID viewer, UUID sender) {
        Set<UUID> set = blocked.get(viewer);
        return set != null && set.contains(sender);
    }

    public boolean isSafechatEnabled(UUID uuid) {
        return safechatEnabled.getOrDefault(uuid, false);
    }

    public void setSafechat(Player player, boolean enabled) {
        safechatEnabled.put(player.getUniqueId(), enabled);
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        String json = String.format("{\"safechat\":%b}", enabled);
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.patch("/api/players/" + player.getUniqueId(), json, new Callback() {
                @Override public void onResponse(Call call, Response r) { r.close(); }
                @Override public void onFailure(Call call, IOException e) {}
            })
        );
    }

    public boolean isMuted(UUID uuid) {
        Long expiry = muteExpiry.get(uuid);
        if (expiry == null) return false;
        if (System.currentTimeMillis() >= expiry) {
            muteExpiry.remove(uuid);
            return false;
        }
        return true;
    }

    public long getMuteExpiryMs(UUID uuid) {
        return muteExpiry.getOrDefault(uuid, 0L);
    }

    public void applyMute(UUID uuid, long durationMs) {
        muteExpiry.put(uuid, System.currentTimeMillis() + durationMs);
    }

    public void removeMute(UUID uuid) {
        muteExpiry.remove(uuid);
    }

    public void adminMute(Player executor, Player target, String duration, String reason) {
        long ms = parseDuration(duration);
        applyMute(target.getUniqueId(), ms);
        target.sendMessage(Component.text("You have been muted for " + duration + ". Reason: " + reason, NamedTextColor.RED));
        postAction(executor, target, "MUTE", duration, reason);
    }

    public void adminUnmute(Player executor, Player target) {
        removeMute(target.getUniqueId());
        target.sendMessage(Component.text("You have been unmuted.", NamedTextColor.GREEN));
        postAction(executor, target, "UNMUTE", null, null);
    }

    public void adminKick(Player executor, Player target, String reason) {
        postAction(executor, target, "KICK", null, reason);
        target.kick(Component.text(reason, NamedTextColor.RED));
    }

    public void adminBan(Player executor, Player target, String duration, String reason) {
        postAction(executor, target, "BAN", duration, reason);
        plugin.getServer().getBanList(BanList.Type.NAME).addBan(
            target.getName(), reason, null, executor.getName());
        target.kick(Component.text("Banned: " + reason, NamedTextColor.RED));
    }

    public void adminUnban(Player executor, String targetName) {
        plugin.getServer().getBanList(BanList.Type.NAME).pardon(targetName);
        postActionByName(executor, targetName, "UNBAN", null, null);
    }

    public void applyTempBan(Player target, int durationMinutes, String reason) {
        Date expiry = Date.from(Instant.now().plusSeconds(durationMinutes * 60L));
        plugin.getServer().getBanList(BanList.Type.NAME).addBan(target.getName(), reason, expiry, "AutoMod");
        target.kick(Component.text("Temp banned: " + reason, NamedTextColor.RED));
    }

    private void postAction(Player executor, Player target, String type, String duration, String reason) {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        StringBuilder sb = new StringBuilder();
        sb.append("{\"executorId\":\"").append(executor.getUniqueId())
          .append("\",\"targetId\":\"").append(target.getUniqueId())
          .append("\",\"type\":\"").append(type).append("\"");
        if (duration != null) sb.append(",\"duration\":\"").append(duration).append("\"");
        if (reason != null) sb.append(",\"reason\":\"").append(reason.replace("\"", "\\\"")).append("\"");
        sb.append("}");
        String json = sb.toString();
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/api/moderation/actions", json, new Callback() {
                @Override public void onResponse(Call call, Response r) { r.close(); }
                @Override public void onFailure(Call call, IOException e) {}
            })
        );
    }

    private void postActionByName(Player executor, String targetName, String type, String duration, String reason) {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        StringBuilder sb = new StringBuilder();
        sb.append("{\"executorId\":\"").append(executor.getUniqueId())
          .append("\",\"targetName\":\"").append(targetName)
          .append("\",\"type\":\"").append(type).append("\"");
        if (duration != null) sb.append(",\"duration\":\"").append(duration).append("\"");
        if (reason != null) sb.append(",\"reason\":\"").append(reason.replace("\"", "\\\"")).append("\"");
        sb.append("}");
        String json = sb.toString();
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/api/moderation/actions", json, new Callback() {
                @Override public void onResponse(Call call, Response r) { r.close(); }
                @Override public void onFailure(Call call, IOException e) {}
            })
        );
    }

    private long parseDuration(String duration) {
        if (duration == null || duration.isBlank()) return 60 * 60_000L;
        try {
            char unit = duration.charAt(duration.length() - 1);
            long value = Long.parseLong(duration.substring(0, duration.length() - 1));
            return switch (unit) {
                case 's' -> value * 1_000L;
                case 'm' -> value * 60_000L;
                case 'h' -> value * 3_600_000L;
                case 'd' -> value * 86_400_000L;
                default -> Long.parseLong(duration) * 60_000L;
            };
        } catch (NumberFormatException e) {
            return 60 * 60_000L;
        }
    }
}
