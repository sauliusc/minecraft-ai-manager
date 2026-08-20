package io.craftcontrol.cosmetics;

import org.bukkit.plugin.java.JavaPlugin;

public class CosmeticsPlugin extends JavaPlugin {
    private static CosmeticsPlugin instance;
    private CosmeticsManager manager;
    private PetManager petManager;
    private PetTypes petTypes;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        manager = new CosmeticsManager(getLogger());
        petManager = new PetManager(this);
        petTypes = new PetTypes(getConfig().getStringList("cosmetics.available_pets"),
            getConfig().getString("cosmetics.default_pet", "CAT"));
        CosmeticsListener listener = new CosmeticsListener(this, manager, petManager);
        getServer().getPluginManager().registerEvents(listener, this);
        CosmeticsCommand cmd = new CosmeticsCommand(this, manager, petManager, petTypes, listener);
        for (String name : new String[]{"title", "chatcolor", "particles", "pet", "trail"}) {
            var c = getCommand(name);
            if (c != null) { c.setExecutor(cmd); c.setTabCompleter(cmd); }
        }
        getLogger().info("CosmeticsPlugin enabled.");
    }

    @Override
    public void onDisable() {}

    public static CosmeticsPlugin getInstance() { return instance; }
    public CosmeticsManager getManager() { return manager; }
    public PetManager getPetManager() { return petManager; }
    public PetTypes getPetTypes() { return petTypes; }
}
