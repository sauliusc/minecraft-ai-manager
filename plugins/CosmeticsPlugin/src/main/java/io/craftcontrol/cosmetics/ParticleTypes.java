package io.craftcontrol.cosmetics;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.function.Predicate;

/**
 * Resolves and validates cosmetic particle and trail names against the whitelist
 * in config.yml.
 *
 * <p>Particle enum constants get renamed across Minecraft versions (the pre-1.13
 * names {@code ENCHANTMENT_TABLE}, {@code VILLAGER_HAPPY} and {@code MAGIC_CRIT}
 * are all gone in 26.2). A name that no longer resolves used to reach the player
 * as "Unknown particle" from a list the command had just offered them, or as a
 * trail that silently never rendered. Validating the whitelist once at enable
 * turns that into a single loud startup warning instead.
 *
 * <p>Kept free of Bukkit types — the caller supplies the "does this constant
 * exist" predicate — so the selection rules can be unit tested.
 */
public class ParticleTypes {
    private final List<String> available;

    public ParticleTypes(List<String> configured, Predicate<String> renderable, Consumer<String> warn) {
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        if (configured != null) {
            for (String name : configured) {
                if (name == null || name.isBlank()) continue;
                String value = normalize(name);
                if (renderable.test(value)) {
                    normalized.add(value);
                } else {
                    warn.accept("Dropping unknown particle '" + value + "' from config.yml — "
                        + "it does not exist in this server's Particle enum (renamed in a newer Minecraft version?)");
                }
            }
        }
        this.available = List.copyOf(new ArrayList<>(normalized));
    }

    /** The configured names that actually resolve on this server, in config order. */
    public List<String> available() { return available; }

    public boolean isAllowed(String name) {
        return name != null && available.contains(normalize(name));
    }

    /** Whitelist entries starting with the given prefix, for tab completion. */
    public List<String> matching(String prefix) {
        String needle = prefix == null ? "" : normalize(prefix);
        return available.stream().filter(t -> t.startsWith(needle)).toList();
    }

    private static String normalize(String name) {
        return name.trim().toUpperCase(Locale.ROOT);
    }
}
