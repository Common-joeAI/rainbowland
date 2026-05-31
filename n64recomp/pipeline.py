"""
n64recomp — AI-driven N64 ROM → Native Windows x64 Pipeline
============================================================

Usage:
    python pipeline.py <rom.z64> [options]

Options:
    --output <dir>      Output directory (default: ./output/<game_name>)
    --no-ai             Skip AI stages — use heuristic only (faster, less accurate)
    --max-funcs <n>     Cap functions for testing (0 = all)
    --max-instrs <n>    Cap disasm instructions for testing (0 = all)
    --groq-key <key>    Override GROQ_API_KEY env var

The output is a complete Visual Studio project. Open output/<game>/CMakeLists.txt
with VS or run build_vs.bat to generate the .sln.
"""

import argparse
import os
import sys
import time
from pathlib import Path

# ── Check deps ────────────────────────────────────────────────────────────────
try:
    import rabbitizer
except ImportError:
    print("ERROR: rabbitizer not installed. Run: pip install rabbitizer")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="n64recomp — AI-driven N64 → Native Windows x64 recompiler")
    parser.add_argument("rom",            help="Path to .z64/.v64/.n64 ROM file")
    parser.add_argument("--output",       default="", help="Output directory")
    parser.add_argument("--no-ai",        action="store_true", help="Heuristic mode only")
    parser.add_argument("--max-funcs",    type=int, default=0)
    parser.add_argument("--max-instrs",   type=int, default=0)
    parser.add_argument("--max-chunks",   type=int, default=0)
    parser.add_argument("--groq-key",     default="")
    args = parser.parse_args()

    # GROQ key override
    if args.groq_key:
        os.environ["GROQ_API_KEY"] = args.groq_key

    groq_available = bool(os.environ.get("GROQ_API_KEY", ""))
    use_ai = not args.no_ai and groq_available

    if not use_ai and not args.no_ai:
        print("⚠  GROQ_API_KEY not set — running in heuristic-only mode")
        print("   Set GROQ_API_KEY or pass --groq-key for AI-enhanced output\n")

    t_start = time.time()

    print("=" * 60)
    print("  n64recomp — AI-driven N64 → Windows x64 Recompiler")
    print("=" * 60)

    # ── STAGE 1: ROM Ingestion ────────────────────────────────────────────────
    from stage1_rom import load_rom
    rom = load_rom(args.rom)

    game_name = rom.known_title or rom.header.title or "unknown_game"
    output_dir = args.output or f"output/{game_name.lower().replace(' ', '_').replace(':', '')}"

    # ── STAGE 2: Disassembly ──────────────────────────────────────────────────
    from stage2_disasm import disassemble_rom
    disasms = disassemble_rom(rom, max_instrs=args.max_instrs)

    # ── STAGE 3: Function boundary detection ──────────────────────────────────
    from stage3_ai_boundaries import detect_boundaries
    dr = disasms[0]  # Main code segment
    bounds = detect_boundaries(dr, use_ai=use_ai, max_chunks=args.max_chunks)

    # ── STAGE 4: C code generation ────────────────────────────────────────────
    from stage4_codegen import generate_code
    cg = generate_code(dr, bounds, use_ai=use_ai, max_funcs=args.max_funcs)

    # ── STAGE 5: VS project generation ───────────────────────────────────────
    from stage5_vsproject import generate_vs_project
    hal_dir = Path(__file__).parent / "hal"
    generate_vs_project(cg, game_name, rom.entry_point, output_dir, hal_dir)

    # ── Summary ───────────────────────────────────────────────────────────────
    elapsed = time.time() - t_start
    total_funcs  = len(cg.functions)
    ai_count     = sum(1 for f in cg.functions if f.method == "ai")
    det_count    = sum(1 for f in cg.functions if f.method == "deterministic")
    stub_count   = sum(1 for f in cg.functions if f.method == "stub")
    warn_count   = sum(len(f.warnings) for f in cg.functions)
    first_entry  = cg.functions[0].boundary.name if cg.functions else "none"

    print()
    print("=" * 60)
    print(f"  ✅ DONE in {elapsed:.1f}s")
    print(f"  Game:         {game_name}")
    print(f"  Entry func:   {first_entry}")
    print(f"  Functions:    {total_funcs}")
    print(f"    AI-trans:   {ai_count}")
    print(f"    Heuristic:  {det_count}")
    print(f"    Stubs:      {stub_count}")
    print(f"  Warnings:     {warn_count}")
    print(f"  Output:       {Path(output_dir).resolve()}")
    print()
    print("  Next steps:")
    print(f"    1. cd {output_dir}")
    print(f"    2. Run build_vs.bat")
    print(f"    3. Open build\\<game>.sln in Visual Studio")
    print(f"    4. Build → Build Solution (Ctrl+Shift+B)")
    print("=" * 60)


if __name__ == "__main__":
    main()
