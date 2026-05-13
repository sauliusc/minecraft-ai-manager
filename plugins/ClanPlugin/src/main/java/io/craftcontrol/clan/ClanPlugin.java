package io.craftcontrol.clan;

import org.bukkit.plugin.java.JavaPlugin;

public class ClanPlugin extends JavaPlugin {
    private static ClanPlugin instance;
    private ClanManager manager;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        manager = new ClanManager(getLogger());
        getServer().getPluginManager().registerEvents(new ClanChatListener(this, manager), this);
        getCommand("clan").setExecutor(new ClanCommand(this, manager));
        getLogger().info("ClanPlugin enabled.");
    }

    @Override
    public void onDisable() {}

    public static ClanPlugin getInstance() { return instance; }
    public ClanManager getManager() { return manager; }
}
