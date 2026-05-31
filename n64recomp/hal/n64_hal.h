/*
 * n64_hal.h — N64 Hardware Abstraction Layer
 *
 * Stubs the N64 hardware (RCP, VI, AI, PI, SI, RDRAM) to
 * Windows-native equivalents (SDL2, OpenAL, OpenGL).
 */

#pragma once
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Primitive types ──────────────────────────────────────────────────────── */
typedef uint8_t  u8;
typedef uint16_t u16;
typedef uint32_t u32;
typedef uint64_t u64;
typedef int8_t   i8;
typedef int16_t  i16;
typedef int32_t  i32;
typedef int64_t  i64;
typedef float    f32;
typedef double   f64;

/* ── RDRAM ────────────────────────────────────────────────────────────────── */
#define N64_RDRAM_SIZE  (8 * 1024 * 1024)
extern u8 N64_RDRAM[N64_RDRAM_SIZE];

/* Strip top 3 bits (KSEG0/KSEG1) → physical address */
#define PHYS(vaddr) ((vaddr) & 0x1FFFFFFF)

/* ── Hardware register I/O — implemented in hal_sdl.c ───────────────────── */
/*
 * NOTE: These are NOT static inline — they are defined in hal_sdl.c.
 * read_u32/write_u32 below call them, so they must be forward-declared
 * as regular extern functions (not inline) to avoid circular dependency.
 */
u32  hw_read32 (u32 vaddr);
void hw_write32(u32 vaddr, u32 val);

/* ── Memory access ────────────────────────────────────────────────────────── */
/*
 * All reads/writes go through these.
 * Hardware register range (0xA0000000+) is dispatched to hw_read32/hw_write32.
 * RDRAM range is accessed directly with endian correction.
 *
 * N64 is big-endian; x86 is little-endian.
 * We byte-swap on every RDRAM access so game code works correctly.
 */

static inline u32 read_u32(u32 vaddr) {
    u32 p = PHYS(vaddr);
    if (p + 3 < N64_RDRAM_SIZE) {
        u32 val;
        memcpy(&val, &N64_RDRAM[p], 4);
        /* big→little endian swap */
        return ((val & 0xFF000000) >> 24) |
               ((val & 0x00FF0000) >>  8) |
               ((val & 0x0000FF00) <<  8) |
               ((val & 0x000000FF) << 24);
    }
    return hw_read32(vaddr);
}

static inline void write_u32(u32 vaddr, u32 val) {
    u32 p = PHYS(vaddr);
    if (p + 3 < N64_RDRAM_SIZE) {
        /* little→big endian swap before storing */
        u32 be = ((val & 0xFF000000) >> 24) |
                 ((val & 0x00FF0000) >>  8) |
                 ((val & 0x0000FF00) <<  8) |
                 ((val & 0x000000FF) << 24);
        memcpy(&N64_RDRAM[p], &be, 4);
        return;
    }
    hw_write32(vaddr, val);
}

static inline u16 read_u16(u32 vaddr) {
    u32 p = PHYS(vaddr);
    if (p + 1 < N64_RDRAM_SIZE) {
        return (u16)(((u16)N64_RDRAM[p] << 8) | N64_RDRAM[p + 1]);
    }
    return (u16)hw_read32(vaddr);
}

static inline void write_u16(u32 vaddr, u16 val) {
    u32 p = PHYS(vaddr);
    if (p + 1 < N64_RDRAM_SIZE) {
        N64_RDRAM[p]     = (u8)(val >> 8);
        N64_RDRAM[p + 1] = (u8)(val & 0xFF);
        return;
    }
    hw_write32(vaddr, val);
}

static inline u8 read_u8(u32 vaddr) {
    u32 p = PHYS(vaddr);
    if (p < N64_RDRAM_SIZE) {
        /* N64 byte lane: address XOR 3 within each 4-byte word */
        return N64_RDRAM[p ^ 3];
    }
    return (u8)hw_read32(vaddr);
}

static inline void write_u8(u32 vaddr, u8 val) {
    u32 p = PHYS(vaddr);
    if (p < N64_RDRAM_SIZE) {
        N64_RDRAM[p ^ 3] = val;
        return;
    }
    hw_write32(vaddr, val);
}

static inline i16 read_i16(u32 vaddr) { return (i16)read_u16(vaddr); }
static inline i8  read_i8 (u32 vaddr) { return (i8) read_u8 (vaddr); }

/* ── Video Interface ──────────────────────────────────────────────────────── */
void vi_present_framebuffer(u32 fb_vaddr, int width, int height, int bpp);

/* ── Audio Interface ──────────────────────────────────────────────────────── */
void ai_submit_dma(u32 dram_addr, u32 length, u32 frequency);

/* ── Peripheral Interface (cartridge DMA) ────────────────────────────────── */
void pi_dma_read (u32 dram_addr, u32 cart_addr, u32 length);
void pi_dma_write(u32 dram_addr, u32 cart_addr, u32 length);
void hal_set_rom (const u8 *data, size_t size);

/* ── Serial Interface (controllers) ──────────────────────────────────────── */
typedef struct {
    bool a, b, z, start;
    bool up, down, left, right;
    bool l, r, cu, cd, cl, cr;
    i8   stick_x;
    i8   stick_y;
} N64Controller;

extern N64Controller g_controllers[4];
void si_init_gamepads(void);
void si_close_gamepads(void);
void si_poll_controllers(void);
bool si_handle_read (u32 vaddr, u32 *out);
bool si_handle_write(u32 vaddr, u32  val);

/* ── RSP / RDP stubs ──────────────────────────────────────────────────────── */
void rsp_run_hle(u32 ucode_addr, u32 data_addr);
void rdp_process_display_list(u32 dl_vaddr);

/* ── System ───────────────────────────────────────────────────────────────── */
bool hal_init    (const char *title, int width, int height);
void hal_shutdown(void);
bool hal_poll_events(void);
void hal_present (void);

/* ── Timing ───────────────────────────────────────────────────────────────── */
u64  hal_get_ticks_ns(void);
void hal_sleep_ns(u64 ns);

/* ── Debug ────────────────────────────────────────────────────────────────── */
void n64_debug_print(const char *fmt, ...);

#ifdef __cplusplus
}
#endif
