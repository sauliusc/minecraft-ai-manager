package io.craftcontrol.npc;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.craftcontrol.bridge.BridgePlugin;
import net.kyori.adventure.text.minimessage.MiniMessage;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.Statistic;
import org.bukkit.entity.Player;
import org.bukkit.entity.Villager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import io.craftcontrol.npc.model.NpcDefinition;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class NpcListener implements Listener {
    private final NpcManager npcManager;
    private final NpcPlugin plugin;
    private static final MiniMessage MM = MiniMessage.miniMessage();

    public NpcListener(NpcManager npcManager, NpcPlugin plugin) {
        this.npcManager = npcManager;
        this.plugin = plugin;
    }

    @EventHandler
    public void onInteract(PlayerInteractEntityEvent event) {
        if (!(event.getRightClicked() instanceof Villager villager)) return;
        NpcDefinition def = npcManager.getDefinitionByEntityId(villager.getUniqueId());
        if (def == null) return;
        event.setCancelled(true);
        Player player = event.getPlayer();

        if (BridgePlugin.getInstance() != null) {
            BridgePlugin.getInstance().getApiClient().get("/events/active", new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    handleAfterEvents(player, def, null);
                }
                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    String activeEventTitle = null;
                    try (response) {
                        if (response.isSuccessful() && response.body() != null) {
                            JsonArray arr = JsonParser.parseString(response.body().string()).getAsJsonArray();
                            if (arr.size() > 0) {
                                JsonObject first = arr.get(0).getAsJsonObject();
                                activeEventTitle = first.has("title") ? first.get("title").getAsString() : null;
                            }
                        }
                    } catch (Exception ignored) {}
                    final String eventTitle = activeEventTitle;
                    handleAfterEvents(player, def, eventTitle);
                }
            });
        } else {
            handleAfterEvents(player, def, null);
        }
    }

    private void handleAfterEvents(Player player, NpcDefinition def, String activeEventTitle) {
        if ("QUEST_GIVER".equals(def.type) && def.questIds != null && !def.questIds.isEmpty()
                && BridgePlugin.getInstance() != null) {
            npcManager.getRelationship(player.getUniqueId(), def.id, new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        sendDialogue(player, def, activeEventTitle);
                        sendQuestList(player, def, 0);
                    });
                }
                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    int tier = 0;
                    try (response) {
                        if (response.isSuccessful() && response.body() != null) {
                            JsonObject rel = JsonParser.parseString(response.body().string()).getAsJsonObject();
                            if (rel.has("tier")) tier = rel.get("tier").getAsInt();
                        }
                    } catch (Exception ignored) {}
                    final int finalTier = tier;
                    plugin.getServer().getScheduler().runTask(plugin, () -> {
                        sendDialogue(player, def, activeEventTitle);
                        sendQuestList(player, def, finalTier);
                    });
                }
            });
        } else {
            plugin.getServer().getScheduler().runTask(plugin, () -> sendDialogue(player, def, activeEventTitle));
        }
    }

    private void sendDialogue(Player player, NpcDefinition def, String activeEventTitle) {
        List<String> lines = def.dialogueLines;
        if (lines == null || lines.isEmpty()) {
            player.sendMessage(MM.deserialize("<gray>[" + def.name + "] <white>...</white>"));
            return;
        }
        player.sendMessage(MM.deserialize("<gold><bold>" + def.name + "</bold></gold>"));
        boolean isReturning = player.getStatistic(Statistic.LEAVE_GAME) > 0;
        if (isReturning) {
            player.sendMessage(MM.deserialize("<yellow>Oh, " + player.getName() + "! You're back!"));
        }
        if (activeEventTitle != null) {
            player.sendMessage(MM.deserialize("<aqua>By the way, there's a <bold>" + activeEventTitle + "</bold> happening right now!"));
        }
        for (String line : lines) {
            String formatted = line
                .replace("<player>", player.getName())
                .replace("<name>", def.name)
                .replace("<title>", def.title != null ? def.title : "");
            player.sendMessage(MM.deserialize("<gray>" + formatted));
        }
    }

    private void sendQuestList(Player player, NpcDefinition def, int tier) {
        List<String> questIds = def.questIds;
        if (questIds == null || questIds.isEmpty()) return;

        player.sendMessage(MM.deserialize("<gold>— Quests —</gold>"));
        for (int i = 0; i < questIds.size(); i++) {
            String questId = questIds.get(i);
            if (i < tier) {
                player.sendMessage(MM.deserialize("<gray>✓ <strikethrough>" + questId + "</strikethrough> <dark_gray>(completed)"));
            } else if (i == tier) {
                player.sendMessage(MM.deserialize("<green>➤ " + questId + " <yellow>(available)"));
            } else {
                player.sendMessage(MM.deserialize("<dark_gray>🔒 " + questId + " <gray>(locked — complete previous quest first)"));
            }
        }
        if (tier >= questIds.size()) {
            player.sendMessage(MM.deserialize("<aqua>You have completed all quests with this NPC!"));
        }
    }
}
