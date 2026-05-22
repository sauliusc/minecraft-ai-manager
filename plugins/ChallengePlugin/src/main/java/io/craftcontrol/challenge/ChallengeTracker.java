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

    private final ChallengePlugin plugin;
    private final ChallengeManager manager;
    private final ChallengeRepository repo;
    private final Logger log;

    private final ConcurrentHashMap<String, AtomicInteger> travelAccum = new ConcurrentHashMap<>();

    public ChallengeTracker(ChallengePlugin plugin, ChallengeManager manager, ChallengeRepository repo, Logger log) {
        this.plugin = plugin;
        this.manager = manager;
        this.repo = repo;
        this.log = log;
    }

    /** Test-only constructor (null plugin — completion sound/title config not used). */
    ChallengeTracker(ChallengeManager manager, ChallengeRepository repo, Logger log) {
        this(null, manager, repo, log);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent event) {
        Player player = event.getPlayer();
        String material = event.getBlock().getType().name();
        List<ActiveChallenge> challenges = manager.getActive();

        for (ActiveChallenge ch : challenges) {
            if (!"BLOCK_BREAK".equals(ch.type())) continue;
            if (!material.equalsIgnoreCase(ch.targetMaterial())) continue;
            bufferAndCheckCompletion(ch, player.getName());
            sendActionBar(player, ch);
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
            bufferAndCheckCompletion(ch, killer.getName());
            sendActionBar(killer, ch);
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
            // Shift-click crafts as many times as the ingredients allow; multiply result amount
            // by how many craft operations actually occur (inventory slots / recipe ingredient count).
            // Using getInventory().getResult().getAmount() gives the per-operation yield;
            // for shift-click we derive the multiplier from the smallest ingredient stack.
            int amount;
            if (event.isShiftClick()) {
                int perCraft = event.getRecipe().getResult().getAmount();
                // Find the smallest ingredient stack to know how many times the recipe runs
                int minIngredient = Integer.MAX_VALUE;
                for (org.bukkit.inventory.ItemStack item : event.getInventory().getMatrix()) {
                    if (item != null && item.getType() != org.bukkit.Material.AIR) {
                        minIngredient = Math.min(minIngredient, item.getAmount());
                    }
                }
                amount = (minIngredient == Integer.MAX_VALUE) ? perCraft : perCraft * minIngredient;
            } else {
                amount = event.getRecipe().getResult().getAmount();
            }
            repo.bufferProgress(ch.id(), player.getName(), amount);
            checkCompletion(ch, player.getName());
            sendActionBar(player, ch);
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlayerMove(PlayerMoveEvent event) {
        // Only count block-level moves to avoid spam on head rotation
        if (event.getFrom().getBlockX() == event.getTo().getBlockX()
                && event.getFrom().getBlockY() == event.getTo().getBlockY()
                && event.getFrom().getBlockZ() == event.getTo().getBlockZ()) return;

        Player player = event.getPlayer();
        // Ignore vertical-only movement (elevators, falling — only count horizontal walking)
        if (event.getFrom().getBlockX() == event.getTo().getBlockX()
                && event.getFrom().getBlockZ() == event.getTo().getBlockZ()) return;

        // Skip players who are riding a vehicle (minecart, horse, boat, elytra gliding)
        if (player.isInsideVehicle() || player.isGliding()) return;

        // Skip players who are flying (creative flight or /fly)
        if (player.isFlying()) return;

        // Only count ground-level movement
        if (!player.isOnGround()) return;

        double dist = event.getFrom().distance(event.getTo());
        int metres = (int) dist;
        if (metres <= 0) return;

        String playerId = player.getName();
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
                sendActionBar(player, ch);
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
        if (BridgePlugin.getInstance() == null) return;
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;

        String json = String.format("{\"playerId\":\"%s\"}", playerId);
        api.post("/challenges/" + ch.id() + "/complete", json, new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                if (response.code() == 200) {
                    log.info("Challenge " + ch.id() + " completed by " + playerId);
                    if (plugin == null) { response.close(); return; }
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        Player p = plugin.getServer().getPlayer(playerId);
                        if (p == null) return;
                        // Title (configurable via config.yml completion.title)
                        String titleText = plugin.getConfig().getString("completion.title", "CHALLENGE COMPLETE!");
                        p.showTitle(net.kyori.adventure.title.Title.title(
                            net.kyori.adventure.text.minimessage.MiniMessage.miniMessage().deserialize(titleText),
                            net.kyori.adventure.text.Component.text(ch.title(), net.kyori.adventure.text.format.NamedTextColor.YELLOW)
                        ));
                        // Sound (configurable via config.yml completion.sound)
                        String soundName = plugin.getConfig().getString("completion.sound", "ENTITY_PLAYER_LEVELUP");
                        try {
                            p.playSound(p.getLocation(), org.bukkit.Sound.valueOf(soundName), 1.0f, 1.0f);
                        } catch (IllegalArgumentException ex) {
                            p.playSound(p.getLocation(), org.bukkit.Sound.ENTITY_PLAYER_LEVELUP, 1.0f, 1.0f);
                        }
                        // Particles
                        p.getWorld().spawnParticle(org.bukkit.Particle.TOTEM_OF_UNDYING,
                            p.getLocation().add(0, 1, 0), 40, 0.5, 0.5, 0.5, 0.1);
                        // Chat message
                        p.sendMessage(net.kyori.adventure.text.Component.text(
                            "✓ Challenge complete: " + ch.title(),
                            net.kyori.adventure.text.format.NamedTextColor.GREEN));
                    });
                }
                response.close();
            }
            @Override
            public void onFailure(Call call, IOException e) {
                // Non-critical; server checks completion authoritatively
            }
        });
    }

    private void sendActionBar(Player player, ActiveChallenge ch) {
        int current = repo.getProgress(ch.id(), player.getName());
        String msg = "⚔ " + ch.title() + ": " + current + "/" + ch.targetCount();
        player.sendActionBar(net.kyori.adventure.text.Component.text(
            msg, net.kyori.adventure.text.format.NamedTextColor.YELLOW));
    }
}
