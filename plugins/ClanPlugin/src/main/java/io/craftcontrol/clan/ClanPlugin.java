package io.craftcontrol.clan;

import io.craftcontrol.clan.war.WarListener;
import io.craftcontrol.clan.war.WarManager;
import org.bukkit.plugin.java.JavaPlugin;

public class ClanPlugin extends JavaPlugin {
    private static ClanPlugin instance;
    private ClanManager manager;
    private WarManager warManager;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        manager = new ClanManager(getLogger());
        warManager = new WarManager(this, manager, getLogger());
        getServer().getPluginManager().registerEvents(new ClanChatListener(this, manager), this);
        getServer().getPluginManager().registerEvents(new WarListener(manager, warManager), this);
        getCommand("clan").setExecutor(new ClanCommand(this, manager));
        getLogger().info("ClanPlugin enabled.");
    }

    @Override
    public void onDisable() {}

    public static ClanPlugin getInstance() { return instance; }
    public ClanManager getManager() { return manager; }
    public WarManager getWarManager() { return warManager; }
}
