package io.craftcontrol.bridge;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class StatsFileTest {

    /** Shaped like a real stats file, with the keys Minecraft actually writes. */
    private static final String SAMPLE = """
        {"stats":{
          "minecraft:custom":{"minecraft:play_time":1468053,"minecraft:mob_kills":349,
                              "minecraft:deaths":1,"minecraft:walk_one_cm":1969763},
          "minecraft:mined":{"minecraft:stone":4000,"minecraft:diamond_ore":18,
                             "minecraft:deepslate_diamond_ore":5},
          "minecraft:crafted":{"minecraft:torch":600,"minecraft:stick":291}
        },"DataVersion":4325}
        """;

    private static File world(File dir, UUID uuid, String json) throws Exception {
        File stats = new File(dir, "players/stats");
        assertTrue(stats.mkdirs());
        Files.write(new File(stats, uuid + ".json").toPath(), json.getBytes(StandardCharsets.UTF_8));
        return dir;
    }

    @Test
    void readsCustomCounters(@TempDir File dir) throws Exception {
        UUID id = UUID.randomUUID();
        StatsFile f = StatsFile.load(world(dir, id, SAMPLE), id);

        assertNotNull(f);
        assertEquals(1468053, f.custom("play_time"));
        assertEquals(349, f.custom("mob_kills"));
        assertEquals(1, f.custom("deaths"));
    }

    @Test
    void treatsAnAbsentCounterAsZero() throws Exception {
        // Minecraft only writes counters a player has actually moved, so a stat
        // they have never triggered is simply missing.
        File dir = Files.createTempDirectory("stats").toFile();
        UUID id = UUID.randomUUID();
        StatsFile f = StatsFile.load(world(dir, id, SAMPLE), id);

        assertEquals(0, f.custom("player_kills"));
        assertEquals(0, f.custom("fish_caught"));
    }

    @Test
    void sumsAWholeCategoryInOnePass(@TempDir File dir) throws Exception {
        // This is the point of reading the file: totals without asking per material.
        UUID id = UUID.randomUUID();
        StatsFile f = StatsFile.load(world(dir, id, SAMPLE), id);

        assertEquals(4023, f.categoryTotal("minecraft:mined"));
        assertEquals(891, f.categoryTotal("minecraft:crafted"));
        assertEquals(0, f.categoryTotal("minecraft:nonexistent"));
    }

    @Test
    void readsIndividualEntries(@TempDir File dir) throws Exception {
        UUID id = UUID.randomUUID();
        StatsFile f = StatsFile.load(world(dir, id, SAMPLE), id);

        assertEquals(18, f.entry("minecraft:mined", "minecraft:diamond_ore"));
        assertEquals(5, f.entry("minecraft:mined", "minecraft:deepslate_diamond_ore"));
        assertEquals(0, f.entry("minecraft:mined", "minecraft:bedrock"));
    }

    @Test
    void returnsNullWhenThePlayerHasNoFile(@TempDir File dir) {
        assertNull(StatsFile.load(dir, UUID.randomUUID()));
    }

    @Test
    void returnsNullRatherThanThrowingOnCorruptJson(@TempDir File dir) throws Exception {
        UUID id = UUID.randomUUID();
        assertNull(StatsFile.load(world(dir, id, "{not json"), id));
    }

    @Test
    void copesWithAFileThatHasNoStatsObject(@TempDir File dir) throws Exception {
        UUID id = UUID.randomUUID();
        StatsFile f = StatsFile.load(world(dir, id, "{\"DataVersion\":4325}"), id);

        assertNotNull(f);
        assertEquals(0, f.custom("play_time"));
        assertEquals(0, f.categoryTotal("minecraft:mined"));
    }

    @Test
    void handlesMissingArguments(@TempDir File dir) {
        assertNull(StatsFile.load(null, UUID.randomUUID()));
        assertNull(StatsFile.load(dir, null));
    }

    @Test
    void alsoFindsTheOlderStatsDirectory(@TempDir File dir) throws Exception {
        // Paper has moved this between versions; both layouts must work.
        UUID id = UUID.randomUUID();
        File stats = new File(dir, "stats");
        assertTrue(stats.mkdirs());
        Files.write(new File(stats, id + ".json").toPath(), SAMPLE.getBytes(StandardCharsets.UTF_8));

        StatsFile f = StatsFile.load(dir, id);
        assertNotNull(f);
        assertEquals(349, f.custom("mob_kills"));
    }

    @Test
    void findsStatsWhenTheWorldFolderIsADimensionSubdirectory(@TempDir File dir) throws Exception {
        // The layout this server actually uses: region data lives under
        // dimensions/minecraft/overworld while stats stay at the world root, so
        // getWorldFolder() points several levels below what we are looking for.
        UUID id = UUID.randomUUID();
        world(dir, id, SAMPLE);
        File dimension = new File(dir, "dimensions/minecraft/overworld");
        assertTrue(dimension.mkdirs());

        StatsFile f = StatsFile.load(dimension, id);

        assertNotNull(f, "should have walked up to the world root");
        assertEquals(4023, f.categoryTotal("minecraft:mined"));
        assertEquals(349, f.custom("mob_kills"));
    }

    @Test
    void stillFindsStatsWhenGivenTheWorldRootDirectly(@TempDir File dir) throws Exception {
        UUID id = UUID.randomUUID();
        StatsFile f = StatsFile.load(world(dir, id, SAMPLE), id);

        assertNotNull(f);
        assertEquals(4023, f.categoryTotal("minecraft:mined"));
    }

    @Test
    void doesNotWalkUpForever(@TempDir File dir) throws Exception {
        // A missing file must stay missing rather than climbing to the filesystem
        // root and picking up somebody else's world.
        File deep = new File(dir, "a/b/c/d/e/f/g");
        assertTrue(deep.mkdirs());
        UUID id = UUID.randomUUID();
        world(dir, id, SAMPLE);

        assertNull(StatsFile.load(deep, id));
    }

    @Test
    void locateReportsTheFileItFound(@TempDir File dir) throws Exception {
        UUID id = UUID.randomUUID();
        world(dir, id, SAMPLE);

        File found = StatsFile.locate(new File(dir, "dimensions/minecraft/overworld"), id);

        assertNotNull(found);
        assertTrue(found.getPath().endsWith("players/stats/" + id + ".json"), found.getPath());
    }
}
