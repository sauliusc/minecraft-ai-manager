package io.craftcontrol.challenge;

import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.challenge.model.ActiveChallenge;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.inventory.CraftItemEvent;
import org.bukkit.event.player.PlayerMoveEvent;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.logging.Logger;

public class ChallengeTracker implements Listener {

    private final ChallengeManager manager;
    private final ChallengeRepository repo;
    private final Logger log;

    private final ConcurrentHashMap<String, AtomicInteger> travelAccum = new ConcurrentHashMap<>();

    public ChallengeTracker(ChallengeManager manager, ChallengeRepository repo, Logger log) {
        this.manager = manager;
        this.repo = repo;
        this.log = log;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent event) {
        Player player = event.getPlayer();
        String material = event.getBlock().getType().name();
        List<ActiveChallenge> challenges = manager.getActive();

        for (ActiveChallenge ch : challenges) {
            if (!"BLOCK_BREAK".equals(ch.type())) continue;
            if (!material.equalsIgnoreCase(ch.targetMaterial())) continue;
            bufferAndCheckCompletion(ch, player.getUniqueId().toString());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onEntityDeath(EntityDeathEvent event) {
        Player killer = event.getEntity().getKiller();
        if (killer == null) return;

        String entityType = event.getEntity().getType().name();
        List<ActiveChallenge> challenges = manager.getActive();

        for (ActiveChallenge ch : challenges) {
            if (!"KILL_MOB".equals(ch.type())) continue;
            if (!entityType.equalsIgnoreCase(ch.targetEntity())) continue;
            bufferAndCheckCompletion(ch, killer.getUniqueId().toString());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onCraftItem(CraftItemEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        String material = event.getRecipe().getResult().getType().name();
        List<ActiveChallenge> challenges = manager.getActive();
        for (ActiveChallenge ch : challenges) {
            if (!"CRAFT_ITEM".equals(ch.type())) continue;
            if (!material.equalsIgnoreCase(ch.targetMaterial())) continue;
            // amount crafted depends on shift-click or single craft
            int amount = event.isShiftClick()
                    ? event.getRecipe().getResult().getAmount()
                    : 1;
            repo.bufferProgress(ch.id(), player.getUniqueId().toString(), amount);
            checkCompletion(ch, player.getUniqueId().toString());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlayerMove(PlayerMoveEvent event) {
        // Only count block-level moves to avoid spam on head rotation
        if (event.getFrom().getBlockX() == event.getTo().getBlockX()
                && event.getFrom().getBlockY() == event.getTo().getBlockY()
                && event.getFrom().getBlockZ() == event.getTo().getBlockZ()) return;

        double dist = event.getFrom().distance(event.getTo());
        int metres = (int) dist;  // truncate to whole metres
        if (metres <= 0) return;

        String playerId = event.getPlayer().getUniqueId().toString();
        List<ActiveChallenge> challenges = manager.getActive();
        for (ActiveChallenge ch : challenges) {
            if (!"TRAVEL".equals(ch.type())) continue;
            String key = ch.id() + ":" + playerId;
            AtomicInteger acc = travelAccum.computeIfAbsent(key, k -> new AtomicInteger(0));
            // Flush every 10m accumulated to reduce DB writes
            if (acc.addAndGet(metres) >= 10) {
                int toFlush = acc.getAndSet(0);
                repo.bufferProgress(ch.id(), playerId, toFlush);
                checkCompletion(ch, playerId);
            }
        }
    }

    private void bufferAndCheckCompletion(ActiveChallenge ch, String playerId) {
        repo.bufferProgress(ch.id(), playerId, 1);
        checkCompletion(ch, playerId);
    }

    private void checkCompletion(ActiveChallenge ch, String playerId) {
        // This is a best-effort local check; authoritative check is server-side
        // We just fire the complete endpoint; server handles idempotency
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;

        String json = String.format("{\"playerId\":\"%s\"}", playerId);
        api.post("/challenges/" + ch.id() + "/complete", json, new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                if (response.code() == 200) {
                    log.info("Challenge " + ch.id() + " completed by " + playerId);
                }
                response.close();
            }
            @Override
            public void onFailure(Call call, IOException e) {
                // Non-critical; server checks completion authoritatively
            }
        });
    }
}
