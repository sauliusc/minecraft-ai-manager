package io.craftcontrol.bridge;

import fi.iki.elonen.NanoHTTPD;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;

public class BridgeServer extends NanoHTTPD {

    private static final String JSON = "application/json";

    private final BridgePlugin plugin;
    private final byte[] secretBytes;

    public BridgeServer(String bind, int port, String secret, BridgePlugin plugin) {
        super(bind, port);
        this.plugin = plugin;
        this.secretBytes = secret.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public Response serve(IHTTPSession session) {
        String incoming = session.getHeaders().get("x-bridge-secret");
        if (!constantTimeEquals(incoming, secretBytes)) {
            plugin.getLogger().warning("Rejected unauthorized request from " + session.getRemoteIpAddress());
            return newFixedLengthResponse(Response.Status.FORBIDDEN, JSON, "{\"error\":\"FORBIDDEN\"}");
        }

        String uri = session.getUri();
        Method method = session.getMethod();

        if (Method.GET.equals(method) && "/bridge/health".equals(uri)) {
            return newFixedLengthResponse(Response.Status.OK, JSON, "{\"status\":\"ok\"}");
        }

        if (Method.POST.equals(method) && "/bridge/rewards/grant".equals(uri)) {
            return handleGrantReward(session);
        }

        return newFixedLengthResponse(Response.Status.NOT_FOUND, JSON, "{\"error\":\"NOT_FOUND\"}");
    }

    private Response handleGrantReward(IHTTPSession session) {
        try {
            Map<String, String> body = new HashMap<>();
            session.parseBody(body);
            String json = body.getOrDefault("postData", "{}");
            plugin.getServer().getScheduler().runTask(plugin, () ->
                    plugin.getLogger().info("Reward grant dispatched: " + json));
            return newFixedLengthResponse(Response.Status.ACCEPTED, JSON, "{\"status\":\"queued\"}");
        } catch (IOException | ResponseException e) {
            plugin.getLogger().severe("Failed to parse reward grant body: " + e.getMessage());
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, JSON, "{\"error\":\"INTERNAL_ERROR\"}");
        }
    }

    private static boolean constantTimeEquals(String incoming, byte[] expected) {
        if (incoming == null) return false;
        byte[] incomingBytes = incoming.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(incomingBytes, expected);
    }
}
