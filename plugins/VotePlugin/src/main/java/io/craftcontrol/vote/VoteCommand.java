package io.craftcontrol.vote;

import io.craftcontrol.bridge.BridgePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import java.io.IOException;
import java.util.List;
import java.util.Map;

public class VoteCommand implements CommandExecutor {

    private final VotePlugin plugin;

    public VoteCommand(VotePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("This command is for players only.");
            return true;
        }

        if (command.getName().equalsIgnoreCase("vote")) {
            handleVote(player);
        } else if (command.getName().equalsIgnoreCase("voteclaim")) {
            handleVoteClaim(player);
        }
        return true;
    }

    private void handleVote(Player player) {
        List<Map<?, ?>> sites = plugin.getConfig().getMapList("vote_sites");
        player.sendMessage(Component.text("§6§l=== Vote for our server! ===", NamedTextColor.GOLD));
        if (sites.isEmpty()) {
            player.sendMessage(Component.text("§7No vote sites configured.", NamedTextColor.GRAY));
            return;
        }
        for (Map<?, ?> site : sites) {
            String name = String.valueOf(site.get("name"));
            String url = String.valueOf(site.get("url"));
            player.sendMessage(Component.text("§e" + name + ": §f" + url, NamedTextColor.YELLOW));
        }
        player.sendMessage(Component.text("§7After voting, use §f/voteclaim §7to receive your reward!", NamedTextColor.GRAY));
    }

    private void handleVoteClaim(Player player) {
        player.sendMessage(Component.text("§eClaiming your vote reward...", NamedTextColor.YELLOW));
        String json = "{\"uuid\":\"" + player.getUniqueId() + "\",\"playerName\":\"" + player.getName() + "\"}";
        BridgePlugin.getInstance().getApiClient().post("/api/vote/claim", json, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                plugin.getServer().getScheduler().runTask(plugin, () ->
                        player.sendMessage(Component.text("§cFailed to claim vote reward. Please try again later.", NamedTextColor.RED)));
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                try (response) {
                    int code = response.code();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (code == 200) {
                            player.sendMessage(Component.text("§aVote reward claimed! Thank you for voting!", NamedTextColor.GREEN));
                        } else if (code == 404) {
                            player.sendMessage(Component.text("§cNo pending vote reward found. Make sure you voted first!", NamedTextColor.RED));
                        } else if (code == 409) {
                            player.sendMessage(Component.text("§cYou already claimed your vote reward recently.", NamedTextColor.RED));
                        } else {
                            player.sendMessage(Component.text("§cUnexpected error (" + code + "). Please try again later.", NamedTextColor.RED));
                        }
                    });
                }
            }
        });
    }
}
