package io.craftcontrol.streak;

import org.bukkit.plugin.java.JavaPlugin;

public class StreakPlugin extends JavaPlugin {
    private static StreakPlugin instance;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        getServer().getPluginManager().registerEvents(new StreakListener(this), this);
        getLogger().info("StreakPlugin enabled.");
    }

    @Override
    public void onDisable() { }

    public static StreakPlugin getInstance() { return instance; }
}
