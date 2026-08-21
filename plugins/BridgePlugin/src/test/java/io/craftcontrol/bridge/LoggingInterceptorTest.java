package io.craftcontrol.bridge;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class LoggingInterceptorTest {

    @Test
    void treatsNoClanAndNoPendingVoteAsExpected() {
        // Two WARN lines on every join, for the ordinary state of not being in a
        // clan and having no vote waiting.
        assertTrue(LoggingInterceptor.isExpectedAbsence(404, "/api/clans/member/Steve"));
        assertTrue(LoggingInterceptor.isExpectedAbsence(404, "/api/vote/pending/Steve"));
    }

    @Test
    void stillWarnsForOtherPaths() {
        assertFalse(LoggingInterceptor.isExpectedAbsence(404, "/api/players/Steve"));
        assertFalse(LoggingInterceptor.isExpectedAbsence(404, "/api/challenges/active"));
    }

    @Test
    void onlyAppliesTo404() {
        assertFalse(LoggingInterceptor.isExpectedAbsence(500, "/api/clans/member/Steve"));
        assertFalse(LoggingInterceptor.isExpectedAbsence(403, "/api/vote/pending/Steve"));
    }

    @Test
    void aBarePrefixIsStillAWarning() {
        // No player segment means the route is wrong, not that the player has no
        // clan — worth keeping loud.
        assertFalse(LoggingInterceptor.isExpectedAbsence(404, "/api/clans/member/"));
        assertFalse(LoggingInterceptor.isExpectedAbsence(404, "/api/vote/pending/"));
    }

    @Test
    void handlesNullPath() {
        assertFalse(LoggingInterceptor.isExpectedAbsence(404, null));
    }
}
