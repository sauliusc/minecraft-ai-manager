package io.craftcontrol.vote;

import org.bukkit.plugin.java.JavaPlugin;

public class VotePlugin extends JavaPlugin {

    private static VotePlugin instance;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        getServer().getPluginManager().registerEvents(new VoteListener(this), this);
        var vote = getCommand("vote");
        if (vote != null) vote.setExecutor(new VoteCommand(this));
        var claim = getCommand("voteclaim");
        if (claim != null) claim.setExecutor(new VoteCommand(this));
        getLogger().info("VotePlugin enabled.");
    }

    @Override
    public void onDisable() {
        getLogger().info("VotePlugin disabled.");
    }

    public static VotePlugin getInstance() { return instance; }
}
