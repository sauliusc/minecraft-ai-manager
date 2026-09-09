package io.craftcontrol.bridge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerChatEvent;

import java.io.IOException;
import java.util.Locale;

/**
 * Answers when a player says ServerGod's name in chat.
 *
 * <p>Listens at MONITOR and ignores cancelled events, so a message the
 * moderation filter blocked never reaches the AI — a muted player should not be
 * able to talk to it, and a message worth blocking is not worth answering.
 *
 * <p>The reply is produced by the API and simply displayed here. Nothing about
 * what it may say is decided in the plugin.
 */
public class ServerGodListener implements Listener {

    private final BridgePlugin plugin;
    private final DeathTracker deaths;
    private final String botName;

    public ServerGodListener(BridgePlugin plugin, DeathTracker deaths, String botName) {
        this.plugin = plugin;
        this.deaths = deaths;
        this.botName = botName;
    }

    @SuppressWarnings("deprecation")
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onChat(AsyncPlayerChatEvent event) {
        String message = event.getMessage();
        if (!mentionsBot(message)) return;

        Player player = event.getPlayer();
        JsonObject body = new JsonObject();
        body.addProperty("username", player.getName());
        body.addProperty("message", message);

        DeathTracker.Death death = deaths.recentDeath(player.getUniqueId());
        if (death != null) body.addProperty("recentDeath", death.cause());

        // Already off the main thread — this is the async chat event — but the
        // HTTP call still gets its own callback so chat is never held up waiting
        // for a language model.
        plugin.getApiClient().post("/servergod/mention", body.toString(), new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                // Deliberately silent. A server that answers "the AI is down" every
                // time somebody says its name is worse than one that says nothing.
                plugin.getLogger().fine("ServerGod mention failed: " + e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                try (Response r = response) {
                    if (!r.isSuccessful() || r.body() == null) return;
                    JsonObject json = JsonParser.parseString(r.body().string()).getAsJsonObject();
                    if (!json.has("reply")) return;   // rate limited, or nothing to say
                    String reply = json.get("reply").getAsString();
                    if (!reply.isBlank()) broadcast(reply);
                } catch (Exception e) {
                    plugin.getLogger().warning("ServerGod reply could not be read: " + e.getMessage());
                }
            }
        });
    }

    /** Whether the message names the bot, however it was capitalised. */
    boolean mentionsBot(String message) {
        return message != null && message.toLowerCase(Locale.ROOT).contains(botName.toLowerCase(Locale.ROOT));
    }

    /**
     * Shows a line in chat as the bot.
     *
     * <p>Built as a Component rather than by concatenating strings, so the reply
     * text cannot carry its own colour codes or pretend to be part of the prefix.
     */
    void broadcast(String reply) {
        Component line = Component.text("[" + botName + "] ", NamedTextColor.LIGHT_PURPLE, TextDecoration.BOLD)
            .append(Component.text(reply, NamedTextColor.WHITE));
        Bukkit.getServer().sendMessage(line);
    }
}
