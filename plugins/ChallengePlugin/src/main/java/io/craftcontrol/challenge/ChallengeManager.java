package io.craftcontrol.challenge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.challenge.model.ActiveChallenge;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.logging.Logger;

public class ChallengeManager {

    private final Logger log;
    private final Gson gson = new Gson();
    private volatile List<ActiveChallenge> activeChallenges = new CopyOnWriteArrayList<>();

    public ChallengeManager(Logger log) {
        this.log = log;
    }

    public void refresh() {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;

        api.get("/challenges/active", new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                try (response) {
                    if (!response.isSuccessful() || response.body() == null) return;
                    String body = response.body().string();
                    List<ActiveChallenge> updated = parse(body);
                    activeChallenges = new CopyOnWriteArrayList<>(updated);
                    log.info("Loaded " + updated.size() + " active challenges.");
                } catch (IOException e) {
                    log.warning("Failed to parse challenges: " + e.getMessage());
                }
            }

            @Override
            public void onFailure(Call call, IOException e) {
                log.warning("Failed to fetch challenges: " + e.getMessage());
            }
        });
    }

    private List<ActiveChallenge> parse(String json) {
        List<ActiveChallenge> list = new ArrayList<>();
        try {
            JsonArray arr = gson.fromJson(json, JsonArray.class);
            for (var el : arr) {
                JsonObject o = el.getAsJsonObject();
                JsonObject cfg = o.has("config") ? o.getAsJsonObject("config") : new JsonObject();
                list.add(new ActiveChallenge(
                        o.get("id").getAsString(),
                        o.get("type").getAsString(),
                        cfg.has("target_material") ? cfg.get("target_material").getAsString() : "",
                        cfg.has("target_entity") ? cfg.get("target_entity").getAsString() : "",
                        cfg.has("target_count") ? cfg.get("target_count").getAsInt() : 1,
                        cfg.has("target_distance") ? cfg.get("target_distance").getAsInt() : 0,
                        o.has("title") ? o.get("title").getAsString() : "Challenge",
                        o.has("description") ? o.get("description").getAsString() : ""
                ));
            }
        } catch (Exception e) {
            log.warning("Challenge parse error: " + e.getMessage());
        }
        return list;
    }

    public List<ActiveChallenge> getActive() {
        return Collections.unmodifiableList(activeChallenges);
    }
}
