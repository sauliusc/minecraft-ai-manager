package io.craftcontrol.moderation;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.entity.Player;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class ReportManager {

    private final ModerationPlugin plugin;
    private final Gson gson = new Gson();
    private final int bufferSize;
    private final Map<UUID, ArrayDeque<String>> chatBuffers = new ConcurrentHashMap<>();
    private final Map<UUID, List<Long>> reportTimestamps = new ConcurrentHashMap<>();
    private final Map<UUID, String> pendingEscalations = new ConcurrentHashMap<>();

    public ReportManager(ModerationPlugin plugin) {
        this.plugin = plugin;
        this.bufferSize = plugin.getConfig().getInt("report.chat_buffer_size", 50);
    }

    public void appendChat(UUID playerUuid, String playerName, String message) {
        ArrayDeque<String> buf = chatBuffers.computeIfAbsent(playerUuid, k -> new ArrayDeque<>());
        if (buf.size() >= bufferSize) buf.pollFirst();
        buf.addLast("[" + playerName + "] " + message);
    }

    public void submitReport(Player reporter, Player reported, String reason) {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) {
            reporter.sendMessage(Component.text("Service unavailable.", NamedTextColor.RED));
            return;
        }

        ArrayDeque<String> buf = chatBuffers.getOrDefault(reported.getUniqueId(), new ArrayDeque<>());
        JsonArray snapshot = new JsonArray();
        for (String line : buf) snapshot.add(line);

        JsonObject body = new JsonObject();
        body.addProperty("reporterId", reporter.getUniqueId().toString());
        body.addProperty("reportedId", reported.getUniqueId().toString());
        body.addProperty("reason", reason);
        body.add("chatSnapshot", snapshot);
        String json = gson.toJson(body);

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/api/moderation/reports", json, new Callback() {
                @Override
                public void onResponse(Call call, Response response) {
                    try (response) {
                        if (!response.isSuccessful() || response.body() == null) {
                            plugin.getServer().getScheduler().runTask(plugin, () ->
                                reporter.sendMessage(Component.text("Failed to submit report.", NamedTextColor.RED)));
                            return;
                        }
                        String body = response.body().string();
                        JsonObject obj = gson.fromJson(body, JsonObject.class);
                        String caseId = obj.has("id") ? obj.get("id").getAsString() : "unknown";

                        plugin.getServer().getScheduler().runTask(plugin, () -> {
                            reporter.sendMessage(Component.text("Report submitted. Case #" + caseId, NamedTextColor.GREEN));
                            trackAndMaybeEscalate(reported.getUniqueId(), reported.getName(), caseId);
                        });
                    } catch (IOException e) {
                        plugin.getServer().getScheduler().runTask(plugin, () ->
                            reporter.sendMessage(Component.text("Failed to submit report.", NamedTextColor.RED)));
                    }
                }
                @Override
                public void onFailure(Call call, IOException e) {
                    plugin.getServer().getScheduler().runTask(plugin, () ->
                        reporter.sendMessage(Component.text("Service unavailable.", NamedTextColor.RED)));
                }
            })
        );
    }

    private void trackAndMaybeEscalate(UUID reportedUuid, String reportedName, String caseId) {
        int threshold = plugin.getConfig().getInt("report.escalation_threshold", 3);
        long windowMs = plugin.getConfig().getInt("report.escalation_window_hours", 24) * 3_600_000L;
        long now = System.currentTimeMillis();

        List<Long> times = reportTimestamps.computeIfAbsent(reportedUuid, k -> new ArrayList<>());
        times.removeIf(t -> now - t > windowMs);
        times.add(now);

        if (times.size() >= threshold) {
            pendingEscalations.put(reportedUuid, caseId);
            escalateReport(reportedUuid, reportedName, caseId);
        }
    }

    private void escalateReport(UUID reportedUuid, String reportedName, String caseId) {
        // Server-side escalation is handled automatically by the API (3+ reports in 24h triggers ESCALATED status).
        // We just notify online moderators in-game immediately.
        plugin.getServer().getScheduler().runTask(plugin, () -> {
            Component alert = Component.text(
                "[MOD] Player " + reportedName + " has received " +
                plugin.getConfig().getInt("report.escalation_threshold", 3) +
                "+ reports. Case #" + caseId + " escalated.", NamedTextColor.RED);
            plugin.getServer().getOnlinePlayers().stream()
                .filter(p -> p.hasPermission("craftcontrol.mod"))
                .forEach(p -> p.sendMessage(alert));
        });
    }
}
