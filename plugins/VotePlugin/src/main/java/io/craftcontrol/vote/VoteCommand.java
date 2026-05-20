package io.craftcontrol.vote;

import io.craftcontrol.bridge.BridgePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;

import java.io.File;
import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

public class VoteCommand implements CommandExecutor {

    private final VotePlugin plugin;
    private final File streaksFile;
    private final YamlConfiguration streaksData;

    public VoteCommand(VotePlugin plugin) {
        this.plugin = plugin;
        plugin.getDataFolder().mkdirs();
        streaksFile = new File(plugin.getDataFolder(), "vote_streaks.yml");
        streaksData = streaksFile.exists() ? YamlConfiguration.loadConfiguration(streaksFile) : new YamlConfiguration();
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("This command is for players only.");
            return true;
        }
        if (command.getName().equalsIgnoreCase("vote")) {
            handleVote(player);
        } else if (command.getName().equalsIgnoreCase("voteclaim")) {
            handleVoteClaim(player);
        }
        return true;
    }

    private void handleVote(Player player) {
        List<Map<?, ?>> sites = plugin.getConfig().getMapList("vote_sites");
        player.sendMessage(Component.text("§6§l=== Vote for our server! ===", NamedTextColor.GOLD));
        if (sites.isEmpty()) {
            player.sendMessage(Component.text("§7No vote sites configured.", NamedTextColor.GRAY));
            return;
        }
        for (Map<?, ?> site : sites) {
            String name = String.valueOf(site.get("name"));
            String url = String.valueOf(site.get("url"));
            player.sendMessage(Component.text("§e" + name + ": §f" + url, NamedTextColor.YELLOW));
        }
        player.sendMessage(Component.text("§7After voting, use §f/voteclaim §7to receive your reward!", NamedTextColor.GRAY));
    }

    private void handleVoteClaim(Player player) {
        player.sendMessage(Component.text("§eClaiming your vote reward...", NamedTextColor.YELLOW));
        String json = "{\"uuid\":\"" + player.getUniqueId() + "\",\"playerName\":\"" + player.getName() + "\"}";
        BridgePlugin.getInstance().getApiClient().post("/api/vote/claim", json, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                plugin.getServer().getScheduler().runTask(plugin, () ->
                    player.sendMessage(Component.text("§cFailed to claim vote reward. Please try again later.", NamedTextColor.RED)));
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                try (response) {
                    int code = response.code();
                    if (code == 200) {
                        int coins = plugin.getConfig().getInt("vote_reward.coins", 100);
                        if (coins > 0) {
                            String creditJson = String.format(
                                "{\"playerId\":\"%s\",\"currency\":\"coins\",\"amount\":%d,\"reason\":\"vote_reward\"}",
                                player.getUniqueId(), coins);
                            BridgePlugin.getInstance().getApiClient().post("/api/economy/plugin/credit", creditJson, new Callback() {
                                @Override public void onResponse(Call c, Response r) { r.close(); }
                                @Override public void onFailure(Call c, IOException e) {
                                    plugin.getLogger().warning("Failed to credit vote coins: " + e.getMessage());
                                }
                            });
                        }
                        String rewardId = plugin.getConfig().getString("vote_reward.reward_id", "");
                        if (rewardId != null && !rewardId.isEmpty()) {
                            String grantJson = String.format(
                                "{\"playerId\":\"%s\",\"rewardId\":\"%s\",\"reason\":\"vote_reward\"}",
                                player.getUniqueId(), rewardId);
                            BridgePlugin.getInstance().getApiClient().post("/api/rewards/grant", grantJson, new Callback() {
                                @Override public void onResponse(Call c, Response r) { r.close(); }
                                @Override public void onFailure(Call c, IOException e) {
                                    plugin.getLogger().warning("Failed to grant vote reward: " + e.getMessage());
                                }
                            });
                        }

                        // Update vote streak on main thread (YML is not thread-safe)
                        plugin.getServer().getScheduler().runTask(plugin, () -> {
                            int streak = updateVoteStreak(player.getUniqueId().toString());
                            player.sendMessage(Component.text(
                                "§aVote reward claimed! +" + coins + " coins. Vote streak: §e" + streak + " days§a!",
                                NamedTextColor.GREEN));
                            deliverStreakMilestone(player, streak);
                        });
                    } else {
                        plugin.getServer().getScheduler().runTask(plugin, () -> {
                            if (code == 404) {
                                player.sendMessage(Component.text("§cNo pending vote reward found. Make sure you voted first!", NamedTextColor.RED));
                            } else if (code == 409) {
                                player.sendMessage(Component.text("§cYou already claimed your vote reward recently.", NamedTextColor.RED));
                            } else {
                                player.sendMessage(Component.text("§cUnexpected error (" + code + "). Please try again later.", NamedTextColor.RED));
                            }
                        });
                    }
                }
            }
        });
    }

    private synchronized int updateVoteStreak(String uuid) {
        long now = System.currentTimeMillis();
        long lastVote = streaksData.getLong(uuid + ".lastVote", 0L);
        int streak = streaksData.getInt(uuid + ".streak", 0);

        LocalDate today = LocalDate.ofInstant(Instant.ofEpochMilli(now), ZoneId.systemDefault());
        LocalDate lastDay = lastVote == 0L ? null
            : LocalDate.ofInstant(Instant.ofEpochMilli(lastVote), ZoneId.systemDefault());

        if (lastDay == null) {
            streak = 1;
        } else if (today.equals(lastDay)) {
            // Already voted today on this site — don't double-increment
            return streak;
        } else {
            long gapDays = today.toEpochDay() - lastDay.toEpochDay();
            streak = gapDays <= 1 ? streak + 1 : 1;
        }

        streaksData.set(uuid + ".lastVote", now);
        streaksData.set(uuid + ".streak", streak);
        try { streaksData.save(streaksFile); } catch (IOException e) {
            plugin.getLogger().warning("Failed to save vote_streaks.yml: " + e.getMessage());
        }
        return streak;
    }

    private void deliverStreakMilestone(Player player, int streak) {
        for (var m : plugin.getConfig().getMapList("vote_streak_milestones")) {
            Object dayObj = m.get("day");
            int day = dayObj instanceof Number n ? n.intValue() : 0;
            if (day != streak) continue;

            Object msgObj = m.get("message");
            String msg = msgObj != null ? msgObj.toString() : "";
            if (!msg.isEmpty()) player.sendMessage(Component.text(msg, NamedTextColor.GOLD));
            player.playSound(player.getLocation(), org.bukkit.Sound.UI_TOAST_CHALLENGE_COMPLETE, 1.0f, 1.0f);

            Object coinsObj = m.get("coins");
            int bonusCoins = coinsObj instanceof Number n ? n.intValue() : 0;
            if (bonusCoins > 0) {
                String uuid = player.getUniqueId().toString();
                String json = String.format(
                    "{\"playerId\":\"%s\",\"currency\":\"coins\",\"amount\":%d,\"reason\":\"vote_streak_milestone_day_%d\"}",
                    uuid, bonusCoins, streak);
                plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
                    BridgePlugin.getInstance().getApiClient().post("/api/economy/plugin/credit", json, new Callback() {
                        @Override public void onResponse(Call c, Response r) { r.close(); }
                        @Override public void onFailure(Call c, IOException e) {
                            plugin.getLogger().warning("Failed to credit vote streak milestone coins: " + e.getMessage());
                        }
                    }));
            }
            break;
        }
    }
}
