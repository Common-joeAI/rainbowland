/*
 * hal_sdl.c — SDL2 + OpenAL implementation of the N64 HAL
 *
 * Handles: window creation, framebuffer display, audio streaming,
 * controller input, timing.
 *
 * Build deps: SDL2, OpenAL
 */

#include "n64_hal.h"
#include <SDL2/SDL.h>
#include <AL/al.h>
#include <AL/alc.h>
#include <stdio.h>
#include <string.h>
#include <stdarg.h>

/* ── RDRAM ───────────────────────────────────────────────────────────────── */
u8 N64_RDRAM[N64_RDRAM_SIZE];

/* ── Controllers ──────────────────────────────────────────────────────────  */
N64Controller g_controllers[4];

/* ── Internals ────────────────────────────────────────────────────────────── */
static SDL_Window   *s_window   = NULL;
static SDL_Renderer *s_renderer = NULL;
static SDL_Texture  *s_fb_tex   = NULL;
static int s_fb_width  = 320;
static int s_fb_height = 240;

/* OpenAL */
static ALCdevice  *s_al_device  = NULL;
static ALCcontext *s_al_context = NULL;
#define AL_BUFFER_COUNT 4
static ALuint s_al_buffers[AL_BUFFER_COUNT];
static ALuint s_al_source;

/* ── init / shutdown ──────────────────────────────────────────────────────── */

bool hal_init(const char *title, int width, int height) {
    s_fb_width  = width;
    s_fb_height = height;

    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER | SDL_INIT_TIMER) != 0) {
        fprintf(stderr, "[hal] SDL_Init failed: %s\n", SDL_GetError());
        return false;
    }

    s_window = SDL_CreateWindow(
        title,
        SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
        width * 2, height * 2,   /* 2× scale default */
        SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE);
    if (!s_window) {
        fprintf(stderr, "[hal] SDL_CreateWindow failed: %s\n", SDL_GetError());
        return false;
    }

    s_renderer = SDL_CreateRenderer(s_window, -1,
        SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
    if (!s_renderer) {
        fprintf(stderr, "[hal] SDL_CreateRenderer failed: %s\n", SDL_GetError());
        return false;
    }
    SDL_RenderSetLogicalSize(s_renderer, width, height);

    s_fb_tex = SDL_CreateTexture(s_renderer, SDL_PIXELFORMAT_RGBA8888,
        SDL_TEXTUREACCESS_STREAMING, width, height);

    /* OpenAL init */
    s_al_device  = alcOpenDevice(NULL);
    s_al_context = alcCreateContext(s_al_device, NULL);
    alcMakeContextCurrent(s_al_context);
    alGenBuffers(AL_BUFFER_COUNT, s_al_buffers);
    alGenSources(1, &s_al_source);
    alSourcei(s_al_source, AL_LOOPING, AL_FALSE);

    memset(N64_RDRAM, 0, N64_RDRAM_SIZE);
    memset(g_controllers, 0, sizeof(g_controllers));

    printf("[hal] Initialized — %dx%d window, OpenAL audio\n", width, height);
    return true;
}

void hal_shutdown(void) {
    alDeleteSources(1, &s_al_source);
    alDeleteBuffers(AL_BUFFER_COUNT, s_al_buffers);
    alcMakeContextCurrent(NULL);
    alcDestroyContext(s_al_context);
    alcCloseDevice(s_al_device);

    if (s_fb_tex)   SDL_DestroyTexture(s_fb_tex);
    if (s_renderer) SDL_DestroyRenderer(s_renderer);
    if (s_window)   SDL_DestroyWindow(s_window);
    SDL_Quit();
}

/* ── Event polling ────────────────────────────────────────────────────────── */

bool hal_poll_events(void) {
    SDL_Event e;
    while (SDL_PollEvent(&e)) {
        if (e.type == SDL_QUIT) return false;
        if (e.type == SDL_KEYDOWN && e.key.keysym.sym == SDLK_ESCAPE) return false;
    }
    return true;
}

/* ── Video ────────────────────────────────────────────────────────────────── */

void vi_present_framebuffer(u32 fb_vaddr, int width, int height, int bpp) {
    u32 phys = PHYS(fb_vaddr);
    if (phys + width * height * (bpp / 8) > N64_RDRAM_SIZE) return;

    /* Convert N64 framebuffer (RGBA5551 or RGBA8888) to SDL RGBA8888 */
    static u32 tmp[640 * 480];
    u8 *src = &N64_RDRAM[phys];
    for (int i = 0; i < width * height; i++) {
        if (bpp == 16) {
            u16 px = (src[i*2] << 8) | src[i*2+1];
            u8 r = ((px >> 11) & 0x1F) << 3;
            u8 g = ((px >>  6) & 0x1F) << 3;
            u8 b = ((px >>  1) & 0x1F) << 3;
            u8 a = (px & 1) ? 0xFF : 0;
            tmp[i] = (r << 24) | (g << 16) | (b << 8) | a;
        } else {
            /* 32-bit RGBA */
            tmp[i] = (src[i*4]<<24)|(src[i*4+1]<<16)|(src[i*4+2]<<8)|src[i*4+3];
        }
    }
    SDL_UpdateTexture(s_fb_tex, NULL, tmp, width * 4);
}

void hal_present(void) {
    SDL_RenderClear(s_renderer);
    SDL_RenderCopy(s_renderer, s_fb_tex, NULL, NULL);
    SDL_RenderPresent(s_renderer);
}

/* ── Audio ────────────────────────────────────────────────────────────────── */

void ai_submit_dma(u32 dram_addr, u32 length, u32 frequency) {
    u32 phys = PHYS(dram_addr);
    if (phys + length > N64_RDRAM_SIZE || length == 0) return;

    /* N64 audio is 16-bit stereo big-endian — byte-swap pairs */
    static u8 pcm_buf[0x40000];
    u8 *src = &N64_RDRAM[phys];
    for (u32 i = 0; i < length; i += 2) {
        pcm_buf[i]   = src[i+1];
        pcm_buf[i+1] = src[i];
    }

    /* Find a free buffer slot */
    ALint processed = 0;
    alGetSourcei(s_al_source, AL_BUFFERS_PROCESSED, &processed);
    if (processed > 0) {
        ALuint buf;
        alSourceUnqueueBuffers(s_al_source, 1, &buf);
        alBufferData(buf, AL_FORMAT_STEREO16, pcm_buf, length, frequency);
        alSourceQueueBuffers(s_al_source, 1, &buf);
    }

    ALint state;
    alGetSourcei(s_al_source, AL_SOURCE_STATE, &state);
    if (state != AL_PLAYING) alSourcePlay(s_al_source);
}

/* ── Controllers ──────────────────────────────────────────────────────────── */

void si_poll_controllers(void) {
    const u8 *k = SDL_GetKeyboardState(NULL);
    N64Controller *c = &g_controllers[0];
    c->a      = k[SDL_SCANCODE_X];
    c->b      = k[SDL_SCANCODE_Z];
    c->z      = k[SDL_SCANCODE_LSHIFT];
    c->start  = k[SDL_SCANCODE_RETURN];
    c->up     = k[SDL_SCANCODE_UP];
    c->down   = k[SDL_SCANCODE_DOWN];
    c->left   = k[SDL_SCANCODE_LEFT];
    c->right  = k[SDL_SCANCODE_RIGHT];
    c->l      = k[SDL_SCANCODE_A];
    c->r      = k[SDL_SCANCODE_S];
    c->stick_x = (k[SDL_SCANCODE_D] ? 80 : 0) - (k[SDL_SCANCODE_A] ? 80 : 0);
    c->stick_y = (k[SDL_SCANCODE_W] ? 80 : 0) - (k[SDL_SCANCODE_S] ? 80 : 0);
}

/* ── Hardware register I/O ────────────────────────────────────────────────── */

/* N64 memory-mapped register ranges */
#define RANGE(lo, hi) ((vaddr) >= (lo) && (vaddr) <= (hi))

u32 hw_read32(u32 vaddr) {
    if (RANGE(0xA4300000, 0xA43FFFFF)) return 0;  /* AI — return ready */
    if (RANGE(0xA4400000, 0xA44FFFFF)) return 0;  /* VI */
    if (RANGE(0xA4500000, 0xA45FFFFF)) return 0;  /* PI */
    if (RANGE(0xA4800000, 0xA48FFFFF)) return 0;  /* SI */
    return 0;
}

void hw_write32(u32 vaddr, u32 val) {
    /* VI framebuffer origin */
    if (vaddr == 0xA4400004) {
        vi_present_framebuffer(val, s_fb_width, s_fb_height, 16);
    }
    /* AI DMA — treat as audio submit */
    if (vaddr == 0xA4500000) {
        /* AI_DRAM_ADDR write followed by AI_LEN_REG — handled lazily */
    }
    (void)val;
}

/* ── RSP/RDP stubs ────────────────────────────────────────────────────────── */

void rsp_run_hle(u32 ucode_addr, u32 data_addr) {
    (void)ucode_addr; (void)data_addr;
    /* TODO: integrate hle_gfx / hle_audio from Mupen64Plus HLE */
}

void rdp_process_display_list(u32 dl_vaddr) {
    (void)dl_vaddr;
    /* TODO: integrate miniRDP or parallel-rdp */
}

/* ── PI DMA ───────────────────────────────────────────────────────────────── */

/* ROM image passed in at init time */
static const u8 *s_rom_data = NULL;
static size_t    s_rom_size = 0;

void hal_set_rom(const u8 *data, size_t size) {
    s_rom_data = data;
    s_rom_size = size;
}

void pi_dma_read(u32 dram_addr, u32 cart_addr, u32 length) {
    u32 phys = PHYS(dram_addr);
    u32 cart_offset = cart_addr & 0x0FFFFFFF;
    if (!s_rom_data || cart_offset + length > s_rom_size) return;
    if (phys + length > N64_RDRAM_SIZE) return;
    memcpy(&N64_RDRAM[phys], &s_rom_data[cart_offset], length);
}

void pi_dma_write(u32 dram_addr, u32 cart_addr, u32 length) {
    (void)dram_addr; (void)cart_addr; (void)length;
    /* Games rarely write back to cartridge — stub OK */
}

/* ── Timing ───────────────────────────────────────────────────────────────── */

u64 hal_get_ticks_ns(void) {
    return SDL_GetPerformanceCounter() * 1000000000ULL / SDL_GetPerformanceFrequency();
}

void hal_sleep_ns(u64 ns) {
    SDL_Delay((u32)(ns / 1000000));
}

/* ── Debug ────────────────────────────────────────────────────────────────── */

void n64_debug_print(const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    vfprintf(stderr, fmt, args);
    va_end(args);
}
