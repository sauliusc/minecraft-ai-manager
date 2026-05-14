package io.craftcontrol.event;

import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.event.model.ActiveEvent;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.scoreboard.DisplaySlot;
import org.bukkit.scoreboard.Objective;
import org.bukkit.scoreboard.Scoreboard;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

public class BuildBattleHandler {

    private static final int VOTE_SECONDS_PER_BUILD = 30;

    private final EventPlugin plugin;
    private final Logger log;
    private final EventManager eventManager;

    private volatile String activeEventId;
    private final Map<UUID, Location> playerPlots = new ConcurrentHashMap<>();
    private final Map<UUID, Integer> playerPlotRadii = new ConcurrentHashMap<>();
    private final Map<UUID, Integer> voteAccumulator = new ConcurrentHashMap<>();
    private final Map<UUID, Integer> voteCount = new ConcurrentHashMap<>();
    private final Map<UUID, Boolean> hasVoted = new ConcurrentHashMap<>();

    private List<UUID> builderOrder = new ArrayList<>();
    private int currentBuilderIndex = 0;
    private BukkitTask countdownTask;
    private BukkitTask voteAdvanceTask;
    private Scoreboard scoreboard;
    private Objective objective;

    public BuildBattleHandler(EventPlugin plugin, EventManager eventManager) {
        this.plugin = plugin;
        this.log = plugin.getLogger();
        this.eventManager = eventManager;
    }

    public void startBattle(ActiveEvent event) {
        activeEventId = event.getId();
        playerPlots.clear();
        voteAccumulator.clear();
        voteCount.clear();
        hasVoted.clear();
        builderOrder.clear();
        currentBuilderIndex = 0;

        List<? extends Player> online = new ArrayList<>(Bukkit.getOnlinePlayers());
        if (online.isEmpty()) {
            log.warning("Build Battle started with no players online, completing immediately.");
            eventManager.completeEvent(event.getId());
            return;
        }

        World world = Bukkit.getWorld(plugin.getConfig().getString("build_battle.world", "world"));
        if (world == null) world = Bukkit.getWorlds().get(0);

        List<Map<?, ?>> plotConfigs = plugin.getConfig().getMapList("build_battle.plots");
        int assignedCount = 0;
        for (Player p : online) {
            if (assignedCount >= plotConfigs.size()) break;
            Map<?, ?> pc = plotConfigs.get(assignedCount);
            double px = toDouble(pc.get("x"), 0.0);
            double py = toDouble(pc.get("y"), 64.0);
            double pz = toDouble(pc.get("z"), 0.0);
            int radius = toInt(pc.get("radius"), 10);
            Location center = new Location(world, px, py, pz);
            playerPlots.put(p.getUniqueId(), center);
            playerPlotRadii.put(p.getUniqueId(), radius);
            builderOrder.add(p.getUniqueId());
            voteAccumulator.put(p.getUniqueId(), 0);
            voteCount.put(p.getUniqueId(), 0);
            p.teleport(center);
            assignedCount++;
        }

        distributeKits(online);
        setupScoreboard();

        int buildMinutes = plugin.getConfig().getInt("build_battle.build_time_minutes", 20);
        Bukkit.broadcastMessage("§a§l[Build Battle] §eStarted! You have §6" + buildMinutes + " minutes §eto build!");
        scheduleBuildPhaseEnd(buildMinutes);
    }

    private void distributeKits(List<? extends Player> players) {
        List<Map<?, ?>> kitItems = plugin.getConfig().getMapList("build_battle.kit");
        for (Player p : players) {
            p.getInventory().clear();
            for (Map<?, ?> entry : kitItems) {
                String matName = String.valueOf(entry.get("material"));
                int amount = toInt(entry.get("amount"), 1);
                Material mat = Material.matchMaterial(matName);
                if (mat != null) {
                    p.getInventory().addItem(new ItemStack(mat, amount));
                }
            }
        }
    }

    private void setupScoreboard() {
        scoreboard = Bukkit.getScoreboardManager().getNewScoreboard();
        objective = scoreboard.registerNewObjective("buildbattle", "dummy",
                Component.text("§6Build Battle", NamedTextColor.GOLD));
        objective.setDisplaySlot(DisplaySlot.SIDEBAR);
        for (Player p : Bukkit.getOnlinePlayers()) {
            p.setScoreboard(scoreboard);
        }
    }

    private void scheduleBuildPhaseEnd(int buildMinutes) {
        long buildTicks = (long) buildMinutes * 60 * 20;
        final int[] remaining = {buildMinutes * 60};

        countdownTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            remaining[0]--;
            int mins = remaining[0] / 60;
            int secs = remaining[0] % 60;
            String timeStr = String.format("%d:%02d", mins, secs);
            if (objective != null) {
                objective.getScore("§eTime Left: §f" + timeStr).setScore(1);
            }
            if (remaining[0] <= 0) {
                countdownTask.cancel();
                startVotingPhase();
            }
        }, 20L, 20L);
    }

    public void startVotingPhase() {
        if (activeEventId == null) return;
        if (objective != null) {
            scoreboard.getEntries().forEach(scoreboard::resetScores);
            objective.getScore("§bVoting Phase!").setScore(1);
        }

        Bukkit.broadcastMessage("§b§l[Build Battle] §eBuild phase over! Voting begins now!");
        hasVoted.clear();
        currentBuilderIndex = 0;
        advanceToNextBuild();
    }

    private void advanceToNextBuild() {
        if (currentBuilderIndex >= builderOrder.size()) {
            announceResults();
            return;
        }

        UUID currentBuilder = builderOrder.get(currentBuilderIndex);
        Location plotCenter = playerPlots.get(currentBuilder);
        String builderName = getPlayerName(currentBuilder);

        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!p.getUniqueId().equals(currentBuilder)) {
                p.teleport(plotCenter);
            }
            p.sendMessage(Component.text("§b[Build Battle] §eNow viewing §6" + builderName
                    + "§e's build. Vote with /buildvote <1-5>!", NamedTextColor.AQUA));
        }

        hasVoted.clear();

        voteAdvanceTask = Bukkit.getScheduler().runTaskLater(plugin, () -> {
            currentBuilderIndex++;
            advanceToNextBuild();
        }, VOTE_SECONDS_PER_BUILD * 20L);
    }

    public boolean submitVote(Player voter, UUID builder, int score) {
        if (activeEventId == null) return false;
        if (score < 1 || score > 5) return false;
        if (voter.getUniqueId().equals(builder)) {
            voter.sendMessage(Component.text("§cYou cannot vote for your own build!", NamedTextColor.RED));
            return false;
        }
        if (hasVoted.putIfAbsent(voter.getUniqueId(), true) != null) {
            voter.sendMessage(Component.text("§cYou already voted for this build!", NamedTextColor.RED));
            return false;
        }
        voteAccumulator.merge(builder, score, Integer::sum);
        voteCount.merge(builder, 1, Integer::sum);
        voter.sendMessage(Component.text("§a[Build Battle] Vote of §6" + score + "§a recorded!", NamedTextColor.GREEN));
        return true;
    }

    public UUID getCurrentBuilder() {
        if (currentBuilderIndex < builderOrder.size()) {
            return builderOrder.get(currentBuilderIndex);
        }
        return null;
    }

    public void announceResults() {
        if (activeEventId == null) return;
        String eventId = activeEventId;
        activeEventId = null;

        if (voteAdvanceTask != null) {
            voteAdvanceTask.cancel();
        }
        if (countdownTask != null) {
            countdownTask.cancel();
        }

        List<Map.Entry<UUID, Double>> averages = new ArrayList<>();
        for (UUID uid : builderOrder) {
            int total = voteAccumulator.getOrDefault(uid, 0);
            int count = voteCount.getOrDefault(uid, 0);
            double avg = count > 0 ? (double) total / count : 0.0;
            averages.add(Map.entry(uid, avg));
        }
        averages.sort(Comparator.<Map.Entry<UUID, Double>>comparingByValue().reversed());

        Bukkit.broadcastMessage("§6§l====[ Build Battle Results ]====");
        String[] medals = {"§6§l1st", "§7§l2nd", "§c§l3rd"};
        String[] rewardIds = {
            plugin.getConfig().getString("build_battle.rewards.first_place_id", "build_battle_first"),
            plugin.getConfig().getString("build_battle.rewards.second_place_id", "build_battle_second"),
            plugin.getConfig().getString("build_battle.rewards.third_place_id", "build_battle_third")
        };

        for (int i = 0; i < Math.min(3, averages.size()); i++) {
            UUID uid = averages.get(i).getKey();
            double avg = averages.get(i).getValue();
            String name = getPlayerName(uid);
            Bukkit.broadcastMessage(medals[i] + " §e" + name + " §7— avg score: §f" + String.format("%.2f", avg));
            grantReward(uid, rewardIds[i], eventId);
        }

        for (Player p : Bukkit.getOnlinePlayers()) {
            p.setScoreboard(Bukkit.getScoreboardManager().getMainScoreboard());
        }

        eventManager.completeEvent(eventId);
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

    private String getPlayerName(UUID uid) {
        Player p = Bukkit.getPlayer(uid);
        if (p != null) return p.getName();
        var offline = Bukkit.getOfflinePlayer(uid);
        return offline.getName() != null ? offline.getName() : uid.toString();
    }

    private double toDouble(Object val, double def) {
        if (val == null) return def;
        try { return Double.parseDouble(String.valueOf(val)); } catch (NumberFormatException e) { return def; }
    }

    private int toInt(Object val, int def) {
        if (val == null) return def;
        try { return Integer.parseInt(String.valueOf(val)); } catch (NumberFormatException e) { return def; }
    }

    public boolean isActive() { return activeEventId != null; }
    public Map<UUID, Location> getPlayerPlots() { return playerPlots; }
    public Map<UUID, Integer> getVoteAccumulator() { return voteAccumulator; }

    public boolean isInOwnPlot(UUID playerId, Location loc) {
        Location center = playerPlots.get(playerId);
        if (center == null) return false;
        if (!loc.getWorld().equals(center.getWorld())) return false;
        int radius = playerPlotRadii.getOrDefault(playerId, 10);
        return Math.abs(loc.getBlockX() - center.getBlockX()) <= radius
            && Math.abs(loc.getBlockZ() - center.getBlockZ()) <= radius;
    }
}
