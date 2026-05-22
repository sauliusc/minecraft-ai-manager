package io.craftcontrol.vote;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.craftcontrol.bridge.BridgePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.scheduler.BukkitRunnable;

import java.io.File;
import java.io.IOException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import org.bukkit.configuration.file.YamlConfiguration;

public class VoteMilestoneTask extends BukkitRunnable {

    private final VotePlugin plugin;
    private final File stateFile;
    private final YamlConfiguration state;

    public VoteMilestoneTask(VotePlugin plugin) {
        this.plugin = plugin;
        plugin.getDataFolder().mkdirs();
        stateFile = new File(plugin.getDataFolder(), "vote_milestone_state.yml");
        state = stateFile.exists() ? YamlConfiguration.loadConfiguration(stateFile) : new YamlConfiguration();
    }

    @Override
    public void run() {
        int threshold = plugin.getConfig().getInt("weekly_vote_threshold", 0);
        if (threshold <= 0) return;

        BridgePlugin.getInstance().getApiClient().get("/vote/stats", new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                plugin.getLogger().warning("Failed to fetch vote stats: " + e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                try (response) {
                    if (!response.isSuccessful() || response.body() == null) return;
                    JsonObject obj = JsonParser.parseString(response.body().string()).getAsJsonObject();
                    int weeklyVotes = obj.get("weeklyVotes").getAsInt();

                    if (weeklyVotes >= threshold) {
                        // Key: week starting Monday (ISO week)
                        LocalDate weekStart = LocalDate.now(ZoneId.systemDefault())
                            .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                        String key = "announced." + weekStart;

                        plugin.getServer().getScheduler().runTask(plugin, () -> {
                            if (state.getBoolean(key, false)) return;
                            state.set(key, true);
                            try { state.save(stateFile); } catch (IOException ex) {
                                plugin.getLogger().warning("Failed to save milestone state: " + ex.getMessage());
                            }
                            String msg = plugin.getConfig().getString(
                                "weekly_milestone_message",
                                "§6§l[Vote Milestone] We hit " + weeklyVotes + " votes this week! Thank you!");
                            plugin.getServer().broadcast(Component.text(msg, NamedTextColor.GOLD));
                        });
                    }
                } catch (Exception e) {
                    plugin.getLogger().warning("Error parsing vote stats: " + e.getMessage());
                }
            }
        });
    }
}
