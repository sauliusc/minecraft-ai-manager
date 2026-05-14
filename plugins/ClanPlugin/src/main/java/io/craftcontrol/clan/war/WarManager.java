package io.craftcontrol.clan.war;

import com.google.gson.*;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.clan.ClanManager;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.*;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.plugin.Plugin;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

public class WarManager {
    private final Plugin plugin;
    private final ClanManager clanManager;
    private final Logger log;
    // clanId -> active war (a clan can only be in one war at a time)
    private final ConcurrentHashMap<String, ActiveWar> clanWars = new ConcurrentHashMap<>();
    // warId -> ActiveWar
    private final ConcurrentHashMap<String, ActiveWar> wars = new ConcurrentHashMap<>();
    private final Gson gson = new Gson();

    public WarManager(Plugin plugin, ClanManager clanManager, Logger log) {
        this.plugin = plugin;
        this.clanManager = clanManager;
        this.log = log;
        startExpiryTask();
    }

    private void startExpiryTask() {
        // Check every 5 seconds for expired wars
        plugin.getServer().getScheduler().runTaskTimer(plugin, () -> {
            for (ActiveWar war : new ArrayList<>(wars.values())) {
                if (war.isExpired() && war.state == WarState.ACTIVE) {
                    resolveWar(war);
                }
            }
        }, 100L, 100L);
    }

    public boolean isInWar(String clanId) { return clanWars.containsKey(clanId); }

    public ActiveWar getWarForClan(String clanId) { return clanWars.get(clanId); }

    public void challengeClan(String challengerClanId, String targetClanId, WarType type,
                               long durationMs, long targetCount, String targetMaterial,
                               Location zoneCenter, double zoneRadius) {
        if (isInWar(challengerClanId) || isInWar(targetClanId)) {
            log.warning("Challenge rejected — one or both clans already in a war");
            return;
        }
        String warId = java.util.UUID.randomUUID().toString();
        ActiveWar war = new ActiveWar(warId, challengerClanId, targetClanId, type,
            durationMs, targetCount, targetMaterial, zoneCenter, zoneRadius);
        wars.put(warId, war);
        clanWars.put(challengerClanId, war);
        clanWars.put(targetClanId, war);

        // Announce to all online players in both clans
        broadcastToWarClans(war, Component.text("⚔ War started between clans! Type: " + type.name(), NamedTextColor.RED));

        // POST to API
        ApiClient api = BridgePlugin.getInstance() != null ? BridgePlugin.getInstance().getApiClient() : null;
        if (api != null) {
            String json = gson.toJson(Map.of("warId", warId, "clan1Id", challengerClanId,
                "clan2Id", targetClanId, "type", type.name(), "durationMs", durationMs));
            api.post("/clans/wars", json, new Callback() {
                @Override public void onResponse(Call call, Response r) { r.close(); }
                @Override public void onFailure(Call call, IOException e) {
                    log.warning("Failed to persist war: " + e.getMessage());
                }
            });
        }
    }

    public void recordScore(ActiveWar war, String clanId, long amount) {
        if (war.state != WarState.ACTIVE || war.isExpired()) return;
        if (clanId.equals(war.clan1Id)) war.clan1Score.addAndGet(amount);
        else if (clanId.equals(war.clan2Id)) war.clan2Score.addAndGet(amount);

        // For RESOURCE_RACE, check if target reached
        if (war.type == WarType.RESOURCE_RACE) {
            long score = clanId.equals(war.clan1Id) ? war.clan1Score.get() : war.clan2Score.get();
            if (score >= war.targetCount) resolveWar(war);
        }
    }

    public void resolveWar(ActiveWar war) {
        if (war.state == WarState.FINISHED) return;
        war.state = WarState.FINISHED;

        String winnerId = war.getLeadingClan();
        String loserId = winnerId.equals(war.clan1Id) ? war.clan2Id : war.clan1Id;

        clanWars.remove(war.clan1Id);
        clanWars.remove(war.clan2Id);
        wars.remove(war.warId);

        String summary = String.format("War over! Winner: %s (%d) vs %s (%d)",
            winnerId, war.clan1Score.get(), loserId, war.clan2Score.get());
        broadcastToWarClans(war, Component.text("🏆 " + summary, NamedTextColor.GOLD));

        // POST result to API and grant XP to winning clan
        ApiClient api = BridgePlugin.getInstance() != null ? BridgePlugin.getInstance().getApiClient() : null;
        if (api != null) {
            String json = gson.toJson(Map.of("warId", war.warId, "winnerId", winnerId,
                "clan1Score", war.clan1Score.get(), "clan2Score", war.clan2Score.get()));
            api.post("/clans/wars/" + war.warId + "/result", json, new Callback() {
                @Override public void onResponse(Call call, Response r) { r.close(); }
                @Override public void onFailure(Call call, IOException e) {
                    log.warning("Failed to post war result: " + e.getMessage());
                }
            });

            int warXp = plugin.getConfig().getInt("war.win_xp", 500);
            api.post("/clans/" + winnerId + "/xp", "{\"xp\":" + warXp + "}", new Callback() {
                @Override public void onResponse(Call call, Response r) { r.close(); }
                @Override public void onFailure(Call call, IOException e) {
                    log.warning("Failed to grant war XP to clan " + winnerId + ": " + e.getMessage());
                }
            });
        }
    }

    private void broadcastToWarClans(ActiveWar war, Component message) {
        Set<String> allMemberIds = new HashSet<>();
        var c1 = clanManager.getClan(war.clan1Id);
        var c2 = clanManager.getClan(war.clan2Id);
        if (c1 != null) allMemberIds.addAll(c1.memberIds());
        if (c2 != null) allMemberIds.addAll(c2.memberIds());
        for (String memberId : allMemberIds) {
            try {
                var player = Bukkit.getPlayer(UUID.fromString(memberId));
                if (player != null) player.sendMessage(message);
            } catch (IllegalArgumentException ignored) {}
        }
    }

    public Collection<ActiveWar> getActiveWars() { return Collections.unmodifiableCollection(wars.values()); }
    public Plugin getPlugin() { return plugin; }
}
