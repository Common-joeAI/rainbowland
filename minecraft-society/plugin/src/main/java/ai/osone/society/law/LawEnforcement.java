package ai.osone.society.law;

import ai.osone.society.OSocietyPlugin;
import ai.osone.society.agents.VillagerAgent;
import org.bukkit.entity.Player;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

import java.util.*;

public class LawEnforcement {

    private final OSocietyPlugin plugin;

    // Active warrants: playerName -> List<crime>
    private final Map<String, List<String>> warrants = new HashMap<>();
    // Criminal records: playerName -> List<{crime, date, fine}>
    private final Map<String, List<Map<String, Object>>> records = new HashMap<>();
    // Strikes: playerName -> count
    private final Map<String, Integer> strikes = new HashMap<>();
    // Currently jailed: playerName -> release time (ms)
    private final Map<String, Long> jailed = new HashMap<>();

    // The law book — rules the AI agents enforce
    private final List<String> laws = new ArrayList<>(List.of(
        "No stealing from other citizens or the market",
        "No assaulting other citizens or villagers",
        "No trespassing in restricted areas (bank vault, jail, mayor's office)",
        "All players must pay market tax on trades",
        "Destroying town infrastructure is vandalism and punishable",
        "Players must pay debts to the bank within 7 days",
        "No bribing town officials (it won't work anyway)",
        "The mayor's decrees are law"
    ));

    public LawEnforcement(OSocietyPlugin plugin) {
        this.plugin = plugin;
        load();
    }

    // ── Arrests ───────────────────────────────────────────────────────────────

    public void initiateArrest(VillagerAgent guard, Player player) {
        String crime = getActiveWarrant(player.getName());
        if (crime == null) crime = "suspicious behavior";

        final String finalCrime = crime;
        player.sendMessage("§c§l[GUARD " + guard.getName().toUpperCase() + "] Stop right there! " +
            "You are under arrest for " + crime + "!");

        // Slow them down
        player.addPotionEffect(new PotionEffect(PotionEffectType.SLOWNESS, 200, 2, false, true));

        // Notify nearby players
        guard.getVillager().getWorld().getPlayers().forEach(p -> {
            if (p.getLocation().distanceSquared(guard.getVillager().getLocation()) <= 900) {
                p.sendMessage("§c[SOCIETY] " + guard.getName() + " is arresting " + player.getName() +
                    " for " + finalCrime + "!");
            }
        });

        // Process arrest after short delay (player can try to run)
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            if (player.isOnline() &&
                player.getLocation().distanceSquared(guard.getVillager().getLocation()) <= 400) {
                processArrest(player, finalCrime, guard);
            } else if (player.isOnline()) {
                player.sendMessage("§e" + guard.getName() + " shouts: 'You can't run forever!'");
                issueWarrant(player.getName(), finalCrime);
            }
        }, 60L);
    }

    private void processArrest(Player player, String crime, VillagerAgent guard) {
        addRecord(player.getName(), crime, "arrested by " + guard.getName());
        addStrike(player.getName());

        int strikes = getStrikes(player.getName());
        int maxStrikes = plugin.getConfig().getInt("law.max-strikes", 3);

        Map<String, Object> crimeCfg = (Map<String, Object>)
            plugin.getConfig().get("law.crimes." + crime.replace(" ", "_"));
        double fine = crimeCfg != null ? ((Number)crimeCfg.getOrDefault("fine", 50)).doubleValue() : 50.0;
        int jailTime = crimeCfg != null ? ((Number)crimeCfg.getOrDefault("jail-time-min", 2)).intValue() : 2;

        if (strikes >= maxStrikes) {
            // Maximum sentence
            jailPlayer(player, jailTime * 3);
            player.sendMessage("§c§lJUDGMENT: " + strikes + " strikes. " +
                jailTime * 3 + " minutes in jail + " + fine * 2 + " Aurum fine.");
            issueFine(player, fine * 2, crime + " (repeat offender)");
        } else {
            issueFine(player, fine, crime);
            if (jailTime > 0) jailPlayer(player, jailTime);
            player.sendMessage("§c§lARRESTED: Fine of " + fine + " Aurums. Strike " + strikes + "/" + maxStrikes + ".");
        }

        removeWarrant(player.getName());
        guard.getMemory().addEvent("Arrested " + player.getName() + " for " + crime);
    }

    // ── Fines ─────────────────────────────────────────────────────────────────

    public void issueFine(Player player, double amount, String reason) {
        boolean paid = plugin.getEconomyManager().charge(player, amount, "fine: " + reason);
        String symbol = plugin.getConfig().getString("society.currency-symbol", "⚜");
        if (paid) {
            player.sendMessage("§c[LAW] Fine of " + amount + symbol + " charged for: " + reason);
        } else {
            player.sendMessage("§c[LAW] Fine of " + amount + symbol + " for: " + reason +
                " — you can't afford it. Debt recorded.");
            plugin.getDatabase().recordDebt(player.getName(), amount, reason);
        }
    }

    // ── Jail ──────────────────────────────────────────────────────────────────

    public void jailPlayer(Player player, int minutes) {
        long releaseTime = System.currentTimeMillis() + (minutes * 60 * 1000L);
        jailed.put(player.getName(), releaseTime);

        player.addPotionEffect(new PotionEffect(PotionEffectType.MINING_FATIGUE, minutes * 1200, 255, false, false));
        player.addPotionEffect(new PotionEffect(PotionEffectType.SLOWNESS, minutes * 1200, 5, false, false));
        player.sendMessage("§8§l[JAILED] You are serving " + minutes + " minutes. Sentence started.");

        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            releasePlayer(player);
        }, minutes * 1200L);
    }

    public void releasePlayer(Player player) {
        jailed.remove(player.getName());
        player.removePotionEffect(PotionEffectType.MINING_FATIGUE);
        player.removePotionEffect(PotionEffectType.SLOWNESS);
        player.sendMessage("§a[RELEASED] You have served your sentence. Stay out of trouble.");
    }

    // ── Warrants ──────────────────────────────────────────────────────────────

    public void issueWarrant(String playerName, String crime) {
        warrants.computeIfAbsent(playerName, k -> new ArrayList<>()).add(crime);
        plugin.getServer().broadcastMessage(
            "§c[WANTED] A warrant has been issued for §f" + playerName + "§c for " + crime + "!"
        );
    }

    public String getActiveWarrant(String playerName) {
        List<String> crimes = warrants.get(playerName);
        return (crimes != null && !crimes.isEmpty()) ? crimes.get(0) : null;
    }

    public void removeWarrant(String playerName) {
        warrants.remove(playerName);
    }

    public boolean isWanted(String playerName) {
        return warrants.containsKey(playerName) && !warrants.get(playerName).isEmpty();
    }

    // ── Records ───────────────────────────────────────────────────────────────

    public void addRecord(String player, String crime, String details) {
        Map<String, Object> entry = new HashMap<>();
        entry.put("crime", crime);
        entry.put("details", details);
        entry.put("date", System.currentTimeMillis());
        records.computeIfAbsent(player, k -> new ArrayList<>()).add(entry);
        plugin.getDatabase().logCrime(player, crime, details);
    }

    public List<Map<String, Object>> getRecord(String player) {
        return records.getOrDefault(player, List.of());
    }

    private void addStrike(String player) {
        strikes.put(player, strikes.getOrDefault(player, 0) + 1);
    }

    public int getStrikes(String player) {
        return strikes.getOrDefault(player, 0);
    }

    // ── Laws ──────────────────────────────────────────────────────────────────

    public void addLaw(String law) {
        laws.add(law);
        plugin.getServer().broadcastMessage(
            "§6§l[NEW LAW] " + plugin.getConfig().getString("society.name") +
            " has a new law: §f" + law
        );
    }

    public List<String> getLaws() { return Collections.unmodifiableList(laws); }

    public boolean isJailed(String playerName) {
        Long release = jailed.get(playerName);
        if (release == null) return false;
        if (System.currentTimeMillis() > release) {
            jailed.remove(playerName);
            return false;
        }
        return true;
    }

    private void load() {
        // Load from database
    }

    public Map<String, List<String>> getWarrants() { return warrants; }
}
