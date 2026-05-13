package io.craftcontrol.event;

import org.bukkit.Location;

import java.util.UUID;

public record BuildPlot(UUID assignedPlayer, Location center, int radius) {}
