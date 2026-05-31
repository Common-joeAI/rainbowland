"""
STAGE 1 — ROM Ingestion + Validation
Parses a .z64/.v64/.n64 ROM file into a structured N64Rom object.
"""

import struct
import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# ── Known CIC chips by bootcode SHA1 ──────────────────────────────────────────
CIC_HASHES = {
    "6101": "4a4311f607b8b10ac19073e3f9f4e793b8bcf4e6",
    "6102": "a536af8c8d7021e1bf5b75d32be38c1c8a4ca9e4",
    "6103": "586da4a88c7e98b9e78bca55b2df58928b77da7b",
    "6105": "8ee19d3f6dfc27e8e9e77e7e7e0a3e93ce5dd455",
    "6106": "6386de4e56e7ddf5f77a96c70b30c6e53e7b8b55",
    "7101": "b965ad3e576bf3eb8d1ce36cbfb55ed85fcb1f0d",
    "7102": "b4e48aa6e1cd62f0aef0e6d2e5ba9e3b7a6c8d2a",
}

KNOWN_GAMES = {
    b"SUPER MARIO 64   ": "Super Mario 64",
    b"THE LEGEND OF ZEL": "Zelda: Ocarina of Time",
    b"ZELDA MAJORA'S MA": "Zelda: Majora's Mask",
    b"BANJO-KAZOOIE    ": "Banjo-Kazooie",
    b"DONKEY KONG 64   ": "Donkey Kong 64",
    b"PAPER MARIO      ": "Paper Mario",
    b"GOLDENEYE        ": "GoldenEye 007",
    b"PERFECT DARK     ": "Perfect Dark",
    b"MARIO KART 64    ": "Mario Kart 64",
    b"STAR FOX 64      ": "Star Fox 64",
}


@dataclass
class RomHeader:
    pi_bsd_dom1_flags: int    # 0x00: PI BSD Dom1 flags
    clock_rate:        int    # 0x04
    entry_point:       int    # 0x08: CPU boot entry point (MIPS vaddr)
    release:           int    # 0x0C
    crc1:              int    # 0x10
    crc2:              int    # 0x14
    title:             str    # 0x20: 20 bytes ASCII
    game_code:         str    # 0x3B: 4 bytes  e.g. "NSME"
    revision:          int    # 0x3F


@dataclass
class CodeSegment:
    vaddr:  int           # Virtual address in N64 address space
    offset: int           # Byte offset in ROM
    data:   bytes         # Raw bytes
    size:   int


@dataclass
class N64Rom:
    path:       Path
    raw:        bytes
    header:     RomHeader
    bootcode:   bytes
    cic_version: str
    segments:   list[CodeSegment] = field(default_factory=list)
    known_title: Optional[str] = None

    @property
    def entry_point(self) -> int:
        return self.header.entry_point

    @property
    def total_size(self) -> int:
        return len(self.raw)


# ── Byte-order detection & normalisation ──────────────────────────────────────

MAGIC_Z64 = bytes([0x80, 0x37, 0x12, 0x40])  # Big-endian   (.z64) — native
MAGIC_V64 = bytes([0x37, 0x80, 0x40, 0x12])  # Byte-swapped (.v64)
MAGIC_N64 = bytes([0x40, 0x12, 0x37, 0x80])  # Word-swapped (.n64)


def _normalise_byteorder(data: bytes) -> bytes:
    magic = data[0:4]
    if magic == MAGIC_Z64:
        return data  # already big-endian
    elif magic == MAGIC_V64:
        # Swap every pair of bytes
        arr = bytearray(data)
        for i in range(0, len(arr) - 1, 2):
            arr[i], arr[i+1] = arr[i+1], arr[i]
        print("  [rom] Detected .v64 (byte-swapped) — normalised to big-endian")
        return bytes(arr)
    elif magic == MAGIC_N64:
        # Swap every group of 4 bytes (little-endian word)
        arr = bytearray(data)
        for i in range(0, len(arr) - 3, 4):
            arr[i], arr[i+1], arr[i+2], arr[i+3] = arr[i+3], arr[i+2], arr[i+1], arr[i]
        print("  [rom] Detected .n64 (word-swapped) — normalised to big-endian")
        return bytes(arr)
    else:
        raise ValueError(f"Unknown ROM magic: {magic.hex()} — is this a valid N64 ROM?")


# ── CIC detection ─────────────────────────────────────────────────────────────

def _detect_cic(bootcode: bytes) -> str:
    h = hashlib.sha1(bootcode).hexdigest()
    for cic, known_hash in CIC_HASHES.items():
        if h == known_hash:
            return cic
    # Fallback: detect by known byte patterns
    if bootcode[0x10:0x14] == bytes([0x3C, 0x0A, 0x00, 0x3F]):
        return "6102"
    return "6102"  # Most common — safe default


# ── Header parsing ─────────────────────────────────────────────────────────────

def _parse_header(data: bytes) -> RomHeader:
    pi_flags   = struct.unpack_from(">I", data, 0x00)[0]
    clock_rate = struct.unpack_from(">I", data, 0x04)[0]
    entry_pt   = struct.unpack_from(">I", data, 0x08)[0]
    release    = struct.unpack_from(">I", data, 0x0C)[0]
    crc1       = struct.unpack_from(">I", data, 0x10)[0]
    crc2       = struct.unpack_from(">I", data, 0x14)[0]
    title_raw  = data[0x20:0x34]
    title      = title_raw.decode("ascii", errors="replace").rstrip("\x00 ")
    game_code  = data[0x3B:0x3F].decode("ascii", errors="replace")
    revision   = data[0x3F]
    return RomHeader(pi_flags, clock_rate, entry_pt, release, crc1, crc2, title, game_code, revision)


# ── Segment extraction ────────────────────────────────────────────────────────

def _extract_segments(data: bytes, header: RomHeader) -> list[CodeSegment]:
    """
    For N64 ROMs the entire ROM is DMA-loaded into RDRAM at runtime by the boot
    code.  The typical layout is:
      0x000_0000  header + bootcode (IPL3)   → not executable game code
      0x000_1000  game binary start          → vaddr 0x8000_0400 (entry point)
      rest        mixed code + data

    We emit one big code segment covering the entire game binary.
    The AI disassembly stage will split it further by function boundaries.
    """
    game_start = 0x1000
    game_data  = data[game_start:]

    # Virtual address: the ROM is DMA'd to RDRAM starting at 0x80000000,
    # but the first 0x1000 bytes are the IPL3 bootcode (not game code).
    # So game code lands at 0x80001000 in RDRAM.
    # The entry point (e.g. 0x80000400) is within the bootcode region —
    # games jump from bootcode into the main binary which starts at 0x80001000.
    #
    # We track both:
    #   vaddr = 0x80001000  (where game binary lands in RDRAM)
    #   entry_point from header (where CPU starts executing)
    vaddr_base = 0x80001000

    seg = CodeSegment(
        vaddr=vaddr_base,
        offset=game_start,
        data=game_data,
        size=len(game_data),
    )
    return [seg]


# ── Public API ────────────────────────────────────────────────────────────────

def load_rom(path: str | Path) -> N64Rom:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"ROM not found: {path}")

    print(f"\n[STAGE 1] Loading ROM: {path.name}")
    raw = path.read_bytes()
    print(f"  Size: {len(raw):,} bytes ({len(raw)/1024/1024:.2f} MB)")

    data   = _normalise_byteorder(raw)
    header = _parse_header(data)

    print(f"  Title:      {header.title!r}")
    print(f"  Game Code:  {header.game_code}")
    print(f"  Entry Point: 0x{header.entry_point:08X}")
    print(f"  CRC1: 0x{header.crc1:08X}  CRC2: 0x{header.crc2:08X}")
    print(f"  Revision: {header.revision}")

    bootcode    = data[0x40:0x1000]
    cic_version = _detect_cic(bootcode)
    print(f"  CIC Chip: {cic_version}")

    # Match known game
    known_title = None
    for title_bytes, name in KNOWN_GAMES.items():
        if data[0x20:0x20+len(title_bytes)] == title_bytes:
            known_title = name
            break
    if known_title:
        print(f"  Known Game: {known_title} ✓")

    segments = _extract_segments(data, header)
    print(f"  Segments: {len(segments)} ({segments[0].size:,} bytes of game code)")

    return N64Rom(
        path=path,
        raw=data,
        header=header,
        bootcode=bootcode,
        cic_version=cic_version,
        segments=segments,
        known_title=known_title,
    )


if __name__ == "__main__":
    import sys
    rom = load_rom(sys.argv[1])
    print(f"\nROM loaded OK — {rom.total_size:,} bytes, entry 0x{rom.entry_point:08X}")
