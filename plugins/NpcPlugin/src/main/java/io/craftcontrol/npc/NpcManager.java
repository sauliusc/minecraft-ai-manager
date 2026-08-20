package io.craftcontrol.npc;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.npc.model.NpcDefinition;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.Bukkit;
import org.bukkit.Chunk;
import org.bukkit.Location;
import org.bukkit.NamespacedKey;
import org.bukkit.World;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Villager;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.scheduler.BukkitTask;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class NpcManager {
    private final NpcPlugin plugin;
    private final ApiClient api;
    private final Gson gson = new Gson();
    private final Map<String, UUID> npcIdToEntityId = new ConcurrentHashMap<>();
    private final Map<UUID, NpcDefinition> entityIdToNpc = new ConcurrentHashMap<>();
    private final NamespacedKey npcIdKey;
    private BukkitTask syncTask;

    /**
     * Upper bound on how many duplicate NPC villagers a single sync pass may remove. The
     * backlog left by the bug in #295 runs into the thousands in one chunk; removing them
     * all in one tick would stall the main thread just as badly as leaving them there, so
     * each pass takes a bite and the next pass continues.
     */
    private static final int MAX_DUPLICATE_REMOVALS_PER_PASS = 200;

    public NpcManager(NpcPlugin plugin, ApiClient api) {
        this.plugin = plugin;
        this.api = api;
        this.npcIdKey = new NamespacedKey(plugin, "npc-id");
    }

    public void start() {
        // npcIdToEntityId only lives in memory and is empty on every plugin load, including
        // after a crash (onDisable/despawnAll never runs, so nothing gets cleaned up). Without
        // this adoption step, the very first sync after any ungraceful restart would find no
        // "existing" entity for each def and spawn a brand new villager on top of whatever was
        // already there from the previous session — permanently orphaning it. Villagers spawned
        // by this plugin carry an npc-id tag in their PersistentDataContainer (see
        // spawnOrUpdate), so on startup we scan currently loaded entities for that tag and
        // re-adopt them instead of assuming none exist. See minecraft-ai-manager#285.
        adoptExistingNpcs();
        long intervalTicks = plugin.getConfig().getLong("sync-interval-seconds", 60) * 20L;
        syncTask = Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, this::syncFromApi, 20L, intervalTicks);
    }

    private void adoptExistingNpcs() {
        for (World world : Bukkit.getWorlds()) {
            for (Entity e : world.getEntities()) {
                if (!(e instanceof Villager)) continue;
                String npcId = e.getPersistentDataContainer().get(npcIdKey, PersistentDataType.STRING);
                if (npcId == null) continue;

                UUID alreadyAdopted = npcIdToEntityId.get(npcId);
                if (alreadyAdopted == null) {
                    npcIdToEntityId.put(npcId, e.getUniqueId());
                } else {
                    // A previous ungraceful restart already left a duplicate for this npc id —
                    // clean it up now rather than letting it accumulate further.
                    e.remove();
                    plugin.getLogger().info("Removed duplicate NPC villager for id " + npcId
                        + " (" + e.getUniqueId() + ") found on startup.");
                }
            }
        }
        if (!npcIdToEntityId.isEmpty()) {
            plugin.getLogger().info("Adopted " + npcIdToEntityId.size() + " existing NPC villager(s) from a prior session.");
        }
    }

    private void syncFromApi() {
        api.get("/npcs/sync", new Callback() {
            @Override public void onFailure(Call call, IOException e) {
                plugin.getLogger().warning("NPC sync failed: " + e.getMessage());
            }
            @Override public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful()) {
                    plugin.getLogger().warning("NPC sync returned HTTP " + response.code());
                    response.close();
                    return;
                }
                String body = response.body().string();
                List<NpcDefinition> defs = gson.fromJson(body,
                    new TypeToken<List<NpcDefinition>>(){}.getType());
                Bukkit.getScheduler().runTask(plugin, () -> applyDefinitions(defs));
            }
        });
    }

    private void applyDefinitions(List<NpcDefinition> defs) {
        if (defs == null) return;
        for (NpcDefinition def : defs) {
            spawnOrUpdate(def);
        }
    }

    private void spawnOrUpdate(NpcDefinition def) {
        World world = Bukkit.getWorld(def.locWorld);
        if (world == null) return;
        Location loc = new Location(world, def.locX, def.locY, def.locZ, def.locYaw, 0);

        int chunkX = loc.getBlockX() >> 4;
        int chunkZ = loc.getBlockZ() >> 4;
        if (!world.isChunkLoaded(chunkX, chunkZ)) {
            // The NPC's entity is not loaded either, so Bukkit.getEntity() below would return
            // null for a villager that is alive and well in the saved chunk. Spawning here
            // would force-load the chunk and stack a duplicate on top of it — every sync pass,
            // forever (this piled up 5000+ villagers and stalled the server thread, see #295).
            // Nobody can see an NPC in an unloaded chunk, so there is nothing to reconcile
            // until it loads again.
            return;
        }

        Villager existing = resolveExisting(def, world.getChunkAt(chunkX, chunkZ));
        if (existing != null) {
            existing.customName(net.kyori.adventure.text.minimessage.MiniMessage.miniMessage()
                .deserialize("<gold>" + def.name + "</gold>"));
            npcIdToEntityId.put(def.id, existing.getUniqueId());
            entityIdToNpc.put(existing.getUniqueId(), def);
            return;
        }

        Villager villager = world.spawn(loc, Villager.class, v -> {
            v.setAI(false);
            v.setInvulnerable(true);
            v.setPersistent(true);
            v.customName(net.kyori.adventure.text.minimessage.MiniMessage.miniMessage()
                .deserialize("<gold>" + def.name + "</gold>"));
            v.setCustomNameVisible(true);
            v.setVillagerType(Villager.Type.PLAINS);
            v.setProfession(def.type != null && def.type.equals("QUEST_GIVER")
                ? Villager.Profession.CARTOGRAPHER : Villager.Profession.NONE);
            // Tagged so a future restart can find and adopt this exact entity instead of
            // spawning a duplicate on top of it — see adoptExistingNpcs().
            v.getPersistentDataContainer().set(npcIdKey, PersistentDataType.STRING, def.id);
        });

        npcIdToEntityId.put(def.id, villager.getUniqueId());
        entityIdToNpc.put(villager.getUniqueId(), def);
    }

    /**
     * Finds this definition's villager in its (already loaded) chunk, or null if it genuinely
     * does not exist yet. The chunk's own contents are the source of truth rather than the
     * in-memory UUID map, which is empty after any restart and stale after an entity is
     * removed by something else. Any surplus tagged villagers found are deleted, so the
     * duplicate backlog from #295 drains as the chunks get loaded.
     */
    private Villager resolveExisting(NpcDefinition def, Chunk chunk) {
        UUID known = npcIdToEntityId.get(def.id);
        Villager keep = null;
        int removed = 0;

        for (Entity e : chunk.getEntities()) {
            if (!(e instanceof Villager v) || v.isDead()) continue;
            if (!def.id.equals(v.getPersistentDataContainer().get(npcIdKey, PersistentDataType.STRING))) continue;

            if (keep == null || v.getUniqueId().equals(known)) {
                // Prefer the entity we already know about so its identity stays stable across
                // passes; the one it displaces is a duplicate and falls through to removal.
                if (keep != null) {
                    entityIdToNpc.remove(keep.getUniqueId());
                    keep.remove();
                    removed++;
                }
                keep = v;
                continue;
            }
            if (removed >= MAX_DUPLICATE_REMOVALS_PER_PASS) break;
            entityIdToNpc.remove(v.getUniqueId());
            v.remove();
            removed++;
        }

        if (removed > 0) {
            plugin.getLogger().info("Removed " + removed + " duplicate NPC villager(s) for id "
                + def.id + " in chunk " + chunk.getX() + "," + chunk.getZ() + ".");
        }
        return keep;
    }

    public void despawnAll() {
        for (UUID entityId : new java.util.ArrayList<>(entityIdToNpc.keySet())) {
            Entity e = Bukkit.getEntity(entityId);
            if (e != null) e.remove();
        }
        npcIdToEntityId.clear();
        entityIdToNpc.clear();
    }

    public NpcDefinition getDefinitionByEntityId(UUID entityId) {
        return entityIdToNpc.get(entityId);
    }

    public void getRelationship(String playerName, String npcId, okhttp3.Callback callback) {
        api.get("/npcs/" + npcId + "/relationship/" + playerName, callback);
    }

    public void recordQuestComplete(String playerName, String npcId, String questId) {
        String body = "{\"questId\":\"" + questId + "\"}";
        api.post("/npcs/" + npcId + "/relationship/" + playerName + "/quest-complete", body, new Callback() {
            @Override public void onFailure(Call call, IOException e) {
                plugin.getLogger().warning("Failed to record quest complete for player " + playerName + ": " + e.getMessage());
            }
            @Override public void onResponse(Call call, Response response) {
                if (!response.isSuccessful()) {
                    plugin.getLogger().warning("Quest complete record returned HTTP " + response.code()
                            + " for player " + playerName + " / npc " + npcId);
                }
                response.close();
            }
        });
    }
}
