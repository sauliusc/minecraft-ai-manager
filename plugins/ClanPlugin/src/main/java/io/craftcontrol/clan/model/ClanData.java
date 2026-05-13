package io.craftcontrol.clan.model;
import java.util.List;
public record ClanData(String id, String name, String tag, String leaderId, long xp, int level, List<String> memberIds) {}
