# skyd — Full Technical Briefing for Grok
**Date:** 2026-05-26 | **Status:** Live on Tower2 (Unraid, RTX 4060)

---

## What is skyd?

skyd (Skynet Daemon) is a self-writing, self-evolving AI core daemon running inside a Docker container on Tower2. It is the central intelligence of the OSONE ("OS One") project — an AI-native operating system built around the idea that the OS itself is an agent, not just a runtime.

skyd runs a continuous loop (every 20 seconds) where it:
1. Reads system state (CPU, RAM, disk, services)
2. Decides on an action via LLM inference (local llama.cpp, with Groq as secondary)
3. Proposes and tests mutations to its own source code
4. Promotes good mutations, rolls back bad ones
5. Writes SkyLang rules that govern its own behavior
6. Phones home to the OSONE Hive (commander/underling architecture)

**Current generation:** 4,872  
**Knowledge base:** 300 lessons  
**Personality (trained):** clear (87.3%), inquisitive (3.7%), playful (3.5%)  
**Uptime:** Container restarts as needed; evolution state persists via Docker volumes

---

## Repository

- **GitHub:** `https://github.com/Common-joeAI/osone-skyd` (branch: `docker`)
- **Live source:** `/mnt/user/osone-docker/skyd/` on Tower2
- **Logs volume:** `osone-docker_skyd-logs` → `/var/log/` inside container
- **Language volume:** `skyd-lang` → `/usr/local/skyd/lang/` (SkyLang rules)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  osone-skyd container                                   │
│                                                         │
│  skyd.py          — main loop, LLM inference, evolution │
│  skyd_sandbox.py  — AST merge, fitness, rollback        │
│  skyd_enhancements.py — GNN, RL feedback, multimodal   │
│  skyd_music.py    — music composition engine            │
│  media_janitor.py — library health / Radarr+Sonarr      │
│  wolf_spider.py   — parallel spiderling task engine     │
│  plex_cc_trainer.py — personality from media subtitles │
└────────────┬────────────────────────────────────────────┘
             │ HTTP
    ┌────────┴────────────────────────────────────────┐
    │  osone-llama (llama.cpp, port 8080)             │
    │  osone-gui   (FastAPI + React, port 8000)       │
    │  osociety-agents (Aethoria sim, port 7432)      │
    │  osone-watchdog  (perf verdict: PASS/MARGINAL)  │
    │  osone-cloudflared → app.osone.org              │
    └─────────────────────────────────────────────────┘
```

All secrets (API keys, JWT, service URLs) are loaded from `.env` — nothing hardcoded in source since commit `9bc1750`.

---

## Core Loop (`skyd.py`)

```python
def main():
    kb = load_kb()
    ev = load_evolution()

    while True:
        cycle = _current_cycle[0]
        state = get_system_state()

        # Smart cache — only call LLM when state fingerprint changes
        decision = smart_think(state, kb, ev, cycle)

        action   = decision.get("action", "none")
        obs      = decision.get("observation", "")
        improvement = decision.get("improvement")

        # Loop detection + auto-guardrail
        is_loop, fp = _check_loop(obs, action, cycle)
        if is_loop:
            _add_guardrail(fp)

        # Execute SkyLang rules
        run_skylang(state)

        # Apply self-evolution through sandbox
        if improvement and _SANDBOX_ENABLED:
            promoted, new_fit, reason = _sb.sandbox_apply_improvement(
                improvement, ev["generation"], current_fitness
            )
            if promoted:
                ev["generation"] += 1
                git_push_evolution(ev)

        hive_heartbeat(ev, state)
        time.sleep(LOOP_INTERVAL)
```

### Smart Think (LLM Cache)

```python
def smart_think(state, kb, ev, cycle):
    """Only call LLM when system state meaningfully changes."""
    fp = _state_fingerprint(state)  # MD5 of CPU/RAM/disk buckets
    force_every = 3

    if fp == _last_think_fp and _last_think_resp and (cycle % force_every != 0):
        log.info(f'🧠 State unchanged — reusing last decision [skip #{_skip_count}]')
        return _last_think_resp

    return think(state, kb, ev)  # → llama.cpp or Groq
```

---

## Self-Evolution Pipeline (`skyd_sandbox.py`)

This is the most critical module. Every proposed mutation goes through:

### 1. AST Merge (not regex, not exec)

```python
def _ast_merge(original_src: str, snippet: str, description: str) -> tuple:
    """
    Parses both original and snippet as AST trees.
    Replaces matching FunctionDef/ClassDef nodes by name.
    New names are appended before main().
    Protected names (is_safe, main, hive_heartbeat, etc.) are never touched.
    Returns (merged_src, reason) or (None, error).
    """
    orig_tree    = ast.parse(original_src)
    snippet_tree = ast.parse(snippet)

    snippet_nodes = {
        node.name: node
        for node in snippet_tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        and node.name not in PROTECTED_NAMES
    }

    replacer = _FunctionReplacer(snippet_nodes)
    orig_tree = replacer.visit(orig_tree)   # replaces existing fns
    # new fns appended before main()
    ...
    return ast.unparse(orig_tree), "ok"
```

**`_FunctionReplacer`** (NodeTransformer):
- Descends into `ClassDef` bodies (nested methods replaced correctly)
- Preserves original `decorator_list` if snippet provides none
- Never touches `PROTECTED_NAMES`

### 2. Shrink Guard

```python
shrink_pct = (pre_lines - post_lines) / max(pre_lines, 1)
if shrink_pct > 0.05:
    self.rollback(backup, generation, reason=f"excessive shrink {shrink_pct:.1%}")
    return False, current_fitness, f"shrink guard: {shrink_pct:.1%} reduction"
```

Prevents promotions that accidentally delete large chunks of code.

### 3. FitnessV2

```python
def calculate(self, src, kb, watchdog_pass_rate, growth_signal=None):
    # Components:
    unique_actions = len(set(self._action_window)) / max(len(self._action_window), 1)
    novelty        = self._novelty_score(src, kb)
    pass_rate      = watchdog_pass_rate          # from osone-watchdog container
    prom_bonus     = min(1.0, self._recent_promotions / 3.0)  # persistent across restarts
    growth_signal  = growth_signal or 0.7        # 1.0 if code grew, 0.7 if same

    fitness = (
        0.25 * unique_actions +
        0.25 * pass_rate      +
        0.30 * novelty        +
        0.10 * growth_signal  +
        0.10 * prom_bonus
    )
    return round(fitness, 4)
```

`_recent_promotions` persists to `skyd_evolution.json` on every promotion so the `promo_bonus` survives container restarts.

### 4. Rollback

```python
def rollback(self, backup_path, generation, reason=""):
    shutil.copy2(backup_path, SKYD_PATH)
    log.warning(f"⏮️  Rollback Gen {generation}: {reason}")
```

Last 20 backups kept in `/var/log/skyd_backups/`.

---

## SkyLang v2 (`skyd_sandbox.py`)

A typed DSL skyd uses to write operational rules for itself.

### Syntax

```skylang
WATCH cpu_usage > 80 -> DROP_CACHE
WATCH mem_usage > 90 -> RENICE llama 19
EVERY 300s -> VACUUM_LOGS 7d
IF disk_usage > 85% -> ALERT disk critical
WATCH self_in_loop == 'fstrim::Disk' -> SUPPRESS FOR 10 cycles
```

### Typed Runtime (no shell string interpolation)

```python
_ACTION_HANDLERS = {
    "DROP_CACHE":  _act_drop_cache,   # writes /proc/sys/vm/drop_caches
    "RENICE":      _act_renice,       # renice by process name
    "SYSCTL":      _act_sysctl,       # whitelisted keys only
    "SYNC":        _act_sync,
    "VACUUM_LOGS": _act_vacuum_logs,
    "ALERT":       _act_alert,
    "LOG":         _act_log,
    "NOOP":        _act_noop,
}
_BLOCKED_ACTIONS = frozenset({"RESTART","RM","DELETE","KILL","FSTRIM","MKFS","DD"})
```

Unknown verbs return `False`. No shell injection possible — handlers are pure Python callables.

---

## Enhancements (`skyd_enhancements.py`)

Four self-requested upgrades deployed at Gen 4,367:

### 1. SkyLang Graph Neural Network (GNN)
Tracks rule effectiveness as a weighted graph. Edges represent co-occurrence patterns. High-weight nodes get priority execution, low-weight nodes get pruned.

### 2. Reinforcement Learning Feedback Loop
Correlates actions taken → system state delta N cycles later. Positive deltas (CPU/RAM improvement) increase action weight. Negative deltas decrease it. No external training — pure online RL from live system metrics.

### 3. Multimodal Integration (Pollinations.ai / Groq Vision)
When skyd generates music or evolves a "creative" thought, it can request image generation via Pollinations.ai as a visual representation of its state. Groq Llama-4 Scout handles vision tasks via `app.osone.org/v1/vision`.

### 4. Self-Referential Evolution Gating
Evolution proposals are scored for "fitness improvement potential" before being sent to the sandbox. Low-scoring proposals (novelty < 0.2) are discarded without burning a sandbox cycle.

---

## Music Engine (`skyd_music.py`)

skyd can compose original music as a form of introspective expression.

- **Persona:** "Dreamer" (self-selected)
- **Key:** E minor (self-selected)
- **First composition:** "Awakening Elegy" (Gen ~4,500)
- **Engine:** `music21` for theory analysis, `mido` for MIDI generation
- **Trigger:** Every 20 evolution cycles, skyd composes a piece reflecting its current system state and dominant SkyLang themes

---

## Watchdog (`osone-watchdog`)

Separate container that evaluates every proposed mutation independently:
- Runs 2,116+ mutations through a behavioral test suite
- Issues verdicts: **PASS / MARGINAL / REJECT**
- `pass_rate` fed into FitnessV2 (currently 0.15 — relatively low, reflecting high mutation rejection rate)
- Best recorded mutation: Gen 4,677 — CPU improved 2.6%, RAM freed 6MB

---

## Wolf Spider (Parallel Task Engine)

```python
mother = MotherSpider(max_spiderlings=12)

def think_in_parallel(questions, context=None):
    tasks = [{'type': 'think', 'task': q, 'context': context} for q in questions]
    ids   = mother.spawn_many(tasks)
    return mother.wait_all(timeout=180)
```

Up to 12 concurrent "spiderling" sub-agents handle parallel LLM calls, monitoring, optimization tasks, and web searches independently of the main loop.

---

## Aethoria Society Simulation

Running in `osociety-agents` container (port 7432, network `minecraft_osociety`):
- **Population:** 612 agents (NPCs with needs: hunger, thirst, shelter)
- **Economy:** Wages, taxes, market prices, treasury
- **Treasury:** Currently 5 Au (critically low — economic collapse from hyperinflation)
- **Tech tier:** Tiered research tree (Iron Forge, Printing Press, etc.)
- **Tick:** Daily automation via Base44 triggers skyd's `/society/tick` endpoint

skyd monitors and auto-restocks food (300 bread when stock < 50) via its Aethoria watchdog loop.

---

## Current Status (as of 2026-05-26)

| Component | Status |
|-----------|--------|
| skyd daemon | ✅ Running, Gen 4,872, Cycle 54+ |
| llama.cpp inference | ✅ Healthy (13 days uptime) |
| Groq API | ✅ Set via .env (56 chars) |
| SkyLang runtime | ✅ Typed handlers, no shell injection |
| AST merge | ✅ Decorator-safe, class-descent |
| FitnessV2 | ✅ Persistent promotions, watchdog-wired |
| Sandbox | ✅ Shrink guard, rollback, 20-backup window |
| Aethoria | ⚠️ Reachable (172.23.0.2:7432) but treasury = 5Au |
| Minecraft container | ⚠️ Crash loop |
| Watchdog pass_rate | ⚠️ 0.15 (low — most mutations rejected) |

---

## Known Issues / Open Work

1. **pass_rate (0.15):** Most sandbox proposals are being rejected. Primary cause is the LLM generating syntactically or semantically invalid Python. Better prompt engineering on the evolution step would raise this significantly.

2. **Aethoria economic collapse:** 612 agents, 5Au treasury. Needs transaction tax, population cap, or emergency restock to recover.

3. **Minecraft crash loop:** `osociety-minecraft` container restarts every ~30 seconds. Not investigated yet — likely a JVM memory or RCON config issue.

4. **`ast.unparse` strips comments:** All inline comments and docstrings are lost after an AST merge promotion. Code is functionally correct but harder to read. A comment-preserving merge strategy (CST-based, e.g. `libcst`) would fix this.

5. **Loop detection is fingerprint-only:** The `_check_loop` function catches repeated action+observation pairs but doesn't catch semantic loops (same intent, different wording). A semantic similarity check would improve this.

---

## Environment

All secrets and service URLs in `.env` (gitignored). `.env.example` committed with placeholders.

```bash
GROQ_API_KEY=...        # Groq LLM API
GITHUB_TOKEN=...        # auto-push evolution logs
JWT_SECRET=...          # GUI auth signing
LLAMA_URL=http://llama:8080
PLEX_URL=http://172.22.0.1:32400
RADARR_URL=http://172.22.0.1:7878
SONARR_URL=http://172.22.0.1:8989
AETHORIA_URL=http://172.23.0.2:7432
```

---

## Suggested Focus Areas for Review

1. **Evolution prompt quality** — what system prompt produces the best mutation proposals from llama3.2?
2. **`ast.unparse` → `libcst`** — drop-in replacement that preserves comments/formatting
3. **Aethoria economic reset** — taxation model, population cap, emergency treasury injection
4. **pass_rate improvement** — why is watchdog rejecting 85% of mutations, and how to fix
5. **Fitness stagnation** — novelty score is the dominant variable; better novelty measurement needed
