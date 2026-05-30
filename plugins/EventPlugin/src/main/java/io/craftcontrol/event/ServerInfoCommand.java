package io.craftcontrol.event;

import io.craftcontrol.event.model.ActiveEvent;
import io.craftcontrol.event.model.EventState;
import io.craftcontrol.event.model.EventType;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

public class ServerInfoCommand implements CommandExecutor {

    private final EventManager eventManager;

    public ServerInfoCommand(EventManager eventManager) {
        this.eventManager = eventManager;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        sender.sendMessage(Component.text("══════ Server Info ══════", NamedTextColor.GOLD));

        showChallenges(sender);
        showEvents(sender);

        return true;
    }

    private void showChallenges(CommandSender sender) {
        sender.sendMessage(Component.text("— Challenges —", NamedTextColor.AQUA));
        try {
            showChallengesImpl(sender);
        } catch (NoClassDefFoundError e) {
            // ChallengePlugin classes not on classpath — soft-depend not loaded
            sender.sendMessage(Component.text("  Challenges unavailable.", NamedTextColor.DARK_GRAY));
        }
    }

    private void showChallengesImpl(CommandSender sender) {
        org.bukkit.plugin.Plugin challengePlugin = Bukkit.getPluginManager().getPlugin("ChallengePlugin");
        if (!(challengePlugin instanceof io.craftcontrol.challenge.ChallengePlugin cp) || !challengePlugin.isEnabled()) {
            sender.sendMessage(Component.text("  Challenges unavailable.", NamedTextColor.DARK_GRAY));
            return;
        }

        List<io.craftcontrol.challenge.model.ActiveChallenge> challenges = cp.getManager().getActive();
        if (challenges.isEmpty()) {
            sender.sendMessage(Component.text("  No active challenges.", NamedTextColor.GRAY));
            return;
        }

        for (io.craftcontrol.challenge.model.ActiveChallenge ch : challenges) {
            sender.sendMessage(Component.text("  ▶ ", NamedTextColor.YELLOW)
                    .append(Component.text(ch.title(), NamedTextColor.WHITE)));
            sender.sendMessage(Component.text("    " + ch.description(), NamedTextColor.GRAY));
        }
    }

    private void showEvents(CommandSender sender) {
        sender.sendMessage(Component.text("— Events —", NamedTextColor.AQUA));

        List<ActiveEvent> active = eventManager.getEvents().values().stream()
                .filter(e -> e.getState() == EventState.ACTIVE)
                .toList();

        List<ActiveEvent> upcoming = eventManager.getEvents().values().stream()
                .filter(e -> e.getState() == EventState.UPCOMING)
                .sorted(Comparator.comparing(ActiveEvent::getStartTime))
                .toList();

        if (active.isEmpty() && upcoming.isEmpty()) {
            sender.sendMessage(Component.text("  No active or upcoming events.", NamedTextColor.GRAY));
            return;
        }

        for (ActiveEvent event : active) {
            sender.sendMessage(Component.text("  ▶ ", NamedTextColor.GREEN)
                    .append(Component.text(eventName(event.getType()), NamedTextColor.WHITE))
                    .append(Component.text(" (Active)", NamedTextColor.GREEN)));
        }

        for (ActiveEvent event : upcoming) {
            long secondsUntil = event.getStartTime().getEpochSecond() - Instant.now().getEpochSecond();
            String countdown = formatCountdown(secondsUntil);
            sender.sendMessage(Component.text("  ▶ ", NamedTextColor.YELLOW)
                    .append(Component.text(eventName(event.getType()), NamedTextColor.WHITE))
                    .append(Component.text(" (in " + countdown + ")", NamedTextColor.YELLOW)));
        }
    }

    private static String eventName(EventType type) {
        return switch (type) {
            case BOSS_RAID -> "Boss Raid";
            case TREASURE_HUNT -> "Treasure Hunt";
            case BUILD_BATTLE -> "Build Battle";
        };
    }

    private static String formatCountdown(long seconds) {
        if (seconds <= 0) return "now";
        long h = seconds / 3600;
        long m = (seconds % 3600) / 60;
        long s = seconds % 60;
        if (h > 0) return h + "h " + m + "m";
        if (m > 0) return m + "m";
        return s + "s";
    }
}
