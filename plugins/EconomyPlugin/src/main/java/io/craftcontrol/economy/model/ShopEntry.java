package io.craftcontrol.economy.model;

/** One row of the server shop catalogue, as served by GET /api/shop/catalogue. */
public record ShopEntry(
    String id,
    String material,
    String displayName,
    int amount,
    int price,
    String currency,
    String category
) {}
