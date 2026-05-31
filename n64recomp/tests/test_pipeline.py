"""
Smoke test — runs all 5 pipeline stages on a synthetic ROM.
Run via: python tests/test_pipeline.py
Or via pytest: pytest tests/
"""

import sys
import os
import struct
import shutil
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


def make_synthetic_rom(tmp_dir: str) -> str:
    """Build a minimal valid N64 ROM with a few real MIPS instructions."""
    header = bytearray(64)
    header[0:4] = bytes([0x80, 0x37, 0x12, 0x40])   # magic
    struct.pack_into(">I", header, 0x04, 0x000F0000) # clock rate
    struct.pack_into(">I", header, 0x08, 0x80001000) # entry point
    struct.pack_into(">I", header, 0x10, 0)
    struct.pack_into(">I", header, 0x14, 0)
    header[0x20:0x40] = b"SMOKE TEST ROM      \x00\x00\x00\x00SMOK\x00" + bytes(27)
    header[0x3B:0x3F] = b"SMOK"

    bootcode = bytes(0xFC0)

    instructions = [
        0x27BDFFE0,  # addiu $sp, $sp, -32
        0xAFBF001C,  # sw $ra, 28($sp)
        0x0C000204,  # jal func2
        0x00000000,  # nop
        0x8FBF001C,  # lw $ra, 28($sp)
        0x27BD0020,  # addiu $sp, $sp, 32
        0x03E00008,  # jr $ra
        0x00000000,  # nop
        # func2
        0x2402002A,  # addiu $v0, $zero, 42
        0x03E00008,  # jr $ra
        0x00000000,  # nop
    ]
    code = b"".join(struct.pack(">I", i) for i in instructions)
    code += bytes(0x2000 - len(code))

    rom_path = os.path.join(tmp_dir, "smoke.z64")
    with open(rom_path, "wb") as f:
        f.write(bytes(header) + bootcode + code)
    return rom_path


def test_full_pipeline():
    tmp = tempfile.mkdtemp(prefix="n64recomp_test_")
    rom_path = make_synthetic_rom(tmp)
    out_dir  = os.path.join(tmp, "output")

    try:
        # Stage 1
        from stage1_rom import load_rom
        rom = load_rom(rom_path)
        assert rom.entry_point == 0x80001000, f"entry mismatch: {rom.entry_point:#010x}"
        assert rom.segments[0].vaddr == 0x80001000, "segment vaddr mismatch"
        assert rom.header.title == "SMOKE TEST ROM"
        print(f"  ✅ Stage 1 — entry=0x{rom.entry_point:08X} title={rom.header.title!r}")

        # Stage 2
        from stage2_disasm import disassemble_rom
        disasms = disassemble_rom(rom, max_instrs=15)
        dr = disasms[0]
        assert len(dr.instructions) > 0
        assert dr.instructions[0].vaddr == 0x80001000
        mnemonics = [i.mnemonic for i in dr.instructions]
        assert "addiu" in mnemonics, f"addiu not found: {mnemonics}"
        assert "nop"   in mnemonics
        print(f"  ✅ Stage 2 — {len(dr.instructions)} instrs, mnemonics look real")

        # Stage 3
        from stage3_ai_boundaries import detect_boundaries
        bounds = detect_boundaries(dr, use_ai=False)
        assert len(bounds.functions) >= 1
        print(f"  ✅ Stage 3 — {len(bounds.functions)} functions detected")

        # Stage 4
        from stage4_codegen import generate_code
        cg = generate_code(dr, bounds, use_ai=False)
        assert len(cg.functions) >= 1
        c_code = cg.functions[0].c_code
        assert "void " in c_code
        assert "return" in c_code or "jr" in c_code.lower() or "0x03E00008" in c_code
        print(f"  ✅ Stage 4 — {len(cg.functions)} C functions generated")

        # Stage 5
        from stage5_vsproject import generate_vs_project
        hal_dir = Path(__file__).parent.parent / "hal"
        out = generate_vs_project(cg, rom.header.title, rom.entry_point, out_dir, hal_dir)
        out = Path(out)
        assert (out / "CMakeLists.txt").exists(), f"missing CMakeLists in {out}"
        assert (out / "build_vs.bat").exists()
        assert (out / "src" / "main.c").exists()
        assert (out / "src" / "hal" / "si.c").exists()
        main_c = (out / "src" / "main.c").read_text()
        assert cg.functions[0].boundary.name in main_c, \
            f"main.c doesn't call {cg.functions[0].boundary.name}"
        print(f"  ✅ Stage 5 — project at {out}")

        # AI parse: test string hex tolerance
        from stage3_ai_boundaries import _parse_ai_response
        fake_ai = '{"functions": [{"start": "0x80001000", "end": "0x80001020", "type": "normal", "name": "game_main"}]}'
        parsed = _parse_ai_response(fake_ai)
        assert len(parsed) == 1
        assert parsed[0].start == 0x80001000
        print(f"  ✅ Stage 3 AI parse — string hex handled correctly")

        print("\n🎉 All pipeline tests PASSED")
        return True

    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    print("=== n64recomp smoke test ===\n")
    ok = test_full_pipeline()
    sys.exit(0 if ok else 1)
