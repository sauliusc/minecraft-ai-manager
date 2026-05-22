package io.craftcontrol.quest;

import io.craftcontrol.quest.model.QuestCategory;
import io.craftcontrol.quest.model.QuestData;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.command.*;
import org.bukkit.entity.Player;
import java.util.List;

public class QuestsCommand implements CommandExecutor {
    private final QuestRepository repo;
    private final QuestPlugin plugin;

    public QuestsCommand(QuestPlugin plugin, QuestRepository repo) {
        this.plugin = plugin;
        this.repo = repo;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Only players can use this command.");
            return true;
        }
        String uuid = player.getName();
        List<QuestData> quests = repo.getQuests(uuid);

        if (quests.isEmpty()) {
            player.sendMessage(Component.text("No active quests. Check back later!", NamedTextColor.YELLOW));
            // Trigger async refresh
            plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> repo.fetchQuests(uuid));
            return true;
        }

        player.sendMessage(Component.text("═══ Your Quests ═══", NamedTextColor.GOLD));
        for (QuestCategory cat : QuestCategory.values()) {
            List<QuestData> catQuests = quests.stream().filter(q -> q.category() == cat).toList();
            if (catQuests.isEmpty()) continue;
            player.sendMessage(Component.text("» " + cat.name(), NamedTextColor.AQUA));
            for (QuestData q : catQuests) {
                int pct = q.targetCount() > 0 ? Math.min(100, q.currentProgress() * 100 / q.targetCount()) : 0;
                String bar = "█".repeat(pct / 10) + "░".repeat(10 - pct / 10);
                NamedTextColor titleColor = q.completed() ? NamedTextColor.GREEN : NamedTextColor.WHITE;
                player.sendMessage(Component.text("  ▶ " + q.title(), titleColor));
                player.sendMessage(Component.text("    " + q.description(), NamedTextColor.GRAY));
                player.sendMessage(Component.text("    " + bar + " " + q.currentProgress() + "/" + q.targetCount(), NamedTextColor.WHITE));
            }
        }
        return true;
    }
}
