package io.craftcontrol.moderation;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import io.craftcontrol.bridge.BridgePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.entity.Player;
import org.bukkit.event.*;
import org.bukkit.event.player.*;

import java.io.IOException;
import java.util.UUID;

public class ModerationListener implements Listener {

    private final ModerationPlugin plugin;
    private final ChatFilterManager filterManager;
    private final ReportManager reportManager;
    private final ModerationManager modManager;

    public ModerationListener(ModerationPlugin plugin, ChatFilterManager filterManager,
                              ReportManager reportManager, ModerationManager modManager) {
        this.plugin = plugin;
        this.filterManager = filterManager;
        this.reportManager = reportManager;
        this.modManager = modManager;
    }

    @SuppressWarnings("deprecation")
    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onChat(AsyncPlayerChatEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();
        String message = event.getMessage();

        if (modManager.isMuted(uuid)) {
            event.setCancelled(true);
            long remaining = (modManager.getMuteExpiryMs(uuid) - System.currentTimeMillis()) / 1000;
            player.sendMessage(Component.text("You are muted. " + remaining + "s remaining.", NamedTextColor.RED));
            return;
        }

        ChatFilterManager.FilterResult result = filterManager.filter(player, message);

        switch (result) {
            case BLOCK_PII -> {
                event.setCancelled(true);
                String redacted = filterManager.redactPii(message);
                event.setMessage(redacted);
                event.setCancelled(false);
                player.sendMessage(Component.text("Personal information was removed from your message.", NamedTextColor.YELLOW));
            }
            case WARN -> {
                String censored = filterManager.censorWords(message);
                event.setMessage(censored);
            }
            case MUTE, TEMPBAN -> event.setCancelled(true);
            case ALLOW -> {}
        }

        String finalMessage = event.isCancelled() ? message : event.getMessage();
        reportManager.appendChat(uuid, player.getName(), finalMessage);

        if (!event.isCancelled()) {
            filterRecipients(event, player);
        }
    }

    @SuppressWarnings("deprecation")
    private void filterRecipients(AsyncPlayerChatEvent event, Player sender) {
        event.getRecipients().removeIf(recipient -> {
            if (modManager.isBlocked(recipient.getUniqueId(), sender.getUniqueId())) return true;
            if (modManager.isSafechatEnabled(recipient.getUniqueId())) return true;
            return false;
        });
    }

    @EventHandler
    public void onLogin(PlayerLoginEvent event) {
        Player player = event.getPlayer();
        if (plugin.getServer().getBanList(org.bukkit.BanList.Type.NAME).isBanned(player.getName())) {
            event.disallow(PlayerLoginEvent.Result.KICK_BANNED,
                Component.text("You are banned from this server.", NamedTextColor.RED));
        }
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();
        if (modManager.isMuted(uuid)) {
            long remaining = (modManager.getMuteExpiryMs(uuid) - System.currentTimeMillis()) / 1000;
            player.sendMessage(Component.text(
                "You are still muted. " + remaining + "s remaining.", NamedTextColor.RED));
        }
        // Notify reporter if any of their reports were resolved since last session
        notifyResolvedReports(player);
    }

    private void notifyResolvedReports(Player player) {
        if (BridgePlugin.getInstance() == null) return;
        String playerId = player.getUniqueId().toString();
        // Check reports resolved in last 30 days (covers any offline period)
        String endpoint = "/api/moderation/reports/resolved/" + playerId;
        BridgePlugin.getInstance().getApiClient().get(endpoint, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) { /* non-critical */ }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                try (response) {
                    if (!response.isSuccessful() || response.body() == null) return;
                    JsonArray arr = JsonParser.parseString(response.body().string()).getAsJsonArray();
                    if (arr.isEmpty()) return;
                    int count = arr.size();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (!player.isOnline()) return;
                        player.sendActionBar(Component.text(
                            count + " of your report(s) have been resolved. Thank you!",
                            NamedTextColor.GREEN));
                        player.sendMessage(Component.text(
                            "§a" + count + " report(s) you submitted have been reviewed and resolved.",
                            NamedTextColor.GREEN));
                    });
                }
            }
        });
    }
}
