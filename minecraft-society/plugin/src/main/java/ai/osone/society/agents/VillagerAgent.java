package ai.osone.society.agents;

import ai.osone.society.OSocietyPlugin;
import ai.osone.society.data.AgentMemory;
import org.bukkit.entity.Villager;
import org.bukkit.entity.Player;

import java.util.*;

/**
 * Wraps a Minecraft Villager with a persistent AI agent.
 * Each VillagerAgent has:
 *  - A unique name and role
 *  - Persistent memory (relationships, events, goals)
 *  - A queue of pending decisions/actions
 *  - Connection to the Python agent server for LLM reasoning
 */
public class VillagerAgent {

    private final String agentId;
    private final String name;
    private final String role;
    private final Villager villager;
    private final AgentMemory memory;
    private final OSocietyPlugin plugin;

    // Personality traits (0.0 - 1.0)
    private final double friendliness;
    private final double greed;
    private final double lawfulness;
    private final double ambition;
    private final double curiosity;

    private String currentGoal = "settle in and get to know the town";
    private String currentMood = "neutral";
    private long lastThinkTime = 0;
    private long lastSpeakTime = 0;
    private boolean isBusy = false;

    // Relationship map: playerName/agentName -> opinion (-100 to 100)
    private final Map<String, Integer> relationships = new HashMap<>();

    public VillagerAgent(String agentId, String name, String role, Villager villager,
                         OSocietyPlugin plugin, Map<String, Double> traits) {
        this.agentId    = agentId;
        this.name       = name;
        this.role       = role;
        this.villager   = villager;
        this.plugin     = plugin;
        this.memory     = new AgentMemory(agentId, plugin.getDatabase());

        this.friendliness = traits.getOrDefault("friendliness", 0.5);
        this.greed        = traits.getOrDefault("greed", 0.5);
        this.lawfulness   = traits.getOrDefault("lawfulness", 0.7);
        this.ambition     = traits.getOrDefault("ambition", 0.5);
        this.curiosity    = traits.getOrDefault("curiosity", 0.5);

        memory.load();
        applyNameTag();
    }

    /** Called every society tick — autonomous behavior. */
    public void tick() {
        if (!villager.isValid() || villager.isDead()) return;

        long now = System.currentTimeMillis();
        long thinkInterval = plugin.getConfig().getLong("society.think-interval", 600) * 50L; // ticks to ms

        if (now - lastThinkTime > thinkInterval) {
            lastThinkTime = now;
            autonomousThink();
        }
    }

    /** Triggered when a player speaks to this villager. */
    public void onPlayerSpeak(Player player, String message) {
        if (!villager.isValid()) return;

        // Update relationship — player is paying attention to us
        adjustRelationship(player.getName(), 1);

        // Build context for the AI
        String context = buildPlayerContext(player, message);

        // Send async to agent server
        plugin.getAgentManager().queryAgent(agentId, context, message, (response) -> {
            if (response != null && !response.isEmpty()) {
                // Send response as villager chat
                plugin.getServer().getScheduler().runTask(plugin, () -> {
                    broadcastVillagerSpeech(response);
                    lastSpeakTime = System.currentTimeMillis();

                    // Parse any action commands from response
                    parseAndExecuteActions(response, player);
                });
            }
        });
    }

    /** Called when another villager agent interacts with this one. */
    public void onAgentInteract(VillagerAgent other, String context) {
        if (!villager.isValid()) return;
        adjustRelationship(other.getName(), 1);
        plugin.getAgentManager().queryAgent(agentId, context, "agent_interact", (response) -> {
            if (response != null && !response.isEmpty()) {
                plugin.getServer().getScheduler().runTask(plugin, () -> {
                    broadcastVillagerSpeech(response);
                    parseAndExecuteActions(response, null);
                });
            }
        });
    }

    private void autonomousThink() {
        if (isBusy) return;

        String context = buildSelfContext();
        String prompt  = "You are thinking autonomously. What do you want to do right now to advance your goal: " + currentGoal +
                         "? You may speak to nearby villagers, decide to work, make a trade, patrol, build something, " +
                         "propose a law, or anything else fitting your role. Keep it short and natural.";

        isBusy = true;
        plugin.getAgentManager().queryAgent(agentId, context, prompt, (response) -> {
            isBusy = false;
            if (response != null && !response.isEmpty()) {
                plugin.getServer().getScheduler().runTask(plugin, () -> {
                    // Only broadcast if meaningful (not internal monologue)
                    if (!response.startsWith("[INTERNAL]")) {
                        broadcastVillagerSpeech(response);
                    }
                    parseAndExecuteActions(response, null);
                });
            }
        });
    }

    private void parseAndExecuteActions(String response, Player triggeringPlayer) {
        // Action tags embedded in response: [TRADE:item:price], [ARREST:player], [BUILD:task], [LAW:proposal], [BANK:deposit:amount]
        if (response.contains("[TRADE:")) {
            // Merchant offering a trade
            String[] parts = response.split("\\[TRADE:")[1].split("]")[0].split(":");
            if (parts.length >= 2 && triggeringPlayer != null) {
                plugin.getEconomyManager().offerTrade(this, triggeringPlayer, parts[0], parseDouble(parts[1]));
            }
        }
        if (response.contains("[ARREST:") && role.equals("guard")) {
            String targetName = response.split("\\[ARREST:")[1].split("]")[0];
            Player target = plugin.getServer().getPlayer(targetName);
            if (target != null) {
                plugin.getLawEnforcement().initiateArrest(this, target);
            }
        }
        if (response.contains("[FINE:") && role.equals("guard")) {
            String[] parts = response.split("\\[FINE:")[1].split("]")[0].split(":");
            if (parts.length >= 2) {
                Player target = plugin.getServer().getPlayer(parts[0]);
                if (target != null) {
                    plugin.getLawEnforcement().issueFine(target, parseDouble(parts[1]), "Guard order");
                }
            }
        }
        if (response.contains("[DEPOSIT:") && role.equals("banker")) {
            String[] parts = response.split("\\[DEPOSIT:")[1].split("]")[0].split(":");
            if (parts.length >= 2) {
                plugin.getEconomyManager().societyDeposit(parts[0], parseDouble(parts[1]), "Banker directive");
            }
        }
        if (response.contains("[GOAL:")) {
            currentGoal = response.split("\\[GOAL:")[1].split("]")[0];
            memory.set("current_goal", currentGoal);
        }
        if (response.contains("[MOOD:")) {
            currentMood = response.split("\\[MOOD:")[1].split("]")[0];
        }
        if (response.contains("[MEMORY:")) {
            String memEntry = response.split("\\[MEMORY:")[1].split("]")[0];
            memory.addEvent(memEntry);
        }
    }

    private String buildPlayerContext(Player player, String message) {
        int opinion = relationships.getOrDefault(player.getName(), 0);
        String opinionStr = opinion > 30 ? "friendly" : opinion < -30 ? "distrustful" : "neutral";
        List<String> recentMemory = memory.getRecentEvents(5);

        return String.format(
            "SOCIETY: %s | YOUR NAME: %s | YOUR ROLE: %s | YOUR MOOD: %s | YOUR GOAL: %s\n" +
            "YOUR PERSONALITY: friendliness=%.1f greed=%.1f lawfulness=%.1f ambition=%.1f\n" +
            "YOUR OPINION OF %s: %s (score: %d)\n" +
            "RECENT MEMORIES: %s\n" +
            "ECONOMY: Treasury=%.0f%s | Your wages=%.0f%s/day\n" +
            "PLAYER %s SAYS: \"%s\"\n\n" +
            "Respond in character as %s, a %s in the town of %s. " +
            "Be natural, direct, and consistent with your personality. 1-3 sentences max. " +
            "You may embed action tags like [TRADE:item:price] [GOAL:new goal] [MEMORY:event to remember] [MOOD:happy/angry/worried/etc].",
            plugin.getConfig().getString("society.name"),
            name, role, currentMood, currentGoal,
            friendliness, greed, lawfulness, ambition,
            player.getName(), opinionStr, opinion,
            String.join("; ", recentMemory),
            plugin.getEconomyManager().getTreasury(),
            plugin.getConfig().getString("society.currency-symbol"),
            plugin.getEconomyManager().getDailyWage(role),
            plugin.getConfig().getString("society.currency-symbol"),
            player.getName(), message,
            name, role, plugin.getConfig().getString("society.name")
        );
    }

    private String buildSelfContext() {
        List<String> recentMemory = memory.getRecentEvents(8);
        List<String> nearbyAgents = plugin.getAgentManager().getNearbyAgentNames(villager.getLocation(), 20.0);

        return String.format(
            "SOCIETY: %s | YOUR NAME: %s | YOUR ROLE: %s | YOUR MOOD: %s | YOUR GOAL: %s\n" +
            "YOUR PERSONALITY: friendliness=%.1f greed=%.1f lawfulness=%.1f ambition=%.1f curiosity=%.1f\n" +
            "RECENT MEMORIES: %s\n" +
            "NEARBY VILLAGERS: %s\n" +
            "ECONOMY: Treasury=%.0f%s | Your wages=%.0f%s/day\n" +
            "TIME OF DAY: %s",
            plugin.getConfig().getString("society.name"),
            name, role, currentMood, currentGoal,
            friendliness, greed, lawfulness, ambition, curiosity,
            String.join("; ", recentMemory),
            String.join(", ", nearbyAgents),
            plugin.getEconomyManager().getTreasury(),
            plugin.getConfig().getString("society.currency-symbol"),
            plugin.getEconomyManager().getDailyWage(role),
            plugin.getConfig().getString("society.currency-symbol"),
            getTimeOfDay()
        );
    }

    private String getTimeOfDay() {
        long time = villager.getWorld().getTime();
        if (time < 6000)  return "morning";
        if (time < 12000) return "afternoon";
        if (time < 18000) return "evening";
        return "night";
    }

    private void broadcastVillagerSpeech(String message) {
        // Strip action tags from visible message
        String visible = message.replaceAll("\\[\\w+:[^\\]]*\\]", "").trim();
        if (visible.isEmpty()) return;

        String symbol = plugin.getConfig().getString("society.currency-symbol", "⚜");
        String roleColor = getRoleColor();

        // Broadcast to players within hearing range (16 blocks)
        villager.getWorld().getPlayers().forEach(p -> {
            if (p.getLocation().distanceSquared(villager.getLocation()) <= 256) {
                p.sendMessage("§7[" + roleColor + name + " §7(" + role + ")§7]: §f" + visible);
            }
        });
    }

    private void applyNameTag() {
        villager.setCustomName("§" + getRoleColorCode() + name + " §7[" + role + "]");
        villager.setCustomNameVisible(true);
        villager.setAI(false); // Disable default AI — we control them
        villager.setProfession(getRoleProfession());
    }

    private Villager.Profession getRoleProfession() {
        return switch (role) {
            case "banker", "merchant" -> Villager.Profession.CARTOGRAPHER;
            case "guard"             -> Villager.Profession.ARMORER;
            case "builder"           -> Villager.Profession.TOOLSMITH;
            case "farmer"            -> Villager.Profession.FARMER;
            case "judge", "mayor"    -> Villager.Profession.LIBRARIAN;
            case "doctor"            -> Villager.Profession.CLERIC;
            case "librarian"         -> Villager.Profession.LIBRARIAN;
            default                  -> Villager.Profession.NITWIT;
        };
    }

    private String getRoleColor() {
        return "§" + getRoleColorCode();
    }

    private String getRoleColorCode() {
        return switch (role) {
            case "mayor"    -> "6";
            case "banker"   -> "a";
            case "merchant" -> "e";
            case "guard"    -> "c";
            case "builder"  -> "b";
            case "farmer"   -> "2";
            case "judge"    -> "5";
            case "doctor"   -> "f";
            default         -> "7";
        };
    }

    public void adjustRelationship(String name, int delta) {
        int current = relationships.getOrDefault(name, 0);
        relationships.put(name, Math.max(-100, Math.min(100, current + delta)));
        memory.setRelationship(name, relationships.get(name));
    }

    private double parseDouble(String s) {
        try { return Double.parseDouble(s.trim()); } catch (Exception e) { return 0; }
    }

    // Getters
    public String getAgentId()   { return agentId; }
    public String getName()      { return name; }
    public String getRole()      { return role; }
    public Villager getVillager(){ return villager; }
    public AgentMemory getMemory(){ return memory; }
    public String getCurrentGoal(){ return currentGoal; }
    public String getCurrentMood(){ return currentMood; }
    public Map<String, Integer> getRelationships(){ return relationships; }
    public double getFriendliness(){ return friendliness; }
    public double getLawfulness() { return lawfulness; }
}
