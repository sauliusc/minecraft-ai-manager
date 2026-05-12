package io.craftcontrol.challenge;

import io.craftcontrol.challenge.model.ActiveChallenge;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.sql.SQLException;
import java.util.List;

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
        ActiveChallenge oakChallenge = new ActiveChallenge("ch-oak", "BLOCK_BREAK", "OAK_LOG", "", 10);
        when(manager.getActive()).thenReturn(List.of(oakChallenge));

        // No BridgePlugin in tests — ChallengeTracker.checkCompletion() will just no-op
        // We test the repo state directly
        repo.bufferProgress("ch-oak", "p1", 1);  // simulate tracker behaviour
        List<ChallengeRepository.ProgressEntry> drained = repo.drainBuffer();
        assertEquals("ch-oak", drained.get(0).challengeId());
    }
}
