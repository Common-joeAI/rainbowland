package ai.osone.society;

import ai.osone.society.agents.AgentManager;
import ai.osone.society.data.SocietyDatabase;
import ai.osone.society.economy.EconomyManager;
import ai.osone.society.events.SocietyEventListener;
import ai.osone.society.law.LawEnforcement;
import ai.osone.society.roles.RoleManager;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

public class OSocietyPlugin extends JavaPlugin {

    private static OSocietyPlugin instance;
    private AgentManager agentManager;
    private EconomyManager economyManager;
    private LawEnforcement lawEnforcement;
    private RoleManager roleManager;
    private SocietyDatabase database;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();

        getLogger().info("╔═══════════════════════════════════╗");
        getLogger().info("║       OSociety - AI Society       ║");
        getLogger().info("║   Powered by skyd / OSONE         ║");
        getLogger().info("╚═══════════════════════════════════╝");

        // Init database
        database = new SocietyDatabase(this);
        database.initialize();

        // Init managers
        economyManager = new EconomyManager(this);
        lawEnforcement = new LawEnforcement(this);
        roleManager    = new RoleManager(this);
        agentManager   = new AgentManager(this);

        // Register events
        getServer().getPluginManager().registerEvents(new SocietyEventListener(this), this);

        // Register commands
        getCommand("society").setExecutor(new SocietyCommand(this));
        getCommand("bank").setExecutor(new BankCommand(this));
        getCommand("law").setExecutor(new LawCommand(this));
        getCommand("talk").setExecutor(new TalkCommand(this));

        // Start the society tick loop
        startSocietyLoop();

        // Start daily wage scheduler
        startWageScheduler();

        getLogger().info("Society '" + getConfig().getString("society.name") + "' is ALIVE.");
    }

    @Override
    public void onDisable() {
        if (agentManager != null) agentManager.shutdown();
        if (database != null) database.close();
        getLogger().info("OSociety saved and shut down.");
    }

    private void startSocietyLoop() {
        int interval = getConfig().getInt("society.tick-interval", 100);
        new BukkitRunnable() {
            @Override
            public void run() {
                try {
                    agentManager.tickAll();
                } catch (Exception e) {
                    getLogger().warning("Society tick error: " + e.getMessage());
                }
            }
        }.runTaskTimer(this, 200L, interval);
    }

    private void startWageScheduler() {
        new BukkitRunnable() {
            @Override
            public void run() {
                economyManager.payDailyWages();
            }
        }.runTaskTimer(this, 24000L, 24000L);
    }

    public static OSocietyPlugin getInstance() { return instance; }
    public AgentManager getAgentManager()       { return agentManager; }
    public EconomyManager getEconomyManager()   { return economyManager; }
    public LawEnforcement getLawEnforcement()   { return lawEnforcement; }
    public RoleManager getRoleManager()         { return roleManager; }
    public SocietyDatabase getDatabase()        { return database; }
}
