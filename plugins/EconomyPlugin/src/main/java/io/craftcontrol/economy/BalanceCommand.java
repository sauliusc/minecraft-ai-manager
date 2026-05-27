package io.craftcontrol.economy;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.command.*;
import org.bukkit.entity.Player;

public class BalanceCommand implements CommandExecutor {
    private final EconomyManager economy;

    public BalanceCommand(EconomyManager economy) { this.economy = economy; }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Component.text("Only players can use this command."));
            return true;
        }
        String targetId = player.getName();
        long[] bal = economy.getBalance(targetId);
        player.sendMessage(Component.text("Balance: ", NamedTextColor.YELLOW)
            .append(Component.text(bal[0] + " Coins", NamedTextColor.GOLD))
            .append(Component.text(" | ", NamedTextColor.GRAY))
            .append(Component.text(bal[1] + " Crystals", NamedTextColor.AQUA)));
        // Async refresh for next time
        EconomyPlugin.getInstance().getServer().getScheduler()
            .runTaskAsynchronously(EconomyPlugin.getInstance(), () -> economy.fetchBalance(targetId));
        return true;
    }
}
