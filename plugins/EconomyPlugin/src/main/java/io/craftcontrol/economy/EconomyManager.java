package io.craftcontrol.economy;

import com.google.gson.*;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import okhttp3.*;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

public class EconomyManager {
    private final Logger log;
    private final Gson gson = new Gson();
    // Local cache: playerId -> Balance. Updated on fetch, invalidated on modify.
    private final ConcurrentHashMap<String, long[]> cache = new ConcurrentHashMap<>();
    // cache value: [coins, crystals]

    public EconomyManager(Logger log) { this.log = log; }

    public long[] getBalance(String playerId) {
        return cache.getOrDefault(playerId, new long[]{0, 0});
    }

    public void fetchBalance(String playerId) {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        api.get("/economy/balance/" + playerId, new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                try (response) {
                    if (!response.isSuccessful() || response.body() == null) return;
                    JsonObject o = gson.fromJson(response.body().string(), JsonObject.class);
                    long coins = o.has("coins") ? o.get("coins").getAsLong() : 0;
                    long crystals = o.has("crystals") ? o.get("crystals").getAsLong() : 0;
                    cache.put(playerId, new long[]{coins, crystals});
                } catch (IOException e) {
                    log.warning("Failed to parse balance: " + e.getMessage());
                }
            }
            @Override
            public void onFailure(Call call, IOException e) {
                log.fine("Failed to fetch balance for " + playerId + ": " + e.getMessage());
            }
        });
    }

    // Transfer coins between players (API call)
    public void transferCoins(String fromId, String toId, long amount, Runnable onSuccess, java.util.function.Consumer<String> onError) {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) { onError.accept("Service unavailable"); return; }
        String json = String.format("{\"fromId\":\"%s\",\"toId\":\"%s\",\"amount\":%d}", fromId, toId, amount);
        api.post("/economy/transfer", json, new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                response.close();
                if (response.isSuccessful()) {
                    cache.remove(fromId);
                    cache.remove(toId);
                    onSuccess.run();
                } else {
                    onError.accept("Transfer failed (server error " + response.code() + ")");
                }
            }
            @Override
            public void onFailure(Call call, IOException e) {
                onError.accept("Transfer failed: " + e.getMessage());
            }
        });
    }

    public void invalidate(String playerId) { cache.remove(playerId); }
}
