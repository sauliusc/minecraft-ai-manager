package io.craftcontrol.bridge;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.MediaType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BridgeServerTest {

    private static final String SECRET = "test-secret-value";
    private static final int PORT = 25590;

    private BridgeServer server;
    private OkHttpClient http;

    @BeforeEach
    void setUp() throws IOException {
        BridgePlugin plugin = mock(BridgePlugin.class);
        var logger = java.util.logging.Logger.getLogger("BridgeServerTest");
        when(plugin.getLogger()).thenReturn(logger);

        var scheduler = mock(org.bukkit.scheduler.BukkitScheduler.class);
        var bukkitServer = mock(org.bukkit.Server.class);
        when(plugin.getServer()).thenReturn(bukkitServer);
        when(bukkitServer.getScheduler()).thenReturn(scheduler);

        server = new BridgeServer("localhost", PORT, SECRET, plugin);
        server.start(fi.iki.elonen.NanoHTTPD.SOCKET_READ_TIMEOUT, false);
        http = new OkHttpClient();
    }

    @AfterEach
    void tearDown() {
        server.stop();
    }

    @Test
    void health_returnsOk_withCorrectSecret() throws IOException {
        Request request = new Request.Builder()
                .url("http://localhost:" + PORT + "/bridge/health")
                .header("X-Bridge-Secret", SECRET)
                .get()
                .build();

        try (Response response = http.newCall(request).execute()) {
            assertEquals(200, response.code());
            assertTrue(response.body().string().contains("ok"));
        }
    }

    @Test
    void health_returns403_withWrongSecret() throws IOException {
        Request request = new Request.Builder()
                .url("http://localhost:" + PORT + "/bridge/health")
                .header("X-Bridge-Secret", "wrong-secret")
                .get()
                .build();

        try (Response response = http.newCall(request).execute()) {
            assertEquals(403, response.code());
        }
    }

    @Test
    void health_returns403_withoutSecret() throws IOException {
        Request request = new Request.Builder()
                .url("http://localhost:" + PORT + "/bridge/health")
                .get()
                .build();

        try (Response response = http.newCall(request).execute()) {
            assertEquals(403, response.code());
        }
    }

    @Test
    void unknownRoute_returns404() throws IOException {
        Request request = new Request.Builder()
                .url("http://localhost:" + PORT + "/bridge/unknown")
                .header("X-Bridge-Secret", SECRET)
                .get()
                .build();

        try (Response response = http.newCall(request).execute()) {
            assertEquals(404, response.code());
        }
    }

    @Test
    void grantReward_returns202_withValidPayload() throws IOException {
        RequestBody body = RequestBody.create("{\"playerId\":\"uuid-123\",\"reward\":\"DIAMOND\"}", MediaType.get("application/json"));
        Request request = new Request.Builder()
                .url("http://localhost:" + PORT + "/bridge/rewards/grant")
                .header("X-Bridge-Secret", SECRET)
                .post(body)
                .build();

        try (Response response = http.newCall(request).execute()) {
            assertEquals(202, response.code());
        }
    }
}
