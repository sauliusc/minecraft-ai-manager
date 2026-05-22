package io.craftcontrol.cosmetics;

import com.google.gson.*;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.cosmetics.model.CosmeticsProfile;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

public class CosmeticsManager {
    private final Logger log;
    private final Gson gson = new Gson();
    private final ConcurrentHashMap<String, CosmeticsProfile> cache = new ConcurrentHashMap<>();

    public CosmeticsManager(Logger log) {
        this.log = log;
    }

    public CosmeticsProfile getProfile(String playerName) {
        return cache.computeIfAbsent(playerName, k -> new CosmeticsProfile());
    }

    public void loadProfile(String playerName) {
        ApiClient api = api();
        if (api == null) return;
        api.get("/cosmetics/" + playerName + "/equipped", new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                try (response) {
                    if (!response.isSuccessful() || response.body() == null) {
                        cache.put(playerName, new CosmeticsProfile());
                        return;
                    }
                    JsonObject o = gson.fromJson(response.body().string(), JsonObject.class);
                    CosmeticsProfile profile = new CosmeticsProfile(
                        o.has("titleId") && !o.get("titleId").isJsonNull() ? o.get("titleId").getAsString() : null,
                        o.has("chatColor") && !o.get("chatColor").isJsonNull() ? o.get("chatColor").getAsString() : null,
                        o.has("particleType") && !o.get("particleType").isJsonNull() ? o.get("particleType").getAsString() : null,
                        o.has("petType") && !o.get("petType").isJsonNull() ? o.get("petType").getAsString() : null,
                        o.has("trailType") && !o.get("trailType").isJsonNull() ? o.get("trailType").getAsString() : null
                    );
                    cache.put(playerName, profile);
                } catch (IOException e) {
                    log.warning("Failed to parse cosmetics profile for " + playerName + ": " + e.getMessage());
                    cache.put(playerName, new CosmeticsProfile());
                }
            }

            @Override
            public void onFailure(Call call, IOException e) {
                log.fine("Failed to fetch cosmetics profile for " + playerName);
                cache.put(playerName, new CosmeticsProfile());
            }
        });
    }

    public void saveProfile(String playerName) {
        ApiClient api = api();
        if (api == null) return;
        CosmeticsProfile profile = cache.get(playerName);
        if (profile == null) return;
        JsonObject body = new JsonObject();
        if (profile.getTitleId() != null) body.addProperty("titleId", profile.getTitleId());
        else body.add("titleId", JsonNull.INSTANCE);
        if (profile.getChatColor() != null) body.addProperty("chatColor", profile.getChatColor());
        else body.add("chatColor", JsonNull.INSTANCE);
        if (profile.getParticleType() != null) body.addProperty("particleType", profile.getParticleType());
        else body.add("particleType", JsonNull.INSTANCE);
        if (profile.getPetType() != null) body.addProperty("petType", profile.getPetType());
        else body.add("petType", JsonNull.INSTANCE);
        if (profile.getTrailType() != null) body.addProperty("trailType", profile.getTrailType());
        else body.add("trailType", JsonNull.INSTANCE);
        api.patch("/cosmetics/" + playerName + "/equipped", gson.toJson(body), new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                try (response) {
                    if (!response.isSuccessful()) {
                        log.warning("Failed to save cosmetics for " + playerName + ": " + response.code());
                    }
                }
            }

            @Override
            public void onFailure(Call call, IOException e) {
                log.warning("Failed to save cosmetics for " + playerName + ": " + e.getMessage());
            }
        });
    }

    public void fetchTitles(Callback callback) {
        ApiClient api = api();
        if (api == null) return;
        api.get("/cosmetics/titles", callback);
    }

    public List<String> parseTitleIds(String json) {
        try {
            JsonArray arr = gson.fromJson(json, JsonArray.class);
            List<String> ids = new ArrayList<>();
            for (JsonElement el : arr) {
                JsonObject o = el.getAsJsonObject();
                if (o.has("id")) ids.add(o.get("id").getAsString());
            }
            return ids;
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    public void unloadProfile(String playerName) {
        cache.remove(playerName);
    }

    private ApiClient api() {
        BridgePlugin bridge = BridgePlugin.getInstance();
        return bridge != null ? bridge.getApiClient() : null;
    }
}
