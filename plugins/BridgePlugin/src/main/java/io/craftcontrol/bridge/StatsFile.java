package io.craftcontrol.bridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Map;
import java.util.UUID;

/**
 * Reads a player's statistics straight out of Minecraft's own JSON file.
 *
 * <p>This exists because {@code CraftOfflinePlayer.getStatistic} re-reads and
 * re-parses the whole file on <em>every call</em> — it constructs a fresh
 * ServerStatsCounter each time. Summing per-material counters that way meant
 * thousands of full parses for one lookup, which froze the server for fifteen
 * seconds (#355).
 *
 * <p>One read and one parse replaces all of it, and because nothing here touches
 * the Bukkit API it can run off the main thread entirely.
 */
public class StatsFile {

    private final JsonObject stats;

    private StatsFile(JsonObject stats) {
        this.stats = stats;
    }

    /** How far up from the world folder to look for the stats directory. */
    private static final int MAX_ASCENT = 4;

    /**
     * Finds a player's statistics file, or null when there is none.
     *
     * <p>The location is searched for rather than assumed. Minecraft's newer
     * world layout puts region data under
     * {@code world/dimensions/minecraft/overworld} while player statistics stay
     * at {@code world/players/stats}, so {@code getWorldFolder()} can point
     * several levels below the directory being looked for (#357). Walking up
     * handles both that and the older flat layout.
     */
    public static File locate(File worldFolder, UUID uuid) {
        if (worldFolder == null || uuid == null) return null;
        File dir = worldFolder;
        for (int i = 0; i <= MAX_ASCENT && dir != null; i++, dir = dir.getParentFile()) {
            for (String sub : new String[]{"players/stats", "stats"}) {
                File file = new File(dir, sub + "/" + uuid + ".json");
                if (file.isFile()) return file;
            }
        }
        return null;
    }

    /**
     * Loads the statistics for a player, or null when there is no file — a
     * player who has never played, or whose statistics have not been written yet.
     */
    public static StatsFile load(File worldFolder, UUID uuid) {
        File file = locate(worldFolder, uuid);
        if (file == null) return null;
        try {
            String json = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
            JsonObject root = JsonParser.parseString(json).getAsJsonObject();
            JsonObject stats = root.getAsJsonObject("stats");
            return new StatsFile(stats == null ? new JsonObject() : stats);
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /** A counter from {@code minecraft:custom}, such as {@code play_time}. */
    public long custom(String key) {
        return entry("minecraft:custom", "minecraft:" + key);
    }

    /** One entry of a category, e.g. {@code minecraft:mined} / {@code minecraft:stone}. */
    public long entry(String category, String key) {
        JsonObject group = stats.getAsJsonObject(category);
        if (group == null) return 0;
        JsonElement value = group.get(key);
        return value == null || value.isJsonNull() ? 0 : value.getAsLong();
    }

    /**
     * Every counter in a category added up — the whole point of reading the file
     * rather than asking per material.
     */
    public long categoryTotal(String category) {
        JsonObject group = stats.getAsJsonObject(category);
        if (group == null) return 0;
        long total = 0;
        for (Map.Entry<String, JsonElement> e : group.entrySet()) {
            if (!e.getValue().isJsonNull()) total += e.getValue().getAsLong();
        }
        return total;
    }
}
