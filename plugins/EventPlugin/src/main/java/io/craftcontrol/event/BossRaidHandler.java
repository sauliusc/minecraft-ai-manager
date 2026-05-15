package io.craftcontrol.event;

import com.google.gson.JsonObject;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.event.model.ActiveEvent;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.Bukkit;
import org.bukkit.Color;
import org.bukkit.FireworkEffect;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.attribute.Attribute;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Firework;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Wither;
import org.bukkit.entity.Zombie;
import org.bukkit.inventory.meta.FireworkMeta;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

public class BossRaidHandler {

    private final EventPlugin plugin;
    private final Logger log;

    private volatile String activeEventId;
    private volatile LivingEntity boss;
    private final ConcurrentHashMap<String, Map<UUID, Double>> damageTrackers = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Set<String>> firedPhases = new ConcurrentHashMap<>();

    public BossRaidHandler(EventPlugin plugin) {
        this.plugin = plugin;
        this.log = plugin.getLogger();
    }

    public void startRaid(ActiveEvent event) {
        String worldName = plugin.getConfig().getString("boss_raid.arena.world", "world");
        double x = plugin.getConfig().getDouble("boss_raid.arena.x", 0.0);
        double y = plugin.getConfig().getDouble("boss_raid.arena.y", 64.0);
        double z = plugin.getConfig().getDouble("boss_raid.arena.z", 0.0);

        World world = Bukkit.getWorld(worldName);
        if (world == null) {
            log.warning("Boss raid arena world '" + worldName + "' not found.");
            return;
        }

        Location arenaLoc = new Location(world, x, y, z);
        int playerCount = Math.max(1, Bukkit.getOnlinePlayers().size());

        activeEventId = event.getId();
        damageTrackers.put(event.getId(), new ConcurrentHashMap<>());
        firedPhases.put(event.getId(), new HashSet<>());

        Bukkit.broadcastMessage("§c§l[Boss Raid] §eA powerful boss has appeared at the arena!");

        JsonObject config = event.getConfig();
        String bossTypeStr = config.has("bossType") ? config.get("bossType").getAsString() : "WITHER";

        if ("ELDER_GUARDIAN".equalsIgnoreCase(bossTypeStr)) {
            spawnElderGuardian(world, arenaLoc, playerCount, event);
        } else {
            spawnWither(world, arenaLoc, playerCount, event);
        }
    }

    private void spawnWither(World world, Location loc, int playerCount, ActiveEvent event) {
        Wither wither = (Wither) world.spawnEntity(loc, EntityType.WITHER);
        wither.setCustomName("§c§lAncient Warden");
        wither.setCustomNameVisible(true);
        wither.setInvulnerable(false);

        double baseHp = 300.0;
        double scaledHp = baseHp * Math.sqrt(playerCount);
        wither.getAttribute(Attribute.MAX_HEALTH).setBaseValue(scaledHp);
        wither.setHealth(scaledHp);

        boss = wither;
        log.info("Spawned Wither boss for raid " + event.getId() + " with " + scaledHp + " HP.");
    }

    private void spawnElderGuardian(World world, Location loc, int playerCount, ActiveEvent event) {
        org.bukkit.entity.ElderGuardian eg = (org.bukkit.entity.ElderGuardian) world.spawnEntity(loc, EntityType.ELDER_GUARDIAN);
        eg.setCustomName("§c§lAncient Warden");
        eg.setCustomNameVisible(true);

        double baseHp = 200.0;
        double scaledHp = baseHp * Math.sqrt(playerCount);
        eg.getAttribute(Attribute.MAX_HEALTH).setBaseValue(scaledHp);
        eg.setHealth(scaledHp);

        boss = eg;
        log.info("Spawned ElderGuardian boss for raid " + event.getId() + " with " + scaledHp + " HP.");
    }

    public void recordDamage(UUID attackerId, double damage) {
        if (activeEventId == null) return;
        Map<UUID, Double> tracker = damageTrackers.get(activeEventId);
        if (tracker == null) return;
        tracker.merge(attackerId, damage, Double::sum);
    }

    public boolean isActiveBoss(LivingEntity entity) {
        return boss != null && boss.equals(entity);
    }

    public void checkPhaseTransition(LivingEntity bossEntity) {
        if (activeEventId == null || boss == null) return;
        if (!boss.equals(bossEntity)) return;

        double maxHp = boss.getAttribute(Attribute.MAX_HEALTH).getValue();
        double currentHp = boss.getHealth();
        double pct = currentHp / maxHp;

        Set<String> fired = firedPhases.get(activeEventId);
        if (fired == null) return;

        if (pct <= 0.75 && !fired.contains("75")) {
            fired.add("75");
            triggerPhase("75%", bossEntity.getLocation());
        }
        if (pct <= 0.50 && !fired.contains("50")) {
            fired.add("50");
            triggerPhase("50%", bossEntity.getLocation());
        }
        if (pct <= 0.25 && !fired.contains("25")) {
            fired.add("25");
            triggerPhase("25%", bossEntity.getLocation());
        }
    }

    private void triggerPhase(String phase, Location loc) {
        Bukkit.broadcastMessage("§c§l[Boss Raid] §eThe boss reached " + phase + " HP — it's enraged!");

        double speedBase = boss.getAttribute(Attribute.MOVEMENT_SPEED).getBaseValue();
        boss.getAttribute(Attribute.MOVEMENT_SPEED).setBaseValue(speedBase * 1.3);

        World world = loc.getWorld();
        if (world == null) return;
        for (int i = 0; i < 3; i++) {
            Location spawnLoc = loc.clone().add(
                    (Math.random() - 0.5) * 10,
                    0,
                    (Math.random() - 0.5) * 10
            );
            Zombie minion = (Zombie) world.spawnEntity(spawnLoc, EntityType.ZOMBIE);
            minion.setCustomName("§7Minion");
            minion.setCustomNameVisible(true);
        }
    }

    public void onBossDeath(LivingEntity bossEntity, Location deathLoc) {
        if (activeEventId == null) return;
        String eventId = activeEventId;
        activeEventId = null;
        boss = null;

        spawnFireworks(deathLoc);
        Bukkit.broadcastMessage("§6§l[Boss Raid] §eThe boss has been defeated! Distributing rewards...");

        Map<UUID, Double> tracker = damageTrackers.remove(eventId);
        firedPhases.remove(eventId);

        if (tracker == null || tracker.isEmpty()) {
            plugin.getEventManager().completeEvent(eventId);
            return;
        }

        List<Map.Entry<UUID, Double>> sorted = new ArrayList<>(tracker.entrySet());
        sorted.sort(Comparator.<Map.Entry<UUID, Double>>comparingByValue().reversed());

        String firstId = plugin.getConfig().getString("boss_raid.rewards.first_place_id", "boss_raid_first");
        String secondId = plugin.getConfig().getString("boss_raid.rewards.second_place_id", "boss_raid_second");
        String thirdId = plugin.getConfig().getString("boss_raid.rewards.third_place_id", "boss_raid_third");
        String participantId = plugin.getConfig().getString("boss_raid.rewards.participation_id", "boss_raid_participant");

        String[] topRewards = {firstId, secondId, thirdId};

        for (int i = 0; i < Math.min(3, sorted.size()); i++) {
            UUID uid = sorted.get(i).getKey();
            grantReward(uid, topRewards[i], eventId);
        }

        for (Map.Entry<UUID, Double> entry : tracker.entrySet()) {
            grantReward(entry.getKey(), participantId, eventId);
        }

        plugin.getEventManager().completeEvent(eventId);
    }

    private void grantReward(UUID playerId, String rewardId, String eventId) {
        String json = "{\"playerId\":\"" + playerId + "\",\"rewardId\":\"" + rewardId + "\",\"eventId\":\"" + eventId + "\"}";
        BridgePlugin.getInstance().getApiClient().post("/api/rewards/grant", json, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                log.warning("Failed to grant reward " + rewardId + " to " + playerId + ": " + e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                response.close();
            }
        });
    }

    private void spawnFireworks(Location loc) {
        World world = loc.getWorld();
        if (world == null) return;
        for (int i = 0; i < 5; i++) {
            Bukkit.getScheduler().runTaskLater(plugin, () -> {
                Firework fw = world.spawn(loc, Firework.class);
                FireworkMeta meta = fw.getFireworkMeta();
                meta.addEffect(FireworkEffect.builder()
                        .withColor(Color.GOLD, Color.RED)
                        .with(FireworkEffect.Type.BURST)
                        .trail(true)
                        .build());
                meta.setPower(1);
                fw.setFireworkMeta(meta);
            }, i * 10L);
        }
    }

    public void cleanup() {
        activeEventId = null;
        damageTrackers.clear();
        firedPhases.clear();
        if (boss != null && !boss.isDead()) {
            boss.remove();
        }
        boss = null;
    }

    public LivingEntity getBoss() { return boss; }
    public String getActiveEventId() { return activeEventId; }
}
