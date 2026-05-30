/*
 * si.c — N64 Serial Interface (SI) + PIF simulation
 *
 * The N64 input pipeline:
 *   Game writes to SI_PIF_ADDR_RD64B_REG (0xA4800010)
 *   → PIF chip polls all 4 controller ports via joybus protocol
 *   → 64-byte PIF RAM result written to RDRAM at SI_DRAM_ADDR
 *   → Game reads controller state from RDRAM
 *
 * We intercept the SI register write, run si_poll_controllers(),
 * pack the result into joybus format, and DMA it to RDRAM directly.
 * No timing emulation needed — games just wait for SI_STATUS_INTERRUPT.
 */

#include "n64_hal.h"
#include <SDL2/SDL.h>
#include <string.h>
#include <stdio.h>

/* ── Controller state (4 ports) ──────────────────────────────────────────── */
N64Controller g_controllers[4];

/* ── SDL gamepad handles ──────────────────────────────────────────────────── */
static SDL_GameController *s_pads[4] = {NULL, NULL, NULL, NULL};

/* ── SI internal registers ───────────────────────────────────────────────── */
static u32 s_si_dram_addr   = 0;
static u32 s_si_status      = 0;

#define SI_STATUS_INTERRUPT  (1 << 12)
#define SI_STATUS_DMA_BUSY   (1 << 0)

/* ── Joybus response offsets in 64-byte PIF RAM ──────────────────────────── */
/* Each controller block is 4 bytes: buttons_hi, buttons_lo, stick_x, stick_y */
static const int JOYBUS_OFFSETS[4] = { 1, 9, 17, 25 };

/* ── N64 button bit layout ────────────────────────────────────────────────── */
/* Byte 0 (buttons_hi): A B Z Start DUp DDown DLeft DRight */
/* Byte 1 (buttons_lo): Reset 0 L R CUp CDown CLeft CRight */
#define BTN_A       0x8000
#define BTN_B       0x4000
#define BTN_Z       0x2000
#define BTN_START   0x1000
#define BTN_DUP     0x0800
#define BTN_DDOWN   0x0400
#define BTN_DLEFT   0x0200
#define BTN_DRIGHT  0x0100
#define BTN_L       0x0020
#define BTN_R       0x0010
#define BTN_CUP     0x0008
#define BTN_CDOWN   0x0004
#define BTN_CLEFT   0x0002
#define BTN_CRIGHT  0x0001

/* ── Gamepad init/teardown ────────────────────────────────────────────────── */

void si_init_gamepads(void) {
    SDL_GameControllerAddMappingsFromFile("gamecontrollerdb.txt"); /* optional */
    int njoysticks = SDL_NumJoysticks();
    int pad_idx = 0;
    for (int i = 0; i < njoysticks && pad_idx < 4; i++) {
        if (SDL_IsGameController(i)) {
            s_pads[pad_idx] = SDL_GameControllerOpen(i);
            if (s_pads[pad_idx]) {
                printf("[si] Gamepad %d: %s\n", pad_idx,
                       SDL_GameControllerName(s_pads[pad_idx]));
                pad_idx++;
            }
        }
    }
    if (pad_idx == 0)
        printf("[si] No gamepad found — using keyboard for P1\n");
}

void si_close_gamepads(void) {
    for (int i = 0; i < 4; i++) {
        if (s_pads[i]) { SDL_GameControllerClose(s_pads[i]); s_pads[i] = NULL; }
    }
}

/* ── Axis → N64 stick value ──────────────────────────────────────────────── */
/* SDL axis: -32768 to +32767. N64 stick: -128 to +127. */
static i8 _axis_to_n64(i16 sdl_axis) {
    int v = (int)sdl_axis * 127 / 32767;
    if (v >  127) v =  127;
    if (v < -128) v = -128;
    return (i8)v;
}

/* Deadzone: ignore small stick movements (avoids drift) */
#define DEADZONE 4096

static i8 _axis_dead(i16 sdl_axis) {
    if (sdl_axis > -DEADZONE && sdl_axis < DEADZONE) return 0;
    return _axis_to_n64(sdl_axis);
}

/* ── Keyboard fallback for P1 ────────────────────────────────────────────── */
static void _poll_keyboard(N64Controller *c) {
    const u8 *k = SDL_GetKeyboardState(NULL);

    c->a      = k[SDL_SCANCODE_X]      != 0;
    c->b      = k[SDL_SCANCODE_Z]      != 0;
    c->z      = k[SDL_SCANCODE_LSHIFT] != 0;
    c->start  = k[SDL_SCANCODE_RETURN] != 0;

    /* D-pad */
    c->up     = k[SDL_SCANCODE_UP]     != 0;
    c->down   = k[SDL_SCANCODE_DOWN]   != 0;
    c->left   = k[SDL_SCANCODE_LEFT]   != 0;
    c->right  = k[SDL_SCANCODE_RIGHT]  != 0;

    /* Shoulder */
    c->l      = k[SDL_SCANCODE_Q]      != 0;
    c->r      = k[SDL_SCANCODE_E]      != 0;

    /* C-buttons (numpad or IJKL) */
    c->cu     = k[SDL_SCANCODE_I]      != 0;
    c->cd     = k[SDL_SCANCODE_K]      != 0;
    c->cl     = k[SDL_SCANCODE_J]      != 0;
    c->cr     = k[SDL_SCANCODE_L]      != 0;

    /* Analog stick via WASD — 80 = ~63% of max range, feels natural */
    c->stick_x = 0;
    c->stick_y = 0;
    if (k[SDL_SCANCODE_D]) c->stick_x += 80;
    if (k[SDL_SCANCODE_A]) c->stick_x -= 80;
    if (k[SDL_SCANCODE_W]) c->stick_y += 80;
    if (k[SDL_SCANCODE_S]) c->stick_y -= 80;
}

/* ── Gamepad poll for ports 0–3 ──────────────────────────────────────────── */
static void _poll_gamepad(int port, N64Controller *c) {
    SDL_GameController *pad = s_pads[port];
    if (!pad || !SDL_GameControllerGetAttached(pad)) {
        /* Gamepad disconnected mid-session — try keyboard for P1 */
        if (port == 0) _poll_keyboard(c);
        return;
    }

#define BTN(sdl_btn) SDL_GameControllerGetButton(pad, SDL_CONTROLLER_BUTTON_##sdl_btn)
#define AXIS(sdl_ax) SDL_GameControllerGetAxis(pad,  SDL_CONTROLLER_AXIS_##sdl_ax)

    c->a     = BTN(A)             != 0;
    c->b     = BTN(B)             != 0;
    c->z     = BTN(LEFTSHOULDER)  != 0;  /* LB → Z */
    c->start = BTN(START)         != 0;

    /* D-pad */
    c->up    = BTN(DPAD_UP)       != 0;
    c->down  = BTN(DPAD_DOWN)     != 0;
    c->left  = BTN(DPAD_LEFT)     != 0;
    c->right = BTN(DPAD_RIGHT)    != 0;

    /* L/R triggers as digital shoulder buttons */
    c->l     = AXIS(TRIGGERLEFT)  > 16384;
    c->r     = AXIS(TRIGGERRIGHT) > 16384;

    /* C-buttons → right stick directions (common N64 on Xbox mapping) */
    i16 rx = AXIS(RIGHTX);
    i16 ry = AXIS(RIGHTY);
    c->cu  = ry < -DEADZONE;
    c->cd  = ry >  DEADZONE;
    c->cl  = rx < -DEADZONE;
    c->cr  = rx >  DEADZONE;

    /* Analog stick */
    c->stick_x = _axis_dead(AXIS(LEFTX));
    c->stick_y = _axis_dead((i16)(-AXIS(LEFTY))); /* SDL Y is inverted vs N64 */

#undef BTN
#undef AXIS
}

/* ── Public poll ─────────────────────────────────────────────────────────── */
void si_poll_controllers(void) {
    for (int i = 0; i < 4; i++) {
        N64Controller *c = &g_controllers[i];
        memset(c, 0, sizeof(N64Controller));

        if (i == 0 && s_pads[0] == NULL) {
            /* No gamepad at all — use keyboard for P1 */
            _poll_keyboard(c);
        } else {
            _poll_gamepad(i, c);
        }
    }
}

/* ── Pack controller state into N64 joybus format ────────────────────────── */
static void _pack_controller(const N64Controller *c, u8 *out) {
    u16 buttons = 0;
    if (c->a)     buttons |= BTN_A;
    if (c->b)     buttons |= BTN_B;
    if (c->z)     buttons |= BTN_Z;
    if (c->start) buttons |= BTN_START;
    if (c->up)    buttons |= BTN_DUP;
    if (c->down)  buttons |= BTN_DDOWN;
    if (c->left)  buttons |= BTN_DLEFT;
    if (c->right) buttons |= BTN_DRIGHT;
    if (c->l)     buttons |= BTN_L;
    if (c->r)     buttons |= BTN_R;
    if (c->cu)    buttons |= BTN_CUP;
    if (c->cd)    buttons |= BTN_CDOWN;
    if (c->cl)    buttons |= BTN_CLEFT;
    if (c->cr)    buttons |= BTN_CRIGHT;

    out[0] = (buttons >> 8) & 0xFF;   /* buttons_hi */
    out[1] = (buttons)      & 0xFF;   /* buttons_lo */
    out[2] = (u8)(i8)c->stick_x;     /* X axis */
    out[3] = (u8)(i8)c->stick_y;     /* Y axis */
}

/* ── PIF RAM response builder ────────────────────────────────────────────── */
/*
 * The full 64-byte PIF RAM layout for a standard 4-controller query:
 *
 *  Byte 0:    0xFF  (command header: poll all ports)
 *  Bytes 1–4:  P1 response (4 bytes)
 *  Byte 5:    0xFE  (port 1 end)
 *  ...same pattern for P2 at 9, P3 at 17, P4 at 25...
 *  Remaining bytes: 0x00
 *
 * We write this into RDRAM at s_si_dram_addr so the game can read it.
 */
static void _build_pif_response(void) {
    u8 pif[64];
    memset(pif, 0x00, 64);

    /* Header byte */
    pif[0] = 0xFF;

    for (int i = 0; i < 4; i++) {
        int offset = JOYBUS_OFFSETS[i];
        /* Check if a controller is connected at this port */
        bool connected = (i == 0) || (s_pads[i] != NULL);
        if (connected) {
            _pack_controller(&g_controllers[i], &pif[offset]);
        } else {
            /* No controller: set error byte */
            pif[offset - 1] = 0x80;  /* device absent flag */
        }
        pif[offset + 4] = 0xFE;   /* end of port block */
    }

    /* DMA result to RDRAM */
    u32 dest = s_si_dram_addr & 0x1FFFFFFF;
    if (dest + 64 <= N64_RDRAM_SIZE) {
        memcpy(&N64_RDRAM[dest], pif, 64);
    }

    /* Signal DMA complete */
    s_si_status = SI_STATUS_INTERRUPT;
}

/* ── SI register read/write (called from hw_read32/hw_write32) ───────────── */

#define SI_BASE         0xA4800000
#define SI_DRAM_ADDR    0xA4800000
#define SI_PIF_RD64B    0xA4800010   /* trigger read from PIF */
#define SI_PIF_WR64B    0xA4800014   /* trigger write to PIF  */
#define SI_STATUS_REG   0xA480001C

bool si_handle_read(u32 vaddr, u32 *out) {
    switch (vaddr) {
        case SI_STATUS_REG:
            *out = s_si_status;
            s_si_status = 0;   /* clear interrupt on read */
            return true;
        default: return false;
    }
}

bool si_handle_write(u32 vaddr, u32 val) {
    switch (vaddr) {
        case SI_DRAM_ADDR:
            s_si_dram_addr = val;
            return true;
        case SI_PIF_RD64B:
            /* Game wants to read controller state — respond immediately */
            si_poll_controllers();
            _build_pif_response();
            return true;
        case SI_PIF_WR64B:
            /* Game writing config to PIF — ignore for now */
            return true;
        case SI_STATUS_REG:
            /* Writing to status clears interrupt */
            s_si_status &= ~SI_STATUS_INTERRUPT;
            return true;
        default: return false;
    }
}
