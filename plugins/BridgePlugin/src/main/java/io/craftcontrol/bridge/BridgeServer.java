package io.craftcontrol.bridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import fi.iki.elonen.NanoHTTPD;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;

public class BridgeServer extends NanoHTTPD {

    private static final String JSON_MIME = "application/json";

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
            return newFixedLengthResponse(Response.Status.FORBIDDEN, JSON_MIME, "{\"error\":\"FORBIDDEN\"}");
        }

        String uri = session.getUri();
        Method method = session.getMethod();

        if (Method.GET.equals(method) && "/bridge/health".equals(uri)) {
            return newFixedLengthResponse(Response.Status.OK, JSON_MIME, "{\"status\":\"ok\"}");
        }

        if (Method.POST.equals(method) && "/bridge/rewards/grant".equals(uri)) {
            return handleGrantReward(session);
        }

        return newFixedLengthResponse(Response.Status.NOT_FOUND, JSON_MIME, "{\"error\":\"NOT_FOUND\"}");
    }

    private Response handleGrantReward(IHTTPSession session) {
        try {
            Map<String, String> body = new HashMap<>();
            session.parseBody(body);
            String json = body.getOrDefault("postData", "{}");

            JsonObject obj;
            try {
                obj = JsonParser.parseString(json).getAsJsonObject();
            } catch (Exception e) {
                plugin.getLogger().warning("Invalid reward grant JSON: " + e.getMessage());
                return newFixedLengthResponse(Response.Status.BAD_REQUEST, JSON_MIME, "{\"error\":\"BAD_REQUEST\"}");
            }

            String playerId   = obj.has("playerId")   ? obj.get("playerId").getAsString()   : null;
            String rewardType = obj.has("rewardType") ? obj.get("rewardType").getAsString() : "";
            JsonObject config = obj.has("config") && obj.get("config").isJsonObject()
                                ? obj.getAsJsonObject("config") : new JsonObject();

            plugin.getLogger().info("Reward grant dispatched: " + json);

            // CURRENCY is credited server-side (DB update in rewards.ts) — nothing to do in-game
            if ("CURRENCY".equalsIgnoreCase(rewardType)) {
                return newFixedLengthResponse(Response.Status.ACCEPTED, JSON_MIME,
                    "{\"status\":\"ok\",\"delivered\":false,\"reason\":\"currency handled server-side\"}");
            }

            if (playerId == null) {
                return newFixedLengthResponse(Response.Status.BAD_REQUEST, JSON_MIME,
                    "{\"error\":\"missing playerId\"}");
            }

            final String pid = playerId;
            final String type = rewardType;
            final JsonObject cfg = config;

            plugin.getServer().getScheduler().runTask(plugin, () -> {
                Player player = plugin.getServer().getPlayerExact(pid);
                if (player == null || !player.isOnline()) {
                    plugin.getLogger().info("Player " + pid + " is offline — reward will be delivered on next login");
                    return;
                }
                deliverToPlayer(player, type, cfg);
            });

            return newFixedLengthResponse(Response.Status.ACCEPTED, JSON_MIME,
                "{\"status\":\"ok\",\"delivered\":true}");

        } catch (IOException | ResponseException e) {
            plugin.getLogger().severe("Failed to parse reward grant body: " + e.getMessage());
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, JSON_MIME,
                "{\"error\":\"INTERNAL_ERROR\"}");
        }
    }

    private void deliverToPlayer(Player player, String rewardType, JsonObject config) {
        try {
            switch (rewardType.toUpperCase()) {
                case "ITEM" -> {
                    String mat = config.has("material") ? config.get("material").getAsString() : "DIAMOND";
                    int amount = config.has("amount") ? config.get("amount").getAsInt() : 1;
                    ItemStack item = new ItemStack(Material.valueOf(mat), amount);
                    Map<Integer, ItemStack> overflow = player.getInventory().addItem(item);
                    overflow.values().forEach(i -> player.getWorld().dropItemNaturally(player.getLocation(), i));
                    player.sendMessage(Component.text("✦ You received: " + amount + "x " + mat, NamedTextColor.GREEN));
                }
                case "XP" -> {
                    int amount = config.has("amount") ? config.get("amount").getAsInt() : 100;
                    player.giveExp(amount);
                    player.sendMessage(Component.text("✦ You received " + amount + " XP!", NamedTextColor.GREEN));
                }
                case "COMMAND" -> {
                    String cmd = config.has("command") ? config.get("command").getAsString() : "";
                    if (!cmd.isBlank()) {
                        String resolved = cmd.replace("{player}", player.getName());
                        Bukkit.dispatchCommand(Bukkit.getConsoleSender(), resolved);
                    }
                    player.sendMessage(Component.text("✦ Reward applied!", NamedTextColor.GREEN));
                }
                default -> plugin.getLogger().warning("Unknown reward type for live delivery: " + rewardType);
            }
            plugin.getLogger().info("Delivered " + rewardType + " reward to online player " + player.getName());
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to deliver " + rewardType + " reward to " + player.getName()
                + ": " + e.getMessage());
        }
    }

    private static boolean constantTimeEquals(String incoming, byte[] expected) {
        if (incoming == null) return false;
        byte[] incomingBytes = incoming.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(incomingBytes, expected);
    }
}
