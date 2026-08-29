package io.craftcontrol.economy;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.economy.model.ShopEntry;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * {@code /shop} — opens the server shop.
 *
 * <p>The catalogue is fetched fresh each time rather than cached, because an
 * admin can change a price in the dashboard at any moment and a player should
 * never be shown a price the server will not honour.
 */
public class ShopCommand implements CommandExecutor {

    private final EconomyPlugin plugin;
    private final EconomyManager economy;
    private final ShopMenu menu;

    public ShopCommand(EconomyPlugin plugin, EconomyManager economy, ShopMenu menu) {
        this.plugin = plugin;
        this.economy = economy;
        this.menu = menu;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Component.text("Only players can use this command."));
            return true;
        }
        ApiClient api = api();
        if (api == null) {
            player.sendMessage(Component.text("Shop is unavailable right now.", NamedTextColor.RED));
            return true;
        }

        api.get("/shop/catalogue", new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                List<ShopEntry> entries;
                try (response) {
                    if (!response.isSuccessful() || response.body() == null) {
                        unavailable(player);
                        return;
                    }
                    entries = parse(response.body().string());
                } catch (Exception e) {
                    plugin.getLogger().warning("Failed to read shop catalogue: " + e.getMessage());
                    unavailable(player);
                    return;
                }
                if (entries.isEmpty()) {
                    send(player, Component.text("The shop is empty right now.", NamedTextColor.YELLOW));
                    return;
                }
                long balance = economy.getBalance(player.getName())[0];
                // Inventory operations are main-thread only.
                Bukkit.getScheduler().runTask(plugin, () -> menu.show(player, entries, balance));
            }

            @Override
            public void onFailure(Call call, IOException e) {
                unavailable(player);
            }
        });
        return true;
    }

    /**
     * Parses the catalogue, dropping rows whose material does not exist on this
     * server. A typo in the dashboard would otherwise become an empty slot the
     * player can click and be charged for.
     */
    List<ShopEntry> parse(String body) {
        List<ShopEntry> out = new ArrayList<>();
        JsonObject root = JsonParser.parseString(body).getAsJsonObject();
        JsonArray data = root.getAsJsonArray("data");
        if (data == null) return out;
        for (JsonElement el : data) {
            JsonObject o = el.getAsJsonObject();
            String material = str(o, "material");
            if (material == null) continue;
            if (Material.matchMaterial(material) == null) {
                plugin.getLogger().warning("Shop item '" + material
                    + "' is not a material on this server — hiding it from the shop.");
                continue;
            }
            out.add(new ShopEntry(
                str(o, "id"),
                material,
                str(o, "displayName"),
                o.has("amount") && !o.get("amount").isJsonNull() ? o.get("amount").getAsInt() : 1,
                o.has("price") && !o.get("price").isJsonNull() ? o.get("price").getAsInt() : 0,
                o.has("currency") && !o.get("currency").isJsonNull() ? o.get("currency").getAsString() : "coins",
                str(o, "category")
            ));
        }
        return out;
    }

    private static String str(JsonObject o, String key) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : null;
    }

    private void unavailable(Player player) {
        send(player, Component.text("Shop is unavailable right now.", NamedTextColor.RED));
    }

    private void send(Player player, Component msg) {
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) player.sendMessage(msg);
        });
    }

    private ApiClient api() {
        BridgePlugin bridge = BridgePlugin.getInstance();
        return bridge == null ? null : bridge.getApiClient();
    }

    private static final Gson GSON = new Gson();
    static String purchaseBody(String playerName, String itemId) {
        JsonObject o = new JsonObject();
        o.addProperty("playerId", playerName);
        o.addProperty("itemId", itemId);
        return GSON.toJson(o);
    }
}
