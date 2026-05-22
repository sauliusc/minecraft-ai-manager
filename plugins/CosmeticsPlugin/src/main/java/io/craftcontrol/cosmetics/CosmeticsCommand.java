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
import org.bukkit.entity.Player;

import java.io.IOException;
import java.util.List;

public class CosmeticsCommand implements CommandExecutor {
    private final CosmeticsPlugin plugin;
    private final CosmeticsManager manager;
    private final PetManager petManager;
    private final CosmeticsListener listener;

    public CosmeticsCommand(CosmeticsPlugin plugin, CosmeticsManager manager, PetManager petManager, CosmeticsListener listener) {
        this.plugin = plugin;
        this.manager = manager;
        this.petManager = petManager;
        this.listener = listener;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
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
        if (args.length == 0) { player.sendMessage(Component.text("Usage: /pet <summon|dismiss>", NamedTextColor.YELLOW)); return; }
        switch (args[0].toLowerCase()) {
            case "summon" -> {
                String petType = manager.getProfile(player.getName()).getPetType();
                if (petType == null) petType = "CAT";
                petManager.summon(player, petType);
                player.sendMessage(Component.text("Pet summoned!", NamedTextColor.GREEN));
            }
            case "dismiss" -> {
                petManager.dismiss(player.getUniqueId());
                player.sendMessage(Component.text("Pet dismissed.", NamedTextColor.YELLOW));
            }
        }
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
