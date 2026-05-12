package io.craftcontrol.reward;

import org.bukkit.plugin.java.JavaPlugin;

public class RewardPlugin extends JavaPlugin {

    private static RewardPlugin instance;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        getLogger().info("RewardPlugin enabled.");
    }

    @Override
    public void onDisable() {
        getLogger().info("RewardPlugin disabled.");
    }

    public static RewardPlugin getInstance() {
        return instance;
    }
}
