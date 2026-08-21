package io.craftcontrol.moderation;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.scheduler.BukkitTask;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.logging.Logger;

/**
 * Ships chat messages to the dashboard's chat log.
 *
 * <p>The API has had {@code POST /api/moderation/chat-log} and a searchable UI
 * on top of it since the moderation panel was built, but nothing ever produced
 * the data, so the log was permanently empty (#309). This is the producer.
 *
 * <p>Messages are batched rather than sent per-line: chat is bursty and one HTTP
 * request per message would put the API in the path of every player message.
 */
public class ChatLogShipper {

    private final ModerationPlugin plugin;
    private final Logger log;
    private final Gson gson = new Gson();

    private final boolean enabled;
    private final int maxBatch;
    private final int maxQueue;
    private final long flushIntervalTicks;

    private final Deque<Entry> queue = new ArrayDeque<>();
    private BukkitTask flushTask;
    private boolean warnedAboutDrops;

    public ChatLogShipper(ModerationPlugin plugin) {
        this.plugin = plugin;
        this.log = plugin.getLogger();
        this.enabled = plugin.getConfig().getBoolean("chat_log.enabled", true);
        this.maxBatch = Math.max(1, plugin.getConfig().getInt("chat_log.max_batch", 200));
        this.maxQueue = Math.max(maxBatch, plugin.getConfig().getInt("chat_log.max_queue", 2000));
        this.flushIntervalTicks =
            Math.max(1, plugin.getConfig().getInt("chat_log.flush_interval_seconds", 30)) * 20L;
    }

    public void start() {
        if (!enabled) {
            log.info("Chat log shipping is disabled in config.");
            return;
        }
        flushTask = plugin.getServer().getScheduler().runTaskTimerAsynchronously(
            plugin, this::flush, flushIntervalTicks, flushIntervalTicks);
    }

    /** Flushes anything still queued, so a clean shutdown does not lose the tail. */
    public void stop() {
        if (flushTask != null) {
            flushTask.cancel();
            flushTask = null;
        }
        if (enabled) flush();
    }

    /**
     * Queues one message. Safe to call from the async chat event.
     *
     * <p>When the API is unreachable the queue is capped and the oldest entries
     * are dropped — an unbounded buffer would turn an API outage into a server
     * memory problem, and chat log is diagnostic data, not something worth
     * failing chat over.
     */
    public void queue(String playerName, String message, boolean flagged) {
        if (!enabled) return;
        synchronized (queue) {
            while (queue.size() >= maxQueue) {
                queue.pollFirst();
                if (!warnedAboutDrops) {
                    log.warning("Chat log queue is full (" + maxQueue
                        + ") — dropping the oldest entries. Is the API reachable?");
                    warnedAboutDrops = true;
                }
            }
            queue.addLast(new Entry(playerName, message, flagged));
        }
    }

    /** Sends up to one batch. Called on the flush timer, off the main thread. */
    void flush() {
        List<Entry> batch = takeBatch();
        if (batch.isEmpty()) return;

        BridgePlugin bridge = BridgePlugin.getInstance();
        ApiClient api = bridge == null ? null : bridge.getApiClient();
        if (api == null) {
            requeue(batch);
            return;
        }

        JsonArray payload = new JsonArray();
        for (Entry entry : batch) {
            JsonObject obj = new JsonObject();
            // The API keys chat on the player name, as the rest of the bridge does.
            obj.addProperty("playerId", entry.playerName);
            obj.addProperty("username", entry.playerName);
            obj.addProperty("message", entry.message);
            obj.addProperty("flagged", entry.flagged);
            payload.add(obj);
        }

        api.post("/moderation/chat-log", gson.toJson(payload), new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                try (response) {
                    if (!response.isSuccessful()) {
                        // 4xx means this batch will never be accepted; retrying it
                        // forever would block every later batch behind it.
                        if (response.code() >= 400 && response.code() < 500) {
                            log.warning("Chat log batch rejected with " + response.code()
                                + " — discarding " + batch.size() + " entries.");
                        } else {
                            requeue(batch);
                        }
                    }
                }
            }

            @Override
            public void onFailure(Call call, IOException e) {
                requeue(batch);
            }
        });
    }

    private List<Entry> takeBatch() {
        synchronized (queue) {
            List<Entry> batch = new ArrayList<>(Math.min(maxBatch, queue.size()));
            while (batch.size() < maxBatch && !queue.isEmpty()) {
                batch.add(queue.pollFirst());
            }
            return batch;
        }
    }

    /** Puts a failed batch back at the front so ordering is preserved on retry. */
    private void requeue(List<Entry> batch) {
        synchronized (queue) {
            for (int i = batch.size() - 1; i >= 0; i--) {
                if (queue.size() >= maxQueue) return;
                queue.addFirst(batch.get(i));
            }
        }
    }

    int queueSize() {
        synchronized (queue) {
            return queue.size();
        }
    }

    private record Entry(String playerName, String message, boolean flagged) {}
}
