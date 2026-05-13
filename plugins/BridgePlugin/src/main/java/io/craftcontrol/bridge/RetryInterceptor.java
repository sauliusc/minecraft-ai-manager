package io.craftcontrol.bridge;

import okhttp3.Interceptor;
import okhttp3.Request;
import okhttp3.Response;

import java.io.IOException;

/**
 * Retries requests on IOException or 5xx responses using exponential backoff.
 * Retry count and base backoff are read from BridgePlugin config at construction time.
 */
public class RetryInterceptor implements Interceptor {

    private final int maxRetries;
    private final long backoffMs;

    public RetryInterceptor(int maxRetries, long backoffMs) {
        this.maxRetries = maxRetries;
        this.backoffMs = backoffMs;
    }

    @Override
    public Response intercept(Chain chain) throws IOException {
        Request request = chain.request();
        IOException lastException = null;
        Response lastResponse = null;

        for (int attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0) {
                closeQuietly(lastResponse);
                sleep(backoffMs * attempt);
            }

            try {
                lastResponse = chain.proceed(request);
                if (lastResponse.code() < 500) {
                    return lastResponse;
                }
            } catch (IOException e) {
                lastException = e;
            }
        }

        if (lastException != null) {
            throw lastException;
        }
        return lastResponse;
    }

    private static void closeQuietly(Response response) {
        if (response != null) {
            response.close();
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
