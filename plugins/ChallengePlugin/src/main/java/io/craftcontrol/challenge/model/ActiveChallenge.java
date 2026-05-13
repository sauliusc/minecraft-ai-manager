package io.craftcontrol.challenge.model;

public record ActiveChallenge(
        String id,
        String type,
        String targetMaterial,
        String targetEntity,
        int targetCount,
        int targetDistance,  // metres for TRAVEL challenges
        String title,
        String description
) {}
