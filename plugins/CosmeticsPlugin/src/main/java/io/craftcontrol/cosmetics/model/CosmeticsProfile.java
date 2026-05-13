package io.craftcontrol.cosmetics.model;

public class CosmeticsProfile {
    private String titleId;
    private String chatColor;
    private String particleType;
    private String petType;
    private String trailType;

    public CosmeticsProfile() {}

    public CosmeticsProfile(String titleId, String chatColor, String particleType, String petType, String trailType) {
        this.titleId = titleId;
        this.chatColor = chatColor;
        this.particleType = particleType;
        this.petType = petType;
        this.trailType = trailType;
    }

    public String getTitleId() { return titleId; }
    public void setTitleId(String titleId) { this.titleId = titleId; }

    public String getChatColor() { return chatColor; }
    public void setChatColor(String chatColor) { this.chatColor = chatColor; }

    public String getParticleType() { return particleType; }
    public void setParticleType(String particleType) { this.particleType = particleType; }

    public String getPetType() { return petType; }
    public void setPetType(String petType) { this.petType = petType; }

    public String getTrailType() { return trailType; }
    public void setTrailType(String trailType) { this.trailType = trailType; }
}
