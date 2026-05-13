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
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

public class CosmeticsManager {
    private final Logger log;
    private final Gson gson = new Gson();
    private final ConcurrentHashMap<UUID, CosmeticsProfile> cache = new ConcurrentHashMap<>();

    public CosmeticsManager(Logger log) {
        this.log = log;
    }

    public CosmeticsProfile getProfile(UUID uuid) {
        return cache.computeIfAbsent(uuid, k -> new CosmeticsProfile());
    }

    public void loadProfile(UUID uuid) {
        ApiClient api = api();
        if (api == null) return;
        api.get("/api/cosmetics/" + uuid + "/equipped", new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                try (response) {
                    if (!response.isSuccessful() || response.body() == null) {
                        cache.put(uuid, new CosmeticsProfile());
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
                    cache.put(uuid, profile);
                } catch (IOException e) {
                    log.warning("Failed to parse cosmetics profile for " + uuid + ": " + e.getMessage());
                    cache.put(uuid, new CosmeticsProfile());
                }
            }

            @Override
            public void onFailure(Call call, IOException e) {
                log.fine("Failed to fetch cosmetics profile for " + uuid);
                cache.put(uuid, new CosmeticsProfile());
            }
        });
    }

    public void saveProfile(UUID uuid) {
        ApiClient api = api();
        if (api == null) return;
        CosmeticsProfile profile = cache.get(uuid);
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
        api.patch("/api/cosmetics/" + uuid + "/equipped", gson.toJson(body), new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                try (response) {
                    if (!response.isSuccessful()) {
                        log.warning("Failed to save cosmetics for " + uuid + ": " + response.code());
                    }
                }
            }

            @Override
            public void onFailure(Call call, IOException e) {
                log.warning("Failed to save cosmetics for " + uuid + ": " + e.getMessage());
            }
        });
    }

    public void fetchTitles(Callback callback) {
        ApiClient api = api();
        if (api == null) return;
        api.get("/api/cosmetics/titles", callback);
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

    public void unloadProfile(UUID uuid) {
        cache.remove(uuid);
    }

    private ApiClient api() {
        BridgePlugin bridge = BridgePlugin.getInstance();
        return bridge != null ? bridge.getApiClient() : null;
    }
}
