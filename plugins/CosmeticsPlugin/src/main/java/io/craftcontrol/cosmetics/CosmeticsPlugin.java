package io.craftcontrol.cosmetics;

import org.bukkit.plugin.java.JavaPlugin;

public class CosmeticsPlugin extends JavaPlugin {
    private static CosmeticsPlugin instance;
    private CosmeticsManager manager;
    private PetManager petManager;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        manager = new CosmeticsManager(getLogger());
        petManager = new PetManager(this);
        CosmeticsListener listener = new CosmeticsListener(this, manager, petManager);
        getServer().getPluginManager().registerEvents(listener, this);
        CosmeticsCommand cmd = new CosmeticsCommand(this, manager, petManager, listener);
        for (String name : new String[]{"title", "chatcolor", "particles", "pet", "trail"}) {
            var c = getCommand(name);
            if (c != null) c.setExecutor(cmd);
        }
        getLogger().info("CosmeticsPlugin enabled.");
    }

    @Override
    public void onDisable() {}

    public static CosmeticsPlugin getInstance() { return instance; }
    public CosmeticsManager getManager() { return manager; }
    public PetManager getPetManager() { return petManager; }
}
