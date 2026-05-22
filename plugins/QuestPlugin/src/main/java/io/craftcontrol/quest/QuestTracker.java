package io.craftcontrol.quest;

import com.google.gson.*;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.quest.model.QuestData;
import okhttp3.*;
import org.bukkit.entity.Player;
import org.bukkit.event.*;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.inventory.CraftItemEvent;
import java.io.IOException;
import java.util.List;
import java.util.logging.Logger;

public class QuestTracker implements Listener {
    private final QuestRepository repo;
    private final Logger log;
    private final Gson gson = new Gson();

    public QuestTracker(QuestRepository repo, Logger log) {
        this.repo = repo;
        this.log = log;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent event) {
        Player player = event.getPlayer();
        String material = event.getBlock().getType().name();
        process(player, "BLOCK_BREAK", material, null, 1);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onEntityDeath(EntityDeathEvent event) {
        Player killer = event.getEntity().getKiller();
        if (killer == null) return;
        String entity = event.getEntity().getType().name();
        process(killer, "KILL_MOB", null, entity, 1);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onCraftItem(CraftItemEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        String material = event.getRecipe().getResult().getType().name();
        int amount = event.isShiftClick() ? event.getRecipe().getResult().getAmount() : 1;
        process(player, "CRAFT_ITEM", material, null, amount);
    }

    private void process(Player player, String eventType, String material, String entity, int amount) {
        String playerId = player.getName();
        List<QuestData> quests = repo.getQuests(playerId);
        for (QuestData q : quests) {
            if (q.completed()) continue;
            if (!q.type().equals(eventType)) continue;
            boolean matches = switch (eventType) {
                case "BLOCK_BREAK", "CRAFT_ITEM" -> material != null && material.equalsIgnoreCase(q.targetMaterial());
                case "KILL_MOB" -> entity != null && entity.equalsIgnoreCase(q.targetEntity());
                default -> false;
            };
            if (!matches) continue;
            postProgress(q.id(), playerId, amount);
        }
    }

    private void postProgress(String questId, String playerId, int amount) {
        ApiClient api = BridgePlugin.getInstance() != null ? BridgePlugin.getInstance().getApiClient() : null;
        if (api == null) return;
        String json = String.format("{\"playerId\":\"%s\",\"amount\":%d}", playerId, amount);
        api.post("/challenges/" + questId + "/progress", json, new Callback() {
            @Override
            public void onResponse(Call call, Response r) { r.close(); }
            @Override
            public void onFailure(Call call, IOException e) { /* non-critical */ }
        });
    }
}
