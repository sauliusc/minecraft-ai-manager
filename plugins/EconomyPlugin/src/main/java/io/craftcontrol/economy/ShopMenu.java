package io.craftcontrol.economy;

import io.craftcontrol.economy.model.ShopEntry;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The chest GUI for {@code /shop}.
 *
 * <p>Holds the catalogue that was open when a menu was built, keyed by player,
 * so a click resolves to the item that was actually on screen. Prices are
 * editable from the dashboard at any moment, so the slot mapping cannot be
 * derived from a shared catalogue that may have changed underneath the player.
 */
public class ShopMenu {

    public static final String TITLE = "Server Shop";
    private static final int ROW = 9;

    private final Map<UUID, List<ShopEntry>> open = new HashMap<>();

    /** Builds and shows the menu. Must run on the main thread. */
    public void show(Player player, List<ShopEntry> entries, long balance) {
        int rows = Math.max(1, Math.min(6, (int) Math.ceil(entries.size() / (double) ROW)));
        Inventory inv = Bukkit.createInventory(null, rows * ROW, Component.text(TITLE));

        List<ShopEntry> shown = new ArrayList<>();
        for (ShopEntry e : entries) {
            if (shown.size() >= rows * ROW) break;
            Material mat = Material.matchMaterial(e.material());
            if (mat == null) continue;   // filtered again in ShopCommand, belt and braces
            ItemStack stack = new ItemStack(mat, Math.max(1, Math.min(64, e.amount())));
            final ShopEntry entry = e;
            final boolean affordable = balance >= e.price();
            stack.editMeta(meta -> {
                meta.displayName(Component.text(
                    entry.displayName() != null ? entry.displayName() : prettify(entry.material()),
                    NamedTextColor.AQUA).decoration(TextDecoration.ITALIC, false));
                List<Component> lore = new ArrayList<>();
                lore.add(Component.text("Price: " + entry.price() + " " + entry.currency(),
                    affordable ? NamedTextColor.GREEN : NamedTextColor.RED)
                    .decoration(TextDecoration.ITALIC, false));
                lore.add(Component.text("Amount: " + entry.amount(), NamedTextColor.GRAY)
                    .decoration(TextDecoration.ITALIC, false));
                lore.add(Component.text(affordable ? "Click to buy" : "You cannot afford this",
                    affordable ? NamedTextColor.YELLOW : NamedTextColor.DARK_GRAY)
                    .decoration(TextDecoration.ITALIC, false));
                meta.lore(lore);
            });
            inv.setItem(shown.size(), stack);
            shown.add(e);
        }

        open.put(player.getUniqueId(), shown);
        player.openInventory(inv);
    }

    /** The entry a clicked slot refers to, or null if the slot is empty. */
    public ShopEntry entryAt(Player player, int slot) {
        List<ShopEntry> entries = open.get(player.getUniqueId());
        if (entries == null || slot < 0 || slot >= entries.size()) return null;
        return entries.get(slot);
    }

    public boolean isOpen(Player player) { return open.containsKey(player.getUniqueId()); }

    public void close(Player player) { open.remove(player.getUniqueId()); }

    /** DIAMOND_SWORD -> Diamond Sword, for items with no display name set. */
    static String prettify(String material) {
        StringBuilder out = new StringBuilder();
        for (String part : material.toLowerCase(java.util.Locale.ROOT).split("_")) {
            if (part.isEmpty()) continue;
            if (out.length() > 0) out.append(' ');
            out.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        return out.length() == 0 ? material : out.toString();
    }
}
