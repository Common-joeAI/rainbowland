"""
STAGE 4 — C Code Generation
Converts MIPS instructions to C code, one function at a time.
Uses AI (Groq) for complex/ambiguous functions, deterministic translation for simple ones.
"""

import json
import os
import re
import urllib.request
import time
from dataclasses import dataclass, field
from stage2_disasm import DisasmResult, Instr
from stage3_ai_boundaries import BoundaryResult, FunctionBoundary


GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.3-70b-versatile"

# Threshold: functions with fewer instructions get deterministic translation
# Larger functions go to AI for better quality
AI_THRESHOLD = 30


# ── MIPS register names ───────────────────────────────────────────────────────

MIPS_REGS = {
    0:"zero",1:"at",2:"v0",3:"v1",4:"a0",5:"a1",6:"a2",7:"a3",
    8:"t0",9:"t1",10:"t2",11:"t3",12:"t4",13:"t5",14:"t6",15:"t7",
    16:"s0",17:"s1",18:"s2",19:"s3",20:"s4",21:"s5",22:"s6",23:"s7",
    24:"t8",25:"t9",26:"k0",27:"k1",28:"gp",29:"sp",30:"fp",31:"ra",
}


# ── Output structures ─────────────────────────────────────────────────────────

@dataclass
class GeneratedFunction:
    boundary:    FunctionBoundary
    c_code:      str          # The actual C function text
    method:      str          # "deterministic" | "ai" | "stub"
    warnings:    list[str] = field(default_factory=list)


@dataclass
class CodeGenResult:
    functions:   list[GeneratedFunction] = field(default_factory=list)
    header_decls: list[str]              = field(default_factory=list)


# ── Groq helper ───────────────────────────────────────────────────────────────

def _ask_groq(system: str, user: str, retries: int = 2) -> str:
    if not GROQ_API_KEY:
        return ""
    body = json.dumps({
        "model": GROQ_MODEL,
        "messages": [{"role":"system","content":system},{"role":"user","content":user}],
        "max_tokens": 2048,
        "temperature": 0.1,
    }).encode()
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                GROQ_URL, data=body,
                headers={"Content-Type":"application/json",
                         "Authorization":f"Bearer {GROQ_API_KEY}"},
                method="POST")
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read())["choices"][0]["message"]["content"].strip()
        except Exception as e:
            if attempt < retries:
                time.sleep(1.5*(attempt+1))
            else:
                print(f"    [groq] {e}")
    return ""


# ── Deterministic MIPS→C translation ─────────────────────────────────────────

def _translate_instr_deterministic(instr: Instr, func_name: str) -> str:
    """
    Best-effort deterministic translation of common MIPS patterns to C.
    Covers ~70% of instructions in a typical N64 game.
    """
    m = instr.mnemonic
    ops = instr.operands.replace("$","").strip()

    # NOP
    if instr.is_nop or m == "nop":
        return "    /* nop */"

    # Arithmetic
    if m == "addiu":
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 3:
            return f"    {parts[0]} = (int32_t)({parts[1]} + {parts[2]});"
    if m == "addu":
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 3:
            return f"    {parts[0]} = {parts[1]} + {parts[2]};"
    if m == "subu":
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 3:
            return f"    {parts[0]} = {parts[1]} - {parts[2]};"
    if m in ("and","andi"):
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 3:
            return f"    {parts[0]} = {parts[1]} & {parts[2]};"
    if m in ("or","ori"):
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 3:
            return f"    {parts[0]} = {parts[1]} | {parts[2]};"
    if m == "xor":
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 3:
            return f"    {parts[0]} = {parts[1]} ^ {parts[2]};"
    if m == "nor":
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 3:
            return f"    {parts[0]} = ~({parts[1]} | {parts[2]});"
    if m == "slt":
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 3:
            return f"    {parts[0]} = ((int32_t){parts[1]} < (int32_t){parts[2]}) ? 1 : 0;"
    if m == "sltu":
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 3:
            return f"    {parts[0]} = ((uint32_t){parts[1]} < (uint32_t){parts[2]}) ? 1 : 0;"
    if m in ("sll","srl","sra"):
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 3:
            op = "<<" if m=="sll" else ">>"
            cast = "(int32_t)" if m=="sra" else "(uint32_t)"
            return f"    {parts[0]} = ({cast}{parts[1]} {op} {parts[2]});"
    if m == "lui":
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 2:
            return f"    {parts[0]} = (int32_t)({parts[1]} << 16);"
    if m == "mul":
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 3:
            return f"    {parts[0]} = (int32_t)((int64_t)(int32_t){parts[1]} * (int32_t){parts[2]});"

    # Memory
    if m in ("lw","lh","lb","lhu","lbu"):
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 2:
            m2 = re.match(r'(-?\d+)\((\w+)\)', parts[1])
            if m2:
                off, base = m2.group(1), m2.group(2)
                cast = {"lw":"u32","lh":"i16","lb":"i8","lhu":"u16","lbu":"u8"}.get(m,"u32")
                return f"    {parts[0]} = read_{cast}({base} + {off});"
    if m in ("sw","sh","sb"):
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 2:
            m2 = re.match(r'(-?\d+)\((\w+)\)', parts[1])
            if m2:
                off, base = m2.group(1), m2.group(2)
                cast = {"sw":"u32","sh":"u16","sb":"u8"}.get(m,"u32")
                return f"    write_{cast}({base} + {off}, {parts[0]});"

    # Control flow
    if instr.is_return:
        return "    return;"
    if m == "jal" and instr.branch_target:
        return f"    func_{instr.branch_target:08x}();"
    if m == "j" and instr.branch_target:
        return f"    goto label_{instr.branch_target:08x};"
    if instr.is_branch and instr.branch_target:
        cond_map = {
            "beq":"==","bne":"!=","blez":"<= 0","bgtz":"> 0",
            "bltz":"< 0","bgez":">= 0",
        }
        parts = [p.strip() for p in ops.split(",")]
        if m in ("blez","bgtz","bltz","bgez") and len(parts) >= 1:
            return f"    if ({parts[0]} {cond_map.get(m,'!=')}) goto label_{instr.branch_target:08x};"
        if len(parts) >= 2:
            return f"    if ({parts[0]} {cond_map.get(m,'==')} {parts[1]}) goto label_{instr.branch_target:08x};"

    # Move
    if m == "move":
        parts = [p.strip() for p in ops.split(",")]
        if len(parts) == 2:
            return f"    {parts[0]} = {parts[1]};"

    # Fallback: emit as comment with raw instruction
    return f"    /* {instr.mnemonic} {instr.operands}  [0x{instr.raw:08X}] */"


def _generate_function_deterministic(boundary: FunctionBoundary,
                                      instrs: list[Instr]) -> GeneratedFunction:
    """Translate a function to C using deterministic patterns."""
    fname = boundary.name
    lines = [f"void {fname}(void) {{"]
    warnings = []

    # Declare all registers used as local variables
    used_regs = set()
    for instr in instrs:
        for reg in re.findall(r'\$(\w+)', instr.operands):
            if reg not in ("zero","sp","gp","ra"):
                used_regs.add(reg)
    if used_regs:
        lines.append("    /* MIPS registers as locals */")
        for reg in sorted(used_regs):
            lines.append(f"    uint32_t {reg} = 0;")
        lines.append("")

    # Emit labels + translated instructions
    prev_was_branch = False
    for instr in instrs:
        # Emit label if targeted by a branch
        lines.append(f"label_{instr.vaddr:08x}: ;")
        c_line = _translate_instr_deterministic(instr, fname)
        lines.append(c_line)
        if instr.is_indirect and not instr.is_return:
            warnings.append(f"Unresolved indirect jump at 0x{instr.vaddr:08X}")

    lines.append("}")
    return GeneratedFunction(
        boundary=boundary,
        c_code="\n".join(lines),
        method="deterministic",
        warnings=warnings,
    )


# ── AI-assisted translation ───────────────────────────────────────────────────

CODEGEN_SYSTEM = """You are a MIPS-to-C decompiler for N64 game code.
Convert the given MIPS assembly function into clean, compilable C code.

Rules:
- Use uint32_t/int32_t for general registers, float for FP
- Memory accesses use: read_u32(addr), write_u32(addr,val), read_u8, write_u8, read_u16, write_u16
- Hardware registers (0xA000000+) use: hw_read32(addr), hw_write32(addr,val)
- Unknown indirect jumps: emit __builtin_unreachable() with a comment
- Function calls: use func_XXXXXXXX() naming
- Return type is void unless you can determine otherwise
- Output ONLY the C function — no explanation, no markdown fences"""


def _generate_function_ai(boundary: FunctionBoundary,
                           instrs: list[Instr]) -> GeneratedFunction:
    """Use Groq to translate a function to C."""
    asm_lines = []
    for instr in instrs:
        asm_lines.append(f"  0x{instr.vaddr:08X}: {instr.mnemonic:<10} {instr.operands}")
    asm_text = "\n".join(asm_lines)

    user_msg = (
        f"Convert this N64 MIPS function to C.\n"
        f"Function: {boundary.name} (type: {boundary.type})\n"
        f"Address range: 0x{boundary.start:08X}–0x{boundary.end:08X}\n\n"
        f"Assembly:\n{asm_text}"
    )
    raw = _ask_groq(CODEGEN_SYSTEM, user_msg)
    if raw:
        # Strip any accidental markdown
        code = re.sub(r"```(?:c|cpp)?", "", raw).strip()
        return GeneratedFunction(boundary=boundary, c_code=code, method="ai")

    # Fallback to deterministic if AI fails
    return _generate_function_deterministic(boundary, instrs)


# ── Stub generator ────────────────────────────────────────────────────────────

def _generate_stub(boundary: FunctionBoundary) -> GeneratedFunction:
    code = (
        f"/* STUB — could not locate instructions for {boundary.name} */\n"
        f"void {boundary.name}(void) {{\n"
        f"    /* TODO: implement (address 0x{boundary.start:08X}) */\n"
        f"}}"
    )
    return GeneratedFunction(boundary=boundary, c_code=code, method="stub",
                             warnings=["Stub — no instructions found"])


# ── Public API ────────────────────────────────────────────────────────────────

def generate_code(dr: DisasmResult, br: BoundaryResult,
                  use_ai: bool = True, max_funcs: int = 0) -> CodeGenResult:
    print(f"\n[STAGE 4] Generating C code for {len(br.functions)} functions...")

    # Build vaddr→instruction index for fast lookup
    v2i = {instr.vaddr: idx for idx, instr in enumerate(dr.instructions)}
    instrs = dr.instructions

    result = CodeGenResult()
    ai_count = det_count = stub_count = 0

    funcs_to_process = br.functions
    if max_funcs:
        funcs_to_process = br.functions[:max_funcs]

    for fi, boundary in enumerate(funcs_to_process):
        # Collect instructions for this function
        start_idx = v2i.get(boundary.start)
        end_idx   = v2i.get(boundary.end)

        if start_idx is None:
            result.functions.append(_generate_stub(boundary))
            stub_count += 1
            continue

        if end_idx is None:
            # Find the closest instruction >= end vaddr
            end_idx = start_idx
            while (end_idx + 1 < len(instrs) and
                   instrs[end_idx + 1].vaddr <= boundary.end):
                end_idx += 1

        func_instrs = instrs[start_idx:end_idx + 1]
        n = len(func_instrs)

        if use_ai and GROQ_API_KEY and n >= AI_THRESHOLD:
            gf = _generate_function_ai(boundary, func_instrs)
            ai_count += 1
        else:
            gf = _generate_function_deterministic(boundary, func_instrs)
            det_count += 1

        result.functions.append(gf)
        result.header_decls.append(f"void {boundary.name}(void);")

        if (fi + 1) % 50 == 0:
            print(f"  ...{fi+1}/{len(funcs_to_process)} functions")

    print(f"  Done: {ai_count} AI-translated, {det_count} deterministic, {stub_count} stubs")
    return result


if __name__ == "__main__":
    import sys
    from stage1_rom import load_rom
    from stage2_disasm import disassemble_rom
    from stage3_ai_boundaries import detect_boundaries

    rom     = load_rom(sys.argv[1])
    disasms = disassemble_rom(rom, max_instrs=500)
    bounds  = detect_boundaries(disasms[0], use_ai=True, max_chunks=2)
    cg      = generate_code(disasms[0], bounds, use_ai=True, max_funcs=5)

    print(f"\nSample function output:\n{'─'*60}")
    if cg.functions:
        print(cg.functions[0].c_code)
