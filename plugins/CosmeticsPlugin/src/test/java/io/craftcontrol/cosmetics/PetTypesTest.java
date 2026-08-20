package io.craftcontrol.cosmetics;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class PetTypesTest {

    private static PetTypes standard() {
        return new PetTypes(List.of("WOLF", "CAT"), "CAT");
    }

    @Test
    void exposesTheConfiguredWhitelistInOrder() {
        assertEquals(List.of("WOLF", "CAT"), standard().available());
    }

    @Test
    void normalizesCaseAndWhitespaceFromConfig() {
        PetTypes types = new PetTypes(List.of(" wolf ", "Cat"), "cat");
        assertEquals(List.of("WOLF", "CAT"), types.available());
        assertTrue(types.isAllowed("wolf"));
        assertEquals("CAT", types.defaultType());
    }

    @Test
    void ignoresBlankAndDuplicateEntries() {
        PetTypes types = new PetTypes(java.util.Arrays.asList("WOLF", "", null, "WOLF"), "WOLF");
        assertEquals(List.of("WOLF"), types.available());
    }

    @Test
    void rejectsTypesOutsideTheWhitelist() {
        PetTypes types = standard();
        assertFalse(types.isAllowed("CREEPER"));
        assertFalse(types.isAllowed(null));
        assertTrue(types.isAllowed("WOLF"));
    }

    @Test
    void defaultTypeIsAddedToTheWhitelistWhenMissing() {
        PetTypes types = new PetTypes(List.of("WOLF"), "PARROT");
        assertTrue(types.isAllowed("PARROT"));
        assertEquals("PARROT", types.defaultType());
    }

    @Test
    void fallsBackToCatWhenNothingIsConfigured() {
        PetTypes types = new PetTypes(List.of(), null);
        assertEquals(List.of("CAT"), types.available());
        assertEquals("CAT", types.defaultType());
    }

    @Test
    void usesFirstWhitelistEntryWhenNoDefaultConfigured() {
        assertEquals("WOLF", new PetTypes(List.of("WOLF", "CAT"), "  ").defaultType());
    }

    @Test
    void resolvePrefersTheExplicitArgument() {
        assertEquals("WOLF", standard().resolve("wolf", "CAT"));
    }

    @Test
    void resolveFallsBackToTheSavedProfileType() {
        assertEquals("WOLF", standard().resolve(null, "WOLF"));
        assertEquals("WOLF", standard().resolve("  ", "WOLF"));
    }

    @Test
    void resolveFallsBackToTheDefaultWhenNothingIsSaved() {
        assertEquals("CAT", standard().resolve(null, null));
    }

    @Test
    void resolveIgnoresSavedTypesDroppedFromTheWhitelist() {
        // A player who picked PARROT before an admin removed it gets the default,
        // not a failed summon.
        assertEquals("CAT", standard().resolve(null, "PARROT"));
    }

    @Test
    void matchingFiltersByPrefixCaseInsensitively() {
        assertEquals(List.of("WOLF"), standard().matching("w"));
        assertEquals(List.of("WOLF", "CAT"), standard().matching(""));
        assertEquals(List.of("WOLF", "CAT"), standard().matching(null));
        assertEquals(List.of(), standard().matching("z"));
    }
}
