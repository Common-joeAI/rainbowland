/*
 * n64_hal.h — N64 Hardware Abstraction Layer
 *
 * Stubs the N64 hardware (RCP, VI, AI, PI, SI, RDRAM) to
 * Windows-native equivalents (SDL2, OpenAL, OpenGL).
 *
 * Every write to a hardware register goes through these functions
 * so the game code never needs to know it's not on real hardware.
 */

#pragma once
#include <stdint.h>
#include <stdbool.h>

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

/* ── RDRAM (4MB or 8MB) ──────────────────────────────────────────────────── */
#define N64_RDRAM_SIZE  (8 * 1024 * 1024)   /* 8MB expanded */
extern u8 N64_RDRAM[N64_RDRAM_SIZE];

/* ── Memory access helpers ───────────────────────────────────────────────── */
/* Masks off the top 3 bits (KSEG0/KSEG1) to get physical address */
#define PHYS(vaddr) ((vaddr) & 0x1FFFFFFF)

static inline u32 read_u32(u32 vaddr) {
    u32 p = PHYS(vaddr);
    if (p < N64_RDRAM_SIZE) {
        u32 val;
        __builtin_memcpy(&val, &N64_RDRAM[p], 4);
        /* N64 is big-endian — swap on x86 */
        return __builtin_bswap32(val);
    }
    return hw_read32(vaddr);
}

static inline void write_u32(u32 vaddr, u32 val) {
    u32 p = PHYS(vaddr);
    if (p < N64_RDRAM_SIZE) {
        val = __builtin_bswap32(val);
        __builtin_memcpy(&N64_RDRAM[p], &val, 4);
        return;
    }
    hw_write32(vaddr, val);
}

static inline u16 read_u16(u32 vaddr) {
    u32 p = PHYS(vaddr);
    if (p + 1 < N64_RDRAM_SIZE) {
        u16 val;
        __builtin_memcpy(&val, &N64_RDRAM[p], 2);
        return __builtin_bswap16(val);
    }
    return (u16)hw_read32(vaddr);
}

static inline void write_u16(u32 vaddr, u16 val) {
    u32 p = PHYS(vaddr);
    if (p + 1 < N64_RDRAM_SIZE) {
        val = __builtin_bswap16(val);
        __builtin_memcpy(&N64_RDRAM[p], &val, 2);
        return;
    }
    hw_write32(vaddr, val);
}

static inline u8 read_u8(u32 vaddr) {
    u32 p = PHYS(vaddr);
    if (p < N64_RDRAM_SIZE) return N64_RDRAM[p ^ 3]; /* byte-lane swap */
    return (u8)hw_read32(vaddr);
}

static inline void write_u8(u32 vaddr, u8 val) {
    u32 p = PHYS(vaddr);
    if (p < N64_RDRAM_SIZE) { N64_RDRAM[p ^ 3] = val; return; }
    hw_write32(vaddr, val);
}

static inline i16 read_i16(u32 vaddr) { return (i16)read_u16(vaddr); }
static inline i8  read_i8 (u32 vaddr) { return (i8) read_u8 (vaddr); }

/* ── Hardware register I/O (implemented in rcp.c / vi.c etc.) ──────────── */
u32  hw_read32 (u32 vaddr);
void hw_write32(u32 vaddr, u32 val);

/* ── Video Interface (VI) ────────────────────────────────────────────────── */
/* Call once per frame after the game writes to VI_V_CURRENT_LINE */
void vi_present_framebuffer(u32 fb_vaddr, int width, int height, int bpp);

/* ── Audio Interface (AI) ────────────────────────────────────────────────── */
void ai_submit_dma(u32 dram_addr, u32 length, u32 frequency);

/* ── Peripheral Interface (PI) — cartridge DMA ──────────────────────────── */
void pi_dma_read (u32 dram_addr, u32 cart_addr, u32 length);
void pi_dma_write(u32 dram_addr, u32 cart_addr, u32 length);

/* ── Serial Interface (SI) — controllers ────────────────────────────────── */
typedef struct {
    bool a, b, z, start;
    bool up, down, left, right;
    bool l, r, cu, cd, cl, cr;
    i8   stick_x;
    i8   stick_y;
} N64Controller;

extern N64Controller g_controllers[4];
void si_poll_controllers(void);   /* called each frame before game reads SI */

/* ── RSP (Reality Signal Processor) ─────────────────────────────────────── */
/*
 * Full RSP emulation is beyond scope for v1. We stub it and provide
 * High-Level Emulation (HLE) for the two most common microcode tasks:
 * F3DEX2 (geometry/display list processing) and ABI (audio).
 */
void rsp_run_hle(u32 ucode_addr, u32 data_addr);

/* ── RDP (Reality Display Processor) ────────────────────────────────────── */
/* Forward display list commands to an OpenGL/Vulkan backend */
void rdp_process_display_list(u32 dl_vaddr);

/* ── System init / shutdown ──────────────────────────────────────────────── */
bool hal_init(const char *title, int width, int height);
void hal_shutdown(void);
bool hal_poll_events(void);    /* returns false when window closed */
void hal_present(void);        /* flip framebuffer */

/* ── Timing ──────────────────────────────────────────────────────────────── */
u64  hal_get_ticks_ns(void);   /* nanoseconds */
void hal_sleep_ns(u64 ns);

/* ── Debug ───────────────────────────────────────────────────────────────── */
void n64_debug_print(const char *fmt, ...);

#ifdef __cplusplus
}
#endif
