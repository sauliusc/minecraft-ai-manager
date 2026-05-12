package io.craftcontrol.bridge;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class ApiClientTest {

    private MockWebServer server;
    private ApiClient client;

    @BeforeEach
    void setUp() throws IOException {
        server = new MockWebServer();
        server.start();
        client = new ApiClient(
                server.url("/api").toString(),
                "test-token",
                2000L,
                2,
                10L
        );
    }

    @AfterEach
    void tearDown() throws IOException {
        client.shutdown();
        server.shutdown();
    }

    @Test
    void get_sendsAuthorizationHeader() throws Exception {
        server.enqueue(new MockResponse().setResponseCode(200).setBody("{}"));

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<Response> responseRef = new AtomicReference<>();

        client.get("/players", new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                responseRef.set(response);
                response.close();
                latch.countDown();
            }
            @Override
            public void onFailure(Call call, IOException e) {
                latch.countDown();
            }
        });

        assertTrue(latch.await(3, TimeUnit.SECONDS));
        RecordedRequest recorded = server.takeRequest();
        assertEquals("Bearer test-token", recorded.getHeader("Authorization"));
        assertEquals("/api/players", recorded.getPath());
    }

    @Test
    void post_sendsJsonBody() throws Exception {
        server.enqueue(new MockResponse().setResponseCode(201).setBody("{}"));

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<Response> responseRef = new AtomicReference<>();

        client.post("/events", "{\"type\":\"join\"}", new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                responseRef.set(response);
                response.close();
                latch.countDown();
            }
            @Override
            public void onFailure(Call call, IOException e) {
                latch.countDown();
            }
        });

        assertTrue(latch.await(3, TimeUnit.SECONDS));
        RecordedRequest recorded = server.takeRequest();
        assertEquals("POST", recorded.getMethod());
        assertEquals("{\"type\":\"join\"}", recorded.getBody().readUtf8());
        assertTrue(recorded.getHeader("Content-Type").startsWith("application/json"));
    }

    @Test
    void retryInterceptor_retriesOn5xx() throws Exception {
        server.enqueue(new MockResponse().setResponseCode(503));
        server.enqueue(new MockResponse().setResponseCode(503));
        server.enqueue(new MockResponse().setResponseCode(200).setBody("{}"));

        CountDownLatch latch = new CountDownLatch(1);
        AtomicInteger statusCode = new AtomicInteger();

        client.get("/health", new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                statusCode.set(response.code());
                response.close();
                latch.countDown();
            }
            @Override
            public void onFailure(Call call, IOException e) {
                latch.countDown();
            }
        });

        assertTrue(latch.await(5, TimeUnit.SECONDS));
        assertEquals(200, statusCode.get());
        assertEquals(3, server.getRequestCount());
    }

    @Test
    void retryInterceptor_exhaustsRetriesAndReturns5xx() throws Exception {
        server.enqueue(new MockResponse().setResponseCode(500));
        server.enqueue(new MockResponse().setResponseCode(500));
        server.enqueue(new MockResponse().setResponseCode(500));

        CountDownLatch latch = new CountDownLatch(1);
        AtomicInteger statusCode = new AtomicInteger();

        client.get("/health", new Callback() {
            @Override
            public void onResponse(Call call, Response response) {
                statusCode.set(response.code());
                response.close();
                latch.countDown();
            }
            @Override
            public void onFailure(Call call, IOException e) {
                latch.countDown();
            }
        });

        assertTrue(latch.await(5, TimeUnit.SECONDS));
        assertEquals(500, statusCode.get());
        assertEquals(3, server.getRequestCount()); // 1 initial + 2 retries
    }
}
