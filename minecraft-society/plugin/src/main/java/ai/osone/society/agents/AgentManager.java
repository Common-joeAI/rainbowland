package ai.osone.society.agents;

import ai.osone.society.OSocietyPlugin;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import org.bukkit.Location;
import org.bukkit.entity.Villager;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;

public class AgentManager {

    private final OSocietyPlugin plugin;
    private final Map<String, VillagerAgent> agents = new ConcurrentHashMap<>();
    private final Map<String, VillagerAgent> entityIdToAgent = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Gson gson = new Gson();

    private final String agentServerUrl;
    private final int timeout;

    // Name pools by role
    private static final Map<String, List<String>> NAMES_BY_ROLE = Map.of(
        "mayor",     List.of("Aldric", "Seraphina", "Edmund", "Isolde"),
        "banker",    List.of("Midas", "Aurelia", "Silas", "Cordelia"),
        "merchant",  List.of("Theo", "Maren", "Jasper", "Petra", "Cato", "Lyra"),
        "guard",     List.of("Bram", "Sable", "Torvin", "Hilda", "Rex", "Vance"),
        "builder",   List.of("Clem", "Wren", "Fergus", "Dagny"),
        "farmer",    List.of("Oryn", "Pip", "Elara", "Merrick"),
        "judge",     List.of("Calixta", "Soren"),
        "doctor",    List.of("Mira", "Aldous"),
        "librarian", List.of("Evander", "Thessaly"),
        "citizen",   List.of("Finn", "Rosie", "Holt", "Bea", "Gus", "Nola", "Dex", "Ivy",
                             "Cobb", "Tess", "Blythe", "Remy", "Arlo", "Zara")
    );

    public AgentManager(OSocietyPlugin plugin) {
        this.plugin = plugin;
        String host = plugin.getConfig().getString("agent-server.host", "127.0.0.1");
        int port    = plugin.getConfig().getInt("agent-server.port", 7432);
        this.agentServerUrl = "http://" + host + ":" + port;
        this.timeout        = plugin.getConfig().getInt("agent-server.timeout-ms", 8000);
    }

    /** Spawn and register a new AI villager at the given location. */
    public VillagerAgent spawnAgent(Location location, String role) {
        String agentId = UUID.randomUUID().toString().substring(0, 8);
        String name    = pickName(role, agentId);

        // Spawn the Minecraft villager
        Villager villager = location.getWorld().spawn(location, Villager.class);
        villager.setVillagerType(Villager.Type.PLAINS);

        // Generate personality traits
        Map<String, Double> traits = generateTraits(role);

        VillagerAgent agent = new VillagerAgent(agentId, name, role, villager, plugin, traits);
        agents.put(agentId, agent);
        entityIdToAgent.put(villager.getUniqueId().toString(), agent);

        // Register with Python agent server
        registerWithServer(agent);

        plugin.getLogger().info("Spawned agent: " + name + " [" + role + "] id=" + agentId);
        return agent;
    }

    /** Register an existing villager (on reload) as an agent. */
    public VillagerAgent registerExisting(String agentId, String name, String role,
                                          Villager villager, Map<String, Double> traits) {
        VillagerAgent agent = new VillagerAgent(agentId, name, role, villager, plugin, traits);
        agents.put(agentId, agent);
        entityIdToAgent.put(villager.getUniqueId().toString(), agent);
        registerWithServer(agent);
        return agent;
    }

    /** Get agent by Minecraft entity UUID. */
    public VillagerAgent getByEntityId(String uuid) {
        return entityIdToAgent.get(uuid);
    }

    /** Tick all agents (called on schedule). */
    public void tickAll() {
        agents.values().forEach(a -> {
            try { a.tick(); } catch (Exception e) {
                plugin.getLogger().warning("Tick error for " + a.getName() + ": " + e.getMessage());
            }
        });

        // Periodically trigger inter-agent conversations
        if (Math.random() < 0.1) { // 10% chance per tick cycle
            triggerRandomAgentConversation();
        }
    }

    /** Query the Python agent server for a response. */
    public void queryAgent(String agentId, String context, String message, Consumer<String> callback) {
        executor.submit(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("agent_id", agentId);
                body.addProperty("context", context);
                body.addProperty("message", message);

                String responseStr = httpPost(agentServerUrl + "/agent/respond", body.toString());
                if (responseStr != null) {
                    JsonObject resp = gson.fromJson(responseStr, JsonObject.class);
                    String text = resp.has("response") ? resp.get("response").getAsString() : "";
                    callback.accept(text);
                }
            } catch (Exception e) {
                plugin.getLogger().warning("Agent query failed for " + agentId + ": " + e.getMessage());
                callback.accept(null);
            }
        });
    }

    /** Trigger a spontaneous conversation between two nearby agents. */
    private void triggerRandomAgentConversation() {
        List<VillagerAgent> agentList = new ArrayList<>(agents.values());
        if (agentList.size() < 2) return;

        Collections.shuffle(agentList);
        VillagerAgent a = agentList.get(0);
        VillagerAgent b = agentList.get(1);

        if (!a.getVillager().isValid() || !b.getVillager().isValid()) return;
        double dist = a.getVillager().getLocation().distanceSquared(b.getVillager().getLocation());
        if (dist > 400) return; // 20 blocks

        String context = String.format(
            "You are %s (%s). You encounter %s (%s). Your opinion of them: %d. " +
            "Your current goal: %s. Your mood: %s. Have a brief natural conversation or interaction.",
            a.getName(), a.getRole(), b.getName(), b.getRole(),
            a.getRelationships().getOrDefault(b.getName(), 0),
            a.getCurrentGoal(), a.getCurrentMood()
        );

        a.onAgentInteract(b, context);
    }

    public List<String> getNearbyAgentNames(Location loc, double radius) {
        List<String> names = new ArrayList<>();
        double rSq = radius * radius;
        for (VillagerAgent a : agents.values()) {
            if (a.getVillager().isValid() &&
                a.getVillager().getLocation().distanceSquared(loc) <= rSq) {
                names.add(a.getName() + " (" + a.getRole() + ")");
            }
        }
        return names;
    }

    private void registerWithServer(VillagerAgent agent) {
        executor.submit(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("agent_id",    agent.getAgentId());
                body.addProperty("name",        agent.getName());
                body.addProperty("role",        agent.getRole());
                body.addProperty("goal",        agent.getCurrentGoal());
                httpPost(agentServerUrl + "/agent/register", body.toString());
            } catch (Exception e) {
                plugin.getLogger().warning("Could not register agent with server: " + e.getMessage());
            }
        });
    }

    private String httpPost(String urlStr, String jsonBody) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setConnectTimeout(timeout);
        conn.setReadTimeout(timeout);
        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
        }

        int code = conn.getResponseCode();
        InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
        if (is == null) return null;

        try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            return sb.toString();
        }
    }

    private String pickName(String role, String agentId) {
        List<String> pool = NAMES_BY_ROLE.getOrDefault(role, List.of("Villager"));
        // Use agentId hash to pick consistently but vary
        int idx = Math.abs(agentId.hashCode()) % pool.size();
        // Check for duplicates
        String name = pool.get(idx);
        long count = agents.values().stream().filter(a -> a.getName().equals(name)).count();
        if (count > 0) name = name + " " + (count + 1);
        return name;
    }

    private Map<String, Double> generateTraits(String role) {
        Random rng = new Random();
        Map<String, Double> t = new HashMap<>();
        // Base traits with role-specific biases
        t.put("friendliness", clamp(rng.nextGaussian() * 0.2 + switch (role) {
            case "merchant", "doctor" -> 0.7; case "guard" -> 0.4; default -> 0.5; }));
        t.put("greed",        clamp(rng.nextGaussian() * 0.2 + switch (role) {
            case "banker", "merchant" -> 0.7; case "guard", "judge" -> 0.2; default -> 0.4; }));
        t.put("lawfulness",   clamp(rng.nextGaussian() * 0.15 + switch (role) {
            case "guard", "judge", "mayor" -> 0.85; case "citizen" -> 0.5; default -> 0.65; }));
        t.put("ambition",     clamp(rng.nextGaussian() * 0.2 + switch (role) {
            case "mayor", "banker" -> 0.8; case "farmer" -> 0.3; default -> 0.5; }));
        t.put("curiosity",    clamp(rng.nextGaussian() * 0.2 + switch (role) {
            case "librarian", "doctor" -> 0.8; default -> 0.5; }));
        return t;
    }

    private double clamp(double v) { return Math.max(0.0, Math.min(1.0, v)); }

    public void shutdown() {
        executor.shutdownNow();
    }

    public Map<String, VillagerAgent> getAgents() { return Collections.unmodifiableMap(agents); }
    public int getAgentCount() { return agents.size(); }
}
