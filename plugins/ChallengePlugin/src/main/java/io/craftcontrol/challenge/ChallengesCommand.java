package io.craftcontrol.challenge;

import io.craftcontrol.challenge.model.ActiveChallenge;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import java.util.List;

public class ChallengesCommand implements CommandExecutor {

    private static final int PAGE_SIZE = 5;

    private final ChallengeManager manager;
    private final ChallengeRepository repo;

    public ChallengesCommand(ChallengeManager manager, ChallengeRepository repo) {
        this.manager = manager;
        this.repo = repo;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Only players can use this command.");
            return true;
        }
        List<ActiveChallenge> challenges = manager.getActive();
        if (challenges.isEmpty()) {
            player.sendMessage(Component.text("No active challenges right now.", NamedTextColor.YELLOW));
            return true;
        }

        int totalPages = Math.max(1, (int) Math.ceil((double) challenges.size() / PAGE_SIZE));
        int page = 1;
        if (args.length > 0) {
            try {
                page = Integer.parseInt(args[0]);
            } catch (NumberFormatException ignored) {}
        }
        page = Math.max(1, Math.min(page, totalPages));

        int from = (page - 1) * PAGE_SIZE;
        int to = Math.min(from + PAGE_SIZE, challenges.size());
        List<ActiveChallenge> pageItems = challenges.subList(from, to);

        player.sendMessage(Component.text(
            "═══ Active Challenges — Page " + page + "/" + totalPages + " ═══", NamedTextColor.GOLD));
        for (ActiveChallenge ch : pageItems) {
            int current = repo.getProgress(ch.id(), player.getUniqueId().toString());
            int pct = ch.targetCount() > 0 ? Math.min(100, current * 100 / ch.targetCount()) : 0;
            String bar = buildProgressBar(pct, 10);
            player.sendMessage(Component.text("▶ " + ch.title(), NamedTextColor.AQUA));
            player.sendMessage(Component.text("  " + ch.description(), NamedTextColor.GRAY));
            player.sendMessage(Component.text("  " + bar + " " + current + "/" + ch.targetCount(), NamedTextColor.WHITE));
        }
        if (totalPages > 1) {
            String nav = "  ";
            if (page > 1) nav += "« /challenges " + (page - 1) + "  ";
            nav += "Page " + page + "/" + totalPages;
            if (page < totalPages) nav += "  /challenges " + (page + 1) + " »";
            player.sendMessage(Component.text(nav, NamedTextColor.GRAY));
        }
        return true;
    }

    private String buildProgressBar(int pct, int length) {
        int filled = pct * length / 100;
        return "█".repeat(filled) + "░".repeat(length - filled);
    }
}
