package ai.osone.society.economy;

import ai.osone.society.OSocietyPlugin;
import ai.osone.society.agents.VillagerAgent;
import org.bukkit.entity.Player;

import java.util.HashMap;
import java.util.Map;

public class EconomyManager {

    private final OSocietyPlugin plugin;
    private double treasury = 10000.0;
    private final Map<String, Double> playerBalances  = new HashMap<>();
    private final Map<String, Double> playerLoans     = new HashMap<>();
    private final Map<String, Map<String, Double>> marketPrices = new HashMap<>();

    // Daily wages by role
    private static final Map<String, Double> BASE_WAGES = Map.of(
        "mayor",    200.0,
        "banker",   150.0,
        "guard",    100.0,
        "judge",    175.0,
        "merchant",  80.0,
        "builder",   90.0,
        "farmer",    60.0,
        "doctor",   130.0,
        "librarian", 70.0,
        "citizen",   50.0
    );

    public EconomyManager(OSocietyPlugin plugin) {
        this.plugin = plugin;
        initMarket();
        load();
    }

    private void initMarket() {
        // Seed the market with basic goods
        marketPrices.put("bread",      Map.of("buy", 5.0,  "sell", 3.0));
        marketPrices.put("wheat",      Map.of("buy", 2.0,  "sell", 1.0));
        marketPrices.put("iron_ingot", Map.of("buy", 15.0, "sell", 10.0));
        marketPrices.put("gold_ingot", Map.of("buy", 40.0, "sell", 30.0));
        marketPrices.put("diamond",    Map.of("buy", 200.0,"sell", 150.0));
        marketPrices.put("wood",       Map.of("buy", 3.0,  "sell", 2.0));
        marketPrices.put("stone",      Map.of("buy", 2.0,  "sell", 1.0));
        marketPrices.put("leather",    Map.of("buy", 8.0,  "sell", 5.0));
        marketPrices.put("book",       Map.of("buy", 12.0, "sell", 8.0));
        marketPrices.put("emerald",    Map.of("buy", 25.0, "sell", 18.0));
    }

    // ── Player balance ops ────────────────────────────────────────────────────

    public double getBalance(Player player) {
        return playerBalances.getOrDefault(player.getName(),
                plugin.getConfig().getDouble("society.starting-balance", 100.0));
    }

    public boolean charge(Player player, double amount, String reason) {
        double bal = getBalance(player);
        if (bal < amount) return false;
        playerBalances.put(player.getName(), bal - amount);
        treasury += amount * 0.1; // 10% goes to treasury as tax
        logTransaction(player.getName(), -amount, reason);
        return true;
    }

    public void pay(Player player, double amount, String reason) {
        double bal = getBalance(player);
        playerBalances.put(player.getName(), bal + amount);
        logTransaction(player.getName(), amount, reason);
    }

    public boolean deposit(Player player, double amount) {
        if (getBalance(player) < amount) return false;
        playerBalances.put(player.getName(), getBalance(player) - amount);
        treasury += amount;
        return true;
    }

    public boolean withdraw(Player player, double amount) {
        if (treasury < amount) return false;
        treasury -= amount;
        playerBalances.put(player.getName(), getBalance(player) + amount);
        return true;
    }

    // ── Loans ─────────────────────────────────────────────────────────────────

    public boolean issueLoan(Player player, double amount) {
        double maxLoan = getBalance(player) * 2 + 100; // Can borrow 2x their balance + 100 base
        if (amount > maxLoan || treasury < amount) return false;
        double existing = playerLoans.getOrDefault(player.getName(), 0.0);
        playerLoans.put(player.getName(), existing + amount * (1 + plugin.getConfig().getDouble("economy.loan-interest", 0.1)));
        treasury -= amount;
        playerBalances.put(player.getName(), getBalance(player) + amount);
        return true;
    }

    public double getLoan(Player player) {
        return playerLoans.getOrDefault(player.getName(), 0.0);
    }

    public boolean repayLoan(Player player, double amount) {
        double owed = getLoan(player);
        if (owed <= 0 || getBalance(player) < amount) return false;
        double paid = Math.min(amount, owed);
        playerLoans.put(player.getName(), owed - paid);
        playerBalances.put(player.getName(), getBalance(player) - paid);
        treasury += paid;
        return true;
    }

    // ── Trades ────────────────────────────────────────────────────────────────

    public void offerTrade(VillagerAgent merchant, Player player, String item, double price) {
        String currency = plugin.getConfig().getString("society.currency-symbol", "⚜");
        player.sendMessage("§e" + merchant.getName() + " offers to sell §b" + item + "§e for §a" + price + currency);
        player.sendMessage("§7Type §f/society trade accept§7 to buy, or just ignore.");
        // Store pending trade — player can accept within 30 seconds
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            // Clear pending trade if not accepted
        }, 600L);
    }

    // ── Wages ─────────────────────────────────────────────────────────────────

    public void payDailyWages() {
        plugin.getAgentManager().getAgents().forEach((id, agent) -> {
            double wage = getDailyWage(agent.getRole());
            if (treasury >= wage) {
                treasury -= wage;
                agent.getMemory().addEvent("Received daily wage of " + wage + " Aurums from the treasury");
            } else {
                agent.getMemory().addEvent("Treasury ran out — no wages today. Very concerning.");
                // Trigger economic crisis event
                broadcastEconomicCrisis();
            }
        });
        plugin.getLogger().info("Daily wages paid. Treasury: " + treasury);
    }

    public double getDailyWage(String role) {
        return BASE_WAGES.getOrDefault(role, 50.0);
    }

    private void broadcastEconomicCrisis() {
        plugin.getServer().broadcastMessage(
            "§c§l[SOCIETY] The treasury is empty! " +
            plugin.getConfig().getString("society.name") + " is in economic crisis!"
        );
    }

    // ── Market ────────────────────────────────────────────────────────────────

    public double getBuyPrice(String item) {
        return marketPrices.getOrDefault(item, Map.of("buy", 10.0)).getOrDefault("buy", 10.0);
    }

    public double getSellPrice(String item) {
        return marketPrices.getOrDefault(item, Map.of("sell", 5.0)).getOrDefault("sell", 5.0);
    }

    public void adjustPrice(String item, double factor) {
        if (!marketPrices.containsKey(item)) return;
        Map<String, Double> prices = new HashMap<>(marketPrices.get(item));
        prices.put("buy",  prices.get("buy")  * factor);
        prices.put("sell", prices.get("sell") * factor);
        marketPrices.put(item, prices);
    }

    // ── Society deposits ─────────────────────────────────────────────────────

    public void societyDeposit(String from, double amount, String reason) {
        treasury += amount;
        logTransaction(from, amount, reason);
    }

    private void logTransaction(String who, double amount, String reason) {
        plugin.getDatabase().logTransaction(who, amount, reason);
    }

    private void load() {
        Map<String, Object> data = plugin.getDatabase().loadEconomy();
        if (data != null) {
            treasury = (double) data.getOrDefault("treasury", treasury);
            @SuppressWarnings("unchecked")
            Map<String, Double> saved = (Map<String, Double>) data.getOrDefault("balances", new HashMap<>());
            playerBalances.putAll(saved);
        }
    }

    public void save() {
        plugin.getDatabase().saveEconomy(treasury, playerBalances);
    }

    public double getTreasury() { return treasury; }
    public Map<String, Double> getPlayerBalances() { return playerBalances; }
    public Map<String, Map<String, Double>> getMarketPrices() { return marketPrices; }
}
