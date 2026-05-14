package io.craftcontrol.npc;

import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.Statistic;
import org.bukkit.entity.Player;
import org.bukkit.entity.Villager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import io.craftcontrol.npc.model.NpcDefinition;

import java.util.List;

public class NpcListener implements Listener {
    private final NpcManager npcManager;
    private static final MiniMessage MM = MiniMessage.miniMessage();

    public NpcListener(NpcManager npcManager) {
        this.npcManager = npcManager;
    }

    @EventHandler
    public void onInteract(PlayerInteractEntityEvent event) {
        if (!(event.getRightClicked() instanceof Villager villager)) return;
        NpcDefinition def = npcManager.getDefinitionByEntityId(villager.getUniqueId());
        if (def == null) return;
        event.setCancelled(true);
        Player player = event.getPlayer();
        sendDialogue(player, def);
    }

    private void sendDialogue(Player player, NpcDefinition def) {
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
        for (String line : lines) {
            String formatted = line
                .replace("<player>", player.getName())
                .replace("<name>", def.name)
                .replace("<title>", def.title != null ? def.title : "");
            player.sendMessage(MM.deserialize("<gray>" + formatted));
        }
    }
}
