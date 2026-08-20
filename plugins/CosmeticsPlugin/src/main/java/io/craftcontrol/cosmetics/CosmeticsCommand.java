package io.craftcontrol.cosmetics;

import io.craftcontrol.cosmetics.model.CosmeticsProfile;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.Particle;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.io.IOException;
import java.util.List;

public class CosmeticsCommand implements CommandExecutor, TabCompleter {
    private static final String PET_USAGE = "Usage: /pet <list|set <type>|summon [type]|dismiss>";
    private static final List<String> PET_SUBCOMMANDS = List.of("list", "set", "summon", "dismiss");

    private final CosmeticsPlugin plugin;
    private final CosmeticsManager manager;
    private final PetManager petManager;
    private final PetTypes petTypes;
    private final CosmeticsListener listener;

    public CosmeticsCommand(CosmeticsPlugin plugin, CosmeticsManager manager, PetManager petManager,
                            PetTypes petTypes, CosmeticsListener listener) {
        this.plugin = plugin;
        this.manager = manager;
        this.petManager = petManager;
        this.petTypes = petTypes;
        this.listener = listener;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command cmd, String label, String[] args) {
        if (!cmd.getName().equalsIgnoreCase("pet")) return List.of();
        if (args.length == 1) {
            String prefix = args[0].toLowerCase();
            return PET_SUBCOMMANDS.stream().filter(s -> s.startsWith(prefix)).toList();
        }
        if (args.length == 2 && (args[0].equalsIgnoreCase("set") || args[0].equalsIgnoreCase("summon"))) {
            return petTypes.matching(args[1]);
        }
        return List.of();
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player player)) { sender.sendMessage(Component.text("Players only.")); return true; }
        String name = cmd.getName().toLowerCase();
        switch (name) {
            case "title" -> handleTitle(player, args);
            case "chatcolor" -> handleChatColor(player, args);
            case "particles" -> handleParticles(player, args);
            case "pet" -> handlePet(player, args);
            case "trail" -> handleTrail(player, args);
        }
        return true;
    }

    private void handleTitle(Player player, String[] args) {
        if (args.length == 0) {
            player.sendMessage(Component.text("Usage: /title <list|equip <id>|unequip>", NamedTextColor.YELLOW));
            return;
        }
        switch (args[0].toLowerCase()) {
            case "list" -> plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
                manager.fetchTitles(new Callback() {
                    @Override public void onResponse(Call c, Response r) {
                        try (r) {
                            if (!r.isSuccessful() || r.body() == null) return;
                            List<String> ids = manager.parseTitleIds(r.body().string());
                            plugin.getServer().getScheduler().runTask(plugin, () -> {
                                player.sendMessage(Component.text("Available titles:", NamedTextColor.GOLD));
                                ids.forEach(id -> player.sendMessage(Component.text("  " + id, NamedTextColor.WHITE)));
                            });
                        } catch (IOException ignored) {}
                    }
                    @Override public void onFailure(Call c, IOException e) {}
                })
            );
            case "equip" -> {
                if (args.length < 2) { player.sendMessage(Component.text("Usage: /title equip <id>", NamedTextColor.RED)); return; }
                CosmeticsProfile profile = manager.getProfile(player.getName());
                profile.setTitleId(args[1]);
                plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> manager.saveProfile(player.getName()));
                plugin.getServer().getScheduler().runTask(plugin, () -> listener.applyTabListName(player, profile));
                player.sendMessage(Component.text("Title equipped: " + args[1], NamedTextColor.GREEN));
            }
            case "unequip" -> {
                manager.getProfile(player.getName()).setTitleId(null);
                plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> manager.saveProfile(player.getName()));
                player.playerListName(player.displayName());
                player.sendMessage(Component.text("Title removed.", NamedTextColor.YELLOW));
            }
        }
    }

    private void handleChatColor(Player player, String[] args) {
        if (args.length == 0) { player.sendMessage(Component.text("Usage: /chatcolor <color|off>", NamedTextColor.YELLOW)); return; }
        CosmeticsProfile profile = manager.getProfile(player.getName());
        if (args[0].equalsIgnoreCase("off")) {
            profile.setChatColor(null);
            player.sendMessage(Component.text("Chat color removed.", NamedTextColor.YELLOW));
        } else {
            profile.setChatColor(args[0].toUpperCase());
            player.sendMessage(Component.text("Chat color set to " + args[0], NamedTextColor.GREEN));
        }
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> manager.saveProfile(player.getName()));
    }

    private void handleParticles(Player player, String[] args) {
        if (args.length == 0) { player.sendMessage(Component.text("Usage: /particles <list|equip <id>|off>", NamedTextColor.YELLOW)); return; }
        switch (args[0].toLowerCase()) {
            case "list" -> {
                player.sendMessage(Component.text("Particle types:", NamedTextColor.GOLD));
                List.of("FLAME", "HEART", "VILLAGER_HAPPY", "SPELL_WITCH", "ENCHANTMENT_TABLE", "SNOWBALL").forEach(
                    p -> player.sendMessage(Component.text("  " + p, NamedTextColor.WHITE)));
            }
            case "equip" -> {
                if (args.length < 2) { player.sendMessage(Component.text("Usage: /particles equip <type>", NamedTextColor.RED)); return; }
                try { Particle.valueOf(args[1].toUpperCase()); } catch (IllegalArgumentException e) {
                    player.sendMessage(Component.text("Unknown particle: " + args[1], NamedTextColor.RED)); return;
                }
                manager.getProfile(player.getName()).setParticleType(args[1].toUpperCase());
                plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> manager.saveProfile(player.getName()));
                plugin.getServer().getScheduler().runTaskTimer(plugin, () -> {
                    if (!player.isOnline()) return;
                    CosmeticsProfile p = manager.getProfile(player.getName());
                    if (p.getParticleType() == null) return;
                    try { player.getWorld().spawnParticle(Particle.valueOf(p.getParticleType()), player.getLocation().add(0,1,0), 5, 0.3, 0.3, 0.3, 0); }
                    catch (IllegalArgumentException ignored) {}
                }, 0L, 40L);
                player.sendMessage(Component.text("Particles equipped: " + args[1], NamedTextColor.GREEN));
            }
            case "off" -> {
                manager.getProfile(player.getName()).setParticleType(null);
                plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> manager.saveProfile(player.getName()));
                player.sendMessage(Component.text("Particles disabled.", NamedTextColor.YELLOW));
            }
        }
    }

    private void handlePet(Player player, String[] args) {
        if (args.length == 0) { player.sendMessage(Component.text(PET_USAGE, NamedTextColor.YELLOW)); return; }
        switch (args[0].toLowerCase()) {
            case "list" -> {
                CosmeticsProfile profile = manager.getProfile(player.getName());
                String current = petTypes.resolve(null, profile.getPetType());
                player.sendMessage(Component.text("Available pets:", NamedTextColor.GOLD));
                petTypes.available().forEach(type -> player.sendMessage(Component.text(
                    "  " + type + (type.equals(current) ? " (selected)" : ""),
                    type.equals(current) ? NamedTextColor.GREEN : NamedTextColor.WHITE)));
            }
            case "set" -> {
                if (args.length < 2) { player.sendMessage(Component.text("Usage: /pet set <type>", NamedTextColor.RED)); return; }
                if (!setPetType(player, args[1], true)) return;
                // Re-summon so the change is visible straight away instead of on next summon.
                if (petManager.hasPet(player.getUniqueId())) petManager.summon(player, args[1].toUpperCase());
            }
            case "summon" -> {
                CosmeticsProfile profile = manager.getProfile(player.getName());
                if (args.length >= 2 && !setPetType(player, args[1], false)) return;
                String petType = petTypes.resolve(args.length >= 2 ? args[1] : null, profile.getPetType());
                if (!petManager.summon(player, petType)) {
                    player.sendMessage(Component.text(
                        "Pet type " + petType + " cannot be spawned — ask an admin to check available_pets.",
                        NamedTextColor.RED));
                    return;
                }
                player.sendMessage(Component.text("Pet summoned: " + petType, NamedTextColor.GREEN));
            }
            case "dismiss" -> {
                petManager.dismiss(player.getUniqueId());
                player.sendMessage(Component.text("Pet dismissed.", NamedTextColor.YELLOW));
            }
            default -> player.sendMessage(Component.text(PET_USAGE, NamedTextColor.YELLOW));
        }
    }

    /** Validates a requested pet type against the whitelist and persists it. */
    private boolean setPetType(Player player, String requested, boolean announce) {
        if (!petTypes.isAllowed(requested)) {
            player.sendMessage(Component.text("Unknown pet: " + requested, NamedTextColor.RED));
            player.sendMessage(Component.text("Available: " + String.join(", ", petTypes.available()), NamedTextColor.GRAY));
            return false;
        }
        manager.getProfile(player.getName()).setPetType(requested.toUpperCase());
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> manager.saveProfile(player.getName()));
        if (announce) player.sendMessage(Component.text("Pet set to " + requested.toUpperCase(), NamedTextColor.GREEN));
        return true;
    }

    private void handleTrail(Player player, String[] args) {
        if (args.length == 0) { player.sendMessage(Component.text("Usage: /trail <equip <id>|off>", NamedTextColor.YELLOW)); return; }
        CosmeticsProfile profile = manager.getProfile(player.getName());
        if (args[0].equalsIgnoreCase("off")) {
            profile.setTrailType(null);
            plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> manager.saveProfile(player.getName()));
            player.sendMessage(Component.text("Trail disabled.", NamedTextColor.YELLOW));
        } else if (args[0].equalsIgnoreCase("equip") && args.length >= 2) {
            try { Particle.valueOf(args[1].toUpperCase()); } catch (IllegalArgumentException e) {
                player.sendMessage(Component.text("Unknown particle: " + args[1], NamedTextColor.RED)); return;
            }
            profile.setTrailType(args[1].toUpperCase());
            plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> manager.saveProfile(player.getName()));
            player.sendMessage(Component.text("Trail equipped: " + args[1], NamedTextColor.GREEN));
        }
    }
}
