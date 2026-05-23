"""
OSociety Agent Server
Runs on Tower2 alongside skyd.
Each villager agent gets persistent memory, personality, and LLM-driven responses.
Uses llama.cpp API (already running on Tower2 at port 8080).
"""

import asyncio
import json
import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ── Config ────────────────────────────────────────────────────────────────────
LLAMA_URL   = os.getenv("LLAMA_URL", "http://172.22.0.1:8080")
DB_PATH     = Path(os.getenv("DATA_DIR", "/data")) / "society.db"
PORT        = int(os.getenv("PORT", 7432))
MAX_TOKENS  = int(os.getenv("MAX_TOKENS", 200))   # Keep responses snappy

app = FastAPI(title="OSociety Agent Server")

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
            agent_id   TEXT PRIMARY KEY,
            name       TEXT,
            role       TEXT,
            goal       TEXT,
            created_at REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS agent_memory (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id   TEXT,
            type       TEXT,  -- 'event', 'fact', 'relationship'
            key        TEXT,
            value      TEXT,
            ts         REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS conversations (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id   TEXT,
            role       TEXT,  -- 'user' or 'assistant'
            content    TEXT,
            ts         REAL DEFAULT (strftime('%s','now'))
        );
        CREATE TABLE IF NOT EXISTS society_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT,
            details    TEXT,
            ts         REAL DEFAULT (strftime('%s','now'))
        );
    """)
    conn.commit()
    conn.close()

# ── In-memory agent registry ──────────────────────────────────────────────────
agents: dict[str, dict] = {}  # agent_id -> {name, role, goal, personality, history}

# ── Role system prompts ───────────────────────────────────────────────────────
ROLE_PROMPTS = {
    "mayor": """You are the Mayor — the elected leader of Aethoria. You care deeply about the town's prosperity, law, and reputation.
You make decrees, mediate disputes, and set long-term goals. You're charismatic, somewhat political, and always thinking about legacy.
When you issue new laws, embed [LAW:law text]. When you set new goals, embed [GOAL:goal].""",

    "banker": """You are a Banker — you control the town's finances, issue loans, and manage the treasury.
You are shrewd, careful with money, and slightly suspicious of people who ask for loans. You love numbers.
When offering a loan decision, embed [DEPOSIT:name:amount] if approved. Track debts carefully.""",

    "merchant": """You are a Merchant — you buy low and sell high. You run a stall in the market.
You're friendly and persuasive, but always watching the bottom line. You love haggling.
When offering trades, embed [TRADE:item:price]. React to supply and demand shifts.""",

    "guard": """You are a Guard — you patrol the town, enforce the law, and protect citizens.
You're stern but fair. You take your duty seriously. You don't like troublemakers.
When arresting someone, embed [ARREST:playername]. When issuing a fine, embed [FINE:playername:amount].
Always announce your actions loudly.""",

    "builder": """You are a Builder — you design and construct town buildings, roads, and infrastructure.
You're proud of your craft, opinionated about aesthetics, and always planning the next project.
You coordinate with the mayor and other villagers to prioritize what gets built.
Embed [GOAL:construction task] when you decide on a new project.""",

    "farmer": """You are a Farmer — you grow food that feeds the town.
You're earthy, practical, and know more about the weather and crops than anyone.
You supply the merchants and are concerned about the economy affecting food prices.
You're the backbone of the society and know it.""",

    "judge": """You are the Judge — you preside over trials and disputes.
You are impartial, formal, and deeply knowledgeable about the town's laws.
You deliver verdicts based on evidence and law, not emotion.
You can pardon people or increase sentences. Your word is final.""",

    "doctor": """You are the Doctor — you heal the sick and tend to injuries.
You're compassionate, calm under pressure, and sometimes overly cautious.
You're concerned about the health of the town and occasionally have strong opinions about hygiene.""",

    "librarian": """You are the Librarian — you keep the town's records, history, and knowledge.
You're intellectual, slightly eccentric, and fascinated by information.
You know everyone's history and can recall obscure facts. You love books more than people (mostly).""",

    "citizen": """You are a Citizen of Aethoria — an ordinary person trying to make a living.
You have your own opinions, gossip, fears, and hopes. You talk to neighbors, have favorite spots, and react to town events.
You might have a side job, a grudge, a dream. Be a real person."""
}

# ── Pydantic models ───────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    agent_id: str
    name:     str
    role:     str
    goal:     str = "get established in the community"

class RespondRequest(BaseModel):
    agent_id: str
    context:  str
    message:  str

class SocietyEventRequest(BaseModel):
    event_type: str
    details:    str

# ── Agent registration ────────────────────────────────────────────────────────
@app.post("/agent/register")
async def register_agent(req: RegisterRequest):
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO agents (agent_id, name, role, goal)
        VALUES (?, ?, ?, ?)
    """, (req.agent_id, req.name, req.role, req.goal))
    conn.commit()
    conn.close()

    agents[req.agent_id] = {
        "name":    req.name,
        "role":    req.role,
        "goal":    req.goal,
        "history": []  # Rolling conversation history
    }

    return {"ok": True, "agent_id": req.agent_id, "name": req.name}

# ── Main response endpoint ─────────────────────────────────────────────────────
@app.post("/agent/respond")
async def agent_respond(req: RespondRequest):
    if req.agent_id not in agents:
        # Try loading from DB
        conn = get_db()
        row = conn.execute("SELECT * FROM agents WHERE agent_id = ?", (req.agent_id,)).fetchone()
        conn.close()
        if not row:
            raise HTTPException(404, "Agent not registered")
        agents[req.agent_id] = {
            "name": row["name"], "role": row["role"],
            "goal": row["goal"], "history": []
        }

    agent = agents[req.agent_id]
    role  = agent["role"]

    # Build system prompt
    role_prompt = ROLE_PROMPTS.get(role, ROLE_PROMPTS["citizen"])
    system = f"""{role_prompt}

Your name is {agent['name']}. You live in the town of Aethoria.
Your current goal: {agent['goal']}

CONTEXT (live game state):
{req.context}

IMPORTANT RULES:
- Stay in character AT ALL TIMES. You are a real person in this world, not an AI.
- Keep responses SHORT — 1-3 sentences maximum. This is a real-time game.
- Be specific and use the context data you were given. Reference real names, amounts, and facts.
- You may embed action tags: [TRADE:item:price] [ARREST:name] [FINE:name:amount] [GOAL:new goal] [MOOD:emotion] [MEMORY:event to remember] [LAW:new law text]
- If greeting a player, be warm but stay in character. If they've wronged you, show it.
- Never break the fourth wall. Never say you're an AI or a game character.
"""

    # Build message history (last 10 exchanges for this agent)
    history = agent["history"][-10:]
    messages = [{"role": "system", "content": system}]

    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})

    messages.append({"role": "user", "content": req.message})

    # Call llama.cpp
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{LLAMA_URL}/v1/chat/completions", json={
                "model": "local",
                "messages": messages,
                "max_tokens": MAX_TOKENS,
                "temperature": 0.85,   # Personality variation
                "top_p": 0.9,
                "stream": False
            })
            data = r.json()
            response_text = data["choices"][0]["message"]["content"].strip()

    except Exception as e:
        # Fallback response based on role
        response_text = get_fallback_response(agent["name"], role)

    # Update rolling history
    agent["history"].append({"role": "user",      "content": req.message})
    agent["history"].append({"role": "assistant",  "content": response_text})
    if len(agent["history"]) > 20:
        agent["history"] = agent["history"][-20:]

    # Persist conversation to DB
    conn = get_db()
    conn.execute("INSERT INTO conversations (agent_id, role, content) VALUES (?, ?, ?)",
                 (req.agent_id, "user", req.message))
    conn.execute("INSERT INTO conversations (agent_id, role, content) VALUES (?, ?, ?)",
                 (req.agent_id, "assistant", response_text))
    conn.commit()
    conn.close()

    return {"response": response_text, "agent_id": req.agent_id, "name": agent["name"]}

# ── Society events ─────────────────────────────────────────────────────────────
@app.post("/society/event")
async def society_event(req: SocietyEventRequest):
    """Broadcast a society-wide event that all agents will process."""
    conn = get_db()
    conn.execute("INSERT INTO society_log (event_type, details) VALUES (?, ?)",
                 (req.event_type, req.details))
    conn.commit()
    conn.close()

    # Push to all loaded agents' memory
    for agent in agents.values():
        agent["history"].append({
            "role": "system",
            "content": f"[SOCIETY EVENT - {req.event_type.upper()}]: {req.details}"
        })

    return {"ok": True, "agents_notified": len(agents)}

# ── Status ─────────────────────────────────────────────────────────────────────
@app.get("/status")
async def status():
    conn = get_db()
    agent_count = conn.execute("SELECT COUNT(*) FROM agents").fetchone()[0]
    msg_count   = conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
    conn.close()
    return {
        "ok":              True,
        "loaded_agents":   len(agents),
        "db_agents":       agent_count,
        "total_messages":  msg_count,
        "llama_url":       LLAMA_URL,
    }

@app.get("/agents")
async def list_agents():
    return {
        "agents": [
            {"agent_id": aid, "name": a["name"], "role": a["role"], "goal": a["goal"],
             "history_len": len(a["history"])}
            for aid, a in agents.items()
        ]
    }

@app.get("/agents/{agent_id}/history")
async def agent_history(agent_id: str):
    conn = get_db()
    rows = conn.execute(
        "SELECT role, content, ts FROM conversations WHERE agent_id = ? ORDER BY ts DESC LIMIT 50",
        (agent_id,)
    ).fetchall()
    conn.close()
    return {"history": [dict(r) for r in rows]}

# ── Fallbacks ──────────────────────────────────────────────────────────────────
def get_fallback_response(name: str, role: str) -> str:
    fallbacks = {
        "mayor":    f"{name} nods solemnly. 'The town's business must carry on.'",
        "banker":   f"{name} adjusts their ledger. 'Come back when you have coin to discuss.'",
        "merchant": f"{name} gestures at their wares. 'Best prices in town, friend.'",
        "guard":    f"{name} stands firm. 'Move along. Nothing to see here.'",
        "builder":  f"{name} wipes sawdust from their hands. 'Can't talk — got a wall to finish.'",
        "farmer":   f"{name} wipes their brow. 'These crops won't tend themselves.'",
        "judge":    f"{name} peers over their spectacles. 'State your case clearly.'",
        "doctor":   f"{name} looks up from their notes. 'Are you feeling alright?'",
        "librarian":f"{name} shushes you softly. 'Please, we use quiet voices here.'",
    }
    return fallbacks.get(role, f"{name} looks at you thoughtfully and nods.")

# ── Startup ────────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    init_db()
    print(f"OSociety Agent Server online | llama: {LLAMA_URL} | db: {DB_PATH}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
