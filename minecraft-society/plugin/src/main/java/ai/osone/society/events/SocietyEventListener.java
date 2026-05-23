package ai.osone.society.events;

import ai.osone.society.OSocietyPlugin;
import ai.osone.society.agents.VillagerAgent;
import org.bukkit.entity.Player;
import org.bukkit.entity.Villager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

public class SocietyEventListener implements Listener {

    private final OSocietyPlugin plugin;

    public SocietyEventListener(OSocietyPlugin plugin) {
        this.plugin = plugin;
    }

    /** Player right-clicks a villager — starts a conversation. */
    @EventHandler
    public void onVillagerInteract(PlayerInteractEntityEvent e) {
        if (!(e.getRightClicked() instanceof Villager villager)) return;

        VillagerAgent agent = plugin.getAgentManager().getByEntityId(
            villager.getUniqueId().toString()
        );
        if (agent == null) return;

        e.setCancelled(true); // Prevent default trade UI

        Player player = e.getPlayer();
        double radius = plugin.getConfig().getDouble("society.conversation-radius", 5.0);
        if (player.getLocation().distanceSquared(villager.getLocation()) > radius * radius) {
            player.sendMessage("§7You're too far away to talk to " + agent.getName() + ".");
            return;
        }

        // Trigger a greeting
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
            agent.onPlayerSpeak(player, "[GREET] " + player.getName() + " approaches and makes eye contact.")
        );
    }

    /** Player types in chat — check if they're near a villager for conversation. */
    @EventHandler
    public void onPlayerChat(AsyncPlayerChatEvent e) {
        Player player = e.getPlayer();
        String message = e.getMessage();

        // Check for nearest agent within conversation radius
        double radius = plugin.getConfig().getDouble("society.conversation-radius", 5.0);
        VillagerAgent nearest = null;
        double nearestDist = Double.MAX_VALUE;

        for (VillagerAgent agent : plugin.getAgentManager().getAgents().values()) {
            if (!agent.getVillager().isValid()) continue;
            if (!agent.getVillager().getWorld().equals(player.getWorld())) continue;
            double dist = player.getLocation().distanceSquared(agent.getVillager().getLocation());
            if (dist <= radius * radius && dist < nearestDist) {
                nearest = agent;
                nearestDist = dist;
            }
        }

        if (nearest != null) {
            final VillagerAgent target = nearest;
            plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () ->
                target.onPlayerSpeak(player, message)
            );
        }
    }

    /** Player attacks a villager — guards respond. */
    @EventHandler
    public void onVillagerAttacked(EntityDamageByEntityEvent e) {
        if (!(e.getEntity() instanceof Villager villager)) return;
        if (!(e.getDamager() instanceof Player player)) return;

        VillagerAgent victim = plugin.getAgentManager().getByEntityId(
            villager.getUniqueId().toString()
        );
        if (victim == null) return;

        e.setCancelled(true); // AI villagers can't be killed

        victim.adjustRelationship(player.getName(), -20);
        victim.getMemory().addEvent(player.getName() + " attacked me!");

        // Notify nearby agents
        plugin.getAgentManager().getAgents().values().stream()
            .filter(a -> a.getRole().equals("guard"))
            .filter(a -> a.getVillager().getLocation().distanceSquared(villager.getLocation()) <= 900)
            .findFirst()
            .ifPresent(guard -> {
                plugin.getLawEnforcement().issueWarrant(player.getName(), "assault");
                plugin.getServer().getScheduler().runTask(plugin, () ->
                    plugin.getLawEnforcement().initiateArrest(guard, player)
                );
            });

        // Victim reacts
        player.sendMessage("§c" + victim.getName() + " shouts: 'Guards! Help!'");
    }

    /** Player joins — welcome from the society. */
    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent e) {
        Player player = e.getPlayer();
        String societyName = plugin.getConfig().getString("society.name", "Aethoria");
        String symbol      = plugin.getConfig().getString("society.currency-symbol", "⚜");
        double startBalance= plugin.getConfig().getDouble("society.starting-balance", 100);

        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            player.sendMessage("");
            player.sendMessage("§6§l✦ Welcome to " + societyName + " ✦");
            player.sendMessage("§7A living AI-driven society awaits you.");
            player.sendMessage("§7Starting balance: §a" + startBalance + symbol);
            player.sendMessage("§7Right-click any villager to talk. Type in chat when nearby.");
            player.sendMessage("§7Use §f/law list §7to see the town laws.");
            player.sendMessage("§7Use §f/bank balance §7to check your funds.");
            player.sendMessage("");

            // Nearest mayor/citizen greets the player
            plugin.getAgentManager().getAgents().values().stream()
                .filter(a -> a.getRole().equals("mayor") || a.getRole().equals("citizen"))
                .filter(a -> a.getVillager().isValid())
                .findFirst()
                .ifPresent(greeter -> {
                    String greeting = "§7[" + greeter.getName() + " (" + greeter.getRole() + ")]: §fAh, a new face! Welcome to " +
                        societyName + ", " + player.getName() + ". I'm " + greeter.getName() +
                        ". Let me know if you need anything — we run a tight ship here.";
                    player.sendMessage(greeting);
                });

            // If player is new, give starting balance
            if (!player.hasPlayedBefore()) {
                plugin.getEconomyManager().pay(player, startBalance, "Welcome bonus");
            }

            // Alert society of new arrival
            if (plugin.getAgentManager().getAgentCount() > 0) {
                String alert = player.getName() + " has arrived in " + societyName + ".";
                plugin.getAgentManager().getAgents().values().forEach(a ->
                    a.getMemory().addEvent(alert)
                );
            }
        }, 60L);
    }

    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent e) {
        // Save their economy data
        plugin.getEconomyManager().save();
    }

    /** Breaking blocks near town — potential vandalism. */
    @EventHandler
    public void onBlockBreak(BlockBreakEvent e) {
        Player player = e.getPlayer();
        if (player.hasPermission("osociety.admin")) return;

        // Check if near a town structure (simple distance check — can be refined)
        plugin.getAgentManager().getAgents().values().stream()
            .filter(a -> a.getRole().equals("guard") || a.getRole().equals("builder"))
            .filter(a -> a.getVillager().isValid())
            .filter(a -> a.getVillager().getLocation().distanceSquared(e.getBlock().getLocation()) <= 625)
            .findFirst()
            .ifPresent(watcher -> {
                watcher.getMemory().addEvent(player.getName() + " broke a block near my area. Suspicious.");
                // Guards issue a warning on first offense
                if (!plugin.getLawEnforcement().isWanted(player.getName())) {
                    player.sendMessage("§e" + watcher.getName() + ": Hey! Be careful what you break around here.");
                }
            });
    }
}
