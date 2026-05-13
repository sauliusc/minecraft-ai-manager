package io.craftcontrol.challenge;

import io.craftcontrol.bridge.ApiClient;
import io.craftcontrol.bridge.BridgePlugin;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.scheduler.BukkitRunnable;

import java.io.IOException;
import java.util.List;
import java.util.logging.Logger;

public class ChallengeSyncTask extends BukkitRunnable {

    private final ChallengeRepository repo;
    private final Logger log;

    public ChallengeSyncTask(ChallengeRepository repo, Logger log) {
        this.repo = repo;
        this.log = log;
    }

    @Override
    public void run() {
        ApiClient api = BridgePlugin.getInstance().getApiClient();
        if (api == null) return;

        List<ChallengeRepository.ProgressEntry> entries = repo.drainBuffer();
        for (ChallengeRepository.ProgressEntry entry : entries) {
            String json = String.format(
                    "{\"playerId\":\"%s\",\"increment\":%d}",
                    entry.playerId(), entry.total());
            api.post("/challenges/" + entry.challengeId() + "/progress", json, new Callback() {
                @Override
                public void onResponse(Call call, Response response) {
                    response.close();
                }
                @Override
                public void onFailure(Call call, IOException e) {
                    log.warning("Progress sync failed for " + entry.challengeId() + ": " + e.getMessage());
                }
            });
        }
    }
}
