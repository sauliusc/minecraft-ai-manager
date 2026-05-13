package io.craftcontrol.event;

import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.event.model.ActiveEvent;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.*;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.CompassMeta;
import org.bukkit.plugin.Plugin;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

public class TreasureHuntHandler {
    private final Plugin plugin;
    private final Logger log;
    private final EventManager eventManager;

    private volatile String activeEventId;
    private final Set<Location> remainingChests = Collections.synchronizedSet(new HashSet<>());
    private final Map<UUID, Integer> playerFinds = new ConcurrentHashMap<>();

    public TreasureHuntHandler(Plugin plugin, EventManager eventManager) {
        this.plugin = plugin;
        this.log = plugin.getLogger();
        this.eventManager = eventManager;
    }

    public void startHunt(ActiveEvent event) {
        activeEventId = event.getId();
        remainingChests.clear();
        playerFinds.clear();

        // Load chest locations from event config
        if (event.getConfig().has("chests")) {
            var chestArr = event.getConfig().getAsJsonArray("chests");
            World world = Bukkit.getWorlds().get(0);
            chestArr.forEach(el -> {
                var o = el.getAsJsonObject();
                Location loc = new Location(world,
                    o.get("x").getAsDouble(), o.get("y").getAsDouble(), o.get("z").getAsDouble());
                remainingChests.add(loc);
            });
        }

        // Distribute compass to all online players
        ItemStack compass = new ItemStack(Material.COMPASS);
        compass.editMeta(m -> m.displayName(Component.text("Mystery Compass", NamedTextColor.GOLD)));
        for (Player p : Bukkit.getOnlinePlayers()) {
            p.getInventory().addItem(compass.clone());
            p.sendMessage(Component.text("⚡ Treasure Hunt has begun! Find the hidden chests!", NamedTextColor.GOLD));
        }

        // Action bar update every 2s
        plugin.getServer().getScheduler().runTaskTimer(plugin, () -> {
            if (activeEventId == null) return;
            for (Player p : Bukkit.getOnlinePlayers()) {
                boolean holdingCompass = p.getInventory().getItemInMainHand().getType() == Material.COMPASS
                    || p.getInventory().getItemInOffHand().getType() == Material.COMPASS;
                if (!holdingCompass) continue;
                Location nearest = findNearest(p.getLocation());
                if (nearest == null) {
                    p.sendActionBar(Component.text("No more treasures!", NamedTextColor.GOLD));
                    continue;
                }
                double dist = p.getLocation().distance(nearest);
                String arrow = getDirectionArrow(p.getLocation(), nearest);
                p.sendActionBar(Component.text(arrow + " Treasure: " + (int)dist + "m | " + remainingChests.size() + " left", NamedTextColor.YELLOW));
            }
        }, 0L, 40L);

        Bukkit.broadcastMessage("§6⚡ Treasure Hunt started! " + remainingChests.size() + " chests hidden!");
    }

    public boolean tryClaimChest(Player player, Location loc) {
        if (activeEventId == null) return false;
        Location claimed = null;
        synchronized (remainingChests) {
            for (Location c : remainingChests) {
                if (c.getBlockX() == loc.getBlockX() && c.getBlockY() == loc.getBlockY()
                        && c.getBlockZ() == loc.getBlockZ()) {
                    claimed = c;
                    break;
                }
            }
            if (claimed == null) return false;
            remainingChests.remove(claimed);
        }
        playerFinds.merge(player.getUniqueId(), 1, Integer::sum);
        int remaining = remainingChests.size();
        Bukkit.broadcastMessage("§6⚡ " + player.getName() + " found a treasure! " + remaining + " remain!");

        if (remaining == 0) endHunt();
        return true;
    }

    private void endHunt() {
        if (activeEventId == null) return;
        String eventId = activeEventId;
        activeEventId = null;

        // Remove compasses from players
        for (Player p : Bukkit.getOnlinePlayers()) {
            p.getInventory().remove(Material.COMPASS);
        }

        Bukkit.broadcastMessage("§6⚡ Treasure Hunt ended! Thanks for playing!");
        eventManager.completeEvent(eventId);
    }

    private Location findNearest(Location from) {
        return remainingChests.stream()
            .filter(l -> l.getWorld() != null && l.getWorld().equals(from.getWorld()))
            .min(Comparator.comparingDouble(l -> l.distanceSquared(from)))
            .orElse(null);
    }

    private String getDirectionArrow(Location from, Location to) {
        double dx = to.getX() - from.getX();
        double dz = to.getZ() - from.getZ();
        double angle = Math.toDegrees(Math.atan2(dz, dx));
        float yaw = from.getYaw();
        double relative = ((angle - yaw + 90) % 360 + 360) % 360;
        if (relative < 45) return "↑";
        if (relative < 135) return "→";
        if (relative < 225) return "↓";
        if (relative < 315) return "←";
        return "↑";
    }

    public Set<Location> getRemainingChests() { return remainingChests; }
    public boolean isActive() { return activeEventId != null; }
}
