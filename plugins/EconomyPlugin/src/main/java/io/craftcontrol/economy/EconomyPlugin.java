package io.craftcontrol.economy;

import org.bukkit.plugin.java.JavaPlugin;

public class EconomyPlugin extends JavaPlugin {
    private static EconomyPlugin instance;
    private EconomyManager economy;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        economy = new EconomyManager(getLogger());
        getServer().getPluginManager().registerEvents(new EconomyListener(this, economy), this);
        getCommand("balance").setExecutor(new BalanceCommand(economy));
        getCommand("pay").setExecutor(new PayCommand(this, economy));
        getCommand("market").setExecutor(new MarketCommand(this));
        ShopMenu shopMenu = new ShopMenu();
        getCommand("shop").setExecutor(new ShopCommand(this, economy, shopMenu));
        getServer().getPluginManager().registerEvents(new ShopListener(this, economy, shopMenu), this);
        getCommand("sell").setExecutor(new SellCommand(this, economy));
        getLogger().info("EconomyPlugin enabled.");
    }

    @Override
    public void onDisable() {}

    public static EconomyPlugin getInstance() { return instance; }
    public EconomyManager getEconomy() { return economy; }
}
