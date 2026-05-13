package io.craftcontrol.clan;

import com.google.gson.*;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.clan.model.ClanData;
import io.craftcontrol.clan.war.ActiveWar;
import io.craftcontrol.clan.war.WarManager;
import io.craftcontrol.clan.war.WarType;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.*;
import org.bukkit.command.*;
import org.bukkit.entity.Player;
import java.io.IOException;

public class ClanCommand implements CommandExecutor {
    private final ClanPlugin plugin;
    private final ClanManager manager;
    private final Gson gson = new Gson();

    public ClanCommand(ClanPlugin plugin, ClanManager manager) {
        this.plugin = plugin;
        this.manager = manager;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Only players can use this command.");
            return true;
        }
        if (args.length == 0) {
            player.sendMessage(Component.text("Usage: /clan <create|invite|join|leave|home|sethome|chat|info|war>", NamedTextColor.YELLOW));
            return true;
        }
        switch (args[0].toLowerCase()) {
            case "create" -> handleCreate(player, args);
            case "invite" -> handleInvite(player, args);
            case "join" -> handleJoin(player, args);
            case "leave" -> handleLeave(player);
            case "home" -> handleHome(player);
            case "sethome" -> handleSetHome(player);
            case "chat" -> handleChat(player);
            case "info" -> handleInfo(player);
            case "war" -> handleWar(player, args);
            default -> player.sendMessage(Component.text("Unknown subcommand.", NamedTextColor.RED));
        }
        return true;
    }

    private void handleCreate(Player player, String[] args) {
        if (args.length < 3) {
            player.sendMessage(Component.text("Usage: /clan create <name> <tag>", NamedTextColor.RED));
            return;
        }
        if (manager.isInClan(player.getUniqueId().toString())) {
            player.sendMessage(Component.text("You are already in a clan.", NamedTextColor.RED));
            return;
        }
        String name = args[1];
        String tag = args[2];
        int maxTag = plugin.getConfig().getInt("clan.max_tag_length", 5);
        if (tag.length() > maxTag) {
            player.sendMessage(Component.text("Tag too long (max " + maxTag + " chars).", NamedTextColor.RED));
            return;
        }
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) { player.sendMessage(Component.text("Service unavailable.", NamedTextColor.RED)); return; }
        String json = String.format("{\"name\":\"%s\",\"tag\":\"%s\",\"leaderId\":\"%s\"}",
            name, tag, player.getUniqueId());
        player.sendMessage(Component.text("Creating clan…", NamedTextColor.GRAY));
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans", json, new Callback() {
                @Override
                public void onResponse(Call call, Response response) {
                    response.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (response.isSuccessful()) {
                            manager.fetchClan(player.getUniqueId().toString());
                            player.sendMessage(Component.text("Clan [" + tag + "] " + name + " created!", NamedTextColor.GREEN));
                        } else if (response.code() == 402) {
                            player.sendMessage(Component.text("Insufficient Coins (requires " +
                                plugin.getConfig().getInt("clan.creation_cost", 500) + ").", NamedTextColor.RED));
                        } else {
                            player.sendMessage(Component.text("Failed to create clan.", NamedTextColor.RED));
                        }
                    });
                }
                @Override public void onFailure(Call call, IOException e) {
                    plugin.getServer().getScheduler().runTask(plugin, () ->
                        player.sendMessage(Component.text("Service unavailable.", NamedTextColor.RED)));
                }
            })
        );
    }

    private void handleInvite(Player player, String[] args) {
        if (args.length < 2) { player.sendMessage(Component.text("Usage: /clan invite <player>", NamedTextColor.RED)); return; }
        if (!manager.isInClan(player.getUniqueId().toString())) {
            player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return;
        }
        org.bukkit.entity.Player target = plugin.getServer().getPlayer(args[1]);
        if (target == null) { player.sendMessage(Component.text("Player not online.", NamedTextColor.RED)); return; }
        String clanId = manager.getClanId(player.getUniqueId().toString());
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        String json = String.format("{\"clanId\":\"%s\",\"inviterId\":\"%s\",\"inviteeId\":\"%s\"}",
            clanId, player.getUniqueId(), target.getUniqueId());
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans/" + clanId + "/invites", json, new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) {
                            player.sendMessage(Component.text("Invite sent to " + target.getName() + ".", NamedTextColor.GREEN));
                            target.sendMessage(Component.text("You've been invited to join clan [" + manager.getClan(clanId).tag() + "]. Use /clan join " + clanId + " to accept.", NamedTextColor.AQUA));
                        } else {
                            player.sendMessage(Component.text("Failed to send invite.", NamedTextColor.RED));
                        }
                    });
                }
                @Override public void onFailure(Call call, IOException e) {}
            })
        );
    }

    private void handleJoin(Player player, String[] args) {
        if (args.length < 2) { player.sendMessage(Component.text("Usage: /clan join <clan-id>", NamedTextColor.RED)); return; }
        if (manager.isInClan(player.getUniqueId().toString())) {
            player.sendMessage(Component.text("Leave your current clan first.", NamedTextColor.RED)); return;
        }
        String clanId = args[1];
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        String json = String.format("{\"playerId\":\"%s\"}", player.getUniqueId());
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans/" + clanId + "/members", json, new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) {
                            manager.fetchClan(player.getUniqueId().toString());
                            player.sendMessage(Component.text("Joined clan!", NamedTextColor.GREEN));
                        } else if (r.code() == 403) {
                            player.sendMessage(Component.text("No invite or clan is private.", NamedTextColor.RED));
                        } else {
                            player.sendMessage(Component.text("Failed to join.", NamedTextColor.RED));
                        }
                    });
                }
                @Override public void onFailure(Call call, IOException e) {}
            })
        );
    }

    private void handleLeave(Player player) {
        String uuid = player.getUniqueId().toString();
        if (!manager.isInClan(uuid)) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        String clanId = manager.getClanId(uuid);
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        String json = String.format("{\"playerId\":\"%s\"}", uuid);
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans/" + clanId + "/leave", json, new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) {
                            manager.invalidate(uuid);
                            player.sendMessage(Component.text("You left the clan.", NamedTextColor.YELLOW));
                        } else {
                            player.sendMessage(Component.text("Failed to leave.", NamedTextColor.RED));
                        }
                    });
                }
                @Override public void onFailure(Call call, IOException e) {}
            })
        );
    }

    private void handleHome(Player player) {
        String uuid = player.getUniqueId().toString();
        ClanData clan = manager.getClanByPlayer(uuid);
        if (clan == null) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        if (manager.isHomeCoolingDown(uuid)) {
            player.sendMessage(Component.text("Clan home on cooldown. " + manager.getCooldownRemaining(uuid) + "s remaining.", NamedTextColor.RED));
            return;
        }
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        api.get("/clans/" + clan.id() + "/home", new Callback() {
            @Override public void onResponse(Call call, Response r) {
                try (r) {
                    if (!r.isSuccessful() || r.body() == null) {
                        plugin.getServer().getScheduler().runTask(plugin, () ->
                            player.sendMessage(Component.text("Clan home not set.", NamedTextColor.RED)));
                        return;
                    }
                    JsonObject o = gson.fromJson(r.body().string(), JsonObject.class);
                    double x = o.get("x").getAsDouble(), y = o.get("y").getAsDouble(), z = o.get("z").getAsDouble();
                    String worldName = o.get("world").getAsString();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        org.bukkit.World world = plugin.getServer().getWorld(worldName);
                        if (world == null) { player.sendMessage(Component.text("Home world not found.", NamedTextColor.RED)); return; }
                        player.teleport(new org.bukkit.Location(world, x, y, z));
                        manager.setHomeCooldown(uuid, plugin.getConfig().getInt("clan.home_cooldown_seconds", 60));
                        player.sendMessage(Component.text("Teleported to clan home.", NamedTextColor.GREEN));
                    });
                } catch (IOException e) {
                    plugin.getServer().getScheduler().runTask(plugin, () ->
                        player.sendMessage(Component.text("Failed to get clan home.", NamedTextColor.RED)));
                }
            }
            @Override public void onFailure(Call call, IOException e) {}
        });
    }

    private void handleSetHome(Player player) {
        String uuid = player.getUniqueId().toString();
        ClanData clan = manager.getClanByPlayer(uuid);
        if (clan == null) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        if (!clan.leaderId().equals(uuid)) {
            player.sendMessage(Component.text("Only the clan leader can set home.", NamedTextColor.RED)); return;
        }
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        org.bukkit.Location loc = player.getLocation();
        String json = String.format("{\"world\":\"%s\",\"x\":%.2f,\"y\":%.2f,\"z\":%.2f}",
            loc.getWorld().getName(), loc.getX(), loc.getY(), loc.getZ());
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans/" + clan.id() + "/home", json, new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) player.sendMessage(Component.text("Clan home set!", NamedTextColor.GREEN));
                        else player.sendMessage(Component.text("Failed to set home.", NamedTextColor.RED));
                    });
                }
                @Override public void onFailure(Call call, IOException e) {}
            })
        );
    }

    private void handleChat(Player player) {
        String uuid = player.getUniqueId().toString();
        if (!manager.isInClan(uuid)) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        manager.toggleClanChat(uuid);
        boolean enabled = manager.isClanChatEnabled(uuid);
        player.sendMessage(Component.text("Clan chat " + (enabled ? "enabled" : "disabled") + ".", enabled ? NamedTextColor.GREEN : NamedTextColor.YELLOW));
    }

    private void handleInfo(Player player) {
        ClanData clan = manager.getClanByPlayer(player.getUniqueId().toString());
        if (clan == null) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        player.sendMessage(Component.text("═══ Clan Info ═══", NamedTextColor.GOLD));
        player.sendMessage(Component.text("Name: " + clan.name() + " [" + clan.tag() + "]", NamedTextColor.WHITE));
        player.sendMessage(Component.text("Level: " + clan.level() + " | XP: " + clan.xp(), NamedTextColor.AQUA));
        player.sendMessage(Component.text("Members: " + clan.memberIds().size(), NamedTextColor.WHITE));
    }

    private void handleWar(Player player, String[] args) {
        if (args.length < 3) {
            player.sendMessage(Component.text("Usage: /clan war challenge <clan-id> <TERRITORY_CONTROL|RESOURCE_RACE|KILL_COUNT>", NamedTextColor.RED));
            return;
        }
        if ("challenge".equalsIgnoreCase(args[1])) {
            String uuid = player.getUniqueId().toString();
            if (!manager.isInClan(uuid)) { player.sendMessage(Component.text("Not in a clan.", NamedTextColor.RED)); return; }
            String myClanId = manager.getClanId(uuid);
            String targetClanId = args[2];
            WarType type;
            try { type = WarType.valueOf(args.length > 3 ? args[3].toUpperCase() : "KILL_COUNT"); }
            catch (IllegalArgumentException e) { player.sendMessage(Component.text("Unknown war type.", NamedTextColor.RED)); return; }

            WarManager wm = plugin.getWarManager();
            if (wm.isInWar(myClanId) || wm.isInWar(targetClanId)) {
                player.sendMessage(Component.text("A clan is already in a war.", NamedTextColor.RED)); return;
            }
            long duration = plugin.getConfig().getLong("war.duration_ms", 600_000L); // 10 min default
            long target = plugin.getConfig().getLong("war.resource_target", 100L);
            String mat = plugin.getConfig().getString("war.resource_material", "DIAMOND_ORE");
            double radius = plugin.getConfig().getDouble("war.zone_radius", 50.0);
            org.bukkit.Location zone = player.getLocation(); // use challenger's current location as zone center
            wm.challengeClan(myClanId, targetClanId, type, duration, target, mat, zone, radius);
            player.sendMessage(Component.text("War challenge sent! War type: " + type.name(), NamedTextColor.GOLD));
        } else if ("status".equalsIgnoreCase(args[1])) {
            String clanId = manager.getClanId(player.getUniqueId().toString());
            if (clanId == null) { player.sendMessage(Component.text("Not in a clan.", NamedTextColor.RED)); return; }
            WarManager wm = plugin.getWarManager();
            ActiveWar war = wm.getWarForClan(clanId);
            if (war == null) { player.sendMessage(Component.text("No active war.", NamedTextColor.YELLOW)); return; }
            long remaining = Math.max(0, (war.endsAtMs - System.currentTimeMillis()) / 1000);
            player.sendMessage(Component.text("War: " + war.type.name() + " | Score: " + war.clan1Score.get() + " vs " + war.clan2Score.get() + " | " + remaining + "s left", NamedTextColor.AQUA));
        } else {
            player.sendMessage(Component.text("Usage: /clan war <challenge|status> [args]", NamedTextColor.RED));
        }
    }
}
