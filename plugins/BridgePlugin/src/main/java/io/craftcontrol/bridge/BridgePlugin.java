package io.craftcontrol.bridge;

import org.bukkit.plugin.java.JavaPlugin;

public class BridgePlugin extends JavaPlugin {

    private static BridgePlugin instance;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        getLogger().info("BridgePlugin enabled.");
    }

    @Override
    public void onDisable() {
        getLogger().info("BridgePlugin disabled.");
    }

    public static BridgePlugin getInstance() {
        return instance;
    }
}
