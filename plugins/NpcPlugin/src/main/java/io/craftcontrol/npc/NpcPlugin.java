package io.craftcontrol.npc;

import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import org.bukkit.plugin.java.JavaPlugin;

public class NpcPlugin extends JavaPlugin {
    private NpcManager npcManager;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        npcManager = new NpcManager(this, api);
        npcManager.start();
        getServer().getPluginManager().registerEvents(new NpcListener(npcManager), this);
        getLogger().info("NpcPlugin enabled — syncing NPCs from API.");
    }

    @Override
    public void onDisable() {
        if (npcManager != null) npcManager.despawnAll();
    }

    public NpcManager getNpcManager() { return npcManager; }
}
