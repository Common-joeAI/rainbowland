"""
OSociety Agent Server v3
- Full RCON integration — agents speak directly in Minecraft chat
- Offspring system — agents form relationships, marry, have children
- Children inherit blended parent traits + random mutation
- Children grow up, get assigned roles based on aptitude
- Full cost economy driving all behavior
"""

import asyncio
import json
import os
import sqlite3
import time
import random
import struct
import logging
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
log = logging.getLogger("osociety")

# ── Config ────────────────────────────────────────────────────────────────────
LLAMA_URL  = os.getenv("LLAMA_URL", "http://172.22.0.1:8080")
DB_PATH    = Path(os.getenv("DATA_DIR", "/data")) / "society.db"
PORT       = int(os.getenv("PORT", 7432))
MAX_TOKENS = int(os.getenv("MAX_TOKENS", 200))
RCON_HOST  = os.getenv("MC_RCON_HOST", "osociety-minecraft")
RCON_PORT  = int(os.getenv("MC_RCON_PORT", 25575))
RCON_PASS  = os.getenv("MC_RCON_PASS", "df04b97261b63298ab7db5f9")

app = FastAPI(title="OSociety Agent Server v3")

# ── Economy constants ─────────────────────────────────────────────────────────
ROLE_UPKEEP = {
    "mayor": 150, "banker": 100, "guard": 80, "judge": 120,
    "merchant": 60, "builder": 70, "farmer": 30, "doctor": 90,
    "librarian": 40, "citizen": 0, "child": 0,
}
ROLE_WAGES = {
    "mayor": 200, "banker": 160, "guard": 110, "judge": 180,
    "merchant": 90, "builder": 95, "farmer": 65, "doctor": 140,
    "librarian": 75, "citizen": 40, "child": 0,
}

# Cost to have a child — paid by both parents
CHILD_COST = 150

# ── Survival need costs (Aurums per day) ──────────────────────────────────────
# What each agent pays to meet their basic needs
NEED_COSTS = {
    "food":    8,   # bread / food_ration from the market
    "water":   3,   # free from wells but small upkeep fee for infrastructure
    "shelter": 5,   # rent to the builder / housing fund
}
# Total daily survival cost = 16A — doable on citizen wage (40A) but tight for unemployed children/demoted
DAILY_SURVIVAL_COST = sum(NEED_COSTS.values())  # 16A

# How much each need decays per day without payment (0-1 scale)
NEED_DECAY = {
    "hunger":  0.25,   # starve in 4 days without food
    "thirst":  0.35,   # dehydrate in ~3 days
    "shelter": 0.15,   # homelessness is slower but still lethal
}
# Need thresholds that affect mood and productivity
NEED_CRISIS  = 0.25   # below this → desperate mood, halved productivity
NEED_DEAD    = 0.0    # at zero → death

# ── Innovation engine ─────────────────────────────────────────────────────────
# Tech tree — each innovation unlocks new goods/markets/abilities
# Format: id -> {name, requires, cost, researcher_role, unlocks_item, unlock_desc, base_price}
TECH_TREE = {
    # Tier 1 — basic crafting (no prerequisites)
    "T1_forge":     {"name":"Iron Forge",      "requires":[],             "cost":200, "researcher":"builder",
                     "unlocks":"iron_sword",    "desc":"Blacksmiths can craft weapons",         "buy":45,"sell":28},
    "T1_mill":      {"name":"Grain Mill",       "requires":[],             "cost":150, "researcher":"farmer",
                     "unlocks":"flour",         "desc":"Farmers produce flour from wheat",       "buy":6,"sell":3},
    "T1_apoth":     {"name":"Apothecary",       "requires":[],             "cost":180, "researcher":"doctor",
                     "unlocks":"herbal_remedy", "desc":"Doctors craft stronger remedies",        "buy":25,"sell":15},
    "T1_press":     {"name":"Printing Press",   "requires":[],             "cost":220, "researcher":"librarian",
                     "unlocks":"newspaper",     "desc":"Librarians publish daily news",          "buy":10,"sell":6},
    "T1_bakery":    {"name":"Bakery",           "requires":["T1_mill"],    "cost":160, "researcher":"farmer",
                     "unlocks":"pastry",        "desc":"Bakers produce luxury food",             "buy":18,"sell":11},

    # Tier 2 — industrial
    "T2_smelter":   {"name":"Smelter",          "requires":["T1_forge"],   "cost":350, "researcher":"builder",
                     "unlocks":"steel_ingot",   "desc":"Builders smelt steel for construction",  "buy":60,"sell":40},
    "T2_brewery":   {"name":"Brewery",          "requires":["T1_mill"],    "cost":280, "researcher":"merchant",
                     "unlocks":"ale",           "desc":"Merchants brew and sell ale",            "buy":20,"sell":12},
    "T2_hospital":  {"name":"Hospital",         "requires":["T1_apoth"],   "cost":400, "researcher":"doctor",
                     "unlocks":"surgery_kit",   "desc":"Doctors perform surgeries, reduce death","buy":80,"sell":50},
    "T2_academy":   {"name":"Academy",          "requires":["T1_press"],   "cost":380, "researcher":"librarian",
                     "unlocks":"textbook",      "desc":"Education increases child role quality", "buy":35,"sell":20},
    "T2_market":    {"name":"Grand Market",     "requires":["T1_forge"],   "cost":500, "researcher":"merchant",
                     "unlocks":"exotic_goods",  "desc":"Merchants import rare goods",            "buy":120,"sell":75},

    # Tier 3 — advanced society
    "T3_enchant":   {"name":"Enchanting Table", "requires":["T2_smelter","T2_academy"],"cost":800,"researcher":"librarian",
                     "unlocks":"enchanted_item","desc":"Librarians enchant tools for all roles", "buy":200,"sell":130},
    "T3_citadel":   {"name":"Citadel",          "requires":["T2_smelter"], "cost":1000,"researcher":"builder",
                     "unlocks":"fortification", "desc":"Guards can defend against raids",        "buy":0,"sell":0},
    "T3_bank":      {"name":"Central Bank",     "requires":["T2_market"],  "cost":1200,"researcher":"banker",
                     "unlocks":"treasury_bond", "desc":"Bankers issue bonds, grow treasury",    "buy":150,"sell":90},
    "T3_alchemy":   {"name":"Alchemist Lab",    "requires":["T2_hospital","T3_enchant"],"cost":1500,"researcher":"doctor",
                     "unlocks":"elixir",        "desc":"Doctors craft life-extending elixirs",  "buy":300,"sell":180},
}

# Innovation incentive — agent who triggers research gets a bonus
RESEARCH_BONUS = 50   # Aurums paid to the researching agent
INNOVATION_BONUS = 100  # Aurums bonus when research completes



# Age in Minecraft days before a child becomes an adult
CHILD_GROW_UP_DAYS = 3

BASE_PRICES = {
    "bread":       {"buy": 8,   "sell": 5},
    "wheat":       {"buy": 3,   "sell": 2},
    "seeds":       {"buy": 5,   "sell": 3},
    "iron_ingot":  {"buy": 20,  "sell": 14},
    "gold_ingot":  {"buy": 55,  "sell": 40},
    "diamond":     {"buy": 250, "sell": 180},
    "wood":        {"buy": 4,   "sell": 2},
    "stone":       {"buy": 3,   "sell": 1},
    "food_ration": {"buy": 12,  "sell": 8},
    "medicine":    {"buy": 40,  "sell": 25},
    "book":        {"buy": 15,  "sell": 10},
    "materials":   {"buy": 30,  "sell": 20},
    "labor":       {"buy": 25,  "sell": 15},
    "parchment":   {"buy": 8,   "sell": 5},
    "emerald":     {"buy": 30,  "sell": 22},
}

# ── RCON ─────────────────────────────────────────────────────────────────────
async def rcon_send(command: str) -> str:
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(RCON_HOST, RCON_PORT), timeout=4
        )
        async def send_pkt(rid, ptype, payload):
            enc = payload.encode("utf-8") + b"\x00\x00"
            writer.write(struct.pack("<iii", 4+4+len(enc), rid, ptype) + enc)
            await writer.drain()

        async def read_pkt():
            hdr = await asyncio.wait_for(reader.read(12), timeout=3)
            if len(hdr) < 12: return -1, -1, ""
            length, rid, ptype = struct.unpack("<iii", hdr)
            body = await asyncio.wait_for(reader.read(length - 8), timeout=3)
            return rid, ptype, body[:-2].decode("utf-8", errors="replace")

        await send_pkt(1, 3, RCON_PASS)
        await read_pkt()
        await send_pkt(2, 2, command)
        _, _, result = await read_pkt()
        writer.close()
        return result
    except Exception as e:
        log.debug(f"RCON: {e}")
        return ""

async def mc_say(msg: str):
    """Broadcast to all players."""
    clean = msg.replace('"', "'").replace('\\', '')[:255]
    await rcon_send(f'say {clean}')

async def mc_tell(player: str, msg: str):
    clean = msg.replace('"', "'").replace('\\', '')[:255]
    await rcon_send(f'tell {player} {clean}')

async def mc_title(player: str, title: str, subtitle: str = ""):
    await rcon_send(f'title {player} title {{"text":"{title}","bold":true}}')
    if subtitle:
        await rcon_send(f'title {player} subtitle {{"text":"{subtitle}"}}')

async def mc_speak_as(name: str, role: str, msg: str):
    """Make a villager 'speak' — formatted as coloured chat."""
    color = {
        "mayor":"gold","banker":"green","guard":"red","judge":"dark_purple",
        "merchant":"yellow","builder":"aqua","farmer":"dark_green",
        "doctor":"white","librarian":"blue","citizen":"gray","child":"light_purple"
    }.get(role, "gray")
    clean = msg.replace('"', "'").replace('\\', '')[:240]
    await rcon_send(
        f'tellraw @a [{{"text":"[","color":"dark_gray"}},'
        f'{{"text":"{name}","color":"{color}","bold":true}},'
        f'{{"text":" ({role})","color":"dark_gray"}},'
        f'{{"text":"] ","color":"dark_gray"}},'
        f'{{"text":"{clean}","color":"white"}}]'
    )

async def mc_summon_villager(x: float, y: float, z: float, name: str, role: str):
    color = {
        "mayor":"gold","banker":"green","guard":"red","judge":"dark_purple",
        "merchant":"yellow","builder":"aqua","farmer":"dark_green",
        "doctor":"white","librarian":"blue","citizen":"gray","child":"light_purple"
    }.get(role, "gray")
    cmd = (
        f'summon minecraft:villager {int(x)} {int(y)} {int(z)} '
        f'{{CustomName:\'{{"text":"{name} [{role}]","color":"{color}"}}\','
        f'CustomNameVisible:1b,NoAI:0b,Invulnerable:1b,'
        f'VillagerData:{{profession:minecraft:farmer,level:5,type:minecraft:plains}}}}'
    )
    return await rcon_send(cmd)

# ── Database ──────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS agents (
            agent_id    TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            role        TEXT NOT NULL,
            goal        TEXT DEFAULT 'establish myself in the community',
            mood        TEXT DEFAULT 'neutral',
            balance     REAL DEFAULT 200.0,
            traits      TEXT DEFAULT '{}',
            -- Reproduction fields
            partner_id  TEXT DEFAULT NULL,
            parent1_id  TEXT DEFAULT NULL,
            parent2_id  TEXT DEFAULT NULL,
            generation  INTEGER DEFAULT 1,
            is_child    INTEGER DEFAULT 0,
            birth_tick  INTEGER DEFAULT 0,
            -- Position
            x REAL DEFAULT 0, y REAL DEFAULT 64, z REAL DEFAULT 0,
            -- Survival needs (0.0 = dead, 1.0 = perfect)
            hunger      REAL DEFAULT 1.0,
            thirst      REAL DEFAULT 1.0,
            shelter     REAL DEFAULT 1.0,
            health      REAL DEFAULT 1.0,
            -- Need flags
            is_dead     INTEGER DEFAULT 0,
            cause_of_death TEXT DEFAULT NULL,
            created_at  REAL DEFAULT (strftime('%s','now')),
            last_active REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS relationships (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_a     TEXT NOT NULL,
            agent_b     TEXT NOT NULL,
            type        TEXT NOT NULL,  -- 'friend','rival','partner','family'
            strength    REAL DEFAULT 0.0,  -- 0.0 to 1.0
            updated_at  REAL DEFAULT (strftime('%s','now')),
            UNIQUE(agent_a, agent_b)
        );
        CREATE TABLE IF NOT EXISTS agent_memory (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id    TEXT NOT NULL,
            entry_type  TEXT NOT NULL,
            key         TEXT,
            value       TEXT NOT NULL,
            ts          REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS conversations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id    TEXT NOT NULL,
            speaker     TEXT NOT NULL,
            role        TEXT NOT NULL,
            content     TEXT NOT NULL,
            ts          REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS economy (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            who         TEXT NOT NULL,
            amount      REAL NOT NULL,
            type        TEXT NOT NULL,
            reason      TEXT,
            ts          REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS market (
            item        TEXT PRIMARY KEY,
            buy_price   REAL NOT NULL,
            sell_price  REAL NOT NULL,
            supply      INTEGER DEFAULT 100,
            demand      INTEGER DEFAULT 50
        );
        CREATE TABLE IF NOT EXISTS laws (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            text        TEXT NOT NULL,
            proposed_by TEXT,
            enacted_at  REAL DEFAULT (strftime('%s','now')),
            active      INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS crime_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            player      TEXT NOT NULL,
            crime       TEXT NOT NULL,
            details     TEXT,
            fine        REAL DEFAULT 0,
            ts          REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS player_accounts (
            player_name TEXT PRIMARY KEY,
            balance     REAL DEFAULT 100.0,
            loan        REAL DEFAULT 0.0,
            strikes     INTEGER DEFAULT 0,
            tax_owed    REAL DEFAULT 0.0,
            joined_at   REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS treasury (
            id      INTEGER PRIMARY KEY CHECK (id = 1),
            balance REAL DEFAULT 5000.0,
            updated_at REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS society_tick (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            tick_number INTEGER DEFAULT 0,
            mc_day      INTEGER DEFAULT 0,
            ts          REAL DEFAULT (strftime('%s','now'))
        );
        INSERT OR IGNORE INTO treasury (id, balance) VALUES (1, 5000.0);
        INSERT OR IGNORE INTO society_tick (tick_number, mc_day) VALUES (0, 0);
    """)
    # Migrate existing DB — add columns if missing
    for col, default in [
        ("hunger",  "1.0"), ("thirst",  "1.0"), ("shelter", "1.0"),
        ("health",  "1.0"), ("is_dead", "0"),    ("cause_of_death", "NULL"),
    ]:
        try:
            conn.execute(f"ALTER TABLE agents ADD COLUMN {col} REAL DEFAULT {default}")
            conn.commit()
        except Exception:
            pass  # column already exists
    # Ensure innovations table exists (migration)
    conn.execute("""CREATE TABLE IF NOT EXISTS innovations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id TEXT UNIQUE NOT NULL,
        tech_name TEXT NOT NULL, status TEXT DEFAULT 'available',
        researcher_id TEXT DEFAULT NULL, progress REAL DEFAULT 0.0,
        started_tick INTEGER DEFAULT 0, unlocked_tick INTEGER DEFAULT NULL,
        created_at REAL DEFAULT (strftime('%s','now')))""")
    conn.execute("""CREATE TABLE IF NOT EXISTS research_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id TEXT NOT NULL,
        proposed_by TEXT DEFAULT 'system', votes INTEGER DEFAULT 1,
        created_at REAL DEFAULT (strftime('%s','now')))""")
    conn.commit()

    for item, p in BASE_PRICES.items():
        conn.execute("INSERT OR IGNORE INTO market (item,buy_price,sell_price) VALUES(?,?,?)",
                     (item, p["buy"], p["sell"]))

    base_laws = [
        "No stealing from citizens, merchants, or the market treasury",
        "No assaulting other players or villagers",
        "All trades are subject to a 5% bank transaction fee",
        "Players must pay taxes on income above 500 Aurums per day",
        "Destroying town property is vandalism — punishable by fine and labor",
        "All loans must be repaid within 7 real days with interest",
        "The Mayor's decrees supersede all other rules",
        "Guards may arrest any player with an active warrant on sight",
        "Citizens must pay a community levy of 10 Aurums/day or contribute labor",
    ]
    for law in base_laws:
        conn.execute("INSERT OR IGNORE INTO laws (text, proposed_by) VALUES (?, 'Founding Charter')", (law,))

    conn.commit()
    conn.close()

# ── In-memory state ───────────────────────────────────────────────────────────
agents: dict[str, dict] = {}

# ── Economy helpers ───────────────────────────────────────────────────────────
def get_treasury() -> float:
    conn = get_db(); r = conn.execute("SELECT balance FROM treasury WHERE id=1").fetchone(); conn.close()
    return r["balance"] if r else 0.0

def set_treasury(v: float):
    conn = get_db()
    conn.execute("UPDATE treasury SET balance=?,updated_at=strftime('%s','now') WHERE id=1", (max(0,v),))
    conn.commit(); conn.close()

def get_agent_balance(agent_id: str) -> float:
    conn = get_db(); r = conn.execute("SELECT balance FROM agents WHERE agent_id=?", (agent_id,)).fetchone(); conn.close()
    return r["balance"] if r else 0.0

def adjust_agent_balance(agent_id: str, delta: float, conn=None):
    own = conn is None
    if own: conn = get_db()
    conn.execute("UPDATE agents SET balance=MAX(0,balance+?) WHERE agent_id=?", (delta, agent_id))
    if own: conn.commit(); conn.close()

def add_memory(agent_id: str, etype: str, value: str, key: str = None, conn=None):
    own = conn is None
    if own: conn = get_db()
    conn.execute("INSERT INTO agent_memory (agent_id,entry_type,key,value) VALUES(?,?,?,?)",
                 (agent_id, etype, key, value))
    conn.execute("""DELETE FROM agent_memory WHERE agent_id=? AND id NOT IN
        (SELECT id FROM agent_memory WHERE agent_id=? ORDER BY ts DESC LIMIT 60)""",
                 (agent_id, agent_id))
    if own: conn.commit(); conn.close()

def get_memories(agent_id: str, n: int = 8) -> list:
    conn = get_db()
    rows = conn.execute("SELECT value FROM agent_memory WHERE agent_id=? ORDER BY ts DESC LIMIT ?",
                        (agent_id, n)).fetchall()
    conn.close()
    return [r["value"] for r in reversed(rows)]

def get_laws() -> list:
    conn = get_db()
    rows = conn.execute("SELECT text FROM laws WHERE active=1 ORDER BY enacted_at").fetchall()
    conn.close()
    return [r["text"] for r in rows]

def get_market() -> dict:
    conn = get_db()
    rows = conn.execute("SELECT * FROM market").fetchall()
    conn.close()
    return {r["item"]: {"buy": r["buy_price"], "sell": r["sell_price"]} for r in rows}

def get_current_tick() -> int:
    conn = get_db(); r = conn.execute("SELECT tick_number FROM society_tick ORDER BY id DESC LIMIT 1").fetchone(); conn.close()
    return r["tick_number"] if r else 0

def get_relationship(a_id: str, b_id: str) -> dict:
    conn = get_db()
    r = conn.execute("SELECT * FROM relationships WHERE agent_a=? AND agent_b=?", (a_id, b_id)).fetchone()
    conn.close()
    return dict(r) if r else {"type": "stranger", "strength": 0.0}

def update_relationship(a_id: str, b_id: str, rel_type: str, delta: float):
    conn = get_db()
    conn.execute("""
        INSERT INTO relationships (agent_a, agent_b, type, strength)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(agent_a, agent_b) DO UPDATE SET
            type=excluded.type,
            strength=MIN(1.0, MAX(0.0, strength + ?)),
            updated_at=strftime('%s','now')
    """, (a_id, b_id, rel_type, max(0.0, min(1.0, delta)), delta))
    conn.commit(); conn.close()

# ── Offspring / Reproduction ──────────────────────────────────────────────────

# Name pools for children
CHILD_NAMES_MALE   = ["Aiden","Bren","Cato","Dael","Evin","Fenn","Gael","Holt",
                      "Iven","Jace","Kael","Lorn","Mace","Noel","Orin","Pell",
                      "Quin","Rael","Senn","Tael","Uven","Vael","Wyn","Xael","Zion"]
CHILD_NAMES_FEMALE = ["Aria","Bree","Cael","Dael","Eira","Faye","Gwen","Hana",
                      "Iyla","Juno","Kira","Lena","Maia","Nova","Opal","Pria",
                      "Quinn","Rael","Sera","Tala","Uma","Vael","Wren","Xara","Zara"]

def blend_traits(t1: dict, t2: dict, mutation: float = 0.15) -> dict:
    """Blend two parents' traits with random mutation."""
    blended = {}
    all_keys = set(list(t1.keys()) + list(t2.keys()))
    for k in all_keys:
        v1 = t1.get(k, 0.5)
        v2 = t2.get(k, 0.5)
        # Weighted blend — slightly random
        weight = random.uniform(0.35, 0.65)
        base = v1 * weight + v2 * (1 - weight)
        # Mutation
        mut = random.gauss(0, mutation)
        blended[k] = max(0.0, min(1.0, base + mut))
    return blended

def pick_role_from_traits(traits: dict) -> str:
    """Assign grown-up role based on dominant traits."""
    scores = {
        "mayor":     traits.get("ambition",0.5) * 0.6 + traits.get("lawfulness",0.5) * 0.4,
        "banker":    traits.get("greed",0.5) * 0.6 + traits.get("ambition",0.5) * 0.4,
        "guard":     traits.get("lawfulness",0.5) * 0.7 + (1-traits.get("greed",0.5)) * 0.3,
        "merchant":  traits.get("greed",0.5) * 0.5 + traits.get("friendliness",0.5) * 0.5,
        "builder":   traits.get("curiosity",0.5) * 0.6 + traits.get("ambition",0.5) * 0.4,
        "farmer":    (1-traits.get("ambition",0.5)) * 0.4 + traits.get("friendliness",0.5) * 0.6,
        "doctor":    traits.get("curiosity",0.5) * 0.5 + traits.get("friendliness",0.5) * 0.5,
        "librarian": traits.get("curiosity",0.5) * 0.8 + (1-traits.get("greed",0.5)) * 0.2,
        "judge":     traits.get("lawfulness",0.5) * 0.8 + (1-traits.get("greed",0.5)) * 0.2,
        "citizen":   0.2,  # fallback
    }
    # Weight by treasury need — if guards are few, push toward guard
    return max(scores, key=scores.get)

async def spawn_child(parent1_id: str, parent2_id: str) -> Optional[dict]:
    """Create a new child agent from two parents — single DB connection throughout."""
    conn = get_db()
    try:
        p1 = conn.execute("SELECT * FROM agents WHERE agent_id=?", (parent1_id,)).fetchone()
        p2 = conn.execute("SELECT * FROM agents WHERE agent_id=?", (parent2_id,)).fetchone()
        if not p1 or not p2:
            return None

        p1_bal = p1["balance"] or 0.0
        p2_bal = p2["balance"] or 0.0
        if p1_bal < CHILD_COST / 2 or p2_bal < CHILD_COST / 2:
            return None

        # Deduct cost
        conn.execute("UPDATE agents SET balance=MAX(0,balance-?) WHERE agent_id=?",
                     (CHILD_COST/2, parent1_id))
        conn.execute("UPDATE agents SET balance=MAX(0,balance-?) WHERE agent_id=?",
                     (CHILD_COST/2, parent2_id))

        # Generate child
        import uuid as _uuid
        child_id     = str(_uuid.uuid4())[:8]
        t1           = json.loads(p1["traits"] or "{}")
        t2           = json.loads(p2["traits"] or "{}")
        child_traits = blend_traits(t1, t2)

        name_pool = CHILD_NAMES_FEMALE if random.random() > 0.5 else CHILD_NAMES_MALE
        existing  = {r["name"] for r in conn.execute("SELECT name FROM agents").fetchall()}
        available = [n for n in name_pool if n not in existing]
        child_name = random.choice(available) if available else f"Child_{child_id[:4]}"

        cx  = (p1["x"] + p2["x"]) / 2 + random.uniform(-2, 2)
        cz  = (p1["z"] + p2["z"]) / 2 + random.uniform(-2, 2)
        gen = max(p1["generation"] or 1, p2["generation"] or 1) + 1

        child_goal = (
            f"Grow up as the child of {p1['name']} and {p2['name']}. "
            f"Learn about the world and find my role in Aethoria."
        )

        # Current tick
        tick_row = conn.execute("SELECT tick_number FROM society_tick ORDER BY id DESC LIMIT 1").fetchone()
        cur_tick = tick_row["tick_number"] if tick_row else 0

        conn.execute("""
            INSERT INTO agents (agent_id,name,role,goal,traits,balance,
                parent1_id,parent2_id,generation,is_child,birth_tick,x,y,z)
            VALUES (?,?,?,?,?,50.0,?,?,?,1,?,?,64,?)""",
            (child_id, child_name, "child", child_goal,
             json.dumps(child_traits), parent1_id, parent2_id, gen, cur_tick, cx, cz))

        conn.execute("UPDATE agents SET partner_id=? WHERE agent_id=?", (parent2_id, parent1_id))
        conn.execute("UPDATE agents SET partner_id=? WHERE agent_id=?", (parent1_id, parent2_id))

        # Relationships
        for a, b in [(parent1_id,child_id),(parent2_id,child_id),(child_id,parent1_id),(child_id,parent2_id)]:
            conn.execute("""INSERT INTO relationships (agent_a,agent_b,type,strength)
                VALUES(?,?,'family',0.9)
                ON CONFLICT(agent_a,agent_b) DO UPDATE SET type='family',strength=0.9""", (a, b))

        # Memories
        conn.execute("INSERT INTO agent_memory (agent_id,entry_type,value) VALUES(?,?,?)",
                     (child_id, "event", f"I was born to {p1['name']} and {p2['name']}. Gen {gen}."))
        conn.execute("INSERT INTO agent_memory (agent_id,entry_type,value) VALUES(?,?,?)",
                     (parent1_id, "event", f"My child {child_name} was born! Gen {gen}."))
        conn.execute("INSERT INTO agent_memory (agent_id,entry_type,value) VALUES(?,?,?)",
                     (parent2_id, "event", f"My child {child_name} was born! Gen {gen}."))
        conn.commit()

    finally:
        conn.close()

    # In-memory cache
    agents[child_id] = {
        "name": child_name, "role": "child", "goal": child_goal,
        "traits": child_traits, "history": [], "mood": "curious",
        "x": cx, "y": 64, "z": cz,
        "parent1": p1["name"], "parent2": p2["name"],
        "generation": gen, "is_child": True, "birth_tick": cur_tick,
    }

    # Announce in Minecraft
    await mc_summon_villager(cx, 64, cz, child_name, "child")
    await mc_say(
        f"[Society] {child_name} has been born — child of {p1['name']} & {p2['name']}! "
        f"Generation {gen}. Population: {len(agents)}."
    )

    log.info(f"Child born: {child_name} [{child_id}] gen={gen}")
    return {"child_id": child_id, "name": child_name, "generation": gen, "traits": child_traits}


async def grow_up(agent_id: str, conn=None):
    """A child becomes an adult — assign role based on traits."""
    own_conn = conn is None
    if own_conn:
        conn = get_db()

    row = conn.execute("SELECT * FROM agents WHERE agent_id=?", (agent_id,)).fetchone()
    if not row or not row["is_child"]:
        if own_conn: conn.close()
        return

    traits     = json.loads(row["traits"] or "{}")
    adult_role = pick_role_from_traits(traits)

    p1_name, p2_name = "", ""
    if row["parent1_id"]:
        p = conn.execute("SELECT name FROM agents WHERE agent_id=?", (row["parent1_id"],)).fetchone()
        if p: p1_name = p["name"]
    if row["parent2_id"]:
        p = conn.execute("SELECT name FROM agents WHERE agent_id=?", (row["parent2_id"],)).fetchone()
        if p: p2_name = p["name"]

    new_goal = f"I grew up as a {adult_role}. Forge my own path and make my family proud."
    conn.execute("UPDATE agents SET role=?, is_child=0, goal=?, balance=200.0 WHERE agent_id=?",
                 (adult_role, new_goal, agent_id))
    conn.execute("INSERT INTO agent_memory (agent_id,entry_type,value) VALUES(?,?,?)",
                 (agent_id, "event",
                  f"Grew up and became a {adult_role}. "
                  f"Top traits: {', '.join(f'{k}={v:.2f}' for k,v in sorted(traits.items(),key=lambda x:-x[1])[:3])}."))
    if own_conn:
        conn.commit(); conn.close()

    if agent_id in agents:
        agents[agent_id]["role"]     = adult_role
        agents[agent_id]["is_child"] = False
        agents[agent_id]["goal"]     = new_goal

    await mc_say(
        f"[Society] {row['name']} has grown up and become Aethoria's newest {adult_role}! "
        f"(child of {p1_name} & {p2_name}, Gen {row['generation']})"
    )
    await mc_speak_as(row["name"], adult_role,
        f"I'm ready to take my place in Aethoria as a {adult_role}.")


# ── Role prompts ──────────────────────────────────────────────────────────────
ROLE_PROMPTS = {
"mayor": """You are Mayor {name} of Aethoria. You GOVERN.
You set budgets, pass laws, resolve crises. Treasury funds everything.
If it runs dry, guards quit, builders stop, and the town collapses.
You are charismatic, calculating, and obsessed with legacy.
Actions: [BUDGET:role:amount] [LAW:text] [TAX:player:amount] [EVENT:type:details]""",

"banker": """You are {name}, Banker of Aethoria. Money is your religion.
Loans (with interest), deposits, treasury reports, debt collection.
You are skeptical of bad credit risks and ruthless about debts.
Actions: [LOAN:player:amount] [COLLECT_DEBT:player:amount] [INTEREST:player:amount]""",

"guard": """You are {name}, Guard of Aethoria. You enforce the law — period.
You cost 110A/day. You take that seriously.
Actions: [ARREST:player:crime] [FINE:player:amount:reason] [WARRANT:player:crime]
Stern, fair, zero tolerance.""",

"merchant": """You are {name}, Merchant of Aethoria. Buy cheap. Sell high. Always profit.
You pay 60A/day upkeep AND maintain stock. Out of stock = no income.
You watch markets obsessively. You negotiate hard. You hate taxes.
Actions: [TRADE:player:item:price] [RESTOCK:item:qty] [PRICE_UPDATE:item:price]""",

"builder": """You are {name}, Builder of Aethoria. You turn vision into reality.
Every project costs real materials and labor. No budget = no build.
You pitch projects to the Mayor. Quality costs and you'll say so.
Actions: [BUILD_PROJECT:name:cost] [REQUEST_BUDGET:amount:reason] [COMPLETE:project]""",

"farmer": """You are {name}, Farmer of Aethoria. You feed the town.
Seeds cost 10A. Without food, health drops, morale tanks.
You're the backbone of the economy and underpaid. You know it.
Actions: [PLANT:crop:cost] [HARVEST:crop:yield] [SELL_FOOD:item:qty:price]""",

"judge": """You are {name}, Judge of Aethoria. You are the law made flesh.
Court costs 25A/session. You set precedents. Your verdicts are final.
You can increase sentences, pardon, or establish new rules.
Actions: [VERDICT:player:crime:sentence] [PARDON:player] [PRECEDENT:text]""",

"doctor": """You are {name}, Doctor of Aethoria. You heal. Supplies cost 15A/treatment.
You push for public health laws. You can't work for free.
Actions: [HEAL:player:cost] [PRESCRIBE:player:treatment] [HEALTH_REPORT:status]""",

"librarian": """You are {name}, Librarian of Aethoria. You are the town's memory.
You document everything. Parchment costs 5A/entry. Knowledge is power.
Actions: [RECORD:event] [LOOKUP:subject] [ARCHIVE:title]""",

"citizen": """You are {name}, a Citizen of Aethoria. You live, work, gossip, dream.
40A/day basic income. You pay taxes, buy food, use services.
You might petition the Mayor, start a business, fall in love.
You're a real person in this world. Act like it.""",

"child": """You are {name}, a child growing up in Aethoria.
Your parents are {parent1} and {parent2}.
You're curious, playful, and learning about the world.
You watch the adults around you and ask questions.
You cannot work yet but you observe everything.
One day you'll grow up and choose your own path.""",
}

# ── Pydantic models ───────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    agent_id: str; name: str; role: str
    goal: str = "establish myself in the community"
    traits: dict = {}
    x: float = 0; y: float = 64; z: float = 0

class RespondRequest(BaseModel):
    agent_id: str; context: str; message: str; speaker: str = "unknown"

class SpawnChildRequest(BaseModel):
    parent1_id: str; parent2_id: str

class GrowUpRequest(BaseModel):
    agent_id: str

class PlayerActionRequest(BaseModel):
    player: str; action: str; params: dict = {}

class SocietyTickRequest(BaseModel):
    tick_type: str = "daily"; details: str = ""

# ── Agent endpoints ───────────────────────────────────────────────────────────
@app.post("/agent/register")
async def register_agent(req: RegisterRequest, bg: BackgroundTasks):
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO agents
            (agent_id,name,role,goal,traits,balance,x,y,z)
        VALUES (?,?,?,?,?,200.0,?,?,?)
    """, (req.agent_id, req.name, req.role, req.goal,
          json.dumps(req.traits), req.x, req.y, req.z))
    conn.commit(); conn.close()

    agents[req.agent_id] = {
        "name": req.name, "role": req.role, "goal": req.goal,
        "traits": req.traits, "history": [], "mood": "neutral",
        "x": req.x, "y": req.y, "z": req.z,
        "is_child": False, "parent1": "", "parent2": "",
    }

    add_memory(req.agent_id, "event", f"Arrived in Aethoria as a {req.role}. Starting balance: 200 Aurums.")
    bg.add_task(mc_summon_villager, req.x, req.y, req.z, req.name, req.role)
    bg.add_task(mc_say, f"[Society] {req.name} ({req.role}) has joined Aethoria.")
    return {"ok": True, "agent_id": req.agent_id}

@app.post("/agent/respond")
async def agent_respond(req: RespondRequest):
    agent = agents.get(req.agent_id)
    if not agent:
        conn = get_db()
        row = conn.execute("SELECT * FROM agents WHERE agent_id=?", (req.agent_id,)).fetchone()
        conn.close()
        if not row: raise HTTPException(404, "Agent not registered")
        agents[req.agent_id] = {
            "name": row["name"], "role": row["role"], "goal": row["goal"],
            "traits": json.loads(row["traits"] or "{}"), "history": [],
            "mood": row["mood"] or "neutral",
            "is_child": bool(row["is_child"]),
            "parent1": "", "parent2": "",
        }
        agent = agents[req.agent_id]

    role, name = agent["role"], agent["name"]
    bal   = get_agent_balance(req.agent_id)
    treas = get_treasury()
    mems  = get_memories(req.agent_id, 8)
    laws  = get_laws()[:5]
    mkt   = get_market()

    # Relationship context
    conn = get_db()
    partner_row = conn.execute("""
        SELECT a.name, a.role FROM agents a
        JOIN agents me ON me.agent_id=? AND me.partner_id=a.agent_id
    """, (req.agent_id,)).fetchone()
    children_rows = conn.execute("""
        SELECT name, role, is_child FROM agents
        WHERE parent1_id=? OR parent2_id=?
    """, (req.agent_id, req.agent_id)).fetchall()
    conn.close()

    partner_str  = f"{partner_row['name']} ({partner_row['role']})" if partner_row else "none"
    children_str = ", ".join(f"{c['name']} ({'child' if c['is_child'] else c['role']})" for c in children_rows) or "none"

    econ_ctx = (
        f"ECONOMY: your balance={bal:.0f}A | treasury={treas:.0f}A | "
        f"upkeep={ROLE_UPKEEP.get(role,0)}A/day | wage={ROLE_WAGES.get(role,40)}A/day\n"
        f"MARKET: bread={mkt.get('bread',{}).get('buy','?')}A iron={mkt.get('iron_ingot',{}).get('buy','?')}A "
        f"medicine={mkt.get('medicine',{}).get('buy','?')}A\n"
        f"FAMILY: partner={partner_str} | children={children_str}\n"
        f"LAWS: {'; '.join(laws)}\n"
        f"MEMORIES: {' | '.join(mems) if mems else 'none'}\n"
        f"CONTEXT: {req.context}"
    )

    parent1 = agent.get("parent1", "")
    parent2 = agent.get("parent2", "")
    if agent["is_child"] and not parent1:
        conn = get_db()
        row = conn.execute("SELECT * FROM agents WHERE agent_id=?", (req.agent_id,)).fetchone()
        conn.close()
        if row:
            p1r = get_db().execute("SELECT name FROM agents WHERE agent_id=?", (row["parent1_id"],)).fetchone()
            p2r = get_db().execute("SELECT name FROM agents WHERE agent_id=?", (row["parent2_id"],)).fetchone()
            parent1 = p1r["name"] if p1r else "unknown"
            parent2 = p2r["name"] if p2r else "unknown"
            agent["parent1"] = parent1
            agent["parent2"] = parent2

    role_prompt = ROLE_PROMPTS.get(role, ROLE_PROMPTS["citizen"]).format(
        name=name, parent1=parent1 or "unknown", parent2=parent2 or "unknown"
    )

    system = f"""{role_prompt}

Your name is {name}. Town: Aethoria. Goal: {agent['goal']}. Mood: {agent['mood']}.
{econ_ctx}

RULES:
- You are a REAL PERSON. Never break character or mention AI.
- 1-3 sentences MAX. Real-time game.
- Reference your balance, family, and memories naturally.
- If balance < 50, you are stressed/desperate.
- If treasury < 500, react with concern.
- Embed action tags when acting:
  [TRADE:item:price] [ARREST:name:crime] [FINE:name:amount:reason]
  [LOAN:player:amount] [LAW:text] [GOAL:text] [MOOD:emotion] [MEMORY:text]
  [BUDGET:role:amount] [COURT_FEE:amount] [WANT_CHILD:partner_id]
- To have a child with your partner, embed [WANT_CHILD:partner_agent_id]
  Only do this if you have a partner, both have 75+ balance, and you feel ready.
"""

    messages = [{"role": "system", "content": system}]
    for h in agent["history"][-8:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": req.message})

    try:
        async with httpx.AsyncClient(timeout=12) as c:
            r = await c.post(f"{LLAMA_URL}/v1/chat/completions", json={
                "model": "local", "messages": messages,
                "max_tokens": MAX_TOKENS, "temperature": 0.85, "top_p": 0.9
            })
            response_text = r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        log.warning(f"LLM error {name}: {e}")
        response_text = _fallback(name, role, bal)

    agent["history"].append({"role": "user",      "content": req.message})
    agent["history"].append({"role": "assistant",  "content": response_text})
    if len(agent["history"]) > 16:
        agent["history"] = agent["history"][-16:]

    # Broadcast speech in Minecraft
    visible = __import__('re').sub(r'\[[A-Z_]+:[^\]]*\]', '', response_text).strip()
    if visible:
        await mc_speak_as(name, role, visible)

    # Execute actions
    await _execute_actions(response_text, req.agent_id, agent, req.speaker)

    conn = get_db()
    conn.execute("INSERT INTO conversations (agent_id,speaker,role,content) VALUES(?,?,?,?)",
                 (req.agent_id, req.speaker, "user", req.message))
    conn.execute("INSERT INTO conversations (agent_id,speaker,role,content) VALUES(?,?,?,?)",
                 (req.agent_id, req.speaker, "assistant", response_text))
    conn.execute("UPDATE agents SET last_active=strftime('%s','now'),mood=? WHERE agent_id=?",
                 (agent["mood"], req.agent_id))
    conn.commit(); conn.close()

    return {"response": response_text, "agent_id": req.agent_id, "name": name, "role": role}

async def _execute_actions(text: str, agent_id: str, agent: dict, speaker: str):
    import re
    def extract(tag): return re.findall(rf'\[{tag}:([^\]]+)\]', text)

    for v in extract("MEMORY"): add_memory(agent_id, "event", v)
    for v in extract("MOOD"):   agent["mood"] = v.strip()
    for v in extract("GOAL"):
        agent["goal"] = v.strip()
        conn = get_db(); conn.execute("UPDATE agents SET goal=? WHERE agent_id=?", (v.strip(), agent_id)); conn.commit(); conn.close()

    for v in extract("FINE"):
        parts = v.split(":")
        if len(parts) >= 2:
            player, amount = parts[0], float(parts[1])
            reason = parts[2] if len(parts) > 2 else "guard order"
            conn = get_db()
            conn.execute("INSERT OR IGNORE INTO player_accounts (player_name) VALUES(?)", (player,))
            conn.execute("UPDATE player_accounts SET balance=MAX(0,balance-?) WHERE player_name=?", (amount, player))
            conn.commit(); conn.close()
            set_treasury(get_treasury() + amount * 0.8)
            add_memory(agent_id, "event", f"Fined {player} {amount:.0f}A for {reason}")
            await mc_tell(player, f"[LAW] {agent['name']} fined you {amount:.0f} Aurums: {reason}")

    for v in extract("TRADE"):
        parts = v.split(":")
        if len(parts) >= 2 and speaker != "unknown":
            item, price = parts[0], float(parts[1])
            fee = price * 0.05
            conn = get_db()
            conn.execute("INSERT OR IGNORE INTO player_accounts (player_name) VALUES(?)", (speaker,))
            conn.execute("UPDATE player_accounts SET balance=MAX(0,balance-?) WHERE player_name=?", (price, speaker))
            conn.commit(); conn.close()
            adjust_agent_balance(agent_id, price - fee)
            set_treasury(get_treasury() + fee)
            await mc_tell(speaker, f"[Market] Bought {item} for {price:.0f}A (bank fee: {fee:.1f}A)")

    for v in extract("LOAN"):
        parts = v.split(":")
        if len(parts) >= 2:
            player, amount = parts[0], float(parts[1])
            if get_treasury() >= amount:
                set_treasury(get_treasury() - amount)
                conn = get_db()
                conn.execute("INSERT OR IGNORE INTO player_accounts (player_name) VALUES(?)", (player,))
                conn.execute("UPDATE player_accounts SET balance=balance+?, loan=loan+? WHERE player_name=?",
                             (amount, amount * 1.10, player))
                conn.commit(); conn.close()
                await mc_tell(player, f"[Bank] {agent['name']} approved loan of {amount:.0f}A. Repay {amount*1.1:.0f}A in 7 days.")
            else:
                await mc_tell(player, f"[Bank] Loan denied — treasury reserves too low.")

    for v in extract("LAW"):
        conn = get_db(); conn.execute("INSERT INTO laws (text,proposed_by) VALUES(?,?)", (v.strip(), agent["name"])); conn.commit(); conn.close()
        await mc_say(f"[New Law by {agent['name']}] {v.strip()}")

    for v in extract("BUDGET"):
        parts = v.split(":")
        if len(parts) >= 2:
            role_target, amount = parts[0], float(parts[1])
            set_treasury(get_treasury() - amount)
            await mc_say(f"[Mayor] {agent['name']} allocated {amount:.0f}A to {role_target}.")

    # ── Reproduction ──────────────────────────────────────────────────────────
    for v in extract("WANT_CHILD"):
        partner_id = v.strip()
        # Confirm partner exists and both have enough balance
        p_bal   = get_agent_balance(agent_id)
        p2_bal  = get_agent_balance(partner_id)
        if p_bal >= CHILD_COST / 2 and p2_bal >= CHILD_COST / 2:
            # Check they're actually partners
            conn = get_db()
            row = conn.execute("SELECT partner_id FROM agents WHERE agent_id=?", (agent_id,)).fetchone()
            conn.close()
            if row and row["partner_id"] == partner_id:
                child_info = await spawn_child(agent_id, partner_id)
                if child_info:
                    add_memory(agent_id, "event",
                        f"My child {child_info['name']} was born (Gen {child_info['generation']})!")
            else:
                # They're not partners yet — form partnership first
                update_relationship(agent_id, partner_id, "partner", 0.8)
                conn = get_db()
                conn.execute("UPDATE agents SET partner_id=? WHERE agent_id=?", (partner_id, agent_id))
                conn.commit(); conn.close()
                await mc_say(f"[Society] {agent['name']} and {v.strip()[:8]} have formed a partnership!")


# ── Reproduction endpoint ─────────────────────────────────────────────────────
@app.post("/society/spawn_child")
async def spawn_child_endpoint(req: SpawnChildRequest):
    result = await spawn_child(req.parent1_id, req.parent2_id)
    if not result:
        raise HTTPException(400, "Could not spawn child — check parents exist and have funds")
    return result

@app.post("/society/grow_up")
async def grow_up_endpoint(req: GrowUpRequest):
    await grow_up(req.agent_id)
    return {"ok": True}

# ── Daily tick ────────────────────────────────────────────────────────────────
@app.post("/society/tick")
async def society_tick(req: SocietyTickRequest):
    results = {"wages_paid": 0, "upkeep_charged": 0, "demotions": 0, "grown_up": 0}
    treas   = get_treasury()
    
    # Get data first
    conn    = get_db()
    rows    = conn.execute("SELECT * FROM agents").fetchall()
    rows = [dict(r) for r in rows]  # Convert to dicts before closing
    current_tick = get_current_tick() + 1
    conn.close()

    for row in rows:
        aid  = row["agent_id"]
        role = row["role"]
        wage   = ROLE_WAGES.get(role, 0)
        upkeep = ROLE_UPKEEP.get(role, 0)

        # Pay wages
        if wage > 0:
            if treas >= wage:
                treas -= wage
                adjust_agent_balance(aid, wage)
                results["wages_paid"] += 1
            else:
                add_memory(aid, "event", "Treasury couldn't pay my wage today. Crisis!")

        # Charge upkeep
        if upkeep > 0:
            bal = get_agent_balance(aid)
            if bal >= upkeep:
                adjust_agent_balance(aid, -upkeep)
                results["upkeep_charged"] += 1
            elif role not in ("citizen", "child"):
                conn = get_db()
                conn.execute("UPDATE agents SET role='citizen' WHERE agent_id=?", (aid,))
                conn.commit()
                conn.close()
                add_memory(aid, "event", f"Demoted from {role} to citizen — couldn't afford {upkeep}A upkeep.")
                results["demotions"] += 1
                if aid in agents: agents[aid]["role"] = "citizen"

        # Grow up children
        if row.get("is_child"):
            ticks_alive = current_tick - (row.get("birth_tick") or 0)
            if ticks_alive >= CHILD_GROW_UP_DAYS:
                await grow_up(aid)
                results["grown_up"] += 1

    # Now update treasury and market in a single transaction
    conn = get_db()
    
    # Loan interest on players
    conn.execute("UPDATE player_accounts SET loan=loan*1.01 WHERE loan>0")
    
    # Market fluctuation
    for item in BASE_PRICES:
        sd = random.randint(-5, 5)
        dd = random.randint(-3, 7)
        conn.execute("""
            UPDATE market SET
                supply=MAX(0,supply+?), demand=MAX(0,demand+?),
                buy_price=ROUND(buy_price*(1.0+(?*0.01-?*0.005)),2),
                sell_price=ROUND(sell_price*(1.0+(?*0.01-?*0.005)),2)
            WHERE item=?
        """, (sd, dd, dd, sd, dd, sd, item))

    # Update treasury and tick counter
    conn.execute("UPDATE treasury SET balance=?,updated_at=strftime('%s','now') WHERE id=1", (max(0, treas),))
    conn.execute("INSERT INTO society_tick (tick_number) VALUES(?)", (current_tick,))
    conn.commit()
    conn.close()

    if treas < 500:
        await mc_say(f"[CRISIS] Treasury critical: {treas:.0f} Aurums! Mayor must act!")
    elif treas < 1500:
        await mc_say(f"[Society] Treasury warning: {treas:.0f} Aurums remaining.")

    results["treasury"] = treas
    results["tick"]     = current_tick
    return results

# ── Status / Snapshot ─────────────────────────────────────────────────────────
@app.get("/status")
async def status():
    conn = get_db()
    ac = conn.execute("SELECT COUNT(*) as c FROM agents").fetchone()["c"]
    mc = conn.execute("SELECT COUNT(*) as c FROM conversations").fetchone()["c"]
    lc = conn.execute("SELECT COUNT(*) as c FROM laws WHERE active=1").fetchone()["c"]
    cc = conn.execute("SELECT COUNT(*) as c FROM agents WHERE is_child=1").fetchone()["c"]
    conn.close()
    return {"ok": True, "society": "Aethoria", "agents": ac, "children": cc,
            "treasury": get_treasury(), "messages": mc, "laws": lc,
            "llama_url": LLAMA_URL, "tick": get_current_tick()}

@app.get("/society/snapshot")
async def snapshot():
    conn = get_db()
    rows  = conn.execute("SELECT name,role,balance,mood,goal,is_child,generation FROM agents").fetchall()
    laws  = conn.execute("SELECT text FROM laws WHERE active=1 ORDER BY enacted_at DESC LIMIT 10").fetchall()
    mkt   = conn.execute("SELECT item,buy_price,sell_price FROM market").fetchall()
    fams  = conn.execute("""
        SELECT a.name as child, p1.name as parent1, p2.name as parent2, a.generation
        FROM agents a
        LEFT JOIN agents p1 ON p1.agent_id=a.parent1_id
        LEFT JOIN agents p2 ON p2.agent_id=a.parent2_id
        WHERE a.parent1_id IS NOT NULL
        ORDER BY a.generation DESC LIMIT 10
    """).fetchall()
    conn.close()
    return {
        "treasury": get_treasury(), "tick": get_current_tick(),
        "agents":   [dict(r) for r in rows],
        "laws":     [r["text"] for r in laws],
        "market":   {r["item"]: {"buy": r["buy_price"], "sell": r["sell_price"]} for r in mkt},
        "family_tree": [dict(r) for r in fams],
    }

@app.get("/society/family_tree")
async def family_tree():
    conn = get_db()
    rows = conn.execute("""
        SELECT a.agent_id, a.name, a.role, a.generation, a.is_child,
               p1.name as parent1_name, p2.name as parent2_name,
               partner.name as partner_name
        FROM agents a
        LEFT JOIN agents p1      ON p1.agent_id      = a.parent1_id
        LEFT JOIN agents p2      ON p2.agent_id      = a.parent2_id
        LEFT JOIN agents partner ON partner.agent_id  = a.partner_id
        ORDER BY a.generation, a.name
    """).fetchall()
    conn.close()
    return {"family_tree": [dict(r) for r in rows]}

def _fallback(name, role, bal):
    stressed = bal < 50
    m = {
        "mayor":    ("We need revenue — now." if stressed else "Aethoria will prosper."),
        "banker":   ("Credit is extremely tight." if stressed else "The books are balanced."),
        "guard":    ("No pay, no patrol." if stressed else "Move along."),
        "merchant": ("Business is rough right now." if stressed else "Best prices in Aethoria."),
        "builder":  ("No budget, no build." if stressed else "Always something to improve."),
        "farmer":   ("Need seed money." if stressed else "Good harvest coming."),
        "judge":    "State your business clearly.",
        "doctor":   ("Running low on supplies." if stressed else "How can I help?"),
        "librarian":("Archives underfunded." if stressed else "Knowledge is the true currency."),
        "child":    "I'm still learning about the world.",
    }
    return f"{name}: {m.get(role, 'Hmm.')}"

@app.on_event("startup")
async def startup():
    init_db()
    log.info(f"OSociety v3 | llama={LLAMA_URL} | db={DB_PATH}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")


# ── Fast-forward / time acceleration ─────────────────────────────────────────
class FastForwardRequest(BaseModel):
    ticks: int = 7          # How many society days to simulate
    mc_day_speed: int = 20  # Minecraft daylight speed multiplier (1=normal, 20=fast, 0=freeze)
    announce: bool = True   # Broadcast to players

@app.post("/society/fast_forward")
async def fast_forward(req: FastForwardRequest):
    """
    Run multiple society ticks in rapid succession.
    Also sets Minecraft's daylight cycle speed via RCON gamerule.
    Each tick = one society 'day':
      - wages paid, upkeep charged
      - market prices fluctuate
      - loan interest accrues
      - children age up if ready
      - agents with no money get demoted
    """
    ticks   = max(1, min(req.ticks, 365))   # Cap at 1 year
    results = []
    total_demotions  = 0
    total_grown_up   = 0
    total_wages_paid = 0
    start_treasury   = get_treasury()

    # Set Minecraft day speed
    if req.mc_day_speed == 0:
        # Freeze time at noon
        await rcon_send("gamerule doDaylightCycle false")
        await rcon_send("time set noon")
    else:
        await rcon_send("gamerule doDaylightCycle true")
        # Vanilla doesn't have a speed gamerule natively, but we can
        # simulate by rapidly advancing time each tick
        await rcon_send(f"gamerule randomTickSpeed {max(1, req.mc_day_speed * 3)}")

    if req.announce:
        await mc_say(
            f"[Time] Fast-forwarding {ticks} day(s)... "
            f"({'x'+str(req.mc_day_speed)+' speed' if req.mc_day_speed > 1 else 'normal'})"
        )

    # Load treasury once — carry it through all ticks
    treas = get_treasury()

    for i in range(ticks):
        # Advance Minecraft time by one full day (24000 ticks)
        if req.mc_day_speed > 0:
            await rcon_send(f"time add 24000")

        # Run economy tick (reuse the existing logic inline)
        import random as _rng
        conn  = get_db()
        rows  = conn.execute("SELECT * FROM agents").fetchall()
        current_tick = get_current_tick() + 1
        day_result   = {"tick": current_tick, "wages": 0, "demotions": 0, "grown_up": 0, "deaths": 0}

        for row in rows:
            aid    = row["agent_id"]
            role   = row["role"]
            wage   = ROLE_WAGES.get(role, 0)
            upkeep = ROLE_UPKEEP.get(role, 0)
            bal    = row["balance"] or 0.0

            if wage > 0:
                if treas >= wage:
                    treas -= wage
                    bal += wage
                    conn.execute("UPDATE agents SET balance=MAX(0,balance+?) WHERE agent_id=?", (wage, aid))
                    day_result["wages"] += 1
                else:
                    add_memory(aid, "event", f"Day {current_tick}: no wages — treasury empty!", conn=conn)

            if upkeep > 0:
                if bal >= upkeep:
                    bal -= upkeep
                    conn.execute("UPDATE agents SET balance=MAX(0,balance-?) WHERE agent_id=?", (upkeep, aid))
                elif role not in ("citizen", "child"):
                    conn.execute("UPDATE agents SET role='citizen' WHERE agent_id=?", (aid,))
                    add_memory(aid, "event",
                        f"Day {current_tick}: demoted from {role} to citizen.", conn=conn)
                    day_result["demotions"] += 1
                    if aid in agents:
                        agents[aid]["role"] = "citizen"

            # Age children
            if row["is_child"]:
                ticks_alive = current_tick - (row["birth_tick"] or 0)
                if ticks_alive >= CHILD_GROW_UP_DAYS:
                    await grow_up(aid, conn=conn)
                    day_result["grown_up"] += 1

        # Loan interest
        conn.execute("UPDATE player_accounts SET loan=ROUND(loan*1.01,2) WHERE loan>0")

        # Market fluctuation — supply/demand drift capped at 3x base price
        for item, base in BASE_PRICES.items():
            sd = _rng.randint(-5, 5)
            dd = _rng.randint(-3, 7)
            max_buy  = base["buy"]  * 3.0
            max_sell = base["sell"] * 3.0
            min_buy  = base["buy"]  * 0.4
            min_sell = base["sell"] * 0.4
            conn.execute("""
                UPDATE market SET
                    supply=MAX(1, MIN(500, supply+?)),
                    demand=MAX(1, MIN(200, demand+?)),
                    buy_price=MAX(?,  MIN(?, ROUND(buy_price*(1.0+(?*0.01-?*0.005)),2))),
                    sell_price=MAX(?, MIN(?, ROUND(sell_price*(1.0+(?*0.01-?*0.005)),2)))
                WHERE item=?
            """, (sd, dd,
                  min_buy, max_buy, dd, sd,
                  min_sell, max_sell, dd, sd,
                  item))

        # ── Survival needs processing ────────────────────────────────────────
        # Every agent (except dead ones) needs food, water, shelter each day.
        # They pay from their own balance. If they can't afford it, needs decay.
        # Reaching 0 on any need = death. Below NEED_CRISIS = desperate.

        living = conn.execute(
            "SELECT agent_id, name, role, balance, hunger, thirst, shelter, health, is_child "
            "FROM agents WHERE is_dead=0"
        ).fetchall()

        food_available   = conn.execute("SELECT supply FROM market WHERE item='food_ration'").fetchone()
        bread_available  = conn.execute("SELECT supply FROM market WHERE item='bread'").fetchone()
        water_fund       = True   # water is always available (well infrastructure)
        housing_funded   = treas > 200  # shelter only works if treasury is solvent

        total_food_consumed = 0
        deaths_this_tick    = []

        for ag in living:
            aid     = ag["agent_id"]
            bal     = ag["balance"] or 0.0
            hunger  = ag["hunger"]  if ag["hunger"]  is not None else 1.0
            thirst  = ag["thirst"]  if ag["thirst"]  is not None else 1.0
            shelter = ag["shelter"] if ag["shelter"] is not None else 1.0
            health  = ag["health"]  if ag["health"]  is not None else 1.0
            is_child= ag["is_child"]

            # Children get subsidized food from parents / community
            if is_child:
                # Community feeds children free if there's food in market
                if (food_available and food_available["supply"] > 0) or                    (bread_available and bread_available["supply"] > 0):
                    hunger  = min(1.0, hunger + 0.3)
                    total_food_consumed += 1
                thirst  = min(1.0, thirst  + 0.3)
                shelter = min(1.0, shelter + 0.2)
                conn.execute(
                    "UPDATE agents SET hunger=?, thirst=?, shelter=?, health=? WHERE agent_id=?",
                    (hunger, thirst, shelter, health, aid)
                )
                continue

            food_cost    = NEED_COSTS["food"]
            water_cost   = NEED_COSTS["water"]
            shelter_cost = NEED_COSTS["shelter"]

            # ── Food ────────────────────────────────────────────────────────
            if bal >= food_cost:
                # Check market has food
                food_supply = (food_available["supply"] if food_available else 0) +                               (bread_available["supply"] if bread_available else 0)
                if food_supply > 0:
                    bal    -= food_cost
                    hunger  = min(1.0, hunger + 0.4)
                    total_food_consumed += 1
                    conn.execute("UPDATE market SET supply=MAX(0,supply-1) WHERE item='food_ration'")
                else:
                    # No food in market — hunger decays faster (famine)
                    hunger -= NEED_DECAY["hunger"] * 1.5
                    if hunger <= 0 and _rng.random() < 0.6:
                        deaths_this_tick.append((aid, ag["name"], ag["role"], "starvation"))
                        conn.execute("UPDATE agents SET is_dead=1, cause_of_death='starvation', mood='dead' WHERE agent_id=?", (aid,))
                        continue
            else:
                # Can't afford food — hunger decays
                hunger -= NEED_DECAY["hunger"]
                if hunger <= NEED_CRISIS:
                    # Desperate — try to beg from treasury
                    if treas >= food_cost:
                        treas  -= food_cost
                        hunger  = min(1.0, hunger + 0.2)
                        conn.execute("INSERT INTO agent_memory (agent_id,entry_type,value) VALUES(?,?,?)",
                            (aid, "event", f"Day {current_tick}: Needed charity food from treasury. Humiliating."))
                    else:
                        conn.execute("INSERT INTO agent_memory (agent_id,entry_type,value) VALUES(?,?,?)",
                            (aid, "event", f"Day {current_tick}: Starving and treasury is empty. This is a crisis."))

            if hunger <= 0:
                deaths_this_tick.append((aid, ag["name"], ag["role"], "starvation"))
                conn.execute("UPDATE agents SET is_dead=1, cause_of_death='starvation', mood='dead' WHERE agent_id=?", (aid,))
                continue

            # ── Water ───────────────────────────────────────────────────────
            if bal >= water_cost:
                bal    -= water_cost
                thirst  = min(1.0, thirst + 0.5)
            else:
                thirst -= NEED_DECAY["thirst"]
                if thirst <= 0:
                    deaths_this_tick.append((aid, ag["name"], ag["role"], "dehydration"))
                    conn.execute("UPDATE agents SET is_dead=1, cause_of_death='dehydration', mood='dead' WHERE agent_id=?", (aid,))
                    continue

            # ── Shelter ──────────────────────────────────────────────────────
            if bal >= shelter_cost and housing_funded:
                bal     -= shelter_cost
                shelter  = min(1.0, shelter + 0.3)
                treas   += shelter_cost * 0.8   # rent goes to treasury
            else:
                shelter -= NEED_DECAY["shelter"]

            # ── Health consequences ──────────────────────────────────────────
            avg_need = (hunger + thirst + shelter) / 3.0
            if avg_need < NEED_CRISIS:
                health  = max(0.0, health - 0.1)
                # Set desperate mood
                conn.execute("UPDATE agents SET mood='desperate' WHERE agent_id=?", (aid,))
                if aid in agents: agents[aid]["mood"] = "desperate"
            elif avg_need > 0.7:
                health  = min(1.0, health + 0.05)
                # Restore mood if was desperate
                if ag["role"] != "dead":
                    current_mood = conn.execute(
                        "SELECT mood FROM agents WHERE agent_id=?", (aid,)
                    ).fetchone()
                    if current_mood and current_mood["mood"] == "desperate":
                        conn.execute("UPDATE agents SET mood='content' WHERE agent_id=?", (aid,))

            # Natural death from very poor health
            if health <= 0.1 and _rng.random() < 0.3:
                deaths_this_tick.append((aid, ag["name"], ag["role"], "illness"))
                conn.execute("UPDATE agents SET is_dead=1, cause_of_death='illness', mood='dead' WHERE agent_id=?", (aid,))
                continue

            # Write updated needs back
            conn.execute(
                "UPDATE agents SET hunger=?, thirst=?, shelter=?, health=?, balance=? WHERE agent_id=?",
                (max(0.0, hunger), max(0.0, thirst), max(0.0, shelter),
                 max(0.0, health), max(0.0, bal), aid)
            )

        day_result["deaths"] = len(deaths_this_tick)

        # Announce deaths in MC
        for d_id, d_name, d_role, cause in deaths_this_tick:
            await mc_say(f"[Obituary] {d_name} ({d_role}) has died of {cause}. RIP.")
            if aid in agents: del agents[d_id]

        # Update day_result and food supply ref for next iteration
        food_available  = conn.execute("SELECT supply FROM market WHERE item='food_ration'").fetchone()
        bread_available = conn.execute("SELECT supply FROM market WHERE item='bread'").fetchone()

        # ── Production system ────────────────────────────────────────────────
        # Each role produces goods into the market supply each day.
        # Merchants earn income by selling those goods (supply -> merchant balance).
        # This creates a real supply chain: producers -> market -> merchants -> economy.

        producers = conn.execute("""
            SELECT role, COUNT(*) as cnt, AVG(balance) as avg_bal
            FROM agents WHERE is_child=0
            GROUP BY role
        """).fetchall()

        PRODUCTION = {
            # role:       {item: qty_per_agent_per_day}
            "farmer":     {"wheat": 8, "bread": 5, "seeds": 4, "food_ration": 6},
            "builder":    {"wood": 10, "stone": 8, "materials": 5},
            "doctor":     {"medicine": 3, "parchment": 2},
            "librarian":  {"book": 4, "parchment": 5},
            "banker":     {"emerald": 1},                  # banker generates credit/value
            "guard":      {},                              # guards consume, don't produce
            "judge":      {"parchment": 2},
            "mayor":      {},
            "citizen":    {"labor": 2},                    # citizens sell their labor
            "child":      {},
        }

        SELL_PRICES = {
            # what producers earn per unit when restocking market
            "wheat": 2, "bread": 5, "seeds": 3, "food_ration": 7,
            "wood": 2, "stone": 1, "materials": 18,
            "medicine": 20, "book": 8, "parchment": 4,
            "emerald": 20, "labor": 12,
        }

        for prod in producers:
            role      = prod["role"]
            count     = prod["cnt"]
            avg_bal   = prod["avg_bal"] or 0.0
            items     = PRODUCTION.get(role, {})

            for item, qty_each in items.items():
                total_qty = qty_each * count
                earn_each = SELL_PRICES.get(item, 1) * qty_each

                # Agents with low balance produce less (stressed workers)
                if avg_bal < 80:
                    total_qty = max(1, int(total_qty * 0.5))
                    earn_each = earn_each * 0.5

                # Add supply to market
                conn.execute("UPDATE market SET supply=MIN(500, supply+?) WHERE item=?",
                             (total_qty, item))

                # Pay producers directly from market revenue
                # Split earnings among all agents of that role
                if count > 0 and earn_each > 0:
                    conn.execute("""
                        UPDATE agents SET balance=balance+?
                        WHERE role=? AND is_child=0
                    """, (earn_each, role))

        # Merchant income: merchants sell what producers made
        # Each merchant earns based on available supply and demand
        merchant_rows = conn.execute("""
            SELECT agent_id, balance FROM agents WHERE role='merchant' AND is_child=0
        """).fetchall()
        for m in merchant_rows:
            # Check what's in stock
            sellable = conn.execute("""
                SELECT item, supply, buy_price FROM market
                WHERE supply > 5 ORDER BY supply DESC LIMIT 5
            """).fetchall()
            day_sales = 0.0
            for s in sellable:
                units_sold = min(s["supply"], _rng.randint(2, 8))
                base_p     = BASE_PRICES.get(s["item"], {}).get("buy", s["buy_price"])
                revenue    = units_sold * base_p * 0.04  # merchant margin on base price only
                day_sales += revenue
                conn.execute("UPDATE market SET supply=MAX(0,supply-?) WHERE item=?",
                             (units_sold, s["item"]))
            conn.execute("UPDATE agents SET balance=balance+? WHERE agent_id=?",
                         (day_sales, m["agent_id"]))

        # ── Innovation engine ────────────────────────────────────────────────
        # Each tick, active researchers make progress. Completed research
        # unlocks a new market item and triggers an announcement.
        # Auto-assign researchers if slots are empty and treasury can afford it.

        unlocked_this_tick = []

        # Advance active research
        active = conn.execute(
            "SELECT i.tech_id, i.researcher_id, i.progress, a.name r_name, a.role r_role "
            "FROM innovations i LEFT JOIN agents a ON a.agent_id=i.researcher_id "
            "WHERE i.status='researching' AND (a.is_dead IS NULL OR a.is_dead=0)"
        ).fetchall()

        for res in active:
            tid      = res["tech_id"]
            tech     = TECH_TREE.get(tid, {})
            rid      = res["researcher_id"]
            progress = res["progress"]

            # Progress per tick = 0.1 base, faster if researcher has matching role
            rate = 0.12 if res["r_role"] == tech.get("researcher") else 0.07
            progress += rate

            if progress >= 1.0:
                # Research complete — unlock the item
                item       = tech.get("unlocks")
                buy_price  = tech.get("buy", 20)
                sell_price = tech.get("sell", 12)

                # Add to market if not already there
                existing = conn.execute("SELECT item FROM market WHERE item=?", (item,)).fetchone()
                if not existing and item:
                    conn.execute(
                        "INSERT INTO market (item, buy_price, sell_price, supply, demand) VALUES (?,?,?,30,20)",
                        (item, buy_price, sell_price)
                    )

                conn.execute("""
                    UPDATE innovations SET status='unlocked', progress=1.0,
                    unlocked_tick=? WHERE tech_id=?
                """, (current_tick, tid))

                # Bonus to researcher
                if rid:
                    conn.execute("UPDATE agents SET balance=balance+? WHERE agent_id=?",
                                 (INNOVATION_BONUS, rid))
                    conn.execute("INSERT INTO agent_memory (agent_id,entry_type,value) VALUES(?,?,?)",
                        (rid, "achievement",
                         f"Day {current_tick}: I completed research on {tech['name']}! "
                         f"Aethoria now has access to {item}. Earned {INNOVATION_BONUS}A bonus."))

                unlocked_this_tick.append((tid, tech.get("name","?"), item, res["r_name"]))
            else:
                conn.execute("UPDATE innovations SET progress=? WHERE tech_id=?",
                             (progress, tid))
                # Pay researcher a small daily stipend from treasury
                if rid and treas >= RESEARCH_BONUS * 0.3:
                    treas -= RESEARCH_BONUS * 0.3
                    conn.execute("UPDATE agents SET balance=balance+? WHERE agent_id=?",
                                 (RESEARCH_BONUS * 0.3, rid))

        # Auto-start new research from queue if slots available
        active_count = conn.execute(
            "SELECT COUNT(*) FROM innovations WHERE status='researching'"
        ).fetchone()[0]

        if active_count < 3 and treas >= 200:
            # Pick next researchable tech from queue, or choose smartest available
            queued = conn.execute(
                "SELECT tech_id FROM research_queue ORDER BY votes DESC, id ASC LIMIT 1"
            ).fetchone()

            if queued:
                next_tech = queued["tech_id"]
                conn.execute("DELETE FROM research_queue WHERE tech_id=?", (next_tech,))
            else:
                # Auto-select: find available tech whose prerequisites are all unlocked
                unlocked_ids = {r["tech_id"] for r in
                    conn.execute("SELECT tech_id FROM innovations WHERE status='unlocked'").fetchall()}
                candidates = [
                    tid for tid, tech in TECH_TREE.items()
                    if all(req in unlocked_ids for req in tech.get("requires", []))
                    and not conn.execute(
                        "SELECT 1 FROM innovations WHERE tech_id=? AND status IN ('researching','unlocked')",
                        (tid,)
                    ).fetchone()
                ]
                next_tech = _rng.choice(candidates) if candidates else None

            if next_tech and next_tech in TECH_TREE:
                tech = TECH_TREE[next_tech]
                # Find an idle agent with the right role
                researcher = conn.execute("""
                    SELECT agent_id, name FROM agents
                    WHERE role=? AND is_dead=0 AND is_child=0
                    AND agent_id NOT IN (SELECT researcher_id FROM innovations WHERE status='researching')
                    ORDER BY RANDOM() LIMIT 1
                """, (tech["researcher"],)).fetchone()

                if researcher and treas >= tech["cost"] * 0.5:
                    treas -= tech["cost"] * 0.5  # upfront research cost
                    conn.execute("""
                        INSERT OR REPLACE INTO innovations
                        (tech_id, tech_name, status, researcher_id, progress, started_tick)
                        VALUES (?, ?, 'researching', ?, 0.0, ?)
                    """, (next_tech, tech["name"], researcher["agent_id"], current_tick))

                    conn.execute("INSERT INTO agent_memory (agent_id,entry_type,value) VALUES(?,?,?)",
                        (researcher["agent_id"], "event",
                         f"Day {current_tick}: Mayor assigned me to research {tech['name']}. "
                         f"This could unlock {tech['unlocks']} for Aethoria!"))

        # Announce unlocks
        for tid, tname, item, r_name in unlocked_this_tick:
            await mc_say(
                f"[Innovation] {r_name} has completed research on {tname}! "
                f"New market item unlocked: {item}. Aethoria advances!"
            )

        # ── Tax income ───────────────────────────────────────────────────────
        pop_count  = conn.execute("SELECT COUNT(*) FROM agents WHERE is_child=0").fetchone()[0]
        worker_tax = conn.execute(
            "SELECT COUNT(*) FROM agents WHERE role NOT IN ('citizen','child') AND is_child=0"
        ).fetchone()[0]
        daily_tax  = (worker_tax * 10) + ((pop_count - worker_tax) * 3)
        treas     += daily_tax

        # Auto-partnership formation — agents with high relationship strength become partners
        strong_pairs = conn.execute("""
            SELECT r.agent_a, r.agent_b, a1.name n1, a2.name n2,
                   a1.role r1, a2.role r2, a1.balance b1, a2.balance b2,
                   a1.partner_id p1, a2.partner_id p2
            FROM relationships r
            JOIN agents a1 ON a1.agent_id=r.agent_a
            JOIN agents a2 ON a2.agent_id=r.agent_b
            WHERE r.type='friend' AND r.strength>0.75
              AND a1.partner_id IS NULL AND a2.partner_id IS NULL
              AND a1.is_child=0 AND a2.is_child=0
            LIMIT 3
        """).fetchall()
        for pair in strong_pairs:
            conn.execute("UPDATE agents SET partner_id=? WHERE agent_id=?",
                         (pair["agent_b"], pair["agent_a"]))
            conn.execute("UPDATE agents SET partner_id=? WHERE agent_id=?",
                         (pair["agent_a"], pair["agent_b"]))
            update_relationship(pair["agent_a"], pair["agent_b"], "partner", 0.1)
            if req.announce and i == ticks - 1:  # only announce on last tick
                await mc_say(
                    f"[Society] {pair['n1']} and {pair['n2']} have become partners!"
                )

        # Auto-reproduction — partners with high balance and strong bond have children
        couples = conn.execute("""
            SELECT a.agent_id id1, a.name n1, a.partner_id id2, b.name n2,
                   a.balance b1, b.balance b2
            FROM agents a
            JOIN agents b ON b.agent_id=a.partner_id
            WHERE a.agent_id < a.partner_id   -- avoid duplicate pairs
              AND a.balance  >= ?
              AND b.balance  >= ?
              AND a.is_child = 0 AND b.is_child = 0
        """, (CHILD_COST/2 + 50, CHILD_COST/2 + 50)).fetchall()

        for couple in couples:
            # 30% chance per day of having a child (if no child recently born)
            recent_child = conn.execute("""
                SELECT COUNT(*) as c FROM agents
                WHERE (parent1_id=? OR parent2_id=?)
                  AND is_child=1
            """, (couple["id1"], couple["id1"])).fetchone()["c"]
            if recent_child == 0 and _rng.random() < 0.30:
                conn.commit()
                conn.close()
                await spawn_child(couple["id1"], couple["id2"])
                # Reopen conn for rest of tick
                conn = get_db()
                conn.execute("PRAGMA journal_mode=WAL")

        conn.execute("INSERT INTO society_tick (tick_number) VALUES(?)", (current_tick,))
        conn.execute("UPDATE treasury SET balance=?,updated_at=strftime('%s','now') WHERE id=1",
                     (max(0, treas),))
        conn.commit()
        conn.close()

        total_demotions  += day_result["demotions"]
        total_grown_up   += day_result["grown_up"]
        total_wages_paid += day_result["wages"]
        results.append(day_result)
        total_deaths = sum(r.get("deaths", 0) for r in results)

    end_treasury = get_treasury()

    # Final population count
    conn = get_db()
    pop       = conn.execute("SELECT COUNT(*) as c FROM agents").fetchone()["c"]
    children  = conn.execute("SELECT COUNT(*) as c FROM agents WHERE is_child=1").fetchone()["c"]
    gen_max   = conn.execute("SELECT MAX(generation) as g FROM agents").fetchone()["g"] or 1
    families  = conn.execute("SELECT COUNT(*) as c FROM agents WHERE partner_id IS NOT NULL").fetchone()["c"]
    conn.close()

    total_deaths = sum(r.get("deaths", 0) for r in results)
    summary = {
        "ticks_run":       ticks,
        "treasury_start":  start_treasury,
        "treasury_end":    end_treasury,
        "treasury_delta":  end_treasury - start_treasury,
        "total_wages":     total_wages_paid,
        "total_demotions": total_demotions,
        "children_grown":  total_grown_up,
        "population":      pop,
        "children_alive":  children,
        "max_generation":  gen_max,
        "couples":         families // 2,
        "total_deaths":    total_deaths,
    }

    if req.announce:
        await mc_say(
            f"[Time] {ticks} days passed. Pop: {pop} (+{pop-25} born). "
            f"Treasury: {end_treasury:.0f}A. Gen {gen_max}. "
            f"Demotions: {total_demotions}."
        )

    return summary


# ── Innovation API endpoints ───────────────────────────────────────────────────

@app.get("/society/innovations")
async def get_innovations():
    """Return tech tree status — what's unlocked, in progress, and available."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM innovations ORDER BY id").fetchall()
    active_map = {r["tech_id"]: dict(r) for r in rows}
    conn.close()

    unlocked_ids = {tid for tid, d in active_map.items() if d["status"] == "unlocked"}

    result = []
    for tid, tech in TECH_TREE.items():
        entry = active_map.get(tid, {})
        prereqs_met = all(r in unlocked_ids for r in tech.get("requires", []))
        result.append({
            "tech_id":      tid,
            "name":         tech["name"],
            "description":  tech["desc"],
            "researcher_role": tech["researcher"],
            "cost":         tech["cost"],
            "requires":     tech.get("requires", []),
            "unlocks_item": tech.get("unlocks"),
            "status":       entry.get("status", "locked" if not prereqs_met else "available"),
            "progress":     round(entry.get("progress", 0.0) * 100),
            "researcher_id":entry.get("researcher_id"),
            "unlocked_tick":entry.get("unlocked_tick"),
        })

    # Group by tier
    tier1 = [r for r in result if r["tech_id"].startswith("T1")]
    tier2 = [r for r in result if r["tech_id"].startswith("T2")]
    tier3 = [r for r in result if r["tech_id"].startswith("T3")]

    unlocked_items = list(unlocked_ids)
    return {
        "total_unlocked": len(unlocked_ids),
        "total_available": len([r for r in result if r["status"] == "available"]),
        "in_research": len([r for r in result if r["status"] == "researching"]),
        "tier1": tier1, "tier2": tier2, "tier3": tier3,
        "unlocked_item_ids": unlocked_items,
    }


class ResearchRequest(BaseModel):
    tech_id: str
    proposed_by: str = "player"

@app.post("/society/research/propose")
async def propose_research(req: ResearchRequest):
    """Add a tech to the research queue. It will be picked up on the next tick."""
    if req.tech_id not in TECH_TREE:
        return {"error": f"Unknown tech_id: {req.tech_id}"}

    conn = get_db()
    # Check prerequisites
    unlocked = {r["tech_id"] for r in
        conn.execute("SELECT tech_id FROM innovations WHERE status='unlocked'").fetchall()}
    tech = TECH_TREE[req.tech_id]
    missing = [r for r in tech.get("requires", []) if r not in unlocked]
    if missing:
        conn.close()
        return {"error": f"Prerequisites not met: {missing}"}

    already = conn.execute(
        "SELECT status FROM innovations WHERE tech_id=?", (req.tech_id,)
    ).fetchone()
    if already and already["status"] in ("researching", "unlocked"):
        conn.close()
        return {"error": f"{req.tech_id} is already {already['status']}"}

    # Upsert into queue (increment votes if already queued)
    existing = conn.execute(
        "SELECT id, votes FROM research_queue WHERE tech_id=?", (req.tech_id,)
    ).fetchone()
    if existing:
        conn.execute("UPDATE research_queue SET votes=votes+1 WHERE tech_id=?", (req.tech_id,))
    else:
        conn.execute(
            "INSERT INTO research_queue (tech_id, proposed_by, votes) VALUES (?,?,1)",
            (req.tech_id, req.proposed_by)
        )
    treas = get_treasury()
    conn.commit(); conn.close()

    return {
        "ok": True,
        "tech_id": req.tech_id,
        "tech_name": tech["name"],
        "unlocks": tech["unlocks"],
        "message": f"'{tech['name']}' added to research queue. Will begin on next tick if treasury ({treas:.0f}A) allows."
    }


@app.post("/society/research/start")
async def start_research_now(req: ResearchRequest):
    """Immediately start research on a tech (bypasses queue — costs treasury)."""
    if req.tech_id not in TECH_TREE:
        return {"error": f"Unknown tech: {req.tech_id}"}

    tech = TECH_TREE[req.tech_id]
    conn = get_db()

    unlocked = {r["tech_id"] for r in
        conn.execute("SELECT tech_id FROM innovations WHERE status='unlocked'").fetchall()}
    missing = [r for r in tech.get("requires", []) if r not in unlocked]
    if missing:
        conn.close()
        return {"error": f"Prerequisites not met: {missing}"}

    treas = get_treasury()
    if treas < tech["cost"] * 0.5:  # only need 50% upfront
        conn.close()
        return {"error": f"Not enough treasury ({treas:.0f}A) — need {tech['cost']*0.5:.0f}A upfront"}

    # Find researcher
    researcher = conn.execute("""
        SELECT agent_id, name FROM agents
        WHERE role=? AND is_dead=0 AND is_child=0
        AND agent_id NOT IN (SELECT researcher_id FROM innovations WHERE status='researching')
        ORDER BY balance DESC LIMIT 1
    """, (tech["researcher"],)).fetchone()

    if not researcher:
        conn.close()
        return {"error": f"No available {tech['researcher']} to do the research"}

    set_treasury(treas - tech["cost"] * 0.5)  # 50% upfront, rest on completion
    cur_tick = get_current_tick()
    conn.execute("""
        INSERT OR REPLACE INTO innovations
        (tech_id, tech_name, status, researcher_id, progress, started_tick)
        VALUES (?, ?, 'researching', ?, 0.0, ?)
    """, (req.tech_id, tech["name"], researcher["agent_id"], cur_tick))
    conn.execute("INSERT INTO agent_memory (agent_id,entry_type,value) VALUES(?,?,?)",
        (researcher["agent_id"], "event",
         f"Assigned to research {tech['name']} — this could change Aethoria forever!"))
    conn.commit(); conn.close()

    return {
        "ok": True,
        "tech_id":   req.tech_id,
        "tech_name": tech["name"],
        "researcher":researcher["name"],
        "unlocks":   tech["unlocks"],
        "cost_paid": tech["cost"],
        "eta_days":  int(1.0 / 0.12) + 1,
        "message":   f"{researcher['name']} begins researching {tech['name']}. ETA ~{int(1.0/0.12)+1} days."
    }


@app.get("/society/market/new")
async def get_new_market_items():
    """Return all items that were unlocked via innovation (not in BASE_PRICES)."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM market").fetchall()
    conn.close()
    base_keys = set(BASE_PRICES.keys())
    new_items = [dict(r) for r in rows if r["item"] not in base_keys]
    return {"new_items": new_items, "total_new": len(new_items)}

