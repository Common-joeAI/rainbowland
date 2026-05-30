"""
STAGE 3 — AI Function Boundary Detection
Feeds disassembly chunks to Groq (llama-3.3-70b-versatile) to detect
function start/end boundaries, types, and jump tables.
Falls back to heuristic detection if API unavailable.
"""

import json
import os
import re
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Optional
from stage2_disasm import DisasmResult, Instr


GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.3-70b-versatile"

CHUNK_SIZE    = 200   # instructions per chunk sent to AI
CHUNK_OVERLAP = 20    # overlap between chunks


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class FunctionBoundary:
    start:      int             # vaddr of first instruction
    end:        int             # vaddr of last instruction (inclusive)
    type:       str             # "normal" | "leaf" | "tail_call" | "jump_table_dispatcher"
    name:       str = ""        # auto-generated or AI-suggested
    confidence: float = 1.0
    jump_table_targets: list[int] = field(default_factory=list)

    def __post_init__(self):
        if not self.name:
            self.name = f"func_{self.start:08x}"


@dataclass
class BoundaryResult:
    functions: list[FunctionBoundary] = field(default_factory=list)
    unresolved_indirect: list[int]    = field(default_factory=list)  # jr $not_ra addrs


# ── Groq API call ─────────────────────────────────────────────────────────────

def _ask_groq(system: str, user: str, retries: int = 2) -> str:
    if not GROQ_API_KEY:
        return ""
    body = json.dumps({
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "max_tokens": 1024,
        "temperature": 0.1,   # low temp = deterministic JSON
    }).encode()
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                GROQ_URL, data=body,
                headers={"Content-Type": "application/json",
                         "Authorization": f"Bearer {GROQ_API_KEY}"},
                method="POST")
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())["choices"][0]["message"]["content"].strip()
        except Exception as e:
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
            else:
                print(f"    [groq] API error: {e}")
    return ""


# ── Chunk builder ─────────────────────────────────────────────────────────────

def _build_chunk_text(instrs: list[Instr], known_entries: set[int]) -> str:
    lines = []
    for instr in instrs:
        tag = ""
        if instr.vaddr in known_entries:
            tag = "  ← KNOWN_ENTRY"
        if instr.is_return:
            tag = "  ← RETURN"
        if instr.is_call and instr.branch_target:
            tag = f"  ← CALL→0x{instr.branch_target:08X}"
        if instr.is_branch and instr.branch_target:
            tag = f"  ← BRANCH→0x{instr.branch_target:08X}"
        if instr.delay_slot:
            tag += " [delay]"
        lines.append(f"  0x{instr.vaddr:08X}: {instr.mnemonic:<10} {instr.operands:<30}{tag}")
    return "\n".join(lines)


# ── AI boundary detection ─────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a MIPS assembly expert analyzing N64 game code.
Your task: identify function boundaries in the given disassembly chunk.

Rules:
- A new function starts after: (1) a jr $ra + its delay slot, (2) a j/b to a far target that never returns, (3) an explicit KNOWN_ENTRY marker
- A leaf function has no jal calls and ends with jr $ra
- A tail-call function ends with j (not jal) to another function
- Output ONLY a JSON object — no explanation, no markdown

Output format:
{
  "functions": [
    {
      "start": <hex address as integer>,
      "end":   <hex address as integer>,
      "type":  "normal"|"leaf"|"tail_call"|"jump_table_dispatcher",
      "name":  "<descriptive name or func_XXXXXXXX>"
    }
  ],
  "notes": "<optional single line about unusual patterns>"
}"""


def _parse_ai_response(raw: str) -> list[FunctionBoundary]:
    """Extract JSON from AI response, handling markdown code fences."""
    # Strip markdown fences
    raw = re.sub(r"```(?:json)?", "", raw).strip()
    try:
        data = json.loads(raw)
        funcs = []
        for f in data.get("functions", []):
            try:
                funcs.append(FunctionBoundary(
                    start=int(f["start"]),
                    end=int(f["end"]),
                    type=f.get("type", "normal"),
                    name=f.get("name", ""),
                    confidence=0.85,
                ))
            except Exception:
                pass
        return funcs
    except json.JSONDecodeError:
        return []


def _ai_detect_chunk(instrs: list[Instr], known_entries: set[int],
                     chunk_idx: int) -> list[FunctionBoundary]:
    chunk_text = _build_chunk_text(instrs, known_entries)
    user_msg = (
        f"Analyze this MIPS disassembly chunk (chunk {chunk_idx}, "
        f"addresses 0x{instrs[0].vaddr:08X}–0x{instrs[-1].vaddr:08X}):\n\n"
        f"{chunk_text}\n\n"
        "Identify all function boundaries."
    )
    raw = _ask_groq(SYSTEM_PROMPT, user_msg)
    if raw:
        funcs = _parse_ai_response(raw)
        if funcs:
            return funcs
    # Fall through to heuristic
    return []


# ── Heuristic fallback ────────────────────────────────────────────────────────

def _heuristic_detect(dr: DisasmResult) -> list[FunctionBoundary]:
    """
    Simple heuristic: new function starts at every known entry point.
    Ends at the instruction before the next entry point or at jr $ra.
    This is fast but misses some boundaries — AI pass improves it.
    """
    instrs     = dr.instructions
    if not instrs:
        return []

    entries = sorted(dr.entry_points)
    # Build vaddr→index map
    v2i = {instr.vaddr: idx for idx, instr in enumerate(instrs)}

    funcs = []
    for ei, entry_vaddr in enumerate(entries):
        if entry_vaddr not in v2i:
            continue
        start_idx = v2i[entry_vaddr]

        # Find end: next entry point or jr $ra (+delay slot)
        end_idx = len(instrs) - 1
        if ei + 1 < len(entries) and entries[ei + 1] in v2i:
            end_idx = v2i[entries[ei + 1]] - 1

        # Walk forward to find actual jr $ra within this range
        func_end_vaddr = instrs[end_idx].vaddr
        is_leaf = True
        for instr in instrs[start_idx:end_idx + 1]:
            if instr.is_call:
                is_leaf = False
            if instr.is_return:
                # +4 for delay slot
                delay_idx = v2i.get(instr.vaddr + 4, end_idx)
                func_end_vaddr = instrs[delay_idx].vaddr
                break

        funcs.append(FunctionBoundary(
            start=entry_vaddr,
            end=func_end_vaddr,
            type="leaf" if is_leaf else "normal",
            confidence=0.6,
        ))

    print(f"    [heuristic] {len(funcs)} functions detected")
    return funcs


# ── Dedup + merge ─────────────────────────────────────────────────────────────

def _merge_boundaries(ai_funcs: list[FunctionBoundary],
                       heuristic_funcs: list[FunctionBoundary]) -> list[FunctionBoundary]:
    """Prefer AI results; fill gaps with heuristic where AI had no coverage."""
    ai_starts  = {f.start for f in ai_funcs}
    combined   = list(ai_funcs)
    for hf in heuristic_funcs:
        if hf.start not in ai_starts:
            combined.append(hf)
    combined.sort(key=lambda f: f.start)
    return combined


# ── Public API ────────────────────────────────────────────────────────────────

def detect_boundaries(dr: DisasmResult,
                       use_ai: bool = True,
                       max_chunks: int = 0) -> BoundaryResult:
    """
    Run function boundary detection on a DisasmResult.
    use_ai: send chunks to Groq (requires GROQ_API_KEY)
    max_chunks: cap AI chunks for testing (0 = no limit)
    """
    print(f"\n[STAGE 3] Function boundary detection "
          f"({'AI+heuristic' if use_ai and GROQ_API_KEY else 'heuristic only'})...")

    instrs       = dr.instructions
    known_entries = dr.entry_points
    ai_funcs     = []

    if use_ai and GROQ_API_KEY:
        chunks_sent = 0
        total_chunks = (len(instrs) + CHUNK_SIZE - 1) // CHUNK_SIZE
        if max_chunks:
            total_chunks = min(total_chunks, max_chunks)

        print(f"  Sending {total_chunks} chunk(s) to Groq ({GROQ_MODEL})...")
        for ci in range(total_chunks):
            start_i = max(0, ci * CHUNK_SIZE - CHUNK_OVERLAP)
            end_i   = min(len(instrs), (ci + 1) * CHUNK_SIZE + CHUNK_OVERLAP)
            chunk   = instrs[start_i:end_i]
            funcs   = _ai_detect_chunk(chunk, known_entries, ci)
            ai_funcs.extend(funcs)
            chunks_sent += 1
            if chunks_sent % 5 == 0:
                print(f"    ...{chunks_sent}/{total_chunks} chunks, "
                      f"{len(ai_funcs)} functions so far")

        print(f"  AI detected {len(ai_funcs)} functions across {chunks_sent} chunks")
    else:
        if use_ai and not GROQ_API_KEY:
            print("  GROQ_API_KEY not set — using heuristic only")

    heuristic_funcs = _heuristic_detect(dr)
    merged = _merge_boundaries(ai_funcs, heuristic_funcs)

    # Identify unresolved indirect jumps (jr $not_ra)
    return_vaddrs = {i.vaddr for i in instrs if i.is_return}
    indirect_all  = set(dr.indirect_jr)
    unresolved    = [v for v in indirect_all if v not in return_vaddrs]

    result = BoundaryResult(functions=merged, unresolved_indirect=unresolved)
    print(f"  Total: {len(merged)} functions | "
          f"{len(unresolved)} unresolved indirect jumps")
    return result


if __name__ == "__main__":
    import sys
    from stage1_rom import load_rom
    from stage2_disasm import disassemble_rom

    rom     = load_rom(sys.argv[1])
    disasms = disassemble_rom(rom, max_instrs=400)
    bounds  = detect_boundaries(disasms[0], use_ai=True, max_chunks=2)
    print(f"\nFirst 10 functions:")
    for f in bounds.functions[:10]:
        print(f"  {f.name}  0x{f.start:08X}–0x{f.end:08X}  [{f.type}] conf={f.confidence:.2f}")
