package io.craftcontrol.quest;

import com.google.gson.*;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.quest.model.QuestCategory;
import io.craftcontrol.quest.model.QuestData;
import okhttp3.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

public class QuestRepository {
    private final Logger log;
    private final Gson gson = new Gson();
    // playerId -> list of quests
    private final ConcurrentHashMap<String, List<QuestData>> cache = new ConcurrentHashMap<>();

    public QuestRepository(Logger log) { this.log = log; }

    public List<QuestData> getQuests(String playerId) {
        return cache.getOrDefault(playerId, Collections.emptyList());
    }

    public void fetchQuests(String playerId) {
        ApiClient api = BridgePlugin.getInstance() != null ? BridgePlugin.getInstance().getApiClient() : null;
        if (api == null) return;
        api.get("/challenges/active?playerId=" + playerId, new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                try (response) {
                    if (!response.isSuccessful() || response.body() == null) return;
                    JsonArray arr = gson.fromJson(response.body().string(), JsonArray.class);
                    List<QuestData> quests = new ArrayList<>();
                    for (var el : arr) {
                        JsonObject o = el.getAsJsonObject();
                        JsonObject cfg = o.has("config") && !o.get("config").isJsonNull() ? o.getAsJsonObject("config") : new JsonObject();
                        String catStr = o.has("questCategory") && !o.get("questCategory").isJsonNull()
                            ? o.get("questCategory").getAsString() : "SIDE";
                        QuestCategory cat;
                        try { cat = QuestCategory.valueOf(catStr); } catch (Exception e) { cat = QuestCategory.SIDE; }
                        quests.add(new QuestData(
                            o.get("id").getAsString(),
                            o.has("title") && !o.get("title").isJsonNull() ? o.get("title").getAsString() : "Quest",
                            o.has("description") && !o.get("description").isJsonNull() ? o.get("description").getAsString() : "",
                            cat,
                            o.has("type") && !o.get("type").isJsonNull() ? o.get("type").getAsString() : "CUSTOM",
                            cfg.has("target_material") ? cfg.get("target_material").getAsString() : "",
                            cfg.has("target_entity") ? cfg.get("target_entity").getAsString() : "",
                            cfg.has("target_count") ? cfg.get("target_count").getAsInt() : 1,
                            0, // progress fetched separately or 0
                            false
                        ));
                    }
                    cache.put(playerId, quests);
                } catch (IOException e) {
                    log.warning("Failed to parse quests: " + e.getMessage());
                }
            }
            @Override
            public void onFailure(Call call, IOException e) {
                log.fine("Failed to fetch quests for " + playerId);
            }
        });
    }

    public void invalidate(String playerId) { cache.remove(playerId); }
}
