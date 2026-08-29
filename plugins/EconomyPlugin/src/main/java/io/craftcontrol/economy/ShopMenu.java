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
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * The chest GUI for {@code /shop}.
 *
 * <p>Paginated: the inventory tops out at six rows, and the catalogue outgrew
 * that as soon as the building blocks were added (#345). Anything past the last
 * slot used to be dropped silently, so an admin could add an item, see it in the
 * dashboard, and have players never find it.
 *
 * <p>Holds the catalogue that was open when a menu was built, keyed by player,
 * so a click resolves to the item that was actually on screen. Prices are
 * editable from the dashboard at any moment, so the slot mapping cannot be
 * derived from a catalogue that may have changed underneath the player.
 */
public class ShopMenu {

    public static final String TITLE = "Server Shop";
    private static final int ROW = 9;
    private static final int MAX_ROWS = 6;
    /** Five rows of items, leaving the bottom row for navigation. */
    static final int PAGE_SIZE = (MAX_ROWS - 1) * ROW;
    private static final int SLOT_PREV = PAGE_SIZE;
    private static final int SLOT_INFO = PAGE_SIZE + 4;
    private static final int SLOT_NEXT = PAGE_SIZE + 8;

    public enum Nav { PREV, NEXT, BACK }

    /** Quantities the picker offers. */
    static final int[] QUANTITIES = {1, 8, 16, 32, 64};
    private static final int QTY_ROWS = 3;
    private static final int QTY_FIRST_SLOT = 10;   // second row, inset by one
    private static final int QTY_BACK_SLOT = 22;
    public static final String QTY_TITLE = TITLE + " — how many?";

    private static final class Open {
        final List<ShopEntry> all;
        final int page;
        final long balance;
        /** Non-null while the quantity picker is showing. */
        final ShopEntry picking;
        Open(List<ShopEntry> all, int page, long balance, ShopEntry picking) {
            this.all = all; this.page = page; this.balance = balance; this.picking = picking;
        }
    }

    private final Map<UUID, Open> open = new HashMap<>();

    /** Number of pages the catalogue needs. Always at least one. */
    static int pageCount(int items) {
        if (items <= MAX_ROWS * ROW) return 1;
        return (int) Math.ceil(items / (double) PAGE_SIZE);
    }

    /** Builds and shows a page. Must run on the main thread. */
    public void show(Player player, List<ShopEntry> entries, long balance, int page) {
        int pages = pageCount(entries.size());
        int p = Math.max(0, Math.min(page, pages - 1));
        boolean paged = pages > 1;
        int perPage = paged ? PAGE_SIZE : MAX_ROWS * ROW;

        int from = p * perPage;
        int to = Math.min(from + perPage, entries.size());
        List<ShopEntry> slice = new ArrayList<>(entries.subList(from, to));

        int rows = paged ? MAX_ROWS
            : Math.max(1, (int) Math.ceil(slice.size() / (double) ROW));
        String title = paged ? TITLE + " (" + (p + 1) + "/" + pages + ")" : TITLE;
        Inventory inv = Bukkit.createInventory(null, rows * ROW, Component.text(title));

        for (int i = 0; i < slice.size(); i++) {
            ShopEntry e = slice.get(i);
            Material mat = Material.matchMaterial(e.material());
            if (mat == null) continue;
            inv.setItem(i, itemFor(e, mat, balance >= e.price()));
        }

        if (paged) {
            if (p > 0) inv.setItem(SLOT_PREV, navItem(Material.ARROW, "Previous page"));
            if (p < pages - 1) inv.setItem(SLOT_NEXT, navItem(Material.ARROW, "Next page"));
            inv.setItem(SLOT_INFO, navItem(Material.PAPER, "Page " + (p + 1) + " of " + pages));
        }

        open.put(player.getUniqueId(), new Open(entries, p, balance, null));
        player.openInventory(inv);
    }

    private static ItemStack itemFor(ShopEntry entry, Material mat, boolean affordable) {
        ItemStack stack = new ItemStack(mat, Math.max(1, Math.min(64, entry.amount())));
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
        return stack;
    }

    private static ItemStack navItem(Material mat, String label) {
        ItemStack stack = new ItemStack(mat);
        stack.editMeta(meta -> meta.displayName(
            Component.text(label, NamedTextColor.YELLOW).decoration(TextDecoration.ITALIC, false)));
        return stack;
    }

    /** The entry a clicked slot refers to, or null for a nav slot or empty space. */
    public ShopEntry entryAt(Player player, int slot) {
        Open state = open.get(player.getUniqueId());
        if (state == null || slot < 0 || state.picking != null) return null;
        boolean paged = pageCount(state.all.size()) > 1;
        int perPage = paged ? PAGE_SIZE : MAX_ROWS * ROW;
        if (paged && slot >= PAGE_SIZE) return null;      // navigation row
        int index = state.page * perPage + slot;
        if (slot >= perPage || index >= state.all.size()) return null;
        return state.all.get(index);
    }

    /** The navigation action for a clicked slot, or null if it is not one. */
    public Nav navAt(Player player, int slot) {
        Open state = open.get(player.getUniqueId());
        if (state == null) return null;
        if (state.picking != null) {
            return slot == QTY_BACK_SLOT ? Nav.BACK : null;
        }
        int pages = pageCount(state.all.size());
        if (pages <= 1) return null;
        if (slot == SLOT_PREV && state.page > 0) return Nav.PREV;
        if (slot == SLOT_NEXT && state.page < pages - 1) return Nav.NEXT;
        return null;
    }

    /** Re-renders the menu one page in the given direction. Main thread only. */
    public void turnPage(Player player, Nav nav) {
        Open state = open.get(player.getUniqueId());
        if (state == null) return;
        if (nav == Nav.BACK) {
            show(player, state.all, state.balance, state.page);
            return;
        }
        show(player, state.all, state.balance, state.page + (nav == Nav.NEXT ? 1 : -1));
    }

    /** Opens the quantity picker for an item. Main thread only. */
    public void showQuantities(Player player, ShopEntry entry, long balance) {
        Open state = open.get(player.getUniqueId());
        if (state == null) return;
        Inventory inv = Bukkit.createInventory(null, QTY_ROWS * ROW, Component.text(QTY_TITLE));

        Material mat = Material.matchMaterial(entry.material());
        if (mat == null) return;

        for (int i = 0; i < QUANTITIES.length; i++) {
            int qty = QUANTITIES[i];
            long total = (long) entry.price() * qty;
            int items = entry.amount() * qty;
            boolean affordable = balance >= total;
            ItemStack stack = new ItemStack(mat, Math.max(1, Math.min(mat.getMaxStackSize(), items)));
            stack.editMeta(meta -> {
                meta.displayName(Component.text("Buy " + items + " x "
                    + (entry.displayName() != null ? entry.displayName() : prettify(entry.material())),
                    NamedTextColor.AQUA).decoration(TextDecoration.ITALIC, false));
                List<Component> lore = new ArrayList<>();
                lore.add(Component.text("Total: " + total + " " + entry.currency(),
                    affordable ? NamedTextColor.GREEN : NamedTextColor.RED)
                    .decoration(TextDecoration.ITALIC, false));
                lore.add(Component.text("You have: " + balance + " " + entry.currency(),
                    NamedTextColor.GRAY).decoration(TextDecoration.ITALIC, false));
                lore.add(Component.text(affordable ? "Click to buy" : "Too expensive",
                    affordable ? NamedTextColor.YELLOW : NamedTextColor.DARK_GRAY)
                    .decoration(TextDecoration.ITALIC, false));
                meta.lore(lore);
            });
            inv.setItem(QTY_FIRST_SLOT + i, stack);
        }
        inv.setItem(QTY_BACK_SLOT, navItem(Material.ARROW, "Back to the shop"));

        open.put(player.getUniqueId(), new Open(state.all, state.page, balance, entry));
        player.openInventory(inv);
    }

    /** The entry and quantity a picker slot refers to, or null. */
    public Purchase quantityAt(Player player, int slot) {
        Open state = open.get(player.getUniqueId());
        if (state == null || state.picking == null) return null;
        int i = slot - QTY_FIRST_SLOT;
        if (i < 0 || i >= QUANTITIES.length) return null;
        return new Purchase(state.picking, QUANTITIES[i]);
    }

    /** True while the quantity picker is the open screen. */
    public boolean isPicking(Player player) {
        Open state = open.get(player.getUniqueId());
        return state != null && state.picking != null;
    }

    public record Purchase(ShopEntry entry, int quantity) {}

    /** True when the given inventory title belongs to this menu. */
    public static boolean isShopTitle(Component title) {
        return title instanceof net.kyori.adventure.text.TextComponent text
            && text.content().startsWith(TITLE);
    }

    public boolean isOpen(Player player) { return open.containsKey(player.getUniqueId()); }

    public void close(Player player) { open.remove(player.getUniqueId()); }

    /** DIAMOND_SWORD -> Diamond Sword, for items with no display name set. */
    static String prettify(String material) {
        StringBuilder out = new StringBuilder();
        for (String part : material.toLowerCase(Locale.ROOT).split("_")) {
            if (part.isEmpty()) continue;
            if (out.length() > 0) out.append(' ');
            out.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        return out.length() == 0 ? material : out.toString();
    }
}
