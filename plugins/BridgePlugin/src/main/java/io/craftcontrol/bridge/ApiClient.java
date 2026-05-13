package io.craftcontrol.bridge;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;

import java.util.concurrent.TimeUnit;

/**
 * Async HTTP client for outbound calls to the CraftControl web API.
 * Reads all configuration from BridgePlugin's config.yml at construction time.
 */
public class ApiClient {

    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private final OkHttpClient http;
    private final String baseUrl;
    private final String serviceToken;

    public ApiClient(String baseUrl, String serviceToken, long timeoutMs, int retryMax, long retryBackoffMs) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.serviceToken = serviceToken;
        this.http = new OkHttpClient.Builder()
                .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .writeTimeout(timeoutMs, TimeUnit.MILLISECONDS)
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

    public void get(String path, Callback callback) {
        Request request = new Request.Builder()
                .url(baseUrl + path)
                .header("Authorization", "Bearer " + serviceToken)
                .get()
                .build();
        http.newCall(request).enqueue(callback);
    }

    public Call newCall(Request request) {
        return http.newCall(request);
    }

    public void shutdown() {
        http.dispatcher().executorService().shutdown();
        http.connectionPool().evictAll();
    }
}
