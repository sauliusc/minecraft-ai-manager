package io.craftcontrol.economy;

import net.kyori.adventure.text.Component;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ShopMenuTest {

    @Test
    void prettifiesMaterialNamesForItemsWithNoDisplayName() {
        assertEquals("Diamond Sword", ShopMenu.prettify("DIAMOND_SWORD"));
        assertEquals("Diamond", ShopMenu.prettify("DIAMOND"));
        assertEquals("Golden Apple", ShopMenu.prettify("GOLDEN_APPLE"));
    }

    @Test
    void copesWithOddMaterialStrings() {
        assertEquals("A B", ShopMenu.prettify("A__B"));
        assertEquals("", ShopMenu.prettify(""));
    }

    @Test
    void readsTheBalanceOutOfAPurchaseResponse() {
        assertEquals(50L, ShopListener.readBalance("{\"material\":\"DIAMOND\",\"balance\":50}"));
    }

    @Test
    void reportsUnknownBalanceRatherThanZeroWhenTheResponseIsUnusable() {
        // -1 means "not reported"; returning 0 would tell the player they are broke.
        assertEquals(-1L, ShopListener.readBalance("not json"));
        assertEquals(-1L, ShopListener.readBalance("{}"));
        assertEquals(-1L, ShopListener.readBalance("{\"balance\":null}"));
    }

    @Test
    void buildsThePurchaseBodyTheApiExpects() {
        String body = ShopCommand.purchaseBody("ADASGAME", "item-1", 8);
        assertTrue(body.contains("\"playerId\":\"ADASGAME\""), body);
        assertTrue(body.contains("\"itemId\":\"item-1\""), body);
        assertTrue(body.contains("\"quantity\":8"), body);
    }

    @Test
    void offersTheQuantitiesThePickerAdvertises() {
        assertArrayEquals(new int[]{1, 8, 16, 32, 64}, ShopMenu.QUANTITIES);
    }

    @Test
    void takesTheDeliveredAmountFromTheServerNotTheClick() {
        // The debit is authoritative: deliver what was charged for, not what the
        // menu happened to be showing.
        assertEquals(128, ShopListener.readAmount("{\"amount\":128,\"price\":384}", 1));
        assertEquals(384L, ShopListener.readPrice("{\"amount\":128,\"price\":384}", 3));
    }

    @Test
    void fallsBackToTheRowWhenTheResponseIsUnreadable() {
        assertEquals(2, ShopListener.readAmount("nonsense", 2));
        assertEquals(3L, ShopListener.readPrice("{}", 3));
    }

    @Test
    void escapesNamesRatherThanBuildingBrokenJson() {
        // Minecraft names cannot contain quotes, but the encoder must not be the
        // reason we find that out.
        String body = ShopCommand.purchaseBody("we\"ird", "id", 1);
        assertFalse(body.contains("we\"ird"), body);
        assertTrue(body.contains("we\\\"ird"), body);
    }

    @Test
    void oneScreenfulNeedsNoPaging() {
        // 54 fits exactly; the 55th is what used to vanish silently (#345).
        assertEquals(1, ShopMenu.pageCount(1));
        assertEquals(1, ShopMenu.pageCount(54));
        assertEquals(2, ShopMenu.pageCount(55));
    }

    @Test
    void pagesAtFortyFiveOnceNavigationIsNeeded() {
        // The bottom row becomes navigation, so a paged screen holds 45.
        assertEquals(45, ShopMenu.PAGE_SIZE);
        assertEquals(2, ShopMenu.pageCount(77));   // the catalogue with stairs
        assertEquals(2, ShopMenu.pageCount(90));
        assertEquals(3, ShopMenu.pageCount(91));
    }

    @Test
    void neverReportsZeroPagesForAnEmptyCatalogue() {
        assertEquals(1, ShopMenu.pageCount(0));
    }

    @Test
    void recognisesItsOwnTitleIncludingThePageSuffix() {
        assertTrue(ShopMenu.isShopTitle(Component.text("Server Shop")));
        assertTrue(ShopMenu.isShopTitle(Component.text("Server Shop (2/3)")));
        assertFalse(ShopMenu.isShopTitle(Component.text("Chest")));
        assertFalse(ShopMenu.isShopTitle(Component.text("Ender Chest")));
    }
}
