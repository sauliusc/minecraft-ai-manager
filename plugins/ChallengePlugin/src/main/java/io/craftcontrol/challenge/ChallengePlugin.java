package io.craftcontrol.challenge;

import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.sql.SQLException;

public class ChallengePlugin extends JavaPlugin {

    private static ChallengePlugin instance;
    private ChallengeManager manager;
    private ChallengeRepository repo;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();

        try {
            String dbPath = new File(getDataFolder(), "challenges.db").getAbsolutePath();
            getDataFolder().mkdirs();
            repo = new ChallengeRepository(dbPath, getLogger());
        } catch (SQLException e) {
            getLogger().severe("Failed to initialise SQLite: " + e.getMessage());
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        manager = new ChallengeManager(getLogger());
        manager.refresh();

        ChallengeTracker tracker = new ChallengeTracker(this, manager, repo, getLogger());
        getServer().getPluginManager().registerEvents(tracker, this);

        getCommand("challenges").setExecutor(new ChallengesCommand(manager, repo));

        long refreshTicks = getConfig().getLong("challenge.refresh_interval_ticks", 1200L);
        long syncTicks = getConfig().getLong("challenge.sync_interval_ticks", 600L);

        getServer().getScheduler().runTaskTimerAsynchronously(this,
                manager::refresh, refreshTicks, refreshTicks);

        new ChallengeSyncTask(repo, getLogger())
                .runTaskTimerAsynchronously(this, syncTicks, syncTicks);

        getLogger().info("ChallengePlugin enabled.");
    }

    @Override
    public void onDisable() {
        if (repo != null) {
            try { repo.close(); } catch (SQLException ignored) {}
        }
        getLogger().info("ChallengePlugin disabled.");
    }

    public static ChallengePlugin getInstance() {
        return instance;
    }

    public ChallengeManager getManager() {
        return manager;
    }
}
