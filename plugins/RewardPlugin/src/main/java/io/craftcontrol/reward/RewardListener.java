package io.craftcontrol.reward;

import com.google.gson.*;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.reward.model.RewardGrant;
import okhttp3.*;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import java.io.IOException;
import java.util.logging.Logger;

public class RewardListener implements Listener {
    private final RewardDelivery delivery;
    private final Logger log;
    private final Gson gson = new Gson();

    public RewardListener(RewardDelivery delivery, Logger log) {
        this.delivery = delivery;
        this.log = log;
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        String playerId = player.getName();

        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;

        api.get("/rewards/pending/" + playerId, new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                if (!response.isSuccessful() || response.body() == null) {
                    response.close();
                    return;
                }
                try (response) {
                    JsonElement parsed = gson.fromJson(response.body().string(), JsonElement.class);
                    if (parsed == null || !parsed.isJsonArray()) return;
                    JsonArray grants = parsed.getAsJsonArray();
                    for (JsonElement el : grants) {
                        JsonObject g = el.getAsJsonObject();
                        RewardGrant grant = new RewardGrant(
                            g.get("id").getAsString(),
                            playerId,
                            g.get("rewardId").getAsString(),
                            g.has("rewardName") && !g.get("rewardName").isJsonNull()
                                ? g.get("rewardName").getAsString() : "",
                            g.get("rewardType").getAsString(),
                            g.has("rarity") && !g.get("rarity").isJsonNull()
                                ? g.get("rarity").getAsString() : "COMMON",
                            gson.fromJson(g.get("config"), java.util.Map.class)
                        );
                        RewardPlugin.getInstance().getServer().getScheduler().runTask(
                            RewardPlugin.getInstance(),
                            () -> {
                                if (player.isOnline()) {
                                    delivery.deliver(player, grant);
                                    // Stamp deliveredAt so this reward is not re-delivered on next login
                                    acknowledgeDelivery(api, grant.grantId());
                                }
                            }
                        );
                    }
                } catch (IOException e) {
                    log.warning("Failed to parse pending rewards: " + e.getMessage());
                }
            }

            @Override
            public void onFailure(Call call, IOException e) {
                log.warning("Failed to fetch pending rewards for " + playerId);
            }
        });
    }

    /** Calls PATCH /rewards/{grantId}/delivered so the server stamps deliveredAt. */
    private void acknowledgeDelivery(ApiClient api, String grantId) {
        api.patch("/rewards/" + grantId + "/delivered", "{}", new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                response.close();
                if (!response.isSuccessful()) {
                    log.warning("Failed to acknowledge reward delivery for grant " + grantId + ": HTTP " + response.code());
                }
            }
            @Override
            public void onFailure(Call call, IOException e) {
                log.warning("Failed to acknowledge reward delivery for grant " + grantId + ": " + e.getMessage());
            }
        });
    }
}
