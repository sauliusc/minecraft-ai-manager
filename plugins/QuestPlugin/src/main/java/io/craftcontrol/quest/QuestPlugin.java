package io.craftcontrol.quest;

import org.bukkit.plugin.java.JavaPlugin;

public class QuestPlugin extends JavaPlugin {
    private static QuestPlugin instance;
    private QuestRepository repo;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        repo = new QuestRepository(getLogger());
        getServer().getPluginManager().registerEvents(new QuestListener(this, repo), this);
        getServer().getPluginManager().registerEvents(new QuestTracker(repo, getLogger()), this);
        getCommand("quests").setExecutor(new QuestsCommand(this, repo));
        getLogger().info("QuestPlugin enabled.");
    }

    @Override
    public void onDisable() {}

    public static QuestPlugin getInstance() { return instance; }
    public QuestRepository getRepo() { return repo; }
}
