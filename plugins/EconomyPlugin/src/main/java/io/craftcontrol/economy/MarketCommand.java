package io.craftcontrol.economy;

import com.google.gson.*;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.*;
import org.bukkit.command.*;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import java.io.IOException;

public class MarketCommand implements CommandExecutor {
    private final EconomyPlugin plugin;
    private final Gson gson = new Gson();
    private final int listingFeePercent;

    public MarketCommand(EconomyPlugin plugin) {
        this.plugin = plugin;
        this.listingFeePercent = plugin.getConfig().getInt("economy.listing_fee_percent", 5);
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Only players can use this command.");
            return true;
        }
        if (args.length == 0) {
            player.sendMessage(Component.text("Usage: /market <list <price>|browse|buy <id>>", NamedTextColor.YELLOW));
            return true;
        }
        switch (args[0].toLowerCase()) {
            case "list" -> handleList(player, args);
            case "browse" -> handleBrowse(player);
            case "buy" -> handleBuy(player, args);
            default -> player.sendMessage(Component.text("Unknown subcommand.", NamedTextColor.RED));
        }
        return true;
    }

    private void handleList(Player player, String[] args) {
        if (args.length < 2) {
            player.sendMessage(Component.text("Usage: /market list <price>", NamedTextColor.RED));
            return;
        }
        long price;
        try { price = Long.parseLong(args[1]); if (price <= 0) throw new NumberFormatException(); }
        catch (NumberFormatException e) {
            player.sendMessage(Component.text("Price must be a positive number.", NamedTextColor.RED));
            return;
        }
        ItemStack held = player.getInventory().getItemInMainHand();
        if (held.getType().isAir()) {
            player.sendMessage(Component.text("Hold the item you want to list in your main hand.", NamedTextColor.RED));
            return;
        }
        long fee = Math.max(1, price * listingFeePercent / 100);
        String material = held.getType().name();
        int amount = held.getAmount();

        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) { player.sendMessage(Component.text("Market service unavailable.", NamedTextColor.RED)); return; }

        String json = String.format("{\"sellerId\":\"%s\",\"material\":\"%s\",\"amount\":%d,\"price\":%d,\"fee\":%d}",
            player.getUniqueId(), material, amount, price, fee);
        player.sendMessage(Component.text("Listing " + amount + "x " + material + " for " + price + " Coins (fee: " + fee + ")…", NamedTextColor.GRAY));
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/economy/market/listings", json, new Callback() {
                @Override
                public void onResponse(Call call, Response response) {
                    response.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (response.isSuccessful()) {
                            player.getInventory().setItemInMainHand(null);
                            player.sendMessage(Component.text("Listed! Fee of " + fee + " Coins deducted.", NamedTextColor.GREEN));
                        } else {
                            player.sendMessage(Component.text("Failed to list item.", NamedTextColor.RED));
                        }
                    });
                }
                @Override public void onFailure(Call call, IOException e) {
                    plugin.getServer().getScheduler().runTask(plugin, () ->
                        player.sendMessage(Component.text("Market unavailable.", NamedTextColor.RED)));
                }
            })
        );
    }

    private void handleBrowse(Player player) {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) { player.sendMessage(Component.text("Market unavailable.", NamedTextColor.RED)); return; }
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.get("/economy/market/listings?limit=10", new Callback() {
                @Override
                public void onResponse(Call call, Response response) {
                    try (response) {
                        if (!response.isSuccessful() || response.body() == null) return;
                        JsonArray arr = gson.fromJson(response.body().string(), JsonArray.class);
                        plugin.getServer().getScheduler().runTask(plugin, () -> {
                            player.sendMessage(Component.text("═══ Market Listings ═══", NamedTextColor.GOLD));
                            for (var el : arr) {
                                JsonObject o = el.getAsJsonObject();
                                player.sendMessage(Component.text(
                                    "#" + o.get("id").getAsString().substring(0, 8) + " | " +
                                    o.get("amount").getAsInt() + "x " + o.get("material").getAsString() +
                                    " — " + o.get("price").getAsLong() + " Coins", NamedTextColor.WHITE));
                            }
                        });
                    } catch (IOException e) {
                        plugin.getServer().getScheduler().runTask(plugin, () ->
                            player.sendMessage(Component.text("Failed to load listings.", NamedTextColor.RED)));
                    }
                }
                @Override public void onFailure(Call call, IOException e) {
                    plugin.getServer().getScheduler().runTask(plugin, () ->
                        player.sendMessage(Component.text("Market unavailable.", NamedTextColor.RED)));
                }
            })
        );
    }

    private void handleBuy(Player player, String[] args) {
        if (args.length < 2) {
            player.sendMessage(Component.text("Usage: /market buy <listing-id>", NamedTextColor.RED));
            return;
        }
        String listingId = args[1];
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) { player.sendMessage(Component.text("Market unavailable.", NamedTextColor.RED)); return; }
        String json = String.format("{\"buyerId\":\"%s\"}", player.getUniqueId());
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            api.post("/economy/market/listings/" + listingId + "/buy", json, new Callback() {
                @Override
                public void onResponse(Call call, Response response) {
                    response.close();
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        if (response.isSuccessful()) {
                            player.sendMessage(Component.text("Purchase successful! Item will be delivered.", NamedTextColor.GREEN));
                        } else if (response.code() == 409) {
                            player.sendMessage(Component.text("Item already sold.", NamedTextColor.RED));
                        } else {
                            player.sendMessage(Component.text("Purchase failed.", NamedTextColor.RED));
                        }
                    });
                }
                @Override public void onFailure(Call call, IOException e) {
                    plugin.getServer().getScheduler().runTask(plugin, () ->
                        player.sendMessage(Component.text("Market unavailable.", NamedTextColor.RED)));
                }
            })
        );
    }
}
