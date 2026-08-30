package io.craftcontrol.stats;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.bridge.VanillaStats;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.io.IOException;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/** {@code /stats [player]} — the player's own numbers, in game. */
public class StatsCommand implements CommandExecutor, TabCompleter {

    private final StatsPlugin plugin;

    public StatsCommand(StatsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command cmd, String label, String[] args) {
        if (args.length != 1) return List.of();
        String prefix = args[0].toLowerCase();
        List<String> names = new ArrayList<>();
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (p.getName().toLowerCase().startsWith(prefix)) names.add(p.getName());
        }
        return names;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player viewer)) {
            sender.sendMessage(Component.text("Only players can use this command."));
            return true;
        }

        String target = args.length > 0 ? args[0] : viewer.getName();
        OfflinePlayer subject = args.length > 0
            ? Bukkit.getOfflinePlayerIfCached(target)
            : viewer;

        if (subject == null || (!subject.hasPlayedBefore() && !subject.isOnline())) {
            viewer.sendMessage(Component.text("No player called " + target + " has played here.",
                NamedTextColor.YELLOW));
            return true;
        }

        // Vanilla statistics are local, so the panel can be built without waiting
        // on the network; only the CraftControl half needs a round trip.
        VanillaStats stats = new VanillaStats(subject);
        String name = subject.getName() != null ? subject.getName() : target;

        ApiClient api = api();
        if (api == null) {
            send(viewer, name, stats, null);
            return true;
        }
        api.get("/players/" + name + "/stats", new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                JsonObject json = null;
                try (response) {
                    if (response.isSuccessful() && response.body() != null) {
                        json = JsonParser.parseString(response.body().string()).getAsJsonObject();
                    }
                } catch (Exception e) {
                    plugin.getLogger().warning("Failed to read stats for " + name + ": " + e.getMessage());
                }
                final JsonObject payload = json;
                Bukkit.getScheduler().runTask(plugin, () -> send(viewer, name, stats, payload));
            }

            @Override
            public void onFailure(Call call, IOException e) {
                // The vanilla half is still worth showing when the API is down.
                Bukkit.getScheduler().runTask(plugin, () -> send(viewer, name, stats, null));
            }
        });
        return true;
    }

    private void send(Player viewer, String name, VanillaStats stats, JsonObject cc) {
        if (!viewer.isOnline()) return;
        VanillaStats.Totals totals = stats.totals();

        viewer.sendMessage(Component.text("═══ " + name + " ═══", NamedTextColor.GOLD));

        if (cc != null) {
            int joins = asInt(cc, "joinCount", 0);
            line(viewer, "Coins", StatsFormat.number(asInt(cc, "coins", 0)));
            line(viewer, "Rank", StatsFormat.tier(joins) + " (" + joins + " joins)");
            long days = StatsFormat.daysBetween(epoch(cc, "firstJoinAt"), System.currentTimeMillis());
            line(viewer, "On the server", days + (days == 1 ? " day" : " days"));
            line(viewer, "Login streak", asInt(cc, "currentStreak", 0)
                + " (best " + asInt(cc, "longestStreak", 0) + ")");
            int challenges = asInt(cc, "challengesCompleted", 0);
            if (challenges > 0) line(viewer, "Challenges done", String.valueOf(challenges));
            int spent = asInt(cc, "coinsSpentInShop", 0);
            if (spent > 0) line(viewer, "Spent in shop", StatsFormat.number(spent) + " coins");
            if (cc.has("clan") && cc.get("clan").isJsonObject()) {
                JsonObject clan = cc.getAsJsonObject("clan");
                line(viewer, "Clan", clan.get("name").getAsString()
                    + " [" + clan.get("tag").getAsString() + "]");
            }
        } else {
            viewer.sendMessage(Component.text("  (coins and streak unavailable right now)",
                NamedTextColor.DARK_GRAY));
        }

        line(viewer, "Time played", StatsFormat.duration(stats.playTicks()));
        line(viewer, "Blocks mined", StatsFormat.number(totals.mined()));
        line(viewer, "Diamond ore", StatsFormat.number(totals.diamondOre()));
        line(viewer, "Items crafted", StatsFormat.number(totals.crafted()));
        line(viewer, "Mobs killed", StatsFormat.number(stats.mobKills()));
        if (stats.playerKills() > 0) {
            line(viewer, "Players killed", StatsFormat.number(stats.playerKills()));
        }
        line(viewer, "Deaths", StatsFormat.number(stats.deaths())
            + "  (K/D " + StatsFormat.killDeathRatio(stats.mobKills(), stats.deaths()) + ")");
        line(viewer, "Since last death", StatsFormat.duration(stats.timeSinceDeath()));
        line(viewer, "Distance", StatsFormat.distance(stats.travelledCm()));
        line(viewer, "Damage dealt", StatsFormat.hearts(stats.damageDealt()) + " hearts");
        line(viewer, "Jumps", StatsFormat.number(stats.jumps()));

        if (stats.fishCaught() > 0)     line(viewer, "Fish caught", StatsFormat.number(stats.fishCaught()));
        if (stats.animalsBred() > 0)    line(viewer, "Animals bred", StatsFormat.number(stats.animalsBred()));
        if (stats.villagerTrades() > 0) line(viewer, "Villager trades", StatsFormat.number(stats.villagerTrades()));
        if (stats.itemsEnchanted() > 0) line(viewer, "Items enchanted", StatsFormat.number(stats.itemsEnchanted()));
    }

    private static void line(Player to, String label, String value) {
        to.sendMessage(Component.text("  " + label + ": ", NamedTextColor.GRAY)
            .append(Component.text(value, NamedTextColor.WHITE)));
    }

    private static int asInt(JsonObject o, String key, int fallback) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsInt() : fallback;
    }

    private static long epoch(JsonObject o, String key) {
        if (!o.has(key) || o.get(key).isJsonNull()) return 0;
        try {
            return Instant.parse(o.get(key).getAsString()).toEpochMilli();
        } catch (DateTimeParseException e) {
            return 0;
        }
    }

    private ApiClient api() {
        BridgePlugin bridge = BridgePlugin.getInstance();
        return bridge == null ? null : bridge.getApiClient();
    }
}
