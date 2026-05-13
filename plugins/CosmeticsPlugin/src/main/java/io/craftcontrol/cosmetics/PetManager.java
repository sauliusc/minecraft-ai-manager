package io.craftcontrol.cosmetics;

import org.bukkit.Location;
import org.bukkit.entity.*;
import org.bukkit.plugin.Plugin;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class PetManager {
    private final Plugin plugin;
    private final Map<UUID, Entity> pets = new ConcurrentHashMap<>();

    public PetManager(Plugin plugin) {
        this.plugin = plugin;
    }

    public boolean summon(Player player, String petType) {
        dismiss(player.getUniqueId());
        Location loc = player.getLocation().add(-1, 0, 0);
        EntityType type;
        try {
            type = EntityType.valueOf(petType.toUpperCase());
        } catch (IllegalArgumentException e) {
            type = EntityType.CAT;
        }
        Entity pet = player.getWorld().spawnEntity(loc, type);
        if (pet instanceof LivingEntity le) {
            le.setCustomName("§d" + player.getName() + "'s Pet");
            le.setCustomNameVisible(true);
            le.setSilent(true);
            le.setAI(false);
            le.setInvulnerable(true);
        }
        pets.put(player.getUniqueId(), pet);

        plugin.getServer().getScheduler().runTaskTimer(plugin, () -> {
            Entity p = pets.get(player.getUniqueId());
            if (p == null || p.isDead()) { pets.remove(player.getUniqueId()); return; }
            Player owner = plugin.getServer().getPlayer(player.getUniqueId());
            if (owner == null || !owner.isOnline()) { p.remove(); pets.remove(player.getUniqueId()); return; }
            Location target = owner.getLocation().subtract(owner.getLocation().getDirection().normalize().multiply(2));
            p.teleport(target);
        }, 20L, 20L);

        return true;
    }

    public void dismiss(UUID uuid) {
        Entity pet = pets.remove(uuid);
        if (pet != null && !pet.isDead()) pet.remove();
    }

    public boolean hasPet(UUID uuid) { return pets.containsKey(uuid) && !pets.get(uuid).isDead(); }
}
