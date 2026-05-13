package io.craftcontrol.event;

import org.bukkit.plugin.java.JavaPlugin;

public class EventPlugin extends JavaPlugin {
    private static EventPlugin instance;
    private EventManager eventManager;
    private BossRaidHandler bossRaidHandler;
    private TreasureHuntHandler treasureHuntHandler;
    private BuildBattleHandler buildBattleHandler;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        eventManager = new EventManager(this);
        bossRaidHandler = new BossRaidHandler(this);
        treasureHuntHandler = new TreasureHuntHandler(this, eventManager);
        buildBattleHandler = new BuildBattleHandler(this, eventManager);
        eventManager.start(bossRaidHandler, treasureHuntHandler, buildBattleHandler);
        getServer().getPluginManager().registerEvents(new EventListener(bossRaidHandler, treasureHuntHandler, buildBattleHandler), this);
        getLogger().info("EventPlugin enabled.");
    }

    @Override
    public void onDisable() {
        if (eventManager != null) eventManager.stop();
    }

    public static EventPlugin getInstance() { return instance; }
    public EventManager getEventManager() { return eventManager; }
    public BossRaidHandler getBossRaidHandler() { return bossRaidHandler; }
    public TreasureHuntHandler getTreasureHuntHandler() { return treasureHuntHandler; }
    public BuildBattleHandler getBuildBattleHandler() { return buildBattleHandler; }
}
