package io.craftcontrol.challenge;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

public class ChallengeRepository implements AutoCloseable {

    private final Connection conn;
    private final Logger log;

    public ChallengeRepository(String dbPath, Logger log) throws SQLException {
        this.log = log;
        conn = DriverManager.getConnection("jdbc:sqlite:" + dbPath);
        conn.setAutoCommit(false);
        initSchema();
    }

    private void initSchema() throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("""
                    CREATE TABLE IF NOT EXISTS progress_buffer (
                        id          INTEGER PRIMARY KEY AUTOINCREMENT,
                        challenge_id TEXT NOT NULL,
                        player_id    TEXT NOT NULL,
                        increment    INTEGER NOT NULL DEFAULT 1,
                        created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
                    )""");
            st.execute("""
                    CREATE TABLE IF NOT EXISTS completed (
                        challenge_id TEXT NOT NULL,
                        player_id    TEXT NOT NULL,
                        PRIMARY KEY (challenge_id, player_id)
                    )""");
            conn.commit();
        }
    }

    public synchronized void bufferProgress(String challengeId, String playerId, int increment) {
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO progress_buffer (challenge_id, player_id, increment) VALUES (?,?,?)")) {
            ps.setString(1, challengeId);
            ps.setString(2, playerId);
            ps.setInt(3, increment);
            ps.executeUpdate();
            conn.commit();
        } catch (SQLException e) {
            log.warning("Failed to buffer progress: " + e.getMessage());
        }
    }

    public synchronized List<ProgressEntry> drainBuffer() {
        List<ProgressEntry> entries = new ArrayList<>();
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(
                     "SELECT id, challenge_id, player_id, SUM(increment) as total " +
                     "FROM progress_buffer GROUP BY challenge_id, player_id")) {
            while (rs.next()) {
                entries.add(new ProgressEntry(
                        rs.getString("challenge_id"),
                        rs.getString("player_id"),
                        rs.getInt("total")
                ));
            }
            if (!entries.isEmpty()) {
                st.executeUpdate("DELETE FROM progress_buffer");
                conn.commit();
            }
        } catch (SQLException e) {
            log.warning("Failed to drain buffer: " + e.getMessage());
        }
        return entries;
    }

    public synchronized boolean markCompleted(String challengeId, String playerId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT OR IGNORE INTO completed (challenge_id, player_id) VALUES (?,?)")) {
            ps.setString(1, challengeId);
            ps.setString(2, playerId);
            int rows = ps.executeUpdate();
            conn.commit();
            return rows > 0;
        } catch (SQLException e) {
            log.warning("Failed to mark completed: " + e.getMessage());
            return false;
        }
    }

    @Override
    public void close() throws SQLException {
        conn.close();
    }

    public record ProgressEntry(String challengeId, String playerId, int total) {}
}
