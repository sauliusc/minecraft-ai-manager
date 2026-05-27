package io.craftcontrol.moderation;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.command.*;
import org.bukkit.entity.Player;

import java.util.Arrays;

public class ModerationCommand implements CommandExecutor {

    private final ModerationPlugin plugin;
    private final ModerationManager modManager;
    private final ReportManager reportManager;

    public ModerationCommand(ModerationPlugin plugin, ModerationManager modManager, ReportManager reportManager) {
        this.plugin = plugin;
        this.modManager = modManager;
        this.reportManager = reportManager;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        switch (cmd.getName().toLowerCase()) {
            case "report" -> handleReport(sender, args);
            case "block" -> handleBlock(sender, args);
            case "unblock" -> handleUnblock(sender, args);
            case "safechat" -> handleSafechat(sender);
            case "mute" -> handleMute(sender, args);
            case "unmute" -> handleUnmute(sender, args);
            case "kick" -> handleKick(sender, args);
            case "ban" -> handleBan(sender, args);
            case "unban" -> handleUnban(sender, args);
            default -> sender.sendMessage(Component.text("Unknown command.", NamedTextColor.RED));
        }
        return true;
    }

    private void handleReport(CommandSender sender, String[] args) {
        if (!(sender instanceof Player player)) { sender.sendMessage(Component.text("Only players can use this.")); return; }
        if (args.length < 2) { player.sendMessage(Component.text("Usage: /report <player> <reason>", NamedTextColor.RED)); return; }
        Player target = plugin.getServer().getPlayer(args[0]);
        if (target == null) { player.sendMessage(Component.text("Player not online.", NamedTextColor.RED)); return; }
        if (target.equals(player)) { player.sendMessage(Component.text("You cannot report yourself.", NamedTextColor.RED)); return; }
        String reason = String.join(" ", Arrays.copyOfRange(args, 1, args.length));
        reportManager.submitReport(player, target, reason);
    }

    private void handleBlock(CommandSender sender, String[] args) {
        if (!(sender instanceof Player player)) { sender.sendMessage(Component.text("Only players can use this.")); return; }
        if (args.length < 1) { player.sendMessage(Component.text("Usage: /block <player>", NamedTextColor.RED)); return; }
        Player target = plugin.getServer().getPlayer(args[0]);
        if (target == null) { player.sendMessage(Component.text("Player not online.", NamedTextColor.RED)); return; }
        if (target.equals(player)) { player.sendMessage(Component.text("You cannot block yourself.", NamedTextColor.RED)); return; }
        modManager.blockPlayer(player, target);
        player.sendMessage(Component.text("You have blocked " + target.getName() + ".", NamedTextColor.YELLOW));
    }

    private void handleUnblock(CommandSender sender, String[] args) {
        if (!(sender instanceof Player player)) { sender.sendMessage(Component.text("Only players can use this.")); return; }
        if (args.length < 1) { player.sendMessage(Component.text("Usage: /unblock <player>", NamedTextColor.RED)); return; }
        Player target = plugin.getServer().getPlayer(args[0]);
        if (target == null) { player.sendMessage(Component.text("Player not online.", NamedTextColor.RED)); return; }
        modManager.unblockPlayer(player, target);
        player.sendMessage(Component.text("You have unblocked " + target.getName() + ".", NamedTextColor.GREEN));
    }

    private void handleSafechat(CommandSender sender) {
        if (!(sender instanceof Player player)) { sender.sendMessage(Component.text("Only players can use this.")); return; }
        boolean current = modManager.isSafechatEnabled(player.getUniqueId());
        modManager.setSafechat(player, !current);
        player.sendMessage(Component.text("Safe chat " + (!current ? "enabled" : "disabled") + ".", !current ? NamedTextColor.GREEN : NamedTextColor.YELLOW));
    }

    private void handleMute(CommandSender sender, String[] args) {
        if (!sender.hasPermission("craftcontrol.mod")) { sender.sendMessage(Component.text("No permission.", NamedTextColor.RED)); return; }
        if (!(sender instanceof Player player)) { sender.sendMessage(Component.text("Only players can use this.")); return; }
        if (args.length < 3) { player.sendMessage(Component.text("Usage: /mute <player> <duration> <reason>", NamedTextColor.RED)); return; }
        Player target = plugin.getServer().getPlayer(args[0]);
        if (target == null) { player.sendMessage(Component.text("Player not online.", NamedTextColor.RED)); return; }
        String duration = args[1];
        String reason = String.join(" ", Arrays.copyOfRange(args, 2, args.length));
        modManager.adminMute(player, target, duration, reason);
        player.sendMessage(Component.text("Muted " + target.getName() + " for " + duration + ".", NamedTextColor.GREEN));
    }

    private void handleUnmute(CommandSender sender, String[] args) {
        if (!sender.hasPermission("craftcontrol.mod")) { sender.sendMessage(Component.text("No permission.", NamedTextColor.RED)); return; }
        if (!(sender instanceof Player player)) { sender.sendMessage(Component.text("Only players can use this.")); return; }
        if (args.length < 1) { player.sendMessage(Component.text("Usage: /unmute <player>", NamedTextColor.RED)); return; }
        Player target = plugin.getServer().getPlayer(args[0]);
        if (target == null) { player.sendMessage(Component.text("Player not online.", NamedTextColor.RED)); return; }
        modManager.adminUnmute(player, target);
        player.sendMessage(Component.text("Unmuted " + target.getName() + ".", NamedTextColor.GREEN));
    }

    private void handleKick(CommandSender sender, String[] args) {
        if (!sender.hasPermission("craftcontrol.mod")) { sender.sendMessage(Component.text("No permission.", NamedTextColor.RED)); return; }
        if (!(sender instanceof Player player)) { sender.sendMessage(Component.text("Only players can use this.")); return; }
        if (args.length < 2) { player.sendMessage(Component.text("Usage: /kick <player> <reason>", NamedTextColor.RED)); return; }
        Player target = plugin.getServer().getPlayer(args[0]);
        if (target == null) { player.sendMessage(Component.text("Player not online.", NamedTextColor.RED)); return; }
        String reason = String.join(" ", Arrays.copyOfRange(args, 1, args.length));
        modManager.adminKick(player, target, reason);
        player.sendMessage(Component.text("Kicked " + target.getName() + ".", NamedTextColor.GREEN));
    }

    private void handleBan(CommandSender sender, String[] args) {
        if (!sender.hasPermission("craftcontrol.mod")) { sender.sendMessage(Component.text("No permission.", NamedTextColor.RED)); return; }
        if (!(sender instanceof Player player)) { sender.sendMessage(Component.text("Only players can use this.")); return; }
        if (args.length < 3) { player.sendMessage(Component.text("Usage: /ban <player> <duration> <reason>", NamedTextColor.RED)); return; }
        Player target = plugin.getServer().getPlayer(args[0]);
        if (target == null) { player.sendMessage(Component.text("Player not online.", NamedTextColor.RED)); return; }
        String duration = args[1];
        String reason = String.join(" ", Arrays.copyOfRange(args, 2, args.length));
        modManager.adminBan(player, target, duration, reason);
        player.sendMessage(Component.text("Banned " + target.getName() + " for " + duration + ".", NamedTextColor.GREEN));
    }

    private void handleUnban(CommandSender sender, String[] args) {
        if (!sender.hasPermission("craftcontrol.mod")) { sender.sendMessage(Component.text("No permission.", NamedTextColor.RED)); return; }
        if (!(sender instanceof Player player)) { sender.sendMessage(Component.text("Only players can use this.")); return; }
        if (args.length < 1) { player.sendMessage(Component.text("Usage: /unban <player>", NamedTextColor.RED)); return; }
        String targetName = args[0];
        modManager.adminUnban(player, targetName);
        player.sendMessage(Component.text("Unbanned " + targetName + ".", NamedTextColor.GREEN));
    }
}
