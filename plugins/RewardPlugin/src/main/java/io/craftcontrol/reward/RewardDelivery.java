package io.craftcontrol.reward;

import io.craftcontrol.reward.model.RewardGrant;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.title.Title;
import java.util.Map;
import java.util.logging.Logger;

public class RewardDelivery {
    private final Logger log;

    public RewardDelivery(Logger log) { this.log = log; }

    public void deliver(Player player, RewardGrant grant) {
        switch (grant.rewardType()) {
            case "ITEM"     -> deliverItem(player, grant);
            case "XP"       -> deliverXp(player, grant);
            case "COMMAND"  -> deliverCommand(player, grant);
            case "CURRENCY" -> {} // credited server-side — just show the theatrics
            default         -> log.warning("Unknown reward type: " + grant.rewardType());
        }
        playTheatrics(player, grant);
    }

    @SuppressWarnings("unchecked")
    private void deliverItem(Player player, RewardGrant grant) {
        try {
            Map<String, Object> cfg = (Map<String, Object>) grant.config();
            String mat = (String) cfg.getOrDefault("material", "DIAMOND");
            int amount = ((Number) cfg.getOrDefault("amount", 1)).intValue();
            ItemStack item = new ItemStack(Material.valueOf(mat), amount);
            Map<Integer, ItemStack> overflow = player.getInventory().addItem(item);
            overflow.values().forEach(i -> player.getWorld().dropItemNaturally(player.getLocation(), i));
        } catch (Exception e) {
            log.warning("Failed to deliver ITEM reward: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void deliverXp(Player player, RewardGrant grant) {
        Map<String, Object> cfg = (Map<String, Object>) grant.config();
        int amount = ((Number) cfg.getOrDefault("amount", 100)).intValue();
        player.giveExp(amount);
    }

    @SuppressWarnings("unchecked")
    private void deliverCommand(Player player, RewardGrant grant) {
        Map<String, Object> cfg = (Map<String, Object>) grant.config();
        String cmd = (String) cfg.getOrDefault("command", "");
        if (!cmd.isBlank()) {
            String resolved = cmd.replace("{player}", player.getName());
            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), resolved);
        }
    }

    /**
     * Build a readable description of the reward for chat/title display.
     * Uses the reward name from the DB; falls back to a type+config summary.
     */
    @SuppressWarnings("unchecked")
    private String buildDisplayName(RewardGrant grant) {
        // Prefer the human-readable name stored in the DB
        String name = grant.rewardName();
        if (name != null && !name.isBlank()) return name;

        // Fallback: derive description from type + config
        try {
            Map<String, Object> cfg = (Map<String, Object>) grant.config();
            return switch (grant.rewardType()) {
                case "ITEM" -> {
                    String mat = (String) cfg.getOrDefault("material", "DIAMOND");
                    int amt    = ((Number) cfg.getOrDefault("amount", 1)).intValue();
                    yield amt + "x " + mat.charAt(0) + mat.substring(1).toLowerCase().replace('_', ' ');
                }
                case "XP" -> {
                    int amt = ((Number) cfg.getOrDefault("amount", 100)).intValue();
                    yield "+" + amt + " XP";
                }
                case "CURRENCY" -> {
                    int coins    = cfg.containsKey("coins")    ? ((Number) cfg.get("coins")).intValue()    : 0;
                    int crystals = cfg.containsKey("crystals") ? ((Number) cfg.get("crystals")).intValue() : 0;
                    if (coins > 0 && crystals > 0) yield "+" + coins + " Coins & +" + crystals + " Crystals";
                    if (coins > 0)    yield "+" + coins    + " Coins";
                    if (crystals > 0) yield "+" + crystals + " Crystals";
                    yield "Currency reward";
                }
                case "COMMAND" -> "Special Reward";
                default        -> "Reward";
            };
        } catch (Exception e) {
            return "Reward";
        }
    }

    private void playTheatrics(Player player, RewardGrant grant) {
        String displayName = buildDisplayName(grant);
        String rarity = grant.rarity() == null ? "COMMON" : grant.rarity().toUpperCase();

        switch (rarity) {
            case "LEGENDARY" -> {
                player.showTitle(Title.title(
                    Component.text("✦ LEGENDARY REWARD!", NamedTextColor.GOLD),
                    Component.text(displayName, NamedTextColor.YELLOW)));
                player.playSound(player.getLocation(), Sound.UI_TOAST_CHALLENGE_COMPLETE, 1.0f, 1.0f);
                player.getWorld().spawnParticle(Particle.TOTEM_OF_UNDYING, player.getLocation().add(0, 1, 0), 80, 1, 1, 1, 0.1);
                Bukkit.broadcast(Component.text(player.getName() + " received a Legendary reward: " + displayName + "!", NamedTextColor.GOLD));
            }
            case "EPIC" -> {
                player.showTitle(Title.title(
                    Component.text("✦ Epic Reward!", NamedTextColor.LIGHT_PURPLE),
                    Component.text(displayName, NamedTextColor.WHITE)));
                player.playSound(player.getLocation(), Sound.ENTITY_ENDER_DRAGON_FLAP, 0.5f, 1.2f);
                player.getWorld().spawnParticle(Particle.PORTAL, player.getLocation().add(0, 1, 0), 40, 0.5, 0.5, 0.5, 0.1);
            }
            case "RARE" -> {
                player.playSound(player.getLocation(), Sound.BLOCK_NOTE_BLOCK_HARP, 1.0f, 1.5f);
                player.getWorld().spawnParticle(Particle.WITCH, player.getLocation().add(0, 1, 0), 20, 0.3, 0.3, 0.3, 0.1);
            }
            default -> player.playSound(player.getLocation(), Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 1.0f, 1.0f);
        }

        // Chat confirmation — always shown
        player.sendMessage(Component.text("✦ Reward received: ", NamedTextColor.GREEN)
            .append(Component.text(displayName, NamedTextColor.WHITE)));
    }
}
