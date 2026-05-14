package io.craftcontrol.npc;

import com.google.gson.Gson;
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

        // Fetch active events async, then send dialogue on main thread
        if (BridgePlugin.getInstance() != null) {
            BridgePlugin.getInstance().getApiClient().get("/api/events/active", new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    plugin.getServer().getScheduler().runTask(plugin, () -> sendDialogue(player, def, null));
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
                    plugin.getServer().getScheduler().runTask(plugin, () -> sendDialogue(player, def, eventTitle));
                }
            });
        } else {
            sendDialogue(player, def, null);
        }
    }

    private void sendDialogue(Player player, NpcDefinition def, String activeEventTitle) {
        List<String> lines = def.dialogueLines;
        if (lines == null || lines.isEmpty()) {
            player.sendMessage(MM.deserialize("<gray>[" + def.name + "] <white>...</white>"));
            return;
        }
        player.sendMessage(MM.deserialize("<gold><bold>" + def.name + "</bold></gold>"));
        // Recognise returning players (LEAVE_GAME stat > 0 means they've played before)
        boolean isReturning = player.getStatistic(Statistic.LEAVE_GAME) > 0;
        if (isReturning) {
            player.sendMessage(MM.deserialize("<yellow>Oh, " + player.getName() + "! You're back!"));
        }
        // Dynamic event comment if an event is currently active
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
}
