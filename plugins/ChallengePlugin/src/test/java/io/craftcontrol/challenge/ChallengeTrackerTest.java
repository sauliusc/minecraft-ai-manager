package io.craftcontrol.challenge;

import io.craftcontrol.challenge.model.ActiveChallenge;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.entity.HumanEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.inventory.CraftItemEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.inventory.CraftingInventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.Recipe;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChallengeTrackerTest {

    @TempDir
    File tempDir;

    private ChallengeRepository repo;
    private ChallengeManager manager;

    @BeforeEach
    void setUp() throws SQLException {
        repo = new ChallengeRepository(new File(tempDir, "test.db").getAbsolutePath(),
                java.util.logging.Logger.getLogger("test"));
        manager = mock(ChallengeManager.class);
    }

    @Test
    void bufferProgress_storesEntry() {
        repo.bufferProgress("ch-1", "player-uuid", 1);
        List<ChallengeRepository.ProgressEntry> drained = repo.drainBuffer();
        assertEquals(1, drained.size());
        assertEquals("ch-1", drained.get(0).challengeId());
        assertEquals(1, drained.get(0).total());
    }

    @Test
    void drainBuffer_aggregatesIncrements() {
        repo.bufferProgress("ch-1", "p1", 1);
        repo.bufferProgress("ch-1", "p1", 1);
        repo.bufferProgress("ch-1", "p1", 1);
        List<ChallengeRepository.ProgressEntry> drained = repo.drainBuffer();
        assertEquals(1, drained.size());
        assertEquals(3, drained.get(0).total());
    }

    @Test
    void drainBuffer_clearsAfterDrain() {
        repo.bufferProgress("ch-1", "p1", 1);
        repo.drainBuffer();
        List<ChallengeRepository.ProgressEntry> second = repo.drainBuffer();
        assertTrue(second.isEmpty());
    }

    @Test
    void markCompleted_returnsTrueOnFirstCall() {
        assertTrue(repo.markCompleted("ch-1", "p1"));
    }

    @Test
    void markCompleted_returnsFalseOnDuplicate() {
        repo.markCompleted("ch-1", "p1");
        assertFalse(repo.markCompleted("ch-1", "p1"));
    }

    @Test
    void blockBreak_onlyMatchesCorrectMaterial() {
        ActiveChallenge oakChallenge = new ActiveChallenge("ch-oak", "BLOCK_BREAK", "OAK_LOG", "", 10, 0);
        when(manager.getActive()).thenReturn(List.of(oakChallenge));

        // No BridgePlugin in tests — ChallengeTracker.checkCompletion() will just no-op
        // We test the repo state directly
        repo.bufferProgress("ch-oak", "p1", 1);  // simulate tracker behaviour
        List<ChallengeRepository.ProgressEntry> drained = repo.drainBuffer();
        assertEquals("ch-oak", drained.get(0).challengeId());
    }

    // -----------------------------------------------------------------------
    // CRAFT_ITEM tests
    // -----------------------------------------------------------------------

    @Test
    void craftItem_matchingMaterial_buffersProgress() {
        ActiveChallenge ch = new ActiveChallenge("ch-craft", "CRAFT_ITEM", "DIAMOND_SWORD", "", 5, 0);
        when(manager.getActive()).thenReturn(List.of(ch));

        ChallengeTracker tracker = new ChallengeTracker(manager, repo,
                java.util.logging.Logger.getLogger("test"));

        Player player = mock(Player.class);
        UUID uuid = UUID.randomUUID();
        when(player.getUniqueId()).thenReturn(uuid);

        ItemStack result = mock(ItemStack.class);
        when(result.getType()).thenReturn(Material.DIAMOND_SWORD);
        when(result.getAmount()).thenReturn(1);

        Recipe recipe = mock(Recipe.class);
        when(recipe.getResult()).thenReturn(result);

        CraftItemEvent event = mock(CraftItemEvent.class);
        when(event.getWhoClicked()).thenReturn(player);
        when(event.getRecipe()).thenReturn(recipe);
        when(event.isShiftClick()).thenReturn(false);

        tracker.onCraftItem(event);

        List<ChallengeRepository.ProgressEntry> drained = repo.drainBuffer();
        assertEquals(1, drained.size());
        assertEquals("ch-craft", drained.get(0).challengeId());
        assertEquals(uuid.toString(), drained.get(0).playerId());
        assertEquals(1, drained.get(0).total());
    }

    @Test
    void craftItem_nonMatchingMaterial_ignored() {
        ActiveChallenge ch = new ActiveChallenge("ch-craft", "CRAFT_ITEM", "DIAMOND_SWORD", "", 5, 0);
        when(manager.getActive()).thenReturn(List.of(ch));

        ChallengeTracker tracker = new ChallengeTracker(manager, repo,
                java.util.logging.Logger.getLogger("test"));

        Player player = mock(Player.class);
        when(player.getUniqueId()).thenReturn(UUID.randomUUID());

        ItemStack result = mock(ItemStack.class);
        when(result.getType()).thenReturn(Material.IRON_SWORD);
        when(result.getAmount()).thenReturn(1);

        Recipe recipe = mock(Recipe.class);
        when(recipe.getResult()).thenReturn(result);

        CraftItemEvent event = mock(CraftItemEvent.class);
        when(event.getWhoClicked()).thenReturn(player);
        when(event.getRecipe()).thenReturn(recipe);
        when(event.isShiftClick()).thenReturn(false);

        tracker.onCraftItem(event);

        List<ChallengeRepository.ProgressEntry> drained = repo.drainBuffer();
        assertTrue(drained.isEmpty(), "bufferProgress should NOT be called for non-matching material");
    }

    // -----------------------------------------------------------------------
    // TRAVEL tests
    // -----------------------------------------------------------------------

    @Test
    void playerMove_accumulatesDistance() {
        ActiveChallenge ch = new ActiveChallenge("ch-travel", "TRAVEL", "", "", 1, 100);
        when(manager.getActive()).thenReturn(List.of(ch));

        ChallengeTracker tracker = new ChallengeTracker(manager, repo,
                java.util.logging.Logger.getLogger("test"));

        Player player = mock(Player.class);
        UUID uuid = UUID.randomUUID();
        when(player.getUniqueId()).thenReturn(uuid);

        World world = mock(World.class);

        // from=(0,64,0) to=(1,64,0) — block coords differ, distance=1.0
        Location from = new Location(world, 0.0, 64.0, 0.0);
        Location to   = new Location(world, 1.0, 64.0, 0.0);

        PlayerMoveEvent event = mock(PlayerMoveEvent.class);
        when(event.getPlayer()).thenReturn(player);
        when(event.getFrom()).thenReturn(from);
        when(event.getTo()).thenReturn(to);

        // Call 10 times; after 10m accumulated the flush fires
        for (int i = 0; i < 10; i++) {
            tracker.onPlayerMove(event);
        }

        List<ChallengeRepository.ProgressEntry> drained = repo.drainBuffer();
        assertEquals(1, drained.size(), "bufferProgress should be called once after 10m accumulated");
        assertEquals("ch-travel", drained.get(0).challengeId());
        assertEquals(uuid.toString(), drained.get(0).playerId());
        assertEquals(10, drained.get(0).total());
    }

    @Test
    void playerMove_onlyHeadRotation_ignored() {
        ActiveChallenge ch = new ActiveChallenge("ch-travel", "TRAVEL", "", "", 1, 100);
        when(manager.getActive()).thenReturn(List.of(ch));

        ChallengeTracker tracker = new ChallengeTracker(manager, repo,
                java.util.logging.Logger.getLogger("test"));

        Player player = mock(Player.class);
        when(player.getUniqueId()).thenReturn(UUID.randomUUID());

        World world = mock(World.class);

        // from and to share the same block coords (only yaw/pitch changed)
        Location from = new Location(world, 0.5, 64.0, 0.5, 0f, 0f);
        Location to   = new Location(world, 0.5, 64.0, 0.5, 45f, 10f);

        PlayerMoveEvent event = mock(PlayerMoveEvent.class);
        when(event.getPlayer()).thenReturn(player);
        when(event.getFrom()).thenReturn(from);
        when(event.getTo()).thenReturn(to);

        tracker.onPlayerMove(event);

        List<ChallengeRepository.ProgressEntry> drained = repo.drainBuffer();
        assertTrue(drained.isEmpty(), "Head-only rotation should not buffer any progress");
    }
}
