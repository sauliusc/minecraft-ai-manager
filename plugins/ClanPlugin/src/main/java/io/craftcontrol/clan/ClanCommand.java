package io.craftcontrol.clan;

import com.google.gson.*;
import com.google.gson.JsonParser;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.clan.model.ClanData;
import io.craftcontrol.clan.war.ActiveWar;
import io.craftcontrol.clan.war.WarManager;
import io.craftcontrol.clan.war.WarType;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.*;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.*;
import org.bukkit.entity.Player;
import java.io.IOException;
import java.util.List;
import java.util.UUID;

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
            player.sendMessage(Component.text("Usage: /clan <create|invite|accept|deny|join|leave|members|kick|promote|demote|disband|home|sethome|chat|info|list|war>", NamedTextColor.YELLOW));
            return true;
        }
        switch (args[0].toLowerCase()) {
            case "create"  -> handleCreate(player, args);
            case "invite"  -> handleInvite(player, args);
            case "accept"  -> handleAccept(player, args);
            case "deny"    -> handleDeny(player, args);
            case "join"    -> handleJoin(player, args);
            case "leave"   -> handleLeave(player);
            case "members" -> handleMembers(player);
            case "kick"    -> handleKick(player, args);
            case "promote" -> handlePromote(player, args);
            case "demote"  -> handleDemote(player, args);
            case "disband" -> handleDisband(player, args);
            case "home"    -> handleHome(player);
            case "sethome" -> handleSetHome(player);
            case "chat"    -> handleChat(player);
            case "info"    -> handleInfo(player);
            case "list"    -> handleList(player);
            case "war"     -> handleWar(player, args);
            default -> player.sendMessage(Component.text("Unknown subcommand.", NamedTextColor.RED));
        }
        return true;
    }

    // ── /clan create <name> <tag> ─────────────────────────────────────────────

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
        JsonObject createBody = new JsonObject();
        createBody.addProperty("name", name);
        createBody.addProperty("tag", tag);
        createBody.addProperty("leaderId", player.getUniqueId().toString());
        player.sendMessage(Component.text("Creating clan…", NamedTextColor.GRAY));
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans", gson.toJson(createBody), new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    String err = readErrorBody(r);
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) {
                            manager.fetchClan(player.getUniqueId().toString());
                            player.sendMessage(Component.text("Clan [" + tag + "] " + name + " created!", NamedTextColor.GREEN));
                        } else if (r.code() == 402) {
                            player.sendMessage(Component.text("Insufficient Coins (requires " +
                                plugin.getConfig().getInt("clan.creation_cost", 500) + ").", NamedTextColor.RED));
                        } else {
                            player.sendMessage(Component.text("Failed to create clan: " + extractMessage(err), NamedTextColor.RED));
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

    // ── /clan invite <player> ─────────────────────────────────────────────────

    private void handleInvite(Player player, String[] args) {
        if (args.length < 2) { player.sendMessage(Component.text("Usage: /clan invite <player>", NamedTextColor.RED)); return; }
        String uuid = player.getUniqueId().toString();
        if (!manager.isInClan(uuid)) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        Player target = plugin.getServer().getPlayer(args[1]);
        if (target == null) { player.sendMessage(Component.text("Player not online.", NamedTextColor.RED)); return; }
        if (manager.isInClan(target.getUniqueId().toString())) {
            player.sendMessage(Component.text(target.getName() + " is already in a clan.", NamedTextColor.RED)); return;
        }
        String clanId = manager.getClanId(uuid);
        ClanData clan = manager.getClan(clanId);
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        JsonObject body = new JsonObject();
        body.addProperty("clanId", clanId);
        body.addProperty("inviterId", uuid);
        body.addProperty("inviteeId", target.getUniqueId().toString());
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans/" + clanId + "/invites", gson.toJson(body), new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    String err = readErrorBody(r);
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) {
                            String clanTag  = clan != null ? clan.tag()  : clanId.substring(0, 6);
                            String clanName = clan != null ? clan.name() : "Unknown";
                            manager.addPendingInvite(target.getUniqueId().toString(), clanId, clanTag, clanName);
                            player.sendMessage(Component.text("Invite sent to " + target.getName() + ".", NamedTextColor.GREEN));
                            target.sendMessage(Component.text("You've been invited to clan [" + clanTag + "] " + clanName + "!", NamedTextColor.AQUA));
                            target.sendMessage(Component.text("  /clan accept " + clanTag + "  or  /clan deny " + clanTag, NamedTextColor.YELLOW));
                        } else {
                            player.sendMessage(Component.text("Failed to send invite: " + extractMessage(err), NamedTextColor.RED));
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

    // ── /clan accept [tag] ────────────────────────────────────────────────────

    private void handleAccept(Player player, String[] args) {
        String uuid = player.getUniqueId().toString();
        if (manager.isInClan(uuid)) { player.sendMessage(Component.text("Leave your current clan first.", NamedTextColor.RED)); return; }
        String[] invite = args.length >= 2
                ? manager.getPendingInvite(uuid, args[1])
                : manager.getFirstPendingInvite(uuid);
        if (invite == null) {
            List<String[]> all = manager.getPendingInvites(uuid);
            if (all.isEmpty()) {
                player.sendMessage(Component.text("You have no pending clan invites.", NamedTextColor.RED));
            } else {
                player.sendMessage(Component.text("Multiple invites pending — specify a tag:", NamedTextColor.YELLOW));
                all.forEach(inv -> player.sendMessage(Component.text("  /clan accept " + inv[1] + "  (" + inv[2] + ")", NamedTextColor.WHITE)));
            }
            return;
        }
        String clanId   = invite[0];
        String clanTag  = invite[1];
        String clanName = invite[2];
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        JsonObject body = new JsonObject();
        body.addProperty("playerId", uuid);
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans/" + clanId + "/members", gson.toJson(body), new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    String err = readErrorBody(r);
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) {
                            manager.removePendingInvite(uuid, clanId);
                            manager.fetchClan(uuid);
                            player.sendMessage(Component.text("Joined clan [" + clanTag + "] " + clanName + "!", NamedTextColor.GREEN));
                        } else if (r.code() == 403) {
                            manager.removePendingInvite(uuid, clanId);
                            player.sendMessage(Component.text("Invite expired or no longer valid.", NamedTextColor.RED));
                        } else {
                            player.sendMessage(Component.text("Failed to join clan: " + extractMessage(err), NamedTextColor.RED));
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

    // ── /clan deny [tag] ──────────────────────────────────────────────────────

    private void handleDeny(Player player, String[] args) {
        String uuid = player.getUniqueId().toString();
        String[] invite = args.length >= 2
                ? manager.getPendingInvite(uuid, args[1])
                : manager.getFirstPendingInvite(uuid);
        if (invite == null) {
            player.sendMessage(Component.text("No matching invite found.", NamedTextColor.RED)); return;
        }
        manager.removePendingInvite(uuid, invite[0]);
        player.sendMessage(Component.text("Declined invite from [" + invite[1] + "] " + invite[2] + ".", NamedTextColor.YELLOW));
    }

    // ── /clan join <clan-id> ──────────────────────────────────────────────────
    // Kept for backward compat / public clan direct-join.

    private void handleJoin(Player player, String[] args) {
        if (args.length < 2) { player.sendMessage(Component.text("Usage: /clan join <clan-id>", NamedTextColor.RED)); return; }
        if (manager.isInClan(player.getUniqueId().toString())) {
            player.sendMessage(Component.text("Leave your current clan first.", NamedTextColor.RED)); return;
        }
        String clanId = args[1];
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        JsonObject body = new JsonObject();
        body.addProperty("playerId", player.getUniqueId().toString());
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans/" + clanId + "/members", gson.toJson(body), new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    String err = readErrorBody(r);
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) {
                            manager.clearPendingInvites(player.getUniqueId().toString());
                            manager.fetchClan(player.getUniqueId().toString());
                            player.sendMessage(Component.text("Joined clan!", NamedTextColor.GREEN));
                        } else if (r.code() == 403) {
                            player.sendMessage(Component.text("No invite or clan is not public.", NamedTextColor.RED));
                        } else {
                            player.sendMessage(Component.text("Failed to join: " + extractMessage(err), NamedTextColor.RED));
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

    // ── /clan leave ───────────────────────────────────────────────────────────

    private void handleLeave(Player player) {
        String uuid = player.getUniqueId().toString();
        if (!manager.isInClan(uuid)) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        String clanId = manager.getClanId(uuid);
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        JsonObject body = new JsonObject();
        body.addProperty("playerId", uuid);
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans/" + clanId + "/leave", gson.toJson(body), new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    String err = readErrorBody(r);
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) {
                            manager.invalidate(uuid);
                            player.sendMessage(Component.text("You left the clan.", NamedTextColor.YELLOW));
                        } else {
                            player.sendMessage(Component.text("Failed to leave: " + extractMessage(err), NamedTextColor.RED));
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

    // ── /clan members ─────────────────────────────────────────────────────────

    private void handleMembers(Player player) {
        String uuid = player.getUniqueId().toString();
        ClanData clan = manager.getClanByPlayer(uuid);
        if (clan == null) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        player.sendMessage(Component.text("══ [" + clan.tag() + "] " + clan.name() + " — Members ══", NamedTextColor.GOLD));
        for (String memberId : clan.memberIds()) {
            boolean isLeader = memberId.equals(clan.leaderId());
            Component role = isLeader
                    ? Component.text("[L] ", NamedTextColor.GOLD)
                    : Component.text("[M] ", NamedTextColor.GRAY);
            Player online = null;
            try { online = plugin.getServer().getPlayer(UUID.fromString(memberId)); }
            catch (IllegalArgumentException ignored) {}
            if (online != null) {
                player.sendMessage(role
                        .append(Component.text(online.getName(), NamedTextColor.GREEN))
                        .append(Component.text(" (online)", NamedTextColor.DARK_GREEN)));
            } else {
                OfflinePlayer off = plugin.getServer().getOfflinePlayer(UUID.fromString(memberId));
                String name = off.getName() != null ? off.getName() : memberId.substring(0, 8) + "…";
                player.sendMessage(role
                        .append(Component.text(name, NamedTextColor.GRAY))
                        .append(Component.text(" (offline)", NamedTextColor.DARK_GRAY)));
            }
        }
        player.sendMessage(Component.text("Total: " + clan.memberIds().size() + " member(s)", NamedTextColor.YELLOW));
    }

    // ── /clan kick <player> ───────────────────────────────────────────────────

    private void handleKick(Player player, String[] args) {
        if (args.length < 2) { player.sendMessage(Component.text("Usage: /clan kick <player>", NamedTextColor.RED)); return; }
        String uuid = player.getUniqueId().toString();
        ClanData clan = manager.getClanByPlayer(uuid);
        if (clan == null) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        if (!clan.leaderId().equals(uuid)) {
            player.sendMessage(Component.text("Only the clan leader can kick members.", NamedTextColor.RED)); return;
        }
        OfflinePlayer target = resolveOfflinePlayer(args[1]);
        if (target == null) { player.sendMessage(Component.text("Player not found.", NamedTextColor.RED)); return; }
        String targetId = target.getUniqueId().toString();
        if (targetId.equals(uuid)) { player.sendMessage(Component.text("You cannot kick yourself.", NamedTextColor.RED)); return; }
        if (!clan.memberIds().contains(targetId)) {
            player.sendMessage(Component.text(args[1] + " is not in your clan.", NamedTextColor.RED)); return;
        }
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        JsonObject body = new JsonObject();
        body.addProperty("playerId", targetId);
        body.addProperty("kickerId", uuid);
        String displayName = target.getName() != null ? target.getName() : args[1];
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans/" + clan.id() + "/kick", gson.toJson(body), new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    String err = readErrorBody(r);
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) {
                            manager.invalidate(targetId);
                            manager.fetchClan(uuid);
                            player.sendMessage(Component.text(displayName + " was kicked from the clan.", NamedTextColor.YELLOW));
                            Player onlineTarget = plugin.getServer().getPlayer(target.getUniqueId());
                            if (onlineTarget != null)
                                onlineTarget.sendMessage(Component.text("You were kicked from clan [" + clan.tag() + "].", NamedTextColor.RED));
                        } else {
                            player.sendMessage(Component.text("Failed to kick player: " + extractMessage(err), NamedTextColor.RED));
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

    // ── /clan promote <player> ────────────────────────────────────────────────

    private void handlePromote(Player player, String[] args) {
        if (args.length < 2) { player.sendMessage(Component.text("Usage: /clan promote <player>", NamedTextColor.RED)); return; }
        handleRoleChange(player, args[1], "OFFICER");
    }

    // ── /clan demote <player> ─────────────────────────────────────────────────

    private void handleDemote(Player player, String[] args) {
        if (args.length < 2) { player.sendMessage(Component.text("Usage: /clan demote <player>", NamedTextColor.RED)); return; }
        handleRoleChange(player, args[1], "MEMBER");
    }

    private void handleRoleChange(Player player, String targetName, String newRole) {
        String uuid = player.getUniqueId().toString();
        ClanData clan = manager.getClanByPlayer(uuid);
        if (clan == null) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        if (!clan.leaderId().equals(uuid)) {
            player.sendMessage(Component.text("Only the clan leader can change member roles.", NamedTextColor.RED)); return;
        }
        OfflinePlayer target = resolveOfflinePlayer(targetName);
        if (target == null) { player.sendMessage(Component.text("Player not found.", NamedTextColor.RED)); return; }
        String targetId = target.getUniqueId().toString();
        if (!clan.memberIds().contains(targetId)) {
            player.sendMessage(Component.text(targetName + " is not in your clan.", NamedTextColor.RED)); return;
        }
        if (targetId.equals(uuid)) { player.sendMessage(Component.text("You cannot change your own role.", NamedTextColor.RED)); return; }
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        JsonObject body = new JsonObject();
        body.addProperty("role", newRole);
        String displayName = target.getName() != null ? target.getName() : targetName;
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.patch("/clans/" + clan.id() + "/members/" + targetId, gson.toJson(body), new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    String err = readErrorBody(r);
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) {
                            player.sendMessage(Component.text(displayName + " is now " + newRole + ".", NamedTextColor.GREEN));
                            Player onlineTarget = plugin.getServer().getPlayer(target.getUniqueId());
                            if (onlineTarget != null)
                                onlineTarget.sendMessage(Component.text("Your clan role was changed to " + newRole + ".", NamedTextColor.AQUA));
                        } else {
                            player.sendMessage(Component.text("Failed to change role: " + extractMessage(err), NamedTextColor.RED));
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

    // ── /clan disband [confirm] ───────────────────────────────────────────────

    private void handleDisband(Player player, String[] args) {
        String uuid = player.getUniqueId().toString();
        ClanData clan = manager.getClanByPlayer(uuid);
        if (clan == null) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        if (!clan.leaderId().equals(uuid)) {
            player.sendMessage(Component.text("Only the clan leader can disband the clan.", NamedTextColor.RED)); return;
        }
        boolean confirmed = args.length >= 2 && "confirm".equalsIgnoreCase(args[1]);
        if (!confirmed) {
            manager.requestDisband(uuid);
            player.sendMessage(Component.text("⚠ This will permanently disband [" + clan.tag() + "] " + clan.name()
                    + " and remove all " + clan.memberIds().size() + " member(s)!", NamedTextColor.RED));
            player.sendMessage(Component.text("Type /clan disband confirm to proceed.", NamedTextColor.YELLOW));
            return;
        }
        if (!manager.checkAndConsumeDisband(uuid)) {
            player.sendMessage(Component.text("Run /clan disband first, then confirm within the same session.", NamedTextColor.RED));
            return;
        }
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        List<String> memberSnapshot = List.copyOf(clan.memberIds());
        String clanTag = clan.tag();
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans/" + clan.id() + "/disband", "{}", new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    String err = readErrorBody(r);
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) {
                            for (String mid : memberSnapshot) {
                                manager.invalidate(mid);
                                try {
                                    Player member = plugin.getServer().getPlayer(UUID.fromString(mid));
                                    if (member != null)
                                        member.sendMessage(Component.text("Clan [" + clanTag + "] has been disbanded.", NamedTextColor.RED));
                                } catch (IllegalArgumentException ignored) {}
                            }
                            player.sendMessage(Component.text("Clan disbanded.", NamedTextColor.YELLOW));
                        } else {
                            player.sendMessage(Component.text("Failed to disband clan: " + extractMessage(err), NamedTextColor.RED));
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

    // ── /clan home ────────────────────────────────────────────────────────────

    private void handleHome(Player player) {
        String uuid = player.getUniqueId().toString();
        ClanData clan = manager.getClanByPlayer(uuid);
        if (clan == null) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        if (manager.isHomeCoolingDown(uuid)) {
            player.sendMessage(Component.text("Clan home on cooldown — " + manager.getCooldownRemaining(uuid) + "s remaining.", NamedTextColor.RED));
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

    // ── /clan sethome ─────────────────────────────────────────────────────────

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
        JsonObject body = new JsonObject();
        body.addProperty("world", loc.getWorld().getName());
        body.addProperty("x", loc.getX());
        body.addProperty("y", loc.getY());
        body.addProperty("z", loc.getZ());
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/clans/" + clan.id() + "/home", gson.toJson(body), new Callback() {
                @Override public void onResponse(Call call, Response r) {
                    String err = readErrorBody(r);
                    r.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (r.isSuccessful()) player.sendMessage(Component.text("Clan home set!", NamedTextColor.GREEN));
                        else player.sendMessage(Component.text("Failed to set home: " + extractMessage(err), NamedTextColor.RED));
                    });
                }
                @Override public void onFailure(Call call, IOException e) {
                    plugin.getServer().getScheduler().runTask(plugin, () ->
                        player.sendMessage(Component.text("Service unavailable.", NamedTextColor.RED)));
                }
            })
        );
    }

    // ── /clan chat ────────────────────────────────────────────────────────────

    private void handleChat(Player player) {
        String uuid = player.getUniqueId().toString();
        if (!manager.isInClan(uuid)) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        manager.toggleClanChat(uuid);
        boolean on = manager.isClanChatEnabled(uuid);
        player.sendMessage(Component.text("Clan chat " + (on ? "enabled" : "disabled") + ".", on ? NamedTextColor.GREEN : NamedTextColor.YELLOW));
    }

    // ── /clan info ────────────────────────────────────────────────────────────

    private void handleInfo(Player player) {
        ClanData clan = manager.getClanByPlayer(player.getUniqueId().toString());
        if (clan == null) { player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED)); return; }
        player.sendMessage(Component.text("═══ Clan Info ═══", NamedTextColor.GOLD));
        player.sendMessage(Component.text("Name: " + clan.name() + " [" + clan.tag() + "]", NamedTextColor.WHITE));
        player.sendMessage(Component.text("Level: " + clan.level() + " | XP: " + clan.xp(), NamedTextColor.AQUA));
        player.sendMessage(Component.text("Members: " + clan.memberIds().size(), NamedTextColor.WHITE));
    }

    // ── /clan list ────────────────────────────────────────────────────────────

    private void handleList(Player player) {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;
        api.get("/clans", new Callback() {
            @Override public void onResponse(Call call, Response r) {
                try (r) {
                    if (!r.isSuccessful() || r.body() == null) {
                        plugin.getServer().getScheduler().runTask(plugin, () ->
                            player.sendMessage(Component.text("Failed to fetch clan list.", NamedTextColor.RED)));
                        return;
                    }
                    JsonArray arr = gson.fromJson(r.body().string(), JsonArray.class);
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (arr.isEmpty()) { player.sendMessage(Component.text("No clans exist yet. Be the first!", NamedTextColor.YELLOW)); return; }
                        player.sendMessage(Component.text("═══ Clans (" + arr.size() + ") ═══", NamedTextColor.GOLD));
                        for (JsonElement el : arr) {
                            JsonObject o = el.getAsJsonObject();
                            String clanName    = o.get("name").getAsString();
                            String clanTag     = o.get("tag").getAsString();
                            int    level       = o.has("level")       ? o.get("level").getAsInt()       : 1;
                            int    memberCount = o.has("memberCount") ? o.get("memberCount").getAsInt() : 0;
                            player.sendMessage(Component.text("[" + clanTag + "] ", NamedTextColor.GOLD)
                                    .append(Component.text(clanName, NamedTextColor.WHITE))
                                    .append(Component.text(" Lv." + level + " · " + memberCount + " member(s)", NamedTextColor.GRAY)));
                        }
                        player.sendMessage(Component.text("Ask a clan member for an invite, then use /clan accept.", NamedTextColor.YELLOW));
                    });
                } catch (IOException e) {
                    plugin.getServer().getScheduler().runTask(plugin, () ->
                        player.sendMessage(Component.text("Failed to parse clan list.", NamedTextColor.RED)));
                }
            }
            @Override public void onFailure(Call call, IOException e) {}
        });
    }

    // ── /clan war ─────────────────────────────────────────────────────────────

    private void handleWar(Player player, String[] args) {
        if (args.length < 2) {
            player.sendMessage(Component.text("Usage: /clan war <challenge|status> [args]", NamedTextColor.RED)); return;
        }
        if ("challenge".equalsIgnoreCase(args[1])) {
            if (args.length < 3) {
                player.sendMessage(Component.text("Usage: /clan war challenge <clan-id> [TERRITORY_CONTROL|RESOURCE_RACE|KILL_COUNT]", NamedTextColor.RED)); return;
            }
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
            long duration = plugin.getConfig().getLong("war.duration_ms", 600_000L);
            long target   = plugin.getConfig().getLong("war.resource_target", 100L);
            String mat    = plugin.getConfig().getString("war.resource_material", "DIAMOND_ORE");
            double radius = plugin.getConfig().getDouble("war.zone_radius", 50.0);
            wm.challengeClan(myClanId, targetClanId, type, duration, target, mat, player.getLocation(), radius);
            player.sendMessage(Component.text("War challenge sent! Type: " + type.name(), NamedTextColor.GOLD));
        } else if ("status".equalsIgnoreCase(args[1])) {
            String clanId = manager.getClanId(player.getUniqueId().toString());
            if (clanId == null) { player.sendMessage(Component.text("Not in a clan.", NamedTextColor.RED)); return; }
            ActiveWar war = plugin.getWarManager().getWarForClan(clanId);
            if (war == null) { player.sendMessage(Component.text("No active war.", NamedTextColor.YELLOW)); return; }
            long remaining = Math.max(0, (war.endsAtMs - System.currentTimeMillis()) / 1000);
            player.sendMessage(Component.text("War: " + war.type.name()
                    + " | Score: " + war.clan1Score.get() + " vs " + war.clan2Score.get()
                    + " | " + remaining + "s left", NamedTextColor.AQUA));
        } else {
            player.sendMessage(Component.text("Usage: /clan war <challenge|status> [args]", NamedTextColor.RED));
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Resolve an online-or-offline player by name. Returns null if unknown. */
    @SuppressWarnings("deprecation")
    private OfflinePlayer resolveOfflinePlayer(String name) {
        Player online = plugin.getServer().getPlayer(name);
        if (online != null) return online;
        OfflinePlayer off = plugin.getServer().getOfflinePlayer(name);
        return off.hasPlayedBefore() ? off : null;
    }

    /** Extract the "message" field from an API JSON error body, or return the raw snippet. */
    private static String extractMessage(String body) {
        if (body == null || body.isBlank()) return "server error";
        try {
            JsonObject obj = JsonParser.parseString(body).getAsJsonObject();
            return obj.has("message") ? obj.get("message").getAsString()
                                      : body.substring(0, Math.min(120, body.length()));
        } catch (Exception e) {
            return body.substring(0, Math.min(120, body.length()));
        }
    }

    /** Read error body before closing the response, for use in error callbacks. */
    private static String readErrorBody(Response r) {
        if (r.isSuccessful() || r.body() == null) return "";
        try { return r.body().string(); } catch (IOException e) { return ""; }
    }
}
