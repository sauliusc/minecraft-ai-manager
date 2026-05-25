package io.craftcontrol.npc.model;

import java.util.List;

public class NpcDefinition {
    public String id;
    public String name;
    public String skinUrl;
    public String title;
    public String locWorld;
    public double locX, locY, locZ;
    public float locYaw;
    public String type; // GUIDE, QUEST_GIVER, MERCHANT
    public List<String> dialogueLines;
    public List<String> questIds;
    /** Human-readable quest names aligned by index with questIds (populated by /npcs/sync). */
    public List<String> questTitles;
}
