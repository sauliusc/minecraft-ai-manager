package io.craftcontrol.cosmetics;

import io.craftcontrol.cosmetics.model.CosmeticsProfile;
import org.bukkit.Particle;
import org.bukkit.entity.Player;

/**
 * Renders the ambient particle cosmetic for every online player.
 *
 * <p>One repeating task drives all players, rather than one task per
 * {@code /particles equip}. The per-equip version leaked a timer on every use,
 * never cancelled on {@code off} or on quit, and — because it only ever started
 * from the command — left a saved cosmetic invisible after a relog or restart.
 */
public class ParticleTask implements Runnable {
    private final CosmeticsPlugin plugin;
    private final CosmeticsManager manager;

    public ParticleTask(CosmeticsPlugin plugin, CosmeticsManager manager) {
        this.plugin = plugin;
        this.manager = manager;
    }

    @Override
    public void run() {
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            CosmeticsProfile profile = manager.getProfile(player.getName());
            String type = profile.getParticleType();
            if (type == null || type.isBlank()) continue;
            Particle particle = CosmeticsPlugin.resolveParticle(type);
            if (particle == null) continue;
            player.getWorld().spawnParticle(particle, player.getLocation().add(0, 1, 0), 5, 0.3, 0.3, 0.3, 0);
        }
    }
}
