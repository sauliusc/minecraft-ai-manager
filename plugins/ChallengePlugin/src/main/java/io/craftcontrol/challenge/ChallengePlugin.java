package io.craftcontrol.challenge;

import org.bukkit.plugin.java.JavaPlugin;

public class ChallengePlugin extends JavaPlugin {

    private static ChallengePlugin instance;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        getLogger().info("ChallengePlugin enabled.");
    }

    @Override
    public void onDisable() {
        getLogger().info("ChallengePlugin disabled.");
    }

    public static ChallengePlugin getInstance() {
        return instance;
    }
}
