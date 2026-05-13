package io.craftcontrol.greeter;

import org.bukkit.plugin.java.JavaPlugin;

public class GreeterPlugin extends JavaPlugin {

    private static GreeterPlugin instance;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        getServer().getPluginManager().registerEvents(new PlayerJoinListener(this), this);
        var cmd = getCommand("greeter");
        if (cmd != null) cmd.setExecutor(new GreeterCommand(this));
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
