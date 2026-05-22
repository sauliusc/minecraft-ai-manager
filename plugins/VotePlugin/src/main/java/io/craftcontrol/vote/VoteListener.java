package io.craftcontrol.vote;

import io.craftcontrol.bridge.BridgePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

import java.io.IOException;

public class VoteListener implements Listener {

    private final VotePlugin plugin;

    public VoteListener(VotePlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        BridgePlugin.getInstance().getApiClient().get("/vote/pending/" + player.getName(), new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                plugin.getLogger().fine("Could not check pending votes for " + player.getName() + ": " + e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                try (response) {
                    if (response.code() == 200) {
                        plugin.getServer().getScheduler().runTask(plugin, () -> {
                            if (player.isOnline()) {
                                player.sendMessage(Component.text(
                                        "§6[Vote] §eYou have a pending vote reward! Use §f/voteclaim §eto collect it.",
                                        NamedTextColor.YELLOW));
                            }
                        });
                    }
                }
            }
        });
    }
}
