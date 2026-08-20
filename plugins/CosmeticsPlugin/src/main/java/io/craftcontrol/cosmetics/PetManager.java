package io.craftcontrol.cosmetics;

import org.bukkit.Location;
import org.bukkit.entity.*;
import org.bukkit.plugin.Plugin;
import org.bukkit.scheduler.BukkitTask;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class PetManager {
    private final Plugin plugin;
    private final double followDistance;
    private final Map<UUID, Entity> pets = new ConcurrentHashMap<>();
    private final Map<UUID, BukkitTask> followTasks = new ConcurrentHashMap<>();

    public PetManager(Plugin plugin) {
        this(plugin, plugin.getConfig().getDouble("cosmetics.pet_follow_distance", 3.0));
    }

    PetManager(Plugin plugin, double followDistance) {
        this.plugin = plugin;
        this.followDistance = followDistance;
    }

    /**
     * Spawns the given pet type for the player, replacing any pet they already have.
     * Returns false if the type is not a spawnable living entity, so the caller can
     * report a misconfigured whitelist instead of silently substituting a cat.
     */
    public boolean summon(Player player, String petType) {
        EntityType type;
        try {
            type = EntityType.valueOf(petType.toUpperCase());
        } catch (IllegalArgumentException e) {
            return false;
        }
        if (!type.isSpawnable() || !type.isAlive()) return false;

        dismiss(player.getUniqueId());
        Location loc = player.getLocation().add(-1, 0, 0);
        Entity pet = player.getWorld().spawnEntity(loc, type);
        if (pet instanceof LivingEntity le) {
            le.setCustomName("§d" + player.getName() + "'s Pet");
            le.setCustomNameVisible(true);
            le.setSilent(true);
            le.setAI(false);
            le.setInvulnerable(true);
        }
        pets.put(player.getUniqueId(), pet);

        BukkitTask task = plugin.getServer().getScheduler().runTaskTimer(plugin, () -> {
            Entity p = pets.get(player.getUniqueId());
            if (p == null || p.isDead()) { dismiss(player.getUniqueId()); return; }
            Player owner = plugin.getServer().getPlayer(player.getUniqueId());
            if (owner == null || !owner.isOnline()) { dismiss(player.getUniqueId()); return; }
            Location target = owner.getLocation()
                .subtract(owner.getLocation().getDirection().normalize().multiply(followDistance));
            p.teleport(target);
        }, 20L, 20L);
        followTasks.put(player.getUniqueId(), task);

        return true;
    }

    public void dismiss(UUID uuid) {
        BukkitTask task = followTasks.remove(uuid);
        if (task != null) task.cancel();
        Entity pet = pets.remove(uuid);
        if (pet != null && !pet.isDead()) pet.remove();
    }

    public boolean hasPet(UUID uuid) { return pets.containsKey(uuid) && !pets.get(uuid).isDead(); }
}
