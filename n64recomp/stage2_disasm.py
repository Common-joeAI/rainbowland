"""
STAGE 2 — MIPS Disassembly
Uses rabbitizer to disassemble N64 MIPS instructions from ROM segments.
Produces a structured instruction list with CFG hints for Stage 3.
"""

import rabbitizer
from dataclasses import dataclass, field
from typing import Optional
from stage1_rom import N64Rom, CodeSegment


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class Instr:
    vaddr:          int
    raw:            int
    mnemonic:       str
    operands:       str
    is_branch:      bool = False
    is_jump:        bool = False      # j / jal (direct)
    is_indirect:    bool = False      # jr / jalr (register)
    is_call:        bool = False      # jal / jalr (writes $ra)
    is_return:      bool = False      # jr $ra
    is_nop:         bool = False
    branch_target:  Optional[int] = None   # resolved vaddr or None
    delay_slot:     bool = False           # this instr is in a delay slot

    def __str__(self):
        return f"0x{self.vaddr:08X}:  {self.mnemonic:<12} {self.operands}"


@dataclass
class DisasmResult:
    segment:      CodeSegment
    instructions: list[Instr] = field(default_factory=list)
    entry_points: set[int]    = field(default_factory=set)   # known function starts
    jump_targets: set[int]    = field(default_factory=set)   # direct call targets
    indirect_jr:  list[int]   = field(default_factory=list)  # vaddrs of jr $ra instrs


# ── Instruction classification ────────────────────────────────────────────────

def _classify(instr_obj, vaddr: int, raw: int) -> Instr:
    """Wrap a rabbitizer instruction into our Instr dataclass."""
    # ── mnemonic via getOpcodeName() ──────────────────────────────────────────
    try:
        mnemonic = instr_obj.getOpcodeName().lower()
    except Exception:
        mnemonic = "unknown"

    # ── full disassembly string, strip mnemonic prefix ────────────────────────
    try:
        full = instr_obj.disassemble("").strip()
        parts = full.split(None, 1)
        mnemonic = parts[0].lower() if parts else mnemonic
        operands = parts[1] if len(parts) > 1 else ""
    except Exception:
        operands = ""

    # ── classification using rabbitizer predicates ────────────────────────────
    try:
        is_call     = instr_obj.isFunctionCall()
        is_return   = instr_obj.isReturn()
        is_branch   = instr_obj.isBranch()
        is_jump     = instr_obj.isJump() and not instr_obj.isFunctionCall() and not instr_obj.isReturn()
        is_indirect = instr_obj.isJrNotRa() or (mnemonic in ("jr","jalr"))
        is_nop      = instr_obj.isNop()
    except Exception:
        is_branch = is_jump = is_indirect = is_call = is_return = is_nop = False
        is_nop    = (raw == 0x00000000)

    # ── branch/jump target ────────────────────────────────────────────────────
    branch_target = None
    if is_branch or is_jump or is_call:
        try:
            branch_target = instr_obj.getBranchVramGeneric()
        except Exception:
            pass

    return Instr(
        vaddr=vaddr,
        raw=raw,
        mnemonic=mnemonic,
        operands=operands,
        is_branch=is_branch,
        is_jump=is_jump,
        is_indirect=is_indirect,
        is_call=is_call,
        is_return=is_return,
        is_nop=is_nop,
        branch_target=branch_target,
    )


# ── Main disassembly pass ─────────────────────────────────────────────────────

def disassemble_segment(seg: CodeSegment, max_instrs: int = 0) -> DisasmResult:
    """
    Linear sweep disassembly of one code segment.
    max_instrs: cap for testing (0 = no limit).
    """
    result = DisasmResult(segment=seg)
    data   = seg.data
    vaddr  = seg.vaddr

    # Mark entry point
    result.entry_points.add(vaddr)

    count = 0
    i = 0
    prev_was_branch = False

    while i + 4 <= len(data):
        raw = int.from_bytes(data[i:i+4], "big")
        cur_vaddr = vaddr + i

        # Build rabbitizer instruction
        try:
            ri = rabbitizer.Instruction(raw, cur_vaddr)
            instr = _classify(ri, cur_vaddr, raw)
        except Exception as e:
            # Non-instruction word (data embedded in code, or alignment pad)
            instr = Instr(cur_vaddr, raw, ".word", f"0x{raw:08X}")

        # Tag delay slots (instruction immediately after any branch/jump)
        instr.delay_slot = prev_was_branch
        prev_was_branch = (instr.is_branch or instr.is_jump or instr.is_indirect)

        result.instructions.append(instr)

        # Track call targets
        if instr.is_call and instr.branch_target:
            result.jump_targets.add(instr.branch_target)
            result.entry_points.add(instr.branch_target)

        # Track branch targets (potential function starts if targeted by multiple branches)
        if instr.branch_target:
            result.entry_points.add(instr.branch_target)

        # Track jr $ra
        if instr.is_return:
            result.indirect_jr.append(cur_vaddr)

        i += 4
        count += 1
        if max_instrs and count >= max_instrs:
            break

    print(f"  [disasm] {count:,} instructions | "
          f"{len(result.entry_points):,} entry points | "
          f"{len(result.indirect_jr):,} returns | "
          f"{len(result.jump_targets):,} call targets")

    return result


def disassemble_rom(rom: N64Rom, max_instrs: int = 0) -> list[DisasmResult]:
    print(f"\n[STAGE 2] Disassembling {len(rom.segments)} segment(s)...")
    results = []
    for seg in rom.segments:
        print(f"  Segment @ 0x{seg.vaddr:08X} ({seg.size:,} bytes)")
        dr = disassemble_segment(seg, max_instrs=max_instrs)
        results.append(dr)
    return results


# ── Text dump helper ──────────────────────────────────────────────────────────

def dump_disasm(dr: DisasmResult, limit: int = 80) -> str:
    """Return a human-readable disassembly string (for AI prompt construction)."""
    lines = []
    for instr in dr.instructions[:limit]:
        marker = ""
        if instr.vaddr in dr.entry_points:
            marker = " <-- ENTRY"
        if instr.is_return:
            marker = " <-- RETURN"
        lines.append(f"  {instr}  {marker}")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    from stage1_rom import load_rom
    rom = load_rom(sys.argv[1])
    results = disassemble_rom(rom, max_instrs=200)
    print("\nFirst 40 instructions:")
    print(dump_disasm(results[0], limit=40))
