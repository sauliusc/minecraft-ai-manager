package io.craftcontrol.bridge;

import okhttp3.Interceptor;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

import java.io.IOException;
import java.util.logging.Logger;

/**
 * OkHttp application interceptor that logs every outbound API call.
 * Success (2xx): INFO with method + status + path.
 * Failure (non-2xx): WARNING with method + status + path + first 512 bytes of body.
 * Network error: logged by the caller's onFailure callback.
 *
 * <p>Some endpoints answer 404 for a perfectly normal state — a player who is in
 * no clan, or has no vote reward waiting. Those are logged at INFO like any other
 * expected answer. Logging them as warnings meant two spurious WARN lines on
 * every single join, which drowned out the warnings that do mean something.
 */
public class LoggingInterceptor implements Interceptor {

    private static final int MAX_BODY_LOG_BYTES = 512;

    /**
     * Path prefixes where a 404 means "this player does not have one", not a fault.
     * Kept as prefixes because the player name is the last path segment.
     */
    private static final String[] ABSENCE_IS_NORMAL_ON_404 = {
        "/api/clans/member/",
        "/api/vote/pending/",
    };

    private final Logger logger;

    public LoggingInterceptor(Logger logger) {
        this.logger = logger;
    }

    @Override
    public Response intercept(Chain chain) throws IOException {
        Request req = chain.request();
        String tag = req.method() + " " + req.url().encodedPath();
        logger.info("[HTTP] → " + tag);

        Response resp = chain.proceed(req);

        if (resp.isSuccessful()) {
            logger.info("[HTTP] ← " + resp.code() + " " + tag);
        } else {
            String snippet = "";
            ResponseBody body = resp.body();
            if (body != null) {
                try {
                    snippet = "  " + resp.peekBody(MAX_BODY_LOG_BYTES).string();
                } catch (IOException ignored) {}
            }
            if (isExpectedAbsence(resp.code(), req.url().encodedPath())) {
                logger.info("[HTTP] ← " + resp.code() + " " + tag + snippet);
            } else {
                logger.warning("[HTTP] ← " + resp.code() + " " + tag + snippet);
            }
        }

        return resp;
    }

    /** True when a 404 on this path is a normal answer rather than a failure. */
    static boolean isExpectedAbsence(int code, String path) {
        if (code != 404 || path == null) return false;
        for (String prefix : ABSENCE_IS_NORMAL_ON_404) {
            // A bare prefix with no trailing segment is a real 404 — the route is
            // wrong, not the player.
            if (path.startsWith(prefix) && path.length() > prefix.length()) return true;
        }
        return false;
    }
}
