package io.craftcontrol.stats;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class StatsFormatTest {

    @Test
    void readsPlayTimeAsTicksNotMinutes() {
        // PLAY_ONE_MINUTE is named for a unit it stopped using years ago; it
        // counts ticks. Treating it as minutes would inflate play time 1200x.
        assertEquals("1m", StatsFormat.duration(20 * 60));
        assertEquals("1h 0m", StatsFormat.duration(20L * 60 * 60));
        assertEquals("2h 30m", StatsFormat.duration(20L * 60 * 150));
    }

    @Test
    void rollsPlayTimeIntoDays() {
        assertEquals("1d 1h 1m", StatsFormat.duration(20L * 60 * (24 * 60 + 61)));
    }

    @Test
    void showsZeroPlayTimeAsMinutes() {
        assertEquals("0m", StatsFormat.duration(0));
        assertEquals("0m", StatsFormat.duration(19));   // less than a tick-second
    }

    @Test
    void convertsCentimetresNotMetres() {
        // The counters are centimetres. Reading them as metres would report a
        // hundred times too far.
        assertEquals("1 m", StatsFormat.distance(100));
        assertEquals("999 m", StatsFormat.distance(99_900));
        assertEquals("1.0 km", StatsFormat.distance(100_000));
        assertEquals("12.3 km", StatsFormat.distance(1_234_000));
    }

    @Test
    void handlesNoDistance() {
        assertEquals("0 m", StatsFormat.distance(0));
    }

    @Test
    void doesNotDivideByZeroDeaths() {
        // A player who has killed 40 mobs and never died has not got a ratio of
        // zero, which is what a naive kills/deaths would print.
        assertEquals("40.0", StatsFormat.killDeathRatio(40, 0));
        assertEquals("—", StatsFormat.killDeathRatio(0, 0));
    }

    @Test
    void computesTheUsualRatios() {
        assertEquals("2.00", StatsFormat.killDeathRatio(10, 5));
        assertEquals("0.50", StatsFormat.killDeathRatio(1, 2));
    }

    @Test
    void groupsLargeNumbers() {
        assertEquals("1,234,567", StatsFormat.number(1234567));
        assertEquals("0", StatsFormat.number(0));
    }

    @Test
    void showsDamageInHeartsNotTenths() {
        assertEquals("10.0", StatsFormat.hearts(100));
        assertEquals("0.5", StatsFormat.hearts(5));
    }

    @Test
    void matchesTheTierLadderTheDashboardUses() {
        assertEquals("New", StatsFormat.tier(0));
        assertEquals("New", StatsFormat.tier(4));
        assertEquals("Regular", StatsFormat.tier(5));
        assertEquals("Regular", StatsFormat.tier(29));
        assertEquals("Veteran", StatsFormat.tier(30));
        assertEquals("Veteran", StatsFormat.tier(99));
        assertEquals("Legend", StatsFormat.tier(100));
    }

    @Test
    void countsWholeDaysOnTheServer() {
        long day = 24L * 60 * 60 * 1000;
        assertEquals(0, StatsFormat.daysBetween(1000, 1000 + day - 1));
        assertEquals(1, StatsFormat.daysBetween(1000, 1000 + day));
        assertEquals(10, StatsFormat.daysBetween(1000, 1000 + 10 * day));
    }

    @Test
    void treatsMissingOrBackwardsDatesAsZeroDays() {
        assertEquals(0, StatsFormat.daysBetween(0, System.currentTimeMillis()));
        assertEquals(0, StatsFormat.daysBetween(2000, 1000));
    }
}
