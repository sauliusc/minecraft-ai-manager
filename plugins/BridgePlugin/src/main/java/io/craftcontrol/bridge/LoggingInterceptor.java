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
 */
public class LoggingInterceptor implements Interceptor {

    private static final int MAX_BODY_LOG_BYTES = 512;
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
            logger.warning("[HTTP] ← " + resp.code() + " " + tag + snippet);
        }

        return resp;
    }
}
