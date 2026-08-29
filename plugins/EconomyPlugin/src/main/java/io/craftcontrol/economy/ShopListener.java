package io.craftcontrol.economy;

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
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.ItemStack;

import java.io.IOException;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/** Handles clicks in the {@code /shop} menu. */
public class ShopListener implements Listener {

    private final EconomyPlugin plugin;
    private final EconomyManager economy;
    private final ShopMenu menu;
    /** Players with a purchase in flight, so a click-spam cannot buy twice. */
    private final Set<UUID> inFlight = new HashSet<>();

    public ShopListener(EconomyPlugin plugin, EconomyManager economy, ShopMenu menu) {
        this.plugin = plugin;
        this.economy = economy;
        this.menu = menu;
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (!menu.isOpen(player)) return;
        if (!event.getView().title().equals(Component.text(ShopMenu.TITLE))) return;

        // The menu is a display, not storage: nothing may be taken out of it or
        // shift-clicked in from the player's own inventory.
        event.setCancelled(true);
        if (event.getClickedInventory() == null
            || !event.getClickedInventory().equals(event.getView().getTopInventory())) return;

        ShopEntry entry = menu.entryAt(player, event.getSlot());
        if (entry == null) return;

        if (!inFlight.add(player.getUniqueId())) return;   // already buying something
        buy(player, entry);
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (menu.isOpen(player)
            && event.getView().title().equals(Component.text(ShopMenu.TITLE))) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onClose(InventoryCloseEvent event) {
        if (event.getPlayer() instanceof Player player) menu.close(player);
    }

    private void buy(Player player, ShopEntry entry) {
        BridgePlugin bridge = BridgePlugin.getInstance();
        ApiClient api = bridge == null ? null : bridge.getApiClient();
        if (api == null) {
            inFlight.remove(player.getUniqueId());
            player.sendMessage(Component.text("Shop is unavailable right now.", NamedTextColor.RED));
            return;
        }

        // The API debits first and only then reports success, so the item is
        // handed over strictly after the money is confirmed gone. A failure
        // anywhere here leaves the player with their coins and no item, which
        // is the right way round to be wrong.
        api.post("/shop/purchase", ShopCommand.purchaseBody(player.getName(), entry.id()), new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                String body = "";
                int code = response.code();
                try (response) {
                    if (response.body() != null) body = response.body().string();
                } catch (IOException ignored) {}
                final String payload = body;
                Bukkit.getScheduler().runTask(plugin, () -> {
                    inFlight.remove(player.getUniqueId());
                    if (!player.isOnline()) return;
                    if (code == 200) {
                        deliver(player, entry, payload);
                    } else if (code == 402) {
                        player.sendMessage(Component.text(
                            "You cannot afford that — it costs " + entry.price() + " " + entry.currency() + ".",
                            NamedTextColor.RED));
                        player.playSound(player.getLocation(), Sound.ENTITY_VILLAGER_NO, 1f, 1f);
                    } else if (code == 404) {
                        player.sendMessage(Component.text("That item is no longer for sale.", NamedTextColor.RED));
                    } else {
                        player.sendMessage(Component.text("Purchase failed. Nothing was charged.", NamedTextColor.RED));
                    }
                });
            }

            @Override
            public void onFailure(Call call, IOException e) {
                Bukkit.getScheduler().runTask(plugin, () -> {
                    inFlight.remove(player.getUniqueId());
                    if (player.isOnline()) {
                        player.sendMessage(Component.text(
                            "Shop is unavailable right now. Nothing was charged.", NamedTextColor.RED));
                    }
                });
            }
        });
    }

    /** Runs on the main thread once the debit has been confirmed. */
    private void deliver(Player player, ShopEntry entry, String payload) {
        Material mat = Material.matchMaterial(entry.material());
        if (mat == null) {
            plugin.getLogger().warning("Bought '" + entry.material() + "' but it is not a material here.");
            player.sendMessage(Component.text(
                "Something went wrong delivering that item — tell an admin.", NamedTextColor.RED));
            return;
        }
        ItemStack stack = new ItemStack(mat, Math.max(1, Math.min(64, entry.amount())));
        var leftover = player.getInventory().addItem(stack);
        // A full inventory must not swallow what was just paid for.
        leftover.values().forEach(rest -> player.getWorld().dropItemNaturally(player.getLocation(), rest));
        if (!leftover.isEmpty()) {
            player.sendMessage(Component.text("Your inventory was full — the rest dropped at your feet.",
                NamedTextColor.YELLOW));
        }

        long balance = readBalance(payload);
        economy.invalidate(player.getName());
        economy.fetchBalance(player.getName());

        player.sendMessage(Component.text("Bought " + entry.amount() + "x "
            + ShopMenu.prettify(entry.material()) + " for " + entry.price() + " " + entry.currency()
            + (balance >= 0 ? " — balance: " + balance : ""), NamedTextColor.GREEN));
        player.playSound(player.getLocation(), Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 1f, 1.2f);
    }

    /** Balance from the purchase response, or -1 when it cannot be read. */
    static long readBalance(String payload) {
        try {
            JsonObject o = JsonParser.parseString(payload).getAsJsonObject();
            return o.has("balance") && !o.get("balance").isJsonNull() ? o.get("balance").getAsLong() : -1;
        } catch (Exception e) {
            return -1;
        }
    }
}
