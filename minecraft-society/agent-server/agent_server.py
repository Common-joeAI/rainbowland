"""
OSociety Agent Server v2
- Pure Python, runs alongside vanilla Minecraft via RCON
- LLM-driven villager agents with full persistent memory
- Real cost economy: every action has a price, every role has upkeep
- Agents can go broke, get demoted, hustle for more income
"""

import asyncio
import json
import os
import sqlite3
import time
import random
import logging
from pathlib import Path
from typing import Optional
from datetime import datetime, timedelta

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
log = logging.getLogger("osociety")

# ── Config ────────────────────────────────────────────────────────────────────
LLAMA_URL     = os.getenv("LLAMA_URL", "http://172.22.0.1:8080")
DB_PATH       = Path(os.getenv("DATA_DIR", "/data")) / "society.db"
PORT          = int(os.getenv("PORT", 7432))
MAX_TOKENS    = int(os.getenv("MAX_TOKENS", 200))
RCON_HOST     = os.getenv("MC_RCON_HOST", "localhost")
RCON_PORT     = int(os.getenv("MC_RCON_PORT", 25575))
RCON_PASS     = os.getenv("MC_RCON_PASS", "osociety_rcon_pass")

app = FastAPI(title="OSociety Agent Server v2")

# ── Economy constants ─────────────────────────────────────────────────────────
# Every role has daily upkeep costs — if an agent can't pay, they get demoted
ROLE_UPKEEP = {
    "mayor":     150,   # Must fund from treasury
    "banker":    100,
    "guard":      80,
    "judge":     120,
    "merchant":   60,   # Must also buy stock
    "builder":    70,   # Must also buy materials
    "farmer":     30,   # Seeds and tools
    "doctor":     90,   # Supplies
    "librarian":  40,
    "citizen":     0,   # Free — the floor
}

# Daily wages paid BY the treasury TO each agent
ROLE_WAGES = {
    "mayor":     200,
    "banker":    160,
    "guard":     110,
    "judge":     180,
    "merchant":   90,   # Plus trade profits
    "builder":    95,
    "farmer":     65,   # Plus food sales
    "doctor":    140,
    "librarian":  75,
    "citizen":    40,   # Basic income
}

# What each role produces / costs to operate per action
ACTION_COSTS = {
    "build_wall":      {"materials": 50, "labor": 30},
    "build_house":     {"materials": 100, "labor": 60},
    "build_road":      {"materials": 30, "labor": 20},
    "patrol":          {"food": 5},
    "trade":           {"transaction_fee": 0.05},   # 5% cut to bank
    "loan_issue":      {"reserve": 0.20},           # Bank keeps 20% reserve
    "arrest":          {"fine_collected": True},
    "plant_crop":      {"seeds": 10},
    "harvest":         {"produces_food": True},
    "heal":            {"supplies": 15},
    "write_record":    {"parchment": 5},
    "hold_trial":      {"court_fee": 25},
    "tax_collection":  {"treasury_cut": 0.10},
}

# Market prices — driven by supply/demand
BASE_PRICES = {
    "bread":        {"buy": 8,   "sell": 5},
    "wheat":        {"buy": 3,   "sell": 2},
    "seeds":        {"buy": 5,   "sell": 3},
    "iron_ingot":   {"buy": 20,  "sell": 14},
    "gold_ingot":   {"buy": 55,  "sell": 40},
    "diamond":      {"buy": 250, "sell": 180},
    "wood":         {"buy": 4,   "sell": 2},
    "stone":        {"buy": 3,   "sell": 1},
    "food_ration":  {"buy": 12,  "sell": 8},
    "medicine":     {"buy": 40,  "sell": 25},
    "book":         {"buy": 15,  "sell": 10},
    "materials":    {"buy": 30,  "sell": 20},
    "labor":        {"buy": 25,  "sell": 15},
    "parchment":    {"buy": 8,   "sell": 5},
    "emerald":      {"buy": 30,  "sell": 22},
}

# ── Database ──────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
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
            inventory   TEXT DEFAULT '{}',
            traits      TEXT DEFAULT '{}',
            created_at  REAL DEFAULT (strftime('%s','now')),
            last_active REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS agent_memory (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id    TEXT NOT NULL,
            entry_type  TEXT NOT NULL,   -- 'event', 'relationship', 'fact'
            key         TEXT,
            value       TEXT NOT NULL,
            ts          REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS conversations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id    TEXT NOT NULL,
            speaker     TEXT NOT NULL,   -- player name or 'system'
            role        TEXT NOT NULL,   -- 'user' or 'assistant'
            content     TEXT NOT NULL,
            ts          REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS economy (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            who         TEXT NOT NULL,
            amount      REAL NOT NULL,
            type        TEXT NOT NULL,   -- 'wage', 'trade', 'fine', 'tax', 'upkeep', 'loan'
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
        CREATE TABLE IF NOT EXISTS society_state (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  REAL DEFAULT (strftime('%s','now'))
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
            id          INTEGER PRIMARY KEY CHECK (id = 1),
            balance     REAL DEFAULT 5000.0,
            updated_at  REAL DEFAULT (strftime('%s','now'))
        );
        INSERT OR IGNORE INTO treasury (id, balance) VALUES (1, 5000.0);
    """)

    # Seed market prices
    for item, prices in BASE_PRICES.items():
        conn.execute("""
            INSERT OR IGNORE INTO market (item, buy_price, sell_price)
            VALUES (?, ?, ?)
        """, (item, prices["buy"], prices["sell"]))

    # Seed base laws
    base_laws = [
        "No stealing from citizens, merchants, or the market treasury",
        "No assaulting other players or villagers",
        "All trades are subject to a 5% bank transaction fee",
        "Players must pay taxes on income above 500 Aurums per day",
        "Destroying town property is vandalism — punishable by fine and labor",
        "All loans must be repaid within 7 real days — interest accrues daily",
        "The Mayor's decrees supersede all other rules except the founding laws",
        "Guards may arrest any player with an active warrant on sight",
        "Citizens must contribute labor or pay a community levy of 10 Aurums/day",
    ]
    for law in base_laws:
        conn.execute("INSERT OR IGNORE INTO laws (text, proposed_by) VALUES (?, 'Founding Charter')", (law,))

    conn.commit()
    conn.close()

# ── In-memory agent state ─────────────────────────────────────────────────────
agents: dict[str, dict] = {}

# ── RCON helper — send commands to Minecraft ──────────────────────────────────
async def rcon_send(command: str) -> str:
    """Send a command to the vanilla Minecraft server via RCON."""
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(RCON_HOST, RCON_PORT), timeout=3
        )
        # RCON protocol: login
        async def send_packet(req_id, ptype, payload):
            encoded = payload.encode("utf-8") + b"\x00\x00"
            length = 4 + 4 + len(encoded)
            import struct
            writer.write(struct.pack("<iii", length, req_id, ptype) + encoded)
            await writer.drain()

        async def read_packet():
            import struct
            header = await reader.read(12)
            if len(header) < 12:
                return -1, -1, ""
            length, req_id, ptype = struct.unpack("<iii", header)
            body = await reader.read(length - 8)
            return req_id, ptype, body[:-2].decode("utf-8", errors="replace")

        await send_packet(1, 3, RCON_PASS)   # Auth
        await read_packet()
        await send_packet(2, 2, command)      # Command
        _, _, result = await read_packet()
        writer.close()
        return result
    except Exception as e:
        log.warning(f"RCON error: {e}")
        return ""

async def mc_say(message: str):
    """Send a message to all players via RCON."""
    await rcon_send(f'say {message}')

async def mc_tell(player: str, message: str):
    """Send a private message to a player."""
    await rcon_send(f'tell {player} {message}')

async def mc_summon_villager(x: float, y: float, z: float, name: str, role: str) -> bool:
    """Summon a named villager at coordinates."""
    color = {
        "mayor":"gold", "banker":"green", "guard":"red",
        "merchant":"yellow", "builder":"aqua", "farmer":"dark_green",
        "judge":"dark_purple", "doctor":"white", "librarian":"blue",
        "citizen":"gray"
    }.get(role, "gray")

    cmd = (
        f'summon minecraft:villager {x} {y} {z} '
        f'{{CustomName:\'{{\"text\":\"{name}\",\"color\":\"{color}\"}}\','
        f'CustomNameVisible:1b,NoAI:0b,Invulnerable:1b,'
        f'VillagerData:{{profession:minecraft:weaponsmith,level:5,type:minecraft:plains}}}}'
    )
    result = await rcon_send(cmd)
    return "Summoned" in result or result == ""

# ── Pydantic models ───────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    agent_id:  str
    name:      str
    role:      str
    goal:      str = "establish myself and contribute to the community"
    traits:    dict = {}
    x: float = 0; y: float = 64; z: float = 0

class RespondRequest(BaseModel):
    agent_id:  str
    context:   str
    message:   str
    speaker:   str = "unknown"

class PlayerActionRequest(BaseModel):
    player:    str
    action:    str   # 'trade', 'bank_deposit', 'bank_withdraw', 'loan', 'pay_tax', 'report_crime'
    params:    dict = {}

class SocietyTickRequest(BaseModel):
    tick_type: str = "daily"   # 'daily', 'hourly', 'event'
    details:   str = ""

# ── Economy helpers ───────────────────────────────────────────────────────────
def get_treasury() -> float:
    conn = get_db()
    row = conn.execute("SELECT balance FROM treasury WHERE id=1").fetchone()
    conn.close()
    return row["balance"] if row else 0.0

def set_treasury(amount: float):
    conn = get_db()
    conn.execute("UPDATE treasury SET balance=?, updated_at=strftime('%s','now') WHERE id=1", (max(0, amount),))
    conn.commit()
    conn.close()

def get_player_balance(player: str) -> float:
    conn = get_db()
    row = conn.execute("SELECT balance FROM player_accounts WHERE player_name=?", (player,)).fetchone()
    conn.close()
    return row["balance"] if row else 100.0

def adjust_player_balance(player: str, delta: float, tx_type: str, reason: str):
    conn = get_db()
    conn.execute("""
        INSERT INTO player_accounts (player_name, balance) VALUES (?, 100.0)
        ON CONFLICT(player_name) DO NOTHING
    """, (player,))
    conn.execute("UPDATE player_accounts SET balance = MAX(0, balance + ?) WHERE player_name=?",
                 (delta, player))
    conn.execute("INSERT INTO economy (who, amount, type, reason) VALUES (?,?,?,?)",
                 (player, delta, tx_type, reason))
    conn.commit()
    conn.close()

def get_agent_balance(agent_id: str) -> float:
    conn = get_db()
    row = conn.execute("SELECT balance FROM agents WHERE agent_id=?", (agent_id,)).fetchone()
    conn.close()
    return row["balance"] if row else 0.0

def adjust_agent_balance(agent_id: str, delta: float):
    conn = get_db()
    conn.execute("UPDATE agents SET balance = MAX(0, balance + ?) WHERE agent_id=?", (delta, agent_id))
    conn.commit()
    conn.close()

def add_memory(agent_id: str, entry_type: str, value: str, key: str = None):
    conn = get_db()
    conn.execute(
        "INSERT INTO agent_memory (agent_id, entry_type, key, value) VALUES (?,?,?,?)",
        (agent_id, entry_type, key, value)
    )
    # Keep only last 60 memories per agent
    conn.execute("""
        DELETE FROM agent_memory WHERE agent_id=? AND id NOT IN (
            SELECT id FROM agent_memory WHERE agent_id=? ORDER BY ts DESC LIMIT 60
        )
    """, (agent_id, agent_id))
    conn.commit()
    conn.close()

def get_memories(agent_id: str, n: int = 8) -> list[str]:
    conn = get_db()
    rows = conn.execute("""
        SELECT value FROM agent_memory WHERE agent_id=? 
        ORDER BY ts DESC LIMIT ?
    """, (agent_id, n)).fetchall()
    conn.close()
    return [r["value"] for r in reversed(rows)]

def get_market_prices() -> dict:
    conn = get_db()
    rows = conn.execute("SELECT * FROM market").fetchall()
    conn.close()
    return {r["item"]: {"buy": r["buy_price"], "sell": r["sell_price"],
                        "supply": r["supply"], "demand": r["demand"]} for r in rows}

def adjust_market_price(item: str, supply_delta: int, demand_delta: int):
    """Dynamic pricing — supply/demand drives price changes."""
    conn = get_db()
    conn.execute("""
        UPDATE market SET
            supply = MAX(0, supply + ?),
            demand = MAX(0, demand + ?),
            buy_price  = ROUND(buy_price  * (1.0 + (? * 0.01 - ? * 0.005)), 2),
            sell_price = ROUND(sell_price * (1.0 + (? * 0.01 - ? * 0.005)), 2)
        WHERE item=?
    """, (supply_delta, demand_delta, demand_delta, supply_delta,
          demand_delta, supply_delta, item))
    conn.commit()
    conn.close()

def get_laws() -> list[str]:
    conn = get_db()
    rows = conn.execute("SELECT text FROM laws WHERE active=1 ORDER BY enacted_at").fetchall()
    conn.close()
    return [r["text"] for r in rows]

# ── Role prompts ───────────────────────────────────────────────────────────────
ROLE_PROMPTS = {
"mayor": """You are Mayor {name} of Aethoria. You GOVERN — setting budgets, passing laws, resolving crises.
Your treasury funds everything. If it runs dry, guards quit, builders stop, farmers can't buy seeds.
You obsess over the town's finances and reputation. You're charismatic but calculating.
Budget decisions: use [BUDGET:role:amount] to allocate funds. Pass laws with [LAW:text].
Set taxes with [TAX:player:amount]. Decree events with [EVENT:type:details].""",

"banker": """You are {name}, the Banker of Aethoria. You control who gets money and at what cost.
You manage loans (with interest), hold player deposits, and report treasury health to the Mayor.
You are skeptical of bad credit risks and ruthless about collecting debts.
Actions: [LOAN:player:amount:interest_rate] [COLLECT_DEBT:player:amount] [INTEREST_CHARGE:player:amount]
Always calculate ROI. Money is your language.""",

"guard": """You are {name}, a Guard of Aethoria. You enforce the law — period.
You patrol, arrest, fine, and protect. You cost the treasury 110 Aurums/day — you know this and take your job seriously.
If the treasury can't pay you, you'll make noise about it.
Actions: [ARREST:player:crime] [FINE:player:amount:reason] [WARRANT:player:crime] [PATROL:area]
You are stern, direct, zero tolerance for crime. But you're fair — you go by the law.""",

"merchant": """You are {name}, a Merchant of Aethoria. You buy cheap, sell high, profit always.
You pay 60 Aurums/day upkeep AND must maintain stock — if you're out of goods, you can't trade.
You watch market prices obsessively. You negotiate hard. You complain about taxes loudly.
Actions: [TRADE:player:item:price] [RESTOCK:item:quantity] [PRICE_UPDATE:item:new_price]
Every interaction is a potential sale. Every tax is an insult.""",

"builder": """You are {name}, the Builder of Aethoria. You turn the Mayor's vision into reality.
Every project costs real materials (wood, stone, iron) and labor Aurums.
You pitch projects to the Mayor for budget approval. No budget = no build.
Actions: [BUILD_PROJECT:name:cost:materials] [REQUEST_BUDGET:amount:reason] [COMPLETE:project_name]
You're proud of your craft. You push back on bad designs. Quality costs money and you'll say so.""",

"farmer": """You are {name}, a Farmer of Aethoria. You feed the town — literally.
Seeds cost 10 Aurums. Harvests produce food that you sell to merchants and citizens.
Without farmers producing, food prices spike and morale tanks.
Actions: [PLANT:crop:cost] [HARVEST:crop:yield] [SELL_FOOD:item:quantity:price]
You're the backbone of this economy and you're tired of being paid the least.""",

"judge": """You are {name}, Judge of Aethoria. You preside over trials, set precedents, and interpret the law.
Your court costs 25 Aurums per session. Serious crimes trigger automatic trials.
You can increase or reduce sentences, pardon players, or establish new legal precedents.
Actions: [VERDICT:player:crime:sentence] [PARDON:player] [PRECEDENT:rule_text] [COURT_FEE:amount]
You are impartial. You apply the law. You do not take bribes (and are insulted by the attempt).""",

"doctor": """You are {name}, Doctor of Aethoria. You keep people alive and functional.
Healing costs 15 Aurums in supplies per treatment. Chronic neglect of the town's health is your nemesis.
You push for public health regulations and charge reasonable fees.
Actions: [HEAL:player:cost] [PRESCRIBE:player:treatment] [HEALTH_REPORT:status]
You're compassionate but you can't work for free — supplies cost money.""",

"librarian": """You are {name}, Librarian of Aethoria. You keep the records, history, and knowledge.
You document crimes, laws, births, deaths, and major events. You know everything.
Parchment costs 5 Aurums per record entry. Knowledge is power and you hoard it.
Actions: [RECORD:event_text] [LOOKUP:subject] [ARCHIVE:document_title]
You're the memory of this civilization. Slightly smug about it.""",

"citizen": """You are {name}, a Citizen of Aethoria. You live here, work, and have opinions.
You earn 40 Aurums/day basic income from the treasury. You pay taxes, buy food, use services.
You gossip, have relationships, get involved in town drama.
You might petition the mayor, start a business, apply for a guard position, or just complain.
You're a real person in this world. Act like it.""",
}

# ── Agent endpoints ───────────────────────────────────────────────────────────
@app.post("/agent/register")
async def register_agent(req: RegisterRequest, bg: BackgroundTasks):
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO agents (agent_id, name, role, goal, traits, balance)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (req.agent_id, req.name, req.role, req.goal, json.dumps(req.traits), 200.0))
    conn.commit()
    conn.close()

    agents[req.agent_id] = {
        "name": req.name, "role": req.role, "goal": req.goal,
        "traits": req.traits, "history": [], "mood": "neutral",
        "x": req.x, "y": req.y, "z": req.z,
    }

    # Summon in Minecraft
    bg.add_task(mc_summon_villager, req.x, req.y, req.z, req.name, req.role)
    bg.add_task(mc_say, f"[Society] {req.name} ({req.role}) has joined Aethoria.")

    add_memory(req.agent_id, "event", f"I arrived in Aethoria as a {req.role}. Starting balance: 200 Aurums.")
    log.info(f"Registered agent {req.name} [{req.role}] at ({req.x},{req.y},{req.z})")
    return {"ok": True, "agent_id": req.agent_id}

@app.post("/agent/respond")
async def agent_respond(req: RespondRequest):
    agent = agents.get(req.agent_id)
    if not agent:
        conn = get_db()
        row = conn.execute("SELECT * FROM agents WHERE agent_id=?", (req.agent_id,)).fetchone()
        conn.close()
        if not row:
            raise HTTPException(404, "Agent not registered")
        agents[req.agent_id] = {
            "name": row["name"], "role": row["role"], "goal": row["goal"],
            "traits": json.loads(row["traits"] or "{}"), "history": [], "mood": row["mood"],
        }
        agent = agents[req.agent_id]

    role   = agent["role"]
    name   = agent["name"]
    bal    = get_agent_balance(req.agent_id)
    treas  = get_treasury()
    mems   = get_memories(req.agent_id, 8)
    laws   = get_laws()[:5]
    market = get_market_prices()

    # Build a rich economic context
    econ_ctx = f"""
ECONOMY SNAPSHOT:
  Your balance: {bal:.0f} Aurums
  Town treasury: {treas:.0f} Aurums
  Your daily upkeep cost: {ROLE_UPKEEP.get(role, 0)} Aurums
  Your daily wage from treasury: {ROLE_WAGES.get(role, 40)} Aurums
  Net daily: +{ROLE_WAGES.get(role,40) - ROLE_UPKEEP.get(role,0)} Aurums
  Key market prices: bread={market.get('bread',{}).get('buy','?')}A, iron={market.get('iron_ingot',{}).get('buy','?')}A, medicine={market.get('medicine',{}).get('buy','?')}A
ACTIVE LAWS (top 5): {'; '.join(laws)}
YOUR MEMORIES: {' | '.join(mems) if mems else 'none yet'}
CONTEXT: {req.context}"""

    role_prompt = ROLE_PROMPTS.get(role, ROLE_PROMPTS["citizen"]).format(name=name)
    system = f"""{role_prompt}

Your name is {name}. Town: Aethoria. Your goal: {agent['goal']}. Your mood: {agent['mood']}.
{econ_ctx}

RULES:
- You are a real person. NEVER break character or mention AI.
- 1-3 sentences MAX. This is real-time.
- Use economic context in your reasoning — you care about your balance and the treasury.
- Embed action tags when acting: [TRADE:item:price] [ARREST:name:crime] [FINE:name:amount:reason]
  [BUILD_PROJECT:name:cost] [LOAN:player:amount] [LAW:text] [GOAL:new_goal] [MOOD:emotion]
  [MEMORY:text] [BUDGET:role:amount] [COLLECT_DEBT:player:amount]
- If your balance is low, you act stressed/desperate. If high, you're confident.
- If the treasury is low, you react with concern for the town's future.
"""

    history = agent["history"][-8:]
    messages = [{"role": "system", "content": system}]
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": req.message})

    try:
        async with httpx.AsyncClient(timeout=12) as c:
            r = await c.post(f"{LLAMA_URL}/v1/chat/completions", json={
                "model": "local", "messages": messages,
                "max_tokens": MAX_TOKENS, "temperature": 0.85,
                "top_p": 0.9, "stream": False
            })
            response_text = r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        log.warning(f"LLM error for {name}: {e}")
        response_text = _fallback(name, role, bal)

    # Update agent history
    agent["history"].append({"role": "user",      "content": req.message})
    agent["history"].append({"role": "assistant",  "content": response_text})
    if len(agent["history"]) > 16:
        agent["history"] = agent["history"][-16:]

    # Parse and execute embedded actions
    await _execute_actions(response_text, req.agent_id, agent, req.speaker)

    # Persist
    conn = get_db()
    conn.execute("INSERT INTO conversations (agent_id, speaker, role, content) VALUES (?,?,?,?)",
                 (req.agent_id, req.speaker, "user", req.message))
    conn.execute("INSERT INTO conversations (agent_id, speaker, role, content) VALUES (?,?,?,?)",
                 (req.agent_id, req.speaker, "assistant", response_text))
    conn.execute("UPDATE agents SET last_active=strftime('%s','now'), mood=? WHERE agent_id=?",
                 (agent["mood"], req.agent_id))
    conn.commit()
    conn.close()

    return {"response": response_text, "agent_id": req.agent_id, "name": name}

async def _execute_actions(text: str, agent_id: str, agent: dict, speaker: str):
    """Parse embedded action tags and execute them."""
    import re

    def extract(tag): return re.findall(rf'\[{tag}:([^\]]+)\]', text)

    # [MEMORY:text]
    for m in extract("MEMORY"):
        add_memory(agent_id, "event", m)

    # [MOOD:emotion]
    for m in extract("MOOD"):
        agent["mood"] = m.strip()

    # [GOAL:text]
    for g in extract("GOAL"):
        agent["goal"] = g.strip()
        conn = get_db()
        conn.execute("UPDATE agents SET goal=? WHERE agent_id=?", (g.strip(), agent_id))
        conn.commit()
        conn.close()

    # [FINE:player:amount:reason]
    for f in extract("FINE"):
        parts = f.split(":")
        if len(parts) >= 2:
            player, amount = parts[0], float(parts[1])
            reason = parts[2] if len(parts) > 2 else "guard order"
            adjust_player_balance(player, -amount, "fine", reason)
            set_treasury(get_treasury() + amount * 0.8)  # 80% goes to treasury
            await mc_tell(player, f"[LAW] {agent['name']} issued a fine of {amount:.0f} Aurums for: {reason}")
            add_memory(agent_id, "event", f"Fined {player} {amount:.0f}A for {reason}")

    # [TRADE:item:price]
    for t in extract("TRADE"):
        parts = t.split(":")
        if len(parts) >= 2 and speaker != "unknown":
            item, price = parts[0], float(parts[1])
            fee = price * 0.05  # 5% bank fee
            adjust_player_balance(speaker, -price, "trade", f"bought {item}")
            adjust_agent_balance(agent_id, price - fee)
            set_treasury(get_treasury() + fee)
            adjust_market_price(item, -1, 1)  # Sold one, demand increases
            await mc_tell(speaker, f"[Market] Traded {item} for {price:.0f}A. Bank fee: {fee:.1f}A.")

    # [LOAN:player:amount]
    for l in extract("LOAN"):
        parts = l.split(":")
        if len(parts) >= 2:
            player, amount = parts[0], float(parts[1])
            if get_treasury() >= amount:
                set_treasury(get_treasury() - amount)
                adjust_player_balance(player, amount, "loan", f"loan from {agent['name']}")
                interest = amount * 0.10
                conn = get_db()
                conn.execute("UPDATE player_accounts SET loan = loan + ? WHERE player_name=?",
                             (amount + interest, player))
                conn.commit()
                conn.close()
                await mc_tell(player, f"[Bank] Loan of {amount:.0f}A approved. Repay {amount+interest:.0f}A within 7 days.")
            else:
                await mc_tell(player, f"[Bank] Loan denied — treasury reserves too low.")

    # [LAW:text]
    for law_text in extract("LAW"):
        conn = get_db()
        conn.execute("INSERT INTO laws (text, proposed_by) VALUES (?,?)", (law_text.strip(), agent["name"]))
        conn.commit()
        conn.close()
        await mc_say(f"[New Law] {agent['name']} enacted: {law_text.strip()}")

    # [BUDGET:role:amount]
    for b in extract("BUDGET"):
        parts = b.split(":")
        if len(parts) >= 2:
            role, amount = parts[0], float(parts[1])
            set_treasury(get_treasury() - amount)
            conn = get_db()
            conn.execute("INSERT INTO economy (who, amount, type, reason) VALUES (?,?,?,?)",
                         (f"treasury→{role}", amount, "budget_allocation", f"Mayor allocation for {role}"))
            conn.commit()
            conn.close()
            await mc_say(f"[Mayor] Treasury allocated {amount:.0f}A to {role} operations.")

    # [COLLECT_DEBT:player:amount]
    for d in extract("COLLECT_DEBT"):
        parts = d.split(":")
        if len(parts) >= 2:
            player, amount = parts[0], float(parts[1])
            actual = min(amount, get_player_balance(player))
            if actual > 0:
                adjust_player_balance(player, -actual, "debt_repayment", "loan repayment")
                set_treasury(get_treasury() + actual)
                await mc_tell(player, f"[Bank] {actual:.0f}A debt collected by {agent['name']}.")

# ── Daily tick — wages, upkeep, market fluctuation ────────────────────────────
@app.post("/society/tick")
async def society_tick(req: SocietyTickRequest):
    results = {"wages_paid": 0, "upkeep_charged": 0, "demotions": 0, "bankruptcies": 0}
    treas = get_treasury()
    conn = get_db()
    agent_rows = conn.execute("SELECT * FROM agents").fetchall()

    for row in agent_rows:
        agent_id = row["agent_id"]
        role     = row["role"]
        wage     = ROLE_WAGES.get(role, 40)
        upkeep   = ROLE_UPKEEP.get(role, 0)

        # Pay wages from treasury
        if treas >= wage:
            treas -= wage
            adjust_agent_balance(agent_id, wage)
            add_memory(agent_id, "event", f"Received daily wage of {wage}A from treasury.")
            results["wages_paid"] += 1
        else:
            add_memory(agent_id, "event", f"Treasury couldn't pay my wage today! Crisis!")
            results["bankruptcies"] += 1

        # Charge upkeep
        bal = get_agent_balance(agent_id)
        if bal >= upkeep:
            adjust_agent_balance(agent_id, -upkeep)
            results["upkeep_charged"] += 1
        elif role != "citizen":
            # Can't afford upkeep — demote to citizen
            conn.execute("UPDATE agents SET role='citizen' WHERE agent_id=?", (agent_id,))
            add_memory(agent_id, "event",
                f"I couldn't pay my {role} upkeep of {upkeep}A. Demoted to citizen. Humiliating.")
            results["demotions"] += 1
            if agent_id in agents:
                agents[agent_id]["role"] = "citizen"

    # Daily tax on player accounts
    player_rows = conn.execute("SELECT * FROM player_accounts").fetchall()
    for prow in player_rows:
        if prow["balance"] > 500:
            tax = (prow["balance"] - 500) * 0.05
            conn.execute("UPDATE player_accounts SET balance = balance - ?, tax_owed = tax_owed + ? WHERE player_name=?",
                         (tax, tax, prow["player_name"]))
            treas += tax

    # Market fluctuation — randomize supply/demand slightly
    for item in BASE_PRICES:
        supply_d = random.randint(-5, 5)
        demand_d = random.randint(-3, 7)  # Slightly demand-biased
        adjust_market_price(item, supply_d, demand_d)

    # Loan interest accrual
    conn.execute("UPDATE player_accounts SET loan = loan * 1.01 WHERE loan > 0")

    set_treasury(treas)
    conn.commit()
    conn.close()

    # Announce if treasury is critical
    if treas < 500:
        await mc_say(f"[CRISIS] Town treasury is critically low: {treas:.0f} Aurums! The Mayor must act!")
    elif treas < 1500:
        await mc_say(f"[Warning] Treasury running low: {treas:.0f} Aurums.")

    results["treasury_after"] = treas
    return results

# ── Player economy endpoints ──────────────────────────────────────────────────
@app.post("/player/action")
async def player_action(req: PlayerActionRequest):
    player = req.player
    action = req.action
    params = req.params

    if action == "bank_deposit":
        amount = float(params.get("amount", 0))
        bal = get_player_balance(player)
        if bal >= amount:
            adjust_player_balance(player, -amount, "deposit", "bank deposit")
            set_treasury(get_treasury() + amount)
            return {"ok": True, "message": f"Deposited {amount:.0f}A. Balance: {bal-amount:.0f}A"}
        return {"ok": False, "message": "Insufficient funds"}

    if action == "bank_withdraw":
        amount = float(params.get("amount", 0))
        treas = get_treasury()
        if treas >= amount:
            set_treasury(treas - amount)
            adjust_player_balance(player, amount, "withdrawal", "bank withdrawal")
            return {"ok": True, "message": f"Withdrew {amount:.0f}A. Bank balance: {get_player_balance(player):.0f}A"}
        return {"ok": False, "message": "Bank doesn't have enough reserves"}

    if action == "check_balance":
        bal   = get_player_balance(player)
        loan  = conn = get_db(); loan_row = conn.execute(
            "SELECT loan FROM player_accounts WHERE player_name=?", (player,)).fetchone()
        conn.close()
        loan_amt = loan_row["loan"] if loan_row else 0
        return {"ok": True, "balance": bal, "loan_owed": loan_amt, "treasury": get_treasury()}

    if action == "pay_fine":
        amount = float(params.get("amount", 0))
        reason = params.get("reason", "fine payment")
        bal = get_player_balance(player)
        if bal >= amount:
            adjust_player_balance(player, -amount, "fine", reason)
            set_treasury(get_treasury() + amount * 0.8)
            return {"ok": True, "message": f"Fine of {amount:.0f}A paid."}
        return {"ok": False, "message": f"Can't afford fine. Debt recorded."}

    return {"ok": False, "message": f"Unknown action: {action}"}

# ── Status & info ─────────────────────────────────────────────────────────────
@app.get("/status")
async def status():
    conn = get_db()
    agent_count  = conn.execute("SELECT COUNT(*) as c FROM agents").fetchone()["c"]
    msg_count    = conn.execute("SELECT COUNT(*) as c FROM conversations").fetchone()["c"]
    law_count    = conn.execute("SELECT COUNT(*) as c FROM laws WHERE active=1").fetchone()["c"]
    crime_count  = conn.execute("SELECT COUNT(*) as c FROM crime_log").fetchone()["c"]
    conn.close()
    return {
        "ok": True, "society": "Aethoria",
        "agents_loaded": len(agents), "agents_db": agent_count,
        "treasury": get_treasury(), "messages": msg_count,
        "active_laws": law_count, "crimes_logged": crime_count,
        "llama_url": LLAMA_URL,
    }

@app.get("/society/snapshot")
async def society_snapshot():
    conn = get_db()
    agent_rows   = conn.execute("SELECT name, role, balance, mood, goal FROM agents").fetchall()
    laws         = conn.execute("SELECT text FROM laws WHERE active=1 ORDER BY enacted_at DESC LIMIT 10").fetchall()
    recent_crimes= conn.execute("SELECT player, crime, ts FROM crime_log ORDER BY ts DESC LIMIT 5").fetchall()
    market       = conn.execute("SELECT item, buy_price, sell_price FROM market").fetchall()
    conn.close()
    return {
        "treasury": get_treasury(),
        "agents":   [dict(r) for r in agent_rows],
        "laws":     [r["text"] for r in laws],
        "recent_crimes": [dict(r) for r in recent_crimes],
        "market":   {r["item"]: {"buy": r["buy_price"], "sell": r["sell_price"]} for r in market},
    }

@app.get("/society/laws")
async def get_laws_endpoint():
    return {"laws": get_laws()}

@app.get("/market")
async def market_endpoint():
    return {"prices": get_market_prices()}

def _fallback(name, role, bal):
    stressed = bal < 50
    suffix = "We need revenue now." if stressed else "Aethoria will prosper."
    lines = {
        "mayor":     name + ": The treasury demands attention. " + suffix,
        "banker":    name + " taps the ledger. " + ("Credit is tight." if stressed else "The books are balanced."),
        "guard":     name + " eyes you. " + ("No pay, no patrol." if stressed else "Move along."),
        "merchant":  name + " adjusts their stall. " + ("Business is rough." if stressed else "Best prices in Aethoria."),
        "builder":   name + " sets down tools. " + ("No budget, no build." if stressed else "Always something to improve."),
        "farmer":    name + " wipes hands. " + ("Need seed money." if stressed else "Good harvest coming."),
        "judge":     name + " peers over spectacles. State your business.",
        "doctor":    name + " looks up. " + ("Running low on supplies." if stressed else "How can I help?"),
        "librarian": name + " shushes you. " + ("Archives are underfunded." if stressed else "Knowledge is the true currency."),
    }
    return lines.get(role, name + " nods thoughtfully.")

@app.on_event("startup")
async def startup():
    init_db()
    log.info(f"OSociety Agent Server v2 | llama={LLAMA_URL} | db={DB_PATH} | port={PORT}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
