package io.craftcontrol.economy;

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
        String body = ShopCommand.purchaseBody("ADASGAME", "item-1");
        assertTrue(body.contains("\"playerId\":\"ADASGAME\""), body);
        assertTrue(body.contains("\"itemId\":\"item-1\""), body);
    }

    @Test
    void escapesNamesRatherThanBuildingBrokenJson() {
        // Minecraft names cannot contain quotes, but the encoder must not be the
        // reason we find that out.
        String body = ShopCommand.purchaseBody("we\"ird", "id");
        assertFalse(body.contains("we\"ird"), body);
        assertTrue(body.contains("we\\\"ird"), body);
    }
}
