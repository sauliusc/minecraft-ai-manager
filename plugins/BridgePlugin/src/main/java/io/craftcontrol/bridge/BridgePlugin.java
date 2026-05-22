package io.craftcontrol.bridge;

import fi.iki.elonen.NanoHTTPD;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.IOException;

public class BridgePlugin extends JavaPlugin {

    private static BridgePlugin instance;
    private ApiClient apiClient;
    private BridgeServer bridgeServer;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();

        FileConfiguration cfg = getConfig();

        String serviceToken = System.getenv("BRIDGE_SECRET");
        if (serviceToken == null || serviceToken.isEmpty()) {
            serviceToken = cfg.getString("api.service_token", "");
        }

        apiClient = new ApiClient(
                cfg.getString("api.base_url", "http://10.10.10.20:3000/api"),
                serviceToken,
                cfg.getLong("api.timeout_ms", 5000L),
                cfg.getInt("api.retry_max", 3),
                cfg.getLong("api.retry_backoff_ms", 500L),
                getLogger()
        );

        String bind = cfg.getString("bridge.bind", "0.0.0.0");
        int port = cfg.getInt("bridge.port", 25580);
        String secret = System.getenv("BRIDGE_SECRET");
        if (secret == null || secret.isEmpty()) {
            secret = cfg.getString("bridge.secret", "");
        }

        bridgeServer = new BridgeServer(bind, port, secret, this);
        try {
            bridgeServer.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
            getLogger().info("Bridge inbound server listening on " + bind + ":" + port);
        } catch (IOException e) {
            getLogger().severe("Failed to start bridge server: " + e.getMessage());
        }

        getLogger().info("CraftControl BridgePlugin v" + getDescription().getVersion() + " enabled.");
    }

    @Override
    public void onDisable() {
        if (bridgeServer != null && bridgeServer.isAlive()) {
            bridgeServer.stop();
        }
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
