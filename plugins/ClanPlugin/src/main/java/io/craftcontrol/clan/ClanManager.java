package io.craftcontrol.clan;

import com.google.gson.*;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.clan.model.ClanData;
import okhttp3.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.logging.Logger;

public class ClanManager {
    private final Logger log;
    private final Gson gson = new Gson();
    // playerId -> clanId
    private final ConcurrentHashMap<String, String> playerClanMap = new ConcurrentHashMap<>();
    // clanId -> ClanData
    private final ConcurrentHashMap<String, ClanData> clanCache = new ConcurrentHashMap<>();
    // playerId -> cooldown expiry millis for /clan home
    private final ConcurrentHashMap<String, Long> homeCooldowns = new ConcurrentHashMap<>();
    // playerId -> clan chat toggle
    private final Set<String> clanChatEnabled = ConcurrentHashMap.newKeySet();
    // playerId -> pending invites: each entry is String[]{clanId, clanTag, clanName}
    private final ConcurrentHashMap<String, List<String[]>> pendingInvites = new ConcurrentHashMap<>();
    // players who have typed /clan disband and are awaiting confirmation
    private final Set<String> disbandConfirmsPending = ConcurrentHashMap.newKeySet();

    public ClanManager(Logger log) { this.log = log; }

    public void fetchClan(String playerId) {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        api.get("/clans/member/" + playerId, new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                try (response) {
                    if (response.code() == 404) { playerClanMap.remove(playerId); return; }
                    if (!response.isSuccessful() || response.body() == null) return;
                    JsonObject o = gson.fromJson(response.body().string(), JsonObject.class);
                    String clanId = o.get("id").getAsString();
                    playerClanMap.put(playerId, clanId);
                    List<String> members = new ArrayList<>();
                    o.getAsJsonArray("members").forEach(m -> members.add(m.getAsString()));
                    clanCache.put(clanId, new ClanData(
                        clanId,
                        o.get("name").getAsString(),
                        o.get("tag").getAsString(),
                        o.get("leaderId").getAsString(),
                        o.get("xp").getAsLong(),
                        o.get("level").getAsInt(),
                        members
                    ));
                } catch (IOException e) {
                    log.warning("Failed to parse clan data: " + e.getMessage());
                }
            }
            @Override public void onFailure(Call call, IOException e) {
                log.fine("Failed to fetch clan for " + playerId);
            }
        });
    }

    public String getClanId(String playerId) { return playerClanMap.get(playerId); }
    /** Alias for {@link #getClanId(String)} used by war listeners. */
    public String getPlayerClan(String playerId) { return playerClanMap.get(playerId); }
    public ClanData getClan(String clanId) { return clanCache.get(clanId); }
    public ClanData getClanByPlayer(String playerId) {
        String id = playerClanMap.get(playerId);
        return id == null ? null : clanCache.get(id);
    }
    public boolean isInClan(String playerId) { return playerClanMap.containsKey(playerId); }
    public boolean isHomeCoolingDown(String playerId) {
        Long expiry = homeCooldowns.get(playerId);
        return expiry != null && System.currentTimeMillis() < expiry;
    }
    public long getCooldownRemaining(String playerId) {
        Long expiry = homeCooldowns.get(playerId);
        if (expiry == null) return 0;
        return Math.max(0, (expiry - System.currentTimeMillis()) / 1000);
    }
    public void setHomeCooldown(String playerId, int seconds) {
        homeCooldowns.put(playerId, System.currentTimeMillis() + seconds * 1000L);
    }
    public boolean isClanChatEnabled(String playerId) { return clanChatEnabled.contains(playerId); }
    public void toggleClanChat(String playerId) {
        if (!clanChatEnabled.remove(playerId)) clanChatEnabled.add(playerId);
    }
    public void invalidate(String playerId) {
        String clanId = playerClanMap.remove(playerId);
        if (clanId != null) clanCache.remove(clanId);
    }

    // ── Pending invites ───────────────────────────────────────────────────────

    public void addPendingInvite(String playerId, String clanId, String clanTag, String clanName) {
        pendingInvites.computeIfAbsent(playerId, k -> new CopyOnWriteArrayList<>())
                .add(new String[]{clanId, clanTag, clanName});
    }

    /** Returns all pending invites for the player; never null. */
    public List<String[]> getPendingInvites(String playerId) {
        List<String[]> list = pendingInvites.get(playerId);
        return list == null ? Collections.emptyList() : Collections.unmodifiableList(list);
    }

    /** Find a pending invite by clan tag or name (case-insensitive). */
    public String[] getPendingInvite(String playerId, String clanTagOrName) {
        List<String[]> list = pendingInvites.get(playerId);
        if (list == null) return null;
        return list.stream()
                .filter(inv -> inv[1].equalsIgnoreCase(clanTagOrName) || inv[2].equalsIgnoreCase(clanTagOrName))
                .findFirst().orElse(null);
    }

    public String[] getFirstPendingInvite(String playerId) {
        List<String[]> list = pendingInvites.get(playerId);
        return (list == null || list.isEmpty()) ? null : list.get(0);
    }

    public void removePendingInvite(String playerId, String clanId) {
        List<String[]> list = pendingInvites.get(playerId);
        if (list != null) list.removeIf(inv -> inv[0].equals(clanId));
    }

    public void clearPendingInvites(String playerId) {
        pendingInvites.remove(playerId);
    }

    // ── Disband confirmation ──────────────────────────────────────────────────

    public void requestDisband(String playerId) {
        disbandConfirmsPending.add(playerId);
    }

    /** Returns true and removes the pending flag if a confirmation was outstanding. */
    public boolean checkAndConsumeDisband(String playerId) {
        return disbandConfirmsPending.remove(playerId);
    }
}
