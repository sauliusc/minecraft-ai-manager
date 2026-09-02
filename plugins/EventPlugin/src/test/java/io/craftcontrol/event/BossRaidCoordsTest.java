package io.craftcontrol.event;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class BossRaidCoordsTest {

    /** Location without a World, which is all coords() needs. */
    private static org.bukkit.Location at(double x, double y, double z) {
        return new org.bukkit.Location(null, x, y, z);
    }

    @Test
    void readsAsWholeBlocksLikeTheF3Screen() {
        assertEquals("2200, 90, 4400", BossRaidHandler.coords(at(2200, 90, 4400)));
    }

    @Test
    void floorsFractionalPositions() {
        // Config values are doubles; players want the block, not 2200.7.
        assertEquals("2200, 90, 4400", BossRaidHandler.coords(at(2200.7, 90.2, 4400.9)));
    }

    @Test
    void handlesNegativeCoordinates() {
        // getBlockX floors, so -0.5 is block -1 — the same number the client shows.
        assertEquals("-2201, 64, -4401", BossRaidHandler.coords(at(-2200.5, 64, -4400.5)));
    }

    @Test
    void handlesOrigin() {
        assertEquals("0, 64, 0", BossRaidHandler.coords(at(0, 64, 0)));
    }
}
