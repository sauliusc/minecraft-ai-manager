package io.craftcontrol.bridge;

import org.bukkit.Material;
import org.bukkit.OfflinePlayer;
import org.bukkit.Statistic;

/**
 * Reads the statistics Minecraft already keeps for a player.
 *
 * <p>Nothing here needs tracking code of our own: the server has recorded all of
 * it since the world was created and persists it per player, so the numbers are
 * complete and retroactive for people who were playing long before this command
 * existed. Offline players work too — the stats live in their player data.
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

    private final OfflinePlayer player;

    public VanillaStats(OfflinePlayer player) {
        this.player = player;
    }

    private long stat(Statistic s) {
        try {
            return player.getStatistic(s);
        } catch (IllegalArgumentException | IllegalStateException e) {
            // A statistic the server does not track, or player data that has
            // never been written. Either way it is a zero, not an error.
            return 0;
        }
    }

    private long stat(Statistic s, Material m) {
        try {
            return player.getStatistic(s, m);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return 0;
        }
    }

    public long playTicks()      { return stat(Statistic.PLAY_ONE_MINUTE); }
    public long mobKills()       { return stat(Statistic.MOB_KILLS); }
    public long playerKills()    { return stat(Statistic.PLAYER_KILLS); }
    public long deaths()         { return stat(Statistic.DEATHS); }
    public long jumps()          { return stat(Statistic.JUMP); }
    public long fishCaught()     { return stat(Statistic.FISH_CAUGHT); }
    public long animalsBred()    { return stat(Statistic.ANIMALS_BRED); }
    public long villagerTrades() { return stat(Statistic.TRADED_WITH_VILLAGER); }
    public long itemsEnchanted() { return stat(Statistic.ITEM_ENCHANTED); }
    public long damageDealt()    { return stat(Statistic.DAMAGE_DEALT); }
    public long damageTaken()    { return stat(Statistic.DAMAGE_TAKEN); }
    public long timeSinceDeath() { return stat(Statistic.TIME_SINCE_DEATH); }

    /** Every movement counter added together. */
    public long travelledCm() {
        long total = 0;
        for (Statistic s : TRAVEL) total += stat(s);
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
        long mined = 0, crafted = 0, diamonds = 0;
        for (Material m : Material.values()) {
            if (m.isLegacy()) continue;
            if (m.isBlock()) {
                long n = stat(Statistic.MINE_BLOCK, m);
                mined += n;
                if (m == Material.DIAMOND_ORE || m == Material.DEEPSLATE_DIAMOND_ORE) diamonds += n;
            }
            if (m.isItem()) crafted += stat(Statistic.CRAFT_ITEM, m);
        }
        return new Totals(mined, crafted, diamonds);
    }

    public record Totals(long mined, long crafted, long diamondOre) {}
}
