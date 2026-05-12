package io.craftcontrol.bridge;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

public class BridgePlugin extends JavaPlugin {

    private static BridgePlugin instance;
    private ApiClient apiClient;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();

        FileConfiguration cfg = getConfig();
        apiClient = new ApiClient(
                cfg.getString("api.base_url", "http://10.10.10.20:3000/api"),
                cfg.getString("api.service_token", ""),
                cfg.getLong("api.timeout_ms", 5000L),
                cfg.getInt("api.retry_max", 3),
                cfg.getLong("api.retry_backoff_ms", 500L)
        );

        getLogger().info("BridgePlugin enabled.");
    }

    @Override
    public void onDisable() {
        if (apiClient != null) {
            apiClient.shutdown();
        }
        getLogger().info("BridgePlugin disabled.");
    }

    public static BridgePlugin getInstance() {
        return instance;
    }

    public ApiClient getApiClient() {
        return apiClient;
    }
}
