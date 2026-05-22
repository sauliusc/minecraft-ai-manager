package io.craftcontrol.economy;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.command.*;
import org.bukkit.entity.Player;

public class PayCommand implements CommandExecutor {
    private final EconomyManager economy;
    private final EconomyPlugin plugin;

    public PayCommand(EconomyPlugin plugin, EconomyManager economy) {
        this.plugin = plugin;
        this.economy = economy;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Only players can use this command.");
            return true;
        }
        if (args.length < 2) {
            player.sendMessage(Component.text("Usage: /pay <player> <amount>", NamedTextColor.RED));
            return true;
        }
        Player target = Bukkit.getPlayer(args[0]);
        if (target == null) {
            player.sendMessage(Component.text("Player not found.", NamedTextColor.RED));
            return true;
        }
        long amount;
        try {
            amount = Long.parseLong(args[1]);
            if (amount <= 0) throw new NumberFormatException();
        } catch (NumberFormatException e) {
            player.sendMessage(Component.text("Amount must be a positive number.", NamedTextColor.RED));
            return true;
        }
        long[] bal = economy.getBalance(player.getName());
        if (bal[0] < amount) {
            player.sendMessage(Component.text("Insufficient Coins.", NamedTextColor.RED));
            return true;
        }
        // Capture names before going async — Player references can become invalid
        // if either participant disconnects before the async callback fires.
        final java.util.UUID senderUuid = player.getUniqueId();
        final java.util.UUID targetUuid = target.getUniqueId();
        final String targetName = target.getName();
        final String senderName = player.getName();

        player.sendMessage(Component.text("Processing transfer…", NamedTextColor.GRAY));
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            economy.transferCoins(
                senderName,
                targetName,
                amount,
                () -> plugin.getServer().getScheduler().runTask(plugin, () -> {
                    Player senderPlayer = Bukkit.getPlayer(senderUuid);
                    Player receiver = Bukkit.getPlayer(targetUuid);
                    if (senderPlayer != null)
                        senderPlayer.sendMessage(Component.text("Sent " + amount + " Coins to " + targetName + ".", NamedTextColor.GREEN));
                    if (receiver != null)
                        receiver.sendMessage(Component.text("You received " + amount + " Coins from " + senderName + "!", NamedTextColor.GREEN));
                }),
                err -> plugin.getServer().getScheduler().runTask(plugin, () -> {
                    Player senderPlayer = Bukkit.getPlayer(senderUuid);
                    if (senderPlayer != null)
                        senderPlayer.sendMessage(Component.text(err, NamedTextColor.RED));
                })
            )
        );
        return true;
    }
}
