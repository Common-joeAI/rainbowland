package ai.osone.society.data;

import java.util.*;

/**
 * Persistent memory for a VillagerAgent.
 * Stores: recent events, relationships, goals, and key facts.
 */
public class AgentMemory {

    private final String agentId;
    private final SocietyDatabase db;

    private final Deque<String> recentEvents = new ArrayDeque<>(50);
    private final Map<String, Integer> relationships = new HashMap<>();
    private final Map<String, String> facts = new HashMap<>();

    private static final int MAX_EVENTS = 50;

    public AgentMemory(String agentId, SocietyDatabase db) {
        this.agentId = agentId;
        this.db = db;
    }

    public void load() {
        Map<String, Object> data = db.loadAgentMemory(agentId);
        if (data == null) return;

        @SuppressWarnings("unchecked")
        List<String> events = (List<String>) data.getOrDefault("events", List.of());
        recentEvents.addAll(events);

        @SuppressWarnings("unchecked")
        Map<String, Integer> rels = (Map<String, Integer>) data.getOrDefault("relationships", Map.of());
        relationships.putAll(rels);

        @SuppressWarnings("unchecked")
        Map<String, String> f = (Map<String, String>) data.getOrDefault("facts", Map.of());
        facts.putAll(f);
    }

    public void save() {
        Map<String, Object> data = new HashMap<>();
        data.put("events",        new ArrayList<>(recentEvents));
        data.put("relationships", relationships);
        data.put("facts",         facts);
        db.saveAgentMemory(agentId, data);
    }

    public void addEvent(String event) {
        String timestamped = "[" + new java.util.Date() + "] " + event;
        if (recentEvents.size() >= MAX_EVENTS) {
            recentEvents.pollFirst(); // Remove oldest
        }
        recentEvents.addLast(timestamped);
        save();
    }

    public List<String> getRecentEvents(int n) {
        List<String> all = new ArrayList<>(recentEvents);
        int from = Math.max(0, all.size() - n);
        return all.subList(from, all.size());
    }

    public void setRelationship(String name, int opinion) {
        relationships.put(name, opinion);
        save();
    }

    public int getRelationship(String name) {
        return relationships.getOrDefault(name, 0);
    }

    public void set(String key, String value) {
        facts.put(key, value);
        save();
    }

    public String get(String key) {
        return facts.get(key);
    }

    public Map<String, Integer> getRelationships() { return Collections.unmodifiableMap(relationships); }
    public Map<String, String> getFacts()           { return Collections.unmodifiableMap(facts); }
}
