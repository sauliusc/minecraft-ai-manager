package io.craftcontrol.economy;

import net.kyori.adventure.text.Component;
import org.bukkit.entity.Player;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryView;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.mockito.Mockito.*;

/**
 * The shop menu must be read-only no matter what.
 *
 * <p>Regression cover for #391: the click handler used to consult per-player
 * state before cancelling, and that state was wiped by the close event that
 * fires when one menu screen opens the next. Every page after the first became
 * an ordinary chest players could empty for free.
 */
class ShopListenerCancelTest {

    private static Player player() {
        Player player = mock(Player.class);
        when(player.getUniqueId()).thenReturn(UUID.randomUUID());
        return player;
    }

    private static InventoryView viewTitled(String title) {
        InventoryView view = mock(InventoryView.class);
        when(view.title()).thenReturn(Component.text(title));
        when(view.getTopInventory()).thenReturn(mock(Inventory.class));
        return view;
    }

    private static ShopListener listenerWithNoState() {
        // A ShopMenu nobody has opened: isOpen() is false for every player, which
        // is exactly the state the close-event bug left behind.
        return new ShopListener(mock(EconomyPlugin.class), mock(EconomyManager.class), new ShopMenu());
    }

    @Test
    void cancelsClicksEvenWhenPerPlayerStateIsMissing() {
        InventoryClickEvent event = mock(InventoryClickEvent.class);
        when(event.getWhoClicked()).thenReturn(player());
        when(event.getView()).thenReturn(viewTitled(ShopMenu.TITLE));

        listenerWithNoState().onClick(event);

        verify(event).setCancelled(true);
    }

    @Test
    void cancelsClicksOnTheQuantityPickerTooWhenStateIsMissing() {
        InventoryClickEvent event = mock(InventoryClickEvent.class);
        when(event.getWhoClicked()).thenReturn(player());
        when(event.getView()).thenReturn(viewTitled(ShopMenu.QTY_TITLE));

        listenerWithNoState().onClick(event);

        verify(event).setCancelled(true);
    }

    @Test
    void cancelsClicksOnAPagedTitleWhenStateIsMissing() {
        InventoryClickEvent event = mock(InventoryClickEvent.class);
        when(event.getWhoClicked()).thenReturn(player());
        when(event.getView()).thenReturn(viewTitled(ShopMenu.TITLE + " (2/3)"));

        listenerWithNoState().onClick(event);

        verify(event).setCancelled(true);
    }

    @Test
    void cancelsDragsEvenWhenPerPlayerStateIsMissing() {
        InventoryDragEvent event = mock(InventoryDragEvent.class);
        when(event.getWhoClicked()).thenReturn(player());
        when(event.getView()).thenReturn(viewTitled(ShopMenu.TITLE));

        listenerWithNoState().onDrag(event);

        verify(event).setCancelled(true);
    }

    @Test
    void leavesOtherInventoriesAlone() {
        InventoryClickEvent click = mock(InventoryClickEvent.class);
        when(click.getWhoClicked()).thenReturn(player());
        when(click.getView()).thenReturn(viewTitled("Chest"));

        InventoryDragEvent drag = mock(InventoryDragEvent.class);
        when(drag.getWhoClicked()).thenReturn(player());
        when(drag.getView()).thenReturn(viewTitled("Chest"));

        ShopListener listener = listenerWithNoState();
        listener.onClick(click);
        listener.onDrag(drag);

        verify(click, never()).setCancelled(anyBoolean());
        verify(drag, never()).setCancelled(anyBoolean());
    }
}
