package io.craftcontrol.event.model;

import com.google.gson.JsonObject;

import java.time.Instant;

public class ActiveEvent {

    private final String id;
    private final EventType type;
    private volatile EventState state;
    private final Instant startTime;
    private final JsonObject config;

    public ActiveEvent(String id, EventType type, EventState state, Instant startTime, JsonObject config) {
        this.id = id;
        this.type = type;
        this.state = state;
        this.startTime = startTime;
        this.config = config;
    }

    public String getId() { return id; }
    public EventType getType() { return type; }
    public EventState getState() { return state; }
    public void setState(EventState state) { this.state = state; }
    public Instant getStartTime() { return startTime; }
    public JsonObject getConfig() { return config; }
}
