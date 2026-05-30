# n64recomp — AI-Driven N64 → Native Windows x64 Recompiler

Convert a Nintendo 64 ROM you own into a native Windows `.exe` — no emulator, no runtime layer, just native x64 code.

## How it works

```
your_game.z64
      │
      ▼ Stage 1: ROM Parser
  Validates header, detects byte order (z64/v64/n64), extracts code segments

      ▼ Stage 2: MIPS Disassembler (rabbitizer)
  Decodes every MIPS R4300i instruction, identifies calls/branches/returns

      ▼ Stage 3: AI Function Boundary Detection (Groq llama-3.3-70b)
  Finds where functions start and end — the hard part humans used to do manually

      ▼ Stage 4: C Code Generator
  Translates each function to compilable C — AI for complex ones, deterministic for simple ones

      ▼ Stage 5: Visual Studio Project Generator
  Writes CMakeLists.txt, HAL (SDL2/OpenAL), main.c → ready to build

      │
      ▼
  your_game.sln  →  Build  →  your_game.exe
```

## Setup

### Requirements
- Python 3.10+
- `pip install rabbitizer`
- Set `GROQ_API_KEY` env var (free at console.groq.com) for AI-enhanced output
- Visual Studio 2022 with C++ workload
- CMake, SDL2, OpenAL (see `SETUP_DEPS.md` in output folder)

### Run
```bash
python pipeline.py your_game.z64
```

### Options
```
python pipeline.py game.z64 --output ./my_output
python pipeline.py game.z64 --no-ai           # heuristic only, no API needed
python pipeline.py game.z64 --max-funcs 100   # limit for testing
python pipeline.py game.z64 --groq-key gsk_xxxxx
```

## Output structure
```
output/game_name/
  CMakeLists.txt        ← CMake build config
  build_vs.bat          ← double-click to generate .sln
  SETUP_DEPS.md         ← dependency install guide
  recomp_manifest.json  ← build metadata
  src/
    main.c              ← Windows entry point + game loop
    functions/          ← one .c file per detected function
    hal/
      n64_hal.h         ← N64 hardware abstraction layer
      hal_sdl.c         ← SDL2+OpenAL implementation
  include/
    functions.h         ← forward declarations
```

## Completeness

| Component       | Status     | Notes |
|----------------|------------|-------|
| ROM parsing     | ✅ Complete | z64/v64/n64, all byte orders |
| MIPS disasm     | ✅ Complete | Full R4300i via rabbitizer |
| Function detect | ✅ Working  | AI + heuristic hybrid |
| C codegen       | ✅ Working  | ~70% deterministic, AI for complex |
| HAL (memory)    | ✅ Complete | Full RDRAM r/w with endian swap |
| HAL (video)     | 🔶 Partial  | Framebuffer present, no RDP |
| HAL (audio)     | 🔶 Partial  | DMA streaming via OpenAL |
| HAL (input)     | ✅ Working  | Keyboard → N64 controller |
| RSP/RDP         | 🔴 Stubbed  | Requires HLE microcode per game |

The RSP/RDP is the remaining hard part — graphics and audio processing. This is a v1 that gives you a working VS project. RSP HLE is a separate phase.

## Legal
Only use ROMs of games you legally own. This tool produces source code from your ROM — what you do with it is your responsibility.

---
Built with: Python, rabbitizer, Groq AI, SDL2, OpenAL, CMake
