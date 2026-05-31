# n64recomp

> Convert N64 ROMs you own into native Windows x64 executables — no emulator, no runtime layer.

![Pipeline](https://img.shields.io/badge/stages-5-blue) ![Platform](https://img.shields.io/badge/output-Windows%20x64-0078d4) ![AI](https://img.shields.io/badge/AI-Groq%20llama--3.3-blueviolet) ![License](https://img.shields.io/badge/license-MIT-green)

## Download

Grab the latest `n64recomp.exe` from [Releases](../../releases) — no install needed.

## How it works

```
your_game.z64
      │
      ▼  Stage 1 — ROM Parser
         Validates header, detects byte order (z64/v64/n64)
      │
      ▼  Stage 2 — MIPS Disassembler  (rabbitizer)
         Decodes every R4300i instruction, maps calls/branches/returns
      │
      ▼  Stage 3 — AI Function Boundary Detection  (Groq llama-3.3-70b)
         Finds where functions start and end — the hard part
      │
      ▼  Stage 4 — C Code Generator
         Translates each function to compilable C (AI + deterministic hybrid)
      │
      ▼  Stage 5 — Visual Studio Project Generator
         CMakeLists.txt, SDL2/OpenAL HAL, main.c → ready to build
      │
      ▼
  your_game.sln  →  Build  →  your_game.exe
```

## GUI Usage

1. Run **n64recomp.exe**
2. Drop your `.z64` ROM onto the window (or click Browse)
3. Optionally enter a [Groq API key](https://console.groq.com) (free) for AI-enhanced analysis
4. Click **Convert ROM**
5. Open the output folder and run `build_vs.bat`
6. Open the `.sln` in Visual Studio 2022 → Ctrl+Shift+B

## CLI Usage

```bash
pip install rabbitizer
python pipeline.py your_game.z64

# Options
python pipeline.py game.z64 --no-ai             # heuristic only
python pipeline.py game.z64 --max-funcs 200      # limit for testing
python pipeline.py game.z64 --output ./my_build
python pipeline.py game.z64 --groq-key gsk_xxx
```

## Output structure

```
output/game_name/
  CMakeLists.txt         ← CMake build config
  build_vs.bat           ← double-click → generates .sln
  SETUP_DEPS.md          ← SDL2 / OpenAL install guide
  recomp_manifest.json   ← build metadata
  src/
    main.c               ← Windows entry point + game loop
    functions/           ← one .c file per detected function
    hal/
      n64_hal.h          ← N64 hardware abstraction layer
      hal_sdl.c          ← SDL2 + OpenAL implementation
      si.c               ← Full PIF/joybus input system
  include/
    functions.h          ← forward declarations
```

## Requirements to compile the output

| Tool | Version |
|------|---------|
| Visual Studio 2022 | C++ workload |
| CMake | 3.20+ |
| SDL2 | 2.28+ |
| OpenAL Soft | 1.23+ |

See `SETUP_DEPS.md` in any output folder for detailed install instructions.

## Input / Controller mapping

**Keyboard (P1 fallback):**

| Key | N64 |
|-----|-----|
| WASD | Analog stick |
| Arrow keys | D-pad |
| X / Z | A / B |
| Enter | Start |
| Q / E | L / R |
| I J K L | C-Up / C-Left / C-Down / C-Right |
| LShift | Z trigger |

**Xbox / PS controller (auto-detected):**

| Input | N64 |
|-------|-----|
| Left stick | Analog stick |
| Right stick | C-buttons |
| A / B | A / B |
| LB | Z trigger |
| LT / RT | L / R |
| D-pad | D-pad |
| Start | Start |

## Completeness

| Component | Status | Notes |
|-----------|--------|-------|
| ROM parsing | ✅ | z64/v64/n64, all byte orders |
| MIPS disasm | ✅ | Full R4300i via rabbitizer |
| Function detection | ✅ | AI + heuristic hybrid |
| C codegen | ✅ | ~70% deterministic, AI for complex |
| HAL — memory | ✅ | 8 MB RDRAM with endian correction |
| HAL — video | 🔶 | Framebuffer output, no RDP |
| HAL — audio | 🔶 | DMA streaming via OpenAL |
| HAL — input | ✅ | Full PIF/joybus + Xbox/keyboard |
| RSP / RDP | 🔴 | Stubbed — requires HLE per game |

RSP/RDP (graphics microcode) is the remaining hard part. Phase 2.

## Legal

Only use ROMs of games you legally own. This tool produces source code from your ROM — what you do with that code is your responsibility.

---

Built with: Python · rabbitizer · Groq AI · SDL2 · OpenAL · CMake · PyQt6
