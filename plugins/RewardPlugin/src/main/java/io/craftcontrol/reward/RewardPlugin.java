package io.craftcontrol.reward;

import org.bukkit.plugin.java.JavaPlugin;

public class RewardPlugin extends JavaPlugin {
    private static RewardPlugin instance;
    private RewardDelivery delivery;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        delivery = new RewardDelivery(getLogger());
        getServer().getPluginManager().registerEvents(new RewardListener(delivery, getLogger()), this);
        getLogger().info("RewardPlugin enabled.");
    }

    @Override
    public void onDisable() {
        getLogger().info("RewardPlugin disabled.");
    }

    public static RewardPlugin getInstance() { return instance; }
    public RewardDelivery getDelivery() { return delivery; }
}
