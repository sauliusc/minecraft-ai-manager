package io.craftcontrol.greeter;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

public class GreeterCommand implements CommandExecutor {

    private final GreeterPlugin plugin;

    public GreeterCommand(GreeterPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 1 && "reload".equalsIgnoreCase(args[0])) {
            plugin.reloadConfig();
            sender.sendMessage("§aGreeterPlugin config reloaded.");
            return true;
        }
        sender.sendMessage("§cUsage: /greeter reload");
        return false;
    }
}
