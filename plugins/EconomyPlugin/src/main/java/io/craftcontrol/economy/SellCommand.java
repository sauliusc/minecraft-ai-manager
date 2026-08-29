package io.craftcontrol.economy;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.io.IOException;

/**
 * {@code /sell} — sells what the player is holding back to the shop at half price.
 *
 * <p>Items are taken out of the inventory <em>before</em> the credit is
 * requested and put back if it fails. The opposite order would pay first and
 * risk crediting without taking, which mints coins. This is the mirror of the
 * buy path, where the safe failure is the player keeping their money.
 */
public class SellCommand implements CommandExecutor {

    private static final Gson GSON = new Gson();

    private final EconomyPlugin plugin;
    private final EconomyManager economy;

    public SellCommand(EconomyPlugin plugin, EconomyManager economy) {
        this.plugin = plugin;
        this.economy = economy;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Component.text("Only players can use this command."));
            return true;
        }

        ItemStack held = player.getInventory().getItemInMainHand();
        if (held == null || held.getType().isAir()) {
            player.sendMessage(Component.text("Hold the item you want to sell.", NamedTextColor.YELLOW));
            return true;
        }
        if (!isPlain(held)) {
            player.sendMessage(Component.text(
                "The shop only buys ordinary items — nothing enchanted, renamed or damaged.",
                NamedTextColor.YELLOW));
            return true;
        }

        boolean all = args.length > 0 && args[0].equalsIgnoreCase("all");
        Material material = held.getType();
        int count = all ? countPlain(player, material) : held.getAmount();
        if (count <= 0) return true;

        ApiClient api = api();
        if (api == null) {
            player.sendMessage(Component.text("Shop is unavailable right now.", NamedTextColor.RED));
            return true;
        }

        // Take first. If the credit fails the items go straight back.
        int removed = removePlain(player, material, count);
        if (removed <= 0) {
            player.sendMessage(Component.text("You do not have any of those.", NamedTextColor.YELLOW));
            return true;
        }

        final int sold = removed;
        api.post("/shop/sell", body(player.getName(), material.name(), sold), new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                int code = response.code();
                String payload = "";
                try (response) {
                    if (response.body() != null) payload = response.body().string();
                } catch (IOException ignored) {}
                final String body = payload;
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (code == 200) {
                        long credited = ShopListener.readPrice(body, 0);
                        long balance = ShopListener.readBalance(body);
                        economy.invalidate(player.getName());
                        economy.fetchBalance(player.getName());
                        if (player.isOnline()) {
                            player.sendMessage(Component.text("Sold " + sold + "x "
                                + ShopMenu.prettify(material.name()) + " for " + credited + " coins"
                                + (balance >= 0 ? " — balance: " + balance : ""), NamedTextColor.GREEN));
                            player.playSound(player.getLocation(), Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 1f, 1.4f);
                        }
                        return;
                    }
                    refund(player, material, sold);
                    if (!player.isOnline()) return;
                    if (code == 404) {
                        player.sendMessage(Component.text("The shop does not buy that.", NamedTextColor.YELLOW));
                    } else if (code == 422) {
                        player.sendMessage(Component.text(
                            "That is not worth anything at half price.", NamedTextColor.YELLOW));
                    } else {
                        player.sendMessage(Component.text(
                            "Sale failed — your items have been returned.", NamedTextColor.RED));
                    }
                });
            }

            @Override
            public void onFailure(Call call, IOException e) {
                Bukkit.getScheduler().runTask(plugin, () -> {
                    refund(player, material, sold);
                    if (player.isOnline()) {
                        player.sendMessage(Component.text(
                            "Shop is unavailable — your items have been returned.", NamedTextColor.RED));
                    }
                });
            }
        });
        return true;
    }

    /** Puts items back after a failed sale, dropping any that will not fit. */
    private void refund(Player player, Material material, int count) {
        int remaining = count;
        int max = material.getMaxStackSize();
        while (remaining > 0) {
            int size = Math.min(remaining, max);
            var leftover = player.getInventory().addItem(new ItemStack(material, size));
            leftover.values().forEach(rest ->
                player.getWorld().dropItemNaturally(player.getLocation(), rest));
            remaining -= size;
        }
    }

    /**
     * Only ordinary items are sellable. A damaged, enchanted or renamed tool is
     * worth a different amount than a fresh one, and the catalogue has no way to
     * express that — so refuse rather than undervalue it.
     */
    static boolean isPlain(ItemStack stack) {
        if (!stack.hasItemMeta()) return true;
        var meta = stack.getItemMeta();
        if (meta == null) return true;
        if (meta.hasDisplayName() || meta.hasEnchants() || meta.hasLore()) return false;
        return !(meta instanceof org.bukkit.inventory.meta.Damageable d) || !d.hasDamage();
    }

    /** How many plain items of this material the player has. */
    private int countPlain(Player player, Material material) {
        int total = 0;
        for (ItemStack stack : player.getInventory().getStorageContents()) {
            if (stack != null && stack.getType() == material && isPlain(stack)) total += stack.getAmount();
        }
        return total;
    }

    /** Removes up to {@code count} plain items, returning how many were taken. */
    private int removePlain(Player player, Material material, int count) {
        int remaining = count;
        ItemStack[] contents = player.getInventory().getStorageContents();
        for (int i = 0; i < contents.length && remaining > 0; i++) {
            ItemStack stack = contents[i];
            if (stack == null || stack.getType() != material || !isPlain(stack)) continue;
            int take = Math.min(stack.getAmount(), remaining);
            stack.setAmount(stack.getAmount() - take);
            if (stack.getAmount() <= 0) contents[i] = null;
            remaining -= take;
        }
        player.getInventory().setStorageContents(contents);
        return count - remaining;
    }

    static String body(String playerName, String material, int count) {
        JsonObject o = new JsonObject();
        o.addProperty("playerId", playerName);
        o.addProperty("material", material);
        o.addProperty("count", count);
        return GSON.toJson(o);
    }

    private ApiClient api() {
        BridgePlugin bridge = BridgePlugin.getInstance();
        return bridge == null ? null : bridge.getApiClient();
    }
}
