package io.craftcontrol.clan;

import com.google.gson.*;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.clan.model.ClanData;
import okhttp3.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
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
}
