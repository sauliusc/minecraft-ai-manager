package io.craftcontrol.event;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import io.craftcontrol.event.model.ActiveEvent;
import io.craftcontrol.event.model.EventState;
import io.craftcontrol.event.model.EventType;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.scheduler.BukkitTask;

import java.io.IOException;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

public class EventManager {

    private final EventPlugin plugin;
    private final Logger log;
    private final ConcurrentHashMap<String, ActiveEvent> events = new ConcurrentHashMap<>();
    private BossRaidHandler bossRaidHandler;
    private TreasureHuntHandler treasureHuntHandler;
    private BuildBattleHandler buildBattleHandler;
    private BukkitTask pollerTask;

    public EventManager(EventPlugin plugin) {
        this.plugin = plugin;
        this.log = plugin.getLogger();
    }

    public void start(BossRaidHandler bossRaidHandler, TreasureHuntHandler treasureHuntHandler, BuildBattleHandler buildBattleHandler) {
        this.bossRaidHandler = bossRaidHandler;
        this.treasureHuntHandler = treasureHuntHandler;
        this.buildBattleHandler = buildBattleHandler;
        pollerTask = Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, this::pollUpcomingEvents, 0L, 20L * 60L);
    }

    public void stop() {
        if (pollerTask != null) {
            pollerTask.cancel();
        }
    }

    private void pollUpcomingEvents() {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        api.get("/events/upcoming", new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                log.warning("Failed to poll events: " + e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                try (response) {
                    if (!response.isSuccessful() || response.body() == null) return;
                    String body = response.body().string();
                    JsonArray arr = JsonParser.parseString(body).getAsJsonArray();
                    for (JsonElement el : arr) {
                        processEventEntry(el.getAsJsonObject());
                    }
                } catch (Exception e) {
                    log.warning("Error parsing events response: " + e.getMessage());
                }
            }
        });
    }

    private void processEventEntry(JsonObject obj) {
        String id = obj.get("id").getAsString();
        String typeStr = obj.get("type").getAsString();
        String startTimeStr = obj.has("startTime") ? obj.get("startTime").getAsString()
                : obj.get("scheduledAt").getAsString();

        EventType type;
        try {
            type = EventType.valueOf(typeStr);
        } catch (IllegalArgumentException e) {
            return;
        }

        Instant startTime = Instant.parse(startTimeStr);
        Instant now = Instant.now();
        long secondsUntil = startTime.getEpochSecond() - now.getEpochSecond();

        ActiveEvent existing = events.get(id);

        if (secondsUntil <= 0) {
            if (existing == null || existing.getState() == EventState.UPCOMING) {
                ActiveEvent event = new ActiveEvent(id, type, EventState.ACTIVE, startTime, obj);
                events.put(id, event);
                Bukkit.getScheduler().runTask(plugin, () -> activateEvent(event));
            }
        } else if (secondsUntil <= 1800) {
            if (existing == null) {
                ActiveEvent event = new ActiveEvent(id, type, EventState.UPCOMING, startTime, obj);
                events.put(id, event);
                long minutesUntil = secondsUntil / 60;
                Bukkit.getScheduler().runTask(plugin, () ->
                        Bukkit.getServer().broadcast(
                                Component.text("[Event] ", NamedTextColor.GOLD)
                                    .append(Component.text(getEventName(type) + " starts in " + minutesUntil + " minutes!", NamedTextColor.YELLOW)))));
            }
        }
    }

    private void activateEvent(ActiveEvent event) {
        switch (event.getType()) {
            case BOSS_RAID -> bossRaidHandler.startRaid(event);
            case TREASURE_HUNT -> treasureHuntHandler.startHunt(event);
            case BUILD_BATTLE -> buildBattleHandler.startBattle(event);
        }
    }

    public void completeEvent(String id) {
        ActiveEvent event = events.get(id);
        if (event == null) return;
        event.setState(EventState.FINISHED);

        // Cleanup handler state and despawn any lingering entities on main thread
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (event.getType() == EventType.BOSS_RAID) bossRaidHandler.cleanup();
            else if (event.getType() == EventType.TREASURE_HUNT) treasureHuntHandler.cleanup();
        });

        ApiClient api = BridgePlugin.getInstance().getApiClient();
        api.post("/events/" + id + "/complete", "{\"result\":\"completed\"}", new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                log.warning("Failed to post event complete for " + id + ": " + e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                response.close();
            }
        });
    }

    public ConcurrentHashMap<String, ActiveEvent> getEvents() { return events; }

    private String getEventName(EventType type) {
        return switch (type) {
            case BOSS_RAID -> "Boss Raid";
            case TREASURE_HUNT -> "Treasure Hunt";
            case BUILD_BATTLE -> "Build Battle";
        };
    }
}
