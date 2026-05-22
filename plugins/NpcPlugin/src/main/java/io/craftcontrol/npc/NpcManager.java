package io.craftcontrol.npc;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.npc.model.NpcDefinition;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Villager;
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
    private BukkitTask syncTask;

    public NpcManager(NpcPlugin plugin, ApiClient api) {
        this.plugin = plugin;
        this.api = api;
    }

    public void start() {
        long intervalTicks = plugin.getConfig().getLong("sync-interval-seconds", 60) * 20L;
        syncTask = Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, this::syncFromApi, 20L, intervalTicks);
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

        UUID existing = npcIdToEntityId.get(def.id);
        if (existing != null) {
            Entity e = Bukkit.getEntity(existing);
            if (e != null && !e.isDead()) {
                // Update name
                if (e instanceof Villager v) {
                    v.customName(net.kyori.adventure.text.minimessage.MiniMessage.miniMessage()
                        .deserialize("<gold>" + def.name + "</gold>"));
                }
                entityIdToNpc.put(existing, def);
                return;
            }
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
        });

        npcIdToEntityId.put(def.id, villager.getUniqueId());
        entityIdToNpc.put(villager.getUniqueId(), def);
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
