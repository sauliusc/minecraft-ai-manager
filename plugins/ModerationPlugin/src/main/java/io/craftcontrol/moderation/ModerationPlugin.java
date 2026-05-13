package io.craftcontrol.moderation;

import org.bukkit.plugin.java.JavaPlugin;

public class ModerationPlugin extends JavaPlugin {

    private static ModerationPlugin instance;
    private ModerationManager moderationManager;
    private ChatFilterManager chatFilterManager;
    private ReportManager reportManager;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();

        moderationManager = new ModerationManager(this);
        chatFilterManager = new ChatFilterManager(this, moderationManager);
        reportManager = new ReportManager(this);

        ModerationListener listener = new ModerationListener(this, chatFilterManager, reportManager, moderationManager);
        getServer().getPluginManager().registerEvents(listener, this);

        ModerationCommand command = new ModerationCommand(this, moderationManager, reportManager);
        for (String cmd : new String[]{"report", "block", "unblock", "safechat", "mute", "unmute", "kick", "ban", "unban"}) {
            if (getCommand(cmd) != null) {
                getCommand(cmd).setExecutor(command);
            }
        }

        getLogger().info("ModerationPlugin enabled.");
    }

    @Override
    public void onDisable() {}

    public static ModerationPlugin getInstance() { return instance; }
    public ModerationManager getModerationManager() { return moderationManager; }
    public ChatFilterManager getChatFilterManager() { return chatFilterManager; }
    public ReportManager getReportManager() { return reportManager; }
}
