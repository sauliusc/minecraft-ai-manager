package io.craftcontrol.stats;

import java.util.Locale;

/**
 * Turns raw statistic counters into the strings shown in {@code /stats}.
 *
 * <p>Kept free of Bukkit types so the arithmetic — which is where these things
 * go wrong — can be tested directly. Vanilla stores distances in centimetres and
 * durations in ticks, and both are easy to convert by the wrong factor.
 */
public final class StatsFormat {

    private StatsFormat() {}

    public static final int TICKS_PER_SECOND = 20;

    /**
     * Play time from the tick counter behind {@code PLAY_ONE_MINUTE} — which is
     * named for the unit it used to use and has counted ticks for years.
     */
    public static String duration(long ticks) {
        long totalMinutes = ticks / TICKS_PER_SECOND / 60;
        long days = totalMinutes / (60 * 24);
        long hours = (totalMinutes / 60) % 24;
        long minutes = totalMinutes % 60;
        if (days > 0) return days + "d " + hours + "h " + minutes + "m";
        if (hours > 0) return hours + "h " + minutes + "m";
        return minutes + "m";
    }

    /** Distance counters are centimetres; show kilometres once it is worth it. */
    public static String distance(long centimetres) {
        double metres = centimetres / 100.0;
        if (metres >= 1000) return String.format(Locale.ROOT, "%.1f km", metres / 1000.0);
        return Math.round(metres) + " m";
    }

    /**
     * Kill/death ratio. Deaths of zero would divide by zero, and reporting 0.0
     * for a player who has killed plenty and died never is exactly backwards, so
     * that case reads as the kill count itself.
     */
    public static String killDeathRatio(long kills, long deaths) {
        if (deaths <= 0) return kills == 0 ? "—" : kills + ".0";
        return String.format(Locale.ROOT, "%.2f", kills / (double) deaths);
    }

    /** Thousands separators, because six-figure block counts are unreadable raw. */
    public static String number(long value) {
        return String.format(Locale.ROOT, "%,d", value);
    }

    /** Damage is stored in tenths of a heart; show it in hearts. */
    public static String hearts(long damageTenths) {
        return String.format(Locale.ROOT, "%.1f", damageTenths / 10.0);
    }

    /** The tier ladder the dashboard uses, so both agree on what a Veteran is. */
    public static String tier(int joinCount) {
        if (joinCount >= 100) return "Legend";
        if (joinCount >= 30) return "Veteran";
        if (joinCount >= 5) return "Regular";
        return "New";
    }

    /** Whole days between two epoch millis, floored at zero. */
    public static long daysBetween(long fromMillis, long toMillis) {
        if (fromMillis <= 0 || toMillis < fromMillis) return 0;
        return (toMillis - fromMillis) / (24L * 60 * 60 * 1000);
    }
}
