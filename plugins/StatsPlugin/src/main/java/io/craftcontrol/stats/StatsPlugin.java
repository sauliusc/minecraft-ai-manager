package io.craftcontrol.stats;

import org.bukkit.plugin.java.JavaPlugin;

public class StatsPlugin extends JavaPlugin {
    private static StatsPlugin instance;

    @Override
    public void onEnable() {
        instance = this;
        StatsCommand cmd = new StatsCommand(this);
        var command = getCommand("stats");
        if (command != null) {
            command.setExecutor(cmd);
            command.setTabCompleter(cmd);
        }
        getLogger().info("StatsPlugin enabled.");
    }

    @Override
    public void onDisable() {}

    public static StatsPlugin getInstance() { return instance; }
}
