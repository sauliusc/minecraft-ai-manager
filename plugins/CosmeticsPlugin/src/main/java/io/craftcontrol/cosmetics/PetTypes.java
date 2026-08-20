package io.craftcontrol.cosmetics;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

/**
 * Resolves and validates cosmetic pet types against the whitelist in config.yml.
 * Kept free of Bukkit types so the selection rules can be unit tested.
 */
public class PetTypes {
    private final List<String> available;
    private final String defaultType;

    public PetTypes(List<String> available, String defaultType) {
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        if (available != null) {
            for (String type : available) {
                if (type != null && !type.isBlank()) normalized.add(normalize(type));
            }
        }
        String fallback = defaultType == null || defaultType.isBlank() ? null : normalize(defaultType);
        if (fallback != null) normalized.add(fallback);
        if (normalized.isEmpty()) normalized.add("CAT");
        this.available = List.copyOf(new ArrayList<>(normalized));
        this.defaultType = fallback != null ? fallback : this.available.get(0);
    }

    public List<String> available() { return available; }

    public String defaultType() { return defaultType; }

    public boolean isAllowed(String type) {
        return type != null && available.contains(normalize(type));
    }

    /**
     * Picks the type to summon: an explicit argument wins, then the player's saved
     * type, then the configured default. Saved types that have since been removed
     * from the whitelist fall back to the default rather than failing the summon.
     */
    public String resolve(String requested, String savedType) {
        if (requested != null && !requested.isBlank()) return normalize(requested);
        if (isAllowed(savedType)) return normalize(savedType);
        return defaultType;
    }

    /** Whitelist entries starting with the given prefix, for tab completion. */
    public List<String> matching(String prefix) {
        String needle = prefix == null ? "" : normalize(prefix);
        return available.stream().filter(t -> t.startsWith(needle)).toList();
    }

    private static String normalize(String type) {
        return type.trim().toUpperCase(Locale.ROOT);
    }
}
