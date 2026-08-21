package io.craftcontrol.cosmetics;

import org.bukkit.Particle;
import org.bukkit.plugin.java.JavaPlugin;

public class CosmeticsPlugin extends JavaPlugin {
    private static final long PARTICLE_INTERVAL_TICKS = 40L;

    private static CosmeticsPlugin instance;
    private CosmeticsManager manager;
    private PetManager petManager;
    private PetTypes petTypes;
    private ParticleTypes particleTypes;
    private ParticleTypes trailTypes;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        manager = new CosmeticsManager(getLogger());
        petManager = new PetManager(this);
        petTypes = new PetTypes(getConfig().getStringList("cosmetics.available_pets"),
            getConfig().getString("cosmetics.default_pet", "CAT"));
        particleTypes = new ParticleTypes(getConfig().getStringList("cosmetics.available_particles"),
            CosmeticsPlugin::isRenderable, getLogger()::warning);
        trailTypes = new ParticleTypes(getConfig().getStringList("cosmetics.available_trails"),
            CosmeticsPlugin::isRenderable, getLogger()::warning);
        CosmeticsListener listener = new CosmeticsListener(this, manager, petManager);
        getServer().getPluginManager().registerEvents(listener, this);
        CosmeticsCommand cmd = new CosmeticsCommand(this, manager, petManager, petTypes,
            particleTypes, trailTypes, listener);
        for (String name : new String[]{"title", "chatcolor", "particles", "pet", "trail"}) {
            var c = getCommand(name);
            if (c != null) { c.setExecutor(cmd); c.setTabCompleter(cmd); }
        }
        getServer().getScheduler().runTaskTimer(this, new ParticleTask(this, manager),
            PARTICLE_INTERVAL_TICKS, PARTICLE_INTERVAL_TICKS);
        getLogger().info("CosmeticsPlugin enabled.");
    }

    @Override
    public void onDisable() {}

    /**
     * Looks up a Particle constant by name, or null when this server has no such
     * constant. Particle names are renamed between Minecraft versions, so a value
     * stored in a player's profile months ago may no longer resolve.
     */
    public static Particle resolveParticle(String name) {
        if (name == null) return null;
        try {
            return Particle.valueOf(name.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * True when the name resolves and can be spawned without an extra data
     * argument. DUST and friends need a {@link Particle.DustOptions} payload that
     * the cosmetic system has no way to supply, so they are rejected up front
     * rather than throwing once per player per tick.
     */
    static boolean isRenderable(String name) {
        Particle particle = resolveParticle(name);
        return particle != null && particle.getDataType() == Void.class;
    }

    public static CosmeticsPlugin getInstance() { return instance; }
    public CosmeticsManager getManager() { return manager; }
    public PetManager getPetManager() { return petManager; }
    public PetTypes getPetTypes() { return petTypes; }
    public ParticleTypes getParticleTypes() { return particleTypes; }
    public ParticleTypes getTrailTypes() { return trailTypes; }
}
