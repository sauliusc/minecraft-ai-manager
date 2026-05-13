package io.craftcontrol.greeter;

import org.bukkit.plugin.java.JavaPlugin;

public class GreeterPlugin extends JavaPlugin {

    private static GreeterPlugin instance;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        getLogger().info("GreeterPlugin enabled.");
    }

    @Override
    public void onDisable() {
        getLogger().info("GreeterPlugin disabled.");
    }

    public static GreeterPlugin getInstance() {
        return instance;
    }
}
