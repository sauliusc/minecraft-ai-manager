package io.craftcontrol.moderation;

import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;

import java.io.File;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

public class ChatFilterManager {

    private static final Pattern PHONE = Pattern.compile("\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b");
    private static final Pattern EMAIL = Pattern.compile("[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}");
    private static final Pattern SOCIAL = Pattern.compile("@[A-Za-z0-9_]{3,30}");

    private final ModerationPlugin plugin;
    private final ModerationManager modManager;
    private List<String> blockedWords = new ArrayList<>();
    private final Map<UUID, List<Long>> warnTimestamps = new ConcurrentHashMap<>();
    private final Map<UUID, List<Long>> allViolationTimestamps = new ConcurrentHashMap<>();

    public ChatFilterManager(ModerationPlugin plugin, ModerationManager modManager) {
        this.plugin = plugin;
        this.modManager = modManager;
        loadBlocklist();
    }

    public void loadBlocklist() {
        File file = new File(plugin.getDataFolder(), "blocklist.yml");
        if (!file.exists()) {
            plugin.saveResource("blocklist.yml", false);
        }
        YamlConfiguration cfg = YamlConfiguration.loadConfiguration(file);
        List<String> words = cfg.getStringList("words");
        blockedWords = new ArrayList<>();
        for (String w : words) {
            if (w != null && !w.isBlank()) blockedWords.add(w.toLowerCase());
        }
    }

    public FilterResult filter(Player player, String message) {
        if (!plugin.getConfig().getBoolean("filter.enabled", true)) {
            return FilterResult.ALLOW;
        }

        boolean piiEnabled = plugin.getConfig().getBoolean("filter.pii_detection", true);
        if (piiEnabled && containsPii(message)) {
            recordViolation(player, message);
            return FilterResult.BLOCK_PII;
        }

        for (String word : blockedWords) {
            if (message.toLowerCase().contains(word)) {
                return escalate(player, message);
            }
        }

        return FilterResult.ALLOW;
    }

    private boolean containsPii(String message) {
        return PHONE.matcher(message).find()
            || EMAIL.matcher(message).find()
            || SOCIAL.matcher(message).find();
    }

    private FilterResult escalate(Player player, String message) {
        UUID uuid = player.getUniqueId();
        long now = System.currentTimeMillis();

        int muteTrigger = plugin.getConfig().getInt("filter.tiers.mute.violations", 3);
        int muteWindowMin = plugin.getConfig().getInt("filter.tiers.mute.window_minutes", 10);
        int muteDuration = plugin.getConfig().getInt("filter.tiers.mute.duration_minutes", 30);
        int banTrigger = plugin.getConfig().getInt("filter.tiers.tempban.violations", 5);
        int banWindowMin = plugin.getConfig().getInt("filter.tiers.tempban.window_minutes", 30);
        int banDuration = plugin.getConfig().getInt("filter.tiers.tempban.duration_minutes", 1440);

        recordViolation(player, message);

        List<Long> banWindow = getRecentTimestamps(allViolationTimestamps, uuid, banWindowMin * 60_000L, now);
        if (banWindow.size() >= banTrigger) {
            modManager.applyTempBan(player, banDuration, "Repeated chat violations");
            return FilterResult.TEMPBAN;
        }

        List<Long> muteWindow = getRecentTimestamps(warnTimestamps, uuid, muteWindowMin * 60_000L, now);
        if (muteWindow.size() >= muteTrigger) {
            modManager.applyMute(player.getUniqueId(), muteDuration * 60_000L);
            player.sendMessage(Component.text("You have been auto-muted for " + muteDuration + " minutes due to repeated violations.", NamedTextColor.RED));
            return FilterResult.MUTE;
        }

        warnTimestamps.computeIfAbsent(uuid, k -> new ArrayList<>()).add(now);
        player.sendMessage(Component.text("Warning: Your message contained inappropriate content and was filtered.", NamedTextColor.YELLOW));
        return FilterResult.WARN;
    }

    private void recordViolation(Player player, String message) {
        long now = System.currentTimeMillis();
        allViolationTimestamps.computeIfAbsent(player.getUniqueId(), k -> new ArrayList<>()).add(now);
    }

    private List<Long> getRecentTimestamps(Map<UUID, List<Long>> map, UUID uuid, long windowMs, long now) {
        List<Long> timestamps = map.computeIfAbsent(uuid, k -> new ArrayList<>());
        timestamps.removeIf(t -> now - t > windowMs);
        return timestamps;
    }

    public String redactPii(String message) {
        message = PHONE.matcher(message).replaceAll("***");
        message = EMAIL.matcher(message).replaceAll("***");
        message = SOCIAL.matcher(message).replaceAll("***");
        return message;
    }

    public String censorWords(String message) {
        String lower = message.toLowerCase();
        for (String word : blockedWords) {
            int idx;
            while ((idx = lower.indexOf(word)) != -1) {
                String stars = "*".repeat(word.length());
                message = message.substring(0, idx) + stars + message.substring(idx + word.length());
                lower = lower.substring(0, idx) + stars + lower.substring(idx + word.length());
            }
        }
        return message;
    }

    public enum FilterResult {
        ALLOW, WARN, MUTE, TEMPBAN, BLOCK_PII
    }
}
