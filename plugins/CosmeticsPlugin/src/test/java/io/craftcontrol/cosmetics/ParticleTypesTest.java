package io.craftcontrol.cosmetics;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;

import static org.junit.jupiter.api.Assertions.*;

class ParticleTypesTest {

    /** Stands in for the running server's Particle enum. */
    private static final Predicate<String> PAPER_26_2 =
        Set.of("FLAME", "HEART", "ENCHANT", "HAPPY_VILLAGER", "CRIT", "NOTE")::contains;

    private static ParticleTypes of(List<String> configured, List<String> warnings) {
        return new ParticleTypes(configured, PAPER_26_2, warnings::add);
    }

    @Test
    void exposesTheConfiguredWhitelistInOrder() {
        assertEquals(List.of("FLAME", "HEART"), of(List.of("FLAME", "HEART"), new ArrayList<>()).available());
    }

    @Test
    void normalizesCaseAndWhitespaceFromConfig() {
        ParticleTypes types = of(List.of(" flame ", "Heart"), new ArrayList<>());
        assertEquals(List.of("FLAME", "HEART"), types.available());
        assertTrue(types.isAllowed("flame"));
    }

    @Test
    void ignoresBlankAndDuplicateEntries() {
        ParticleTypes types = of(Arrays.asList("FLAME", "", null, "FLAME"), new ArrayList<>());
        assertEquals(List.of("FLAME"), types.available());
    }

    @Test
    void dropsNamesThatDoNotResolveOnThisServer() {
        List<String> warnings = new ArrayList<>();
        // The pre-1.13 names that shipped in config.yml until #319.
        ParticleTypes types = of(List.of("FLAME", "ENCHANTMENT_TABLE", "VILLAGER_HAPPY"), warnings);

        assertEquals(List.of("FLAME"), types.available());
        assertFalse(types.isAllowed("ENCHANTMENT_TABLE"));
        assertEquals(2, warnings.size(), "each dropped name should be warned about once");
        assertTrue(warnings.get(0).contains("ENCHANTMENT_TABLE"));
    }

    @Test
    void survivesAConfigWhereNothingResolves() {
        ParticleTypes types = of(List.of("ENCHANTMENT_TABLE"), new ArrayList<>());
        assertEquals(List.of(), types.available());
        assertFalse(types.isAllowed("ENCHANTMENT_TABLE"));
        assertEquals(List.of(), types.matching(""));
    }

    @Test
    void handlesNullConfigList() {
        assertEquals(List.of(), of(null, new ArrayList<>()).available());
    }

    @Test
    void isAllowedRejectsNull() {
        assertFalse(of(List.of("FLAME"), new ArrayList<>()).isAllowed(null));
    }

    @Test
    void matchingFiltersByPrefixForTabCompletion() {
        ParticleTypes types = of(List.of("FLAME", "HEART", "HAPPY_VILLAGER"), new ArrayList<>());
        assertEquals(List.of("HEART", "HAPPY_VILLAGER"), types.matching("h"));
        assertEquals(List.of("FLAME", "HEART", "HAPPY_VILLAGER"), types.matching(null));
    }
}
