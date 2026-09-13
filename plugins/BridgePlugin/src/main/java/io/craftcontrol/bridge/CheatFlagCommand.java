package io.craftcontrol.bridge;

import com.google.gson.JsonObject;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.command.RemoteConsoleCommandSender;

import java.io.IOException;

/**
 * Forwards a GrimAC violation into CraftControl.
 *
 * <p>Grim keeps its own history in a SQLite file inside the container, which
 * nothing outside the server can read, so a flag is invisible in the dashboard
 * unless something pushes it out. Grim can run an arbitrary command when a check
 * crosses a threshold, so this is that command:
 *
 * <pre>ccflag &lt;player&gt; &lt;check&gt; &lt;violations&gt; [description]</pre>
 *
 * <p>Restricted to the console and RCON. Grim dispatches as the console, and
 * RCON is how an operator or a script reaches it; a player must never be able to
 * run it, or any child could fabricate accusations against another.
 *
 * <p>The allowlist is positive rather than "not a player" on purpose. A command
 * block is not a player either, and a block is something a player can end up
 * holding.
 */
public class CheatFlagCommand implements CommandExecutor {

    private final BridgePlugin plugin;

    public CheatFlagCommand(BridgePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        boolean fromServer = sender instanceof ConsoleCommandSender
            || sender instanceof RemoteConsoleCommandSender;
        if (!fromServer) {
            sender.sendMessage("This command can only be run by the server.");
            return true;
        }
        if (args.length < 3) {
            sender.sendMessage("Usage: /ccflag <player> <check> <violations> [description]");
            return true;
        }

        int violations;
        try {
            violations = Integer.parseInt(args[2]);
        } catch (NumberFormatException e) {
            // Grim substitutes %vl% itself, so this means the placeholder did not
            // expand — worth saying rather than silently recording a zero.
            plugin.getLogger().warning("ccflag: violations was not a number: " + args[2]);
            return true;
        }

        JsonObject body = new JsonObject();
        body.addProperty("username", args[0]);
        body.addProperty("check", args[1]);
        body.addProperty("violations", violations);
        if (args.length > 3) {
            body.addProperty("description", String.join(" ", java.util.Arrays.copyOfRange(args, 3, args.length)));
        }

        plugin.getApiClient().post("/moderation/cheat-flag", body.toString(), new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                // Losing a flag is not worth interrupting the game for; Grim has
                // still alerted staff in game and written its own history.
                plugin.getLogger().warning("ccflag: could not report " + args[0] + ": " + e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) {
                try (Response r = response) {
                    if (!r.isSuccessful()) {
                        plugin.getLogger().warning("ccflag: API returned " + r.code() + " for " + args[0]);
                    }
                }
            }
        });
        return true;
    }
}
