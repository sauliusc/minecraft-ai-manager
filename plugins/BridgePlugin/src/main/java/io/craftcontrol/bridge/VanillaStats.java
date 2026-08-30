package io.craftcontrol.bridge;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.OfflinePlayer;
import org.bukkit.Statistic;
import org.bukkit.entity.Player;

import java.io.File;

/**
 * Reads the statistics Minecraft already keeps for a player.
 *
 * <p>Nothing here needs tracking code of our own: the server has recorded all of
 * it since the world was created and persists it per player, so the numbers are
 * complete and retroactive for people who were playing long before this command
 * existed.
 *
 * <p>Two paths, deliberately. An online player is read through the Bukkit API,
 * where the counters are a live map lookup and always current. An offline player
 * is read from their statistics file instead, because
 * {@code CraftOfflinePlayer.getStatistic} re-parses that entire file on every
 * single call — summing per-material counters that way froze the server for
 * fifteen seconds (#355). Reading the file costs one parse and needs no main
 * thread at all.
 */
public class VanillaStats {

    /** Movement counters, all in centimetres, summed for "distance travelled". */
    private static final Statistic[] TRAVEL = {
        Statistic.WALK_ONE_CM, Statistic.SPRINT_ONE_CM, Statistic.CROUCH_ONE_CM,
        Statistic.SWIM_ONE_CM, Statistic.WALK_ON_WATER_ONE_CM, Statistic.WALK_UNDER_WATER_ONE_CM,
        Statistic.FLY_ONE_CM, Statistic.AVIATE_ONE_CM, Statistic.CLIMB_ONE_CM, Statistic.FALL_ONE_CM,
        Statistic.BOAT_ONE_CM, Statistic.MINECART_ONE_CM, Statistic.HORSE_ONE_CM,
        Statistic.PIG_ONE_CM, Statistic.STRIDER_ONE_CM,
    };

    /** File keys for TRAVEL, in the same order. */
    private static final String[] TRAVEL_KEYS = {
        "walk_one_cm", "sprint_one_cm", "crouch_one_cm",
        "swim_one_cm", "walk_on_water_one_cm", "walk_under_water_one_cm",
        "fly_one_cm", "aviate_one_cm", "climb_one_cm", "fall_one_cm",
        "boat_one_cm", "minecart_one_cm", "horse_one_cm",
        "pig_one_cm", "strider_one_cm",
    };

    private final OfflinePlayer player;
    /** Non-null when reading from disk, i.e. the player is offline. */
    private final StatsFile file;

    public VanillaStats(OfflinePlayer player) {
        this.player = player;
        this.file = player != null && player.isOnline()
            ? null
            : StatsFile.load(worldFolder(), player == null ? null : player.getUniqueId());
    }

    private static File worldFolder() {
        return Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0).getWorldFolder();
    }

    /** True when the player is offline and no statistics file could be read. */
    public boolean isEmpty() {
        return file == null && (player == null || !player.isOnline());
    }

    private long stat(Statistic s, String customKey) {
        if (file != null) return file.custom(customKey);
        try {
            return player.getStatistic(s);
        } catch (IllegalArgumentException | IllegalStateException e) {
            // A statistic the server does not track, or player data that has
            // never been written. Either way it is a zero, not an error.
            return 0;
        }
    }

    // The file keys are not derivable from the enum names — PLAY_ONE_MINUTE is
    // stored as play_time — so each is named explicitly.
    public long playTicks()      { return stat(Statistic.PLAY_ONE_MINUTE, "play_time"); }
    public long mobKills()       { return stat(Statistic.MOB_KILLS, "mob_kills"); }
    public long playerKills()    { return stat(Statistic.PLAYER_KILLS, "player_kills"); }
    public long deaths()         { return stat(Statistic.DEATHS, "deaths"); }
    public long jumps()          { return stat(Statistic.JUMP, "jump"); }
    public long fishCaught()     { return stat(Statistic.FISH_CAUGHT, "fish_caught"); }
    public long animalsBred()    { return stat(Statistic.ANIMALS_BRED, "animals_bred"); }
    public long villagerTrades() { return stat(Statistic.TRADED_WITH_VILLAGER, "traded_with_villager"); }
    public long itemsEnchanted() { return stat(Statistic.ITEM_ENCHANTED, "enchant_item"); }
    public long damageDealt()    { return stat(Statistic.DAMAGE_DEALT, "damage_dealt"); }
    public long damageTaken()    { return stat(Statistic.DAMAGE_TAKEN, "damage_taken"); }
    public long timeSinceDeath() { return stat(Statistic.TIME_SINCE_DEATH, "time_since_death"); }

    /** Every movement counter added together. */
    public long travelledCm() {
        long total = 0;
        for (int i = 0; i < TRAVEL.length; i++) total += stat(TRAVEL[i], TRAVEL_KEYS[i]);
        return total;
    }

    /**
     * Blocks mined and items crafted, summed across every material in one pass.
     *
     * <p>MINE_BLOCK and CRAFT_ITEM are per-material, so a total means walking the
     * whole Material list. Doing it once and returning both totals keeps that to
     * a single traversal per lookup rather than one for each.
     */
    public Totals totals() {
        if (file != null) {
            // The file already groups these, so the totals are two map sums
            // rather than a walk over every material.
            return new Totals(
                file.categoryTotal("minecraft:mined"),
                file.categoryTotal("minecraft:crafted"),
                file.entry("minecraft:mined", "minecraft:diamond_ore")
                    + file.entry("minecraft:mined", "minecraft:deepslate_diamond_ore"));
        }
        Player online = player instanceof Player p ? p : null;
        if (online == null) return new Totals(0, 0, 0);
        long mined = 0, crafted = 0, diamonds = 0;
        for (Material m : Material.values()) {
            if (m.isLegacy()) continue;
            if (m.isBlock()) {
                long n = safe(online, Statistic.MINE_BLOCK, m);
                mined += n;
                if (m == Material.DIAMOND_ORE || m == Material.DEEPSLATE_DIAMOND_ORE) diamonds += n;
            }
            if (m.isItem()) crafted += safe(online, Statistic.CRAFT_ITEM, m);
        }
        return new Totals(mined, crafted, diamonds);
    }

    /** Per-material lookup on a live player, where it is a map read. */
    private static long safe(Player p, Statistic s, Material m) {
        try {
            return p.getStatistic(s, m);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return 0;
        }
    }

    public record Totals(long mined, long crafted, long diamondOre) {}
}
