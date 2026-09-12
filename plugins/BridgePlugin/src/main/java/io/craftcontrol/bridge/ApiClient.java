package io.craftcontrol.bridge;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;

import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

/**
 * Async HTTP client for outbound calls to the CraftControl web API.
 * Reads all configuration from BridgePlugin's config.yml at construction time.
 */
public class ApiClient {

    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private final OkHttpClient http;
    private final String baseUrl;
    private final String serviceToken;

    public ApiClient(String baseUrl, String serviceToken, long timeoutMs, int retryMax, long retryBackoffMs, Logger logger) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.serviceToken = serviceToken;
        this.http = new OkHttpClient.Builder()
                .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .writeTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .addInterceptor(new LoggingInterceptor(logger))
                .addInterceptor(new RetryInterceptor(retryMax, retryBackoffMs))
                .build();
    }

    public void post(String path, String jsonBody, Callback callback) {
        RequestBody body = RequestBody.create(jsonBody, JSON);
        Request request = new Request.Builder()
                .url(baseUrl + path)
                .header("Authorization", "Bearer " + serviceToken)
                .post(body)
                .build();
        http.newCall(request).enqueue(callback);
    }

    /**
     * A POST that waits longer and is never retried.
     *
     * The shared client is tuned for database-backed calls: five seconds, three
     * retries. A ServerGod reply waits on a language model and takes eight to
     * twenty seconds, so it timed out every time — and each retry produced a
     * second reply rather than recovering the first, because a mention is not
     * idempotent (#393).
     */
    public void postSlow(String path, String jsonBody, long timeoutMs, Callback callback) {
        // Built fresh rather than from the shared client, so the retry
        // interceptor is left out: retrying asks the model a second question
        // instead of re-delivering the first answer.
        OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .writeTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .build();
        RequestBody body = RequestBody.create(jsonBody, JSON);
        Request request = new Request.Builder()
                .url(baseUrl + path)
                .header("Authorization", "Bearer " + serviceToken)
                .post(body)
                .build();
        client.newCall(request).enqueue(callback);
    }

    public void get(String path, Callback callback) {
        Request request = new Request.Builder()
                .url(baseUrl + path)
                .header("Authorization", "Bearer " + serviceToken)
                .get()
                .build();
        http.newCall(request).enqueue(callback);
    }

    public void patch(String path, String jsonBody, Callback callback) {
        RequestBody body = RequestBody.create(jsonBody, JSON);
        Request request = new Request.Builder()
                .url(baseUrl + path)
                .header("Authorization", "Bearer " + serviceToken)
                .patch(body)
                .build();
        http.newCall(request).enqueue(callback);
    }

    public Call newCall(Request request) {
        return http.newCall(request);
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public String getServiceToken() {
        return serviceToken;
    }

    public void shutdown() {
        http.dispatcher().cancelAll();
        http.dispatcher().executorService().shutdown();
        try {
            if (!http.dispatcher().executorService().awaitTermination(10, TimeUnit.SECONDS)) {
                http.dispatcher().executorService().shutdownNow();
            }
        } catch (InterruptedException e) {
            http.dispatcher().executorService().shutdownNow();
            Thread.currentThread().interrupt();
        }
        http.connectionPool().evictAll();
    }
}
