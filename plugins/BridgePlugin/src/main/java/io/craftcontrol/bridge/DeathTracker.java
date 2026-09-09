package io.craftcontrol.bridge;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Remembers how each player most recently died.
 *
 * Vanilla statistics count deaths but not causes, and the cause is the whole
 * joke — "bladrobe died" is a fact, "bladrobe fell in lava again" is funny.
 * Nothing else on the server records it, so this keeps the last one per player.
 *
 * <p>In memory on purpose. A death from before the last restart is far too old
 * to be worth a comment, so there is nothing to persist.
 */
public class DeathTracker implements Listener {

    /** How long a death stays interesting enough to mention. */
    private static final long RELEVANT_FOR_MS = 30 * 60 * 1000L;

    public record Death(String cause, long atMs) {}

    private final Map<UUID, Death> lastDeath = new ConcurrentHashMap<>();

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onDeath(PlayerDeathEvent event) {
        Player player = event.getEntity();
        String message = event.getDeathMessage();
        if (message == null || message.isBlank()) return;

        // The vanilla message starts with the player's name ("adas fell from a
        // high place"). Strip it: the digest already names the player, and
        // repeating it reads oddly once the AI rewrites the sentence.
        String cause = message.startsWith(player.getName())
            ? message.substring(player.getName().length()).trim()
            : message;

        lastDeath.put(player.getUniqueId(), new Death(cause, System.currentTimeMillis()));
    }

    /** The player's last death, or null when there is none recent enough to mention. */
    public Death recentDeath(UUID uuid) {
        Death death = lastDeath.get(uuid);
        if (death == null) return null;
        return System.currentTimeMillis() - death.atMs() <= RELEVANT_FOR_MS ? death : null;
    }

    public void forget(UUID uuid) {
        lastDeath.remove(uuid);
    }
}
