# Responsive layout — the scale-to-fit design canvas

How this game stays pixel-faithful to the Figma on **every** screen (iPhone 12 Pro, SE, tablet,
desktop, ultrawide) without CSS media queries. Read this before you add or move any on-screen element.

---

## The problem it solves

PixiJS has no media queries (`sm` / `md` / `xl`). Our first layout gave every component its own
per-device math — a **mix** of height-fractions, width-fractions, and fixed pixels — all hand-tuned to
one device (iPhone 12 Pro). That looks perfect on the 12 Pro and **collides everywhere else**:

- **Portrait, iPhone SE:** header overlapped the reel frame. The vertical gap between them was a
  *height*-fraction (`0.28·h`) but the header + frame eating it were *width*-fractions (`0.594·w`).
  On a shorter phone the height budget shrinks while the width-sized elements don't → −36px overlap.
  It was positive by only **4.6px** on the 12 Pro — literally tuned to that one screen.
- **Landscape:** the spin button (fixed 87px from the right) marched inward faster than the frame edge
  (fraction `0.75·w`) as the viewport narrowed, and its fractional Y (`0.42·h`) dropped it onto the
  reels.

**Root cause:** every element was a free sibling with no shared coordinate system, so nobody owned the
space between them, and fixed-vs-fractional units drifted apart at different aspect ratios.

---

## The fix: design once, scale the whole scene

Lay the entire UI out **once**, in a **fixed coordinate space** (the Figma / iPhone-12-Pro size), then
uniformly **scale that whole space** to fit the real screen and center it. Every device then renders a
*proportionally-identical* copy of the design, so **collisions become mathematically impossible** — if
two elements don't overlap in the design, they can't overlap at any size.

```
real screen (e.g. 375×667)         design canvas (390×844)
┌──────────────┐                   ┌───────────────┐
│  ┌────────┐  │   scale = min(    │   [ LOGO ]    │
│  │[LOGO]  │  │     375/390,      │  ╭─────────╮  │  ← lay everything out here,
│  │ REELS  │  │     667/844)      │  │  REELS  │  │    in fixed 390×844 coords
│  │(−)◉(+) │  │   = 0.79          │  ╰─────────╯  │
│  │[○][○][○]│ │   → centered      │  (−) ◉ (+)    │
│  └────────┘  │                   │  [○] [○] [○]  │
└──────────────┘                   └───────────────┘
   background art fills any leftover margin (letterbox)
```

- **Aspect ratio is the only thing that matters** in the design size; the absolute px just define the
  coordinate space components use.
- On aspect ratios far from the design (tablet 4:3, ultrawide 21:9) the scaled canvas is centered and
  the **themed background fills the margins** — the game never shows black bars or a broken layout.

---

## The pieces

| File | Role |
|---|---|
| [`src/constants/design.ts`](../src/constants/design.ts) | `DESIGN[mode]` — the fixed canvas size per orientation (portrait / mobile-landscape / desktop). |
| [`src/hooks/useStage.ts`](../src/hooks/useStage.ts) | Returns the **design** `w`/`h` (as if the screen were exactly the canvas) plus `scale`, `offsetX/Y`, `mode`. Derived from `useScreen()`. |
| [`src/components/pixi/DesignStage.tsx`](../src/components/pixi/DesignStage.tsx) | One container that applies `scale` + centering offset. Wrap design-space UI in it. |
| [`src/components/pixi/OverlayScrim.tsx`](../src/components/pixi/OverlayScrim.tsx) | Full-screen dim backdrop sized to the **real** screen, so overlays dim the whole viewport (incl. margins). |
| [`src/hooks/useScreen.ts`](../src/hooks/useScreen.ts) | Unchanged — still reports the **real** window size + `mode`. Use it only for things pinned to the real screen. |

`DesignStage` is just:
```tsx
const { scale, offsetX, offsetY } = useStage();
return <PixiContainer x={offsetX} y={offsetY} scale={scale}>{children}</PixiContainer>;
```
Pixi propagates the transform to hit-testing, so buttons inside stay clickable — no extra work.

---

## The one rule: `useStage()` vs `useScreen()`

- **Inside a `DesignStage`** (all game UI, all overlay content) → size/position with **`useStage()`**.
  Its `w`/`h` are the fixed design canvas, so your fractions/px mean the same thing on every device.
- **Pinned to the real screen** (cover-fit background, background decor, overlay scrims) → **`useScreen()`**.
  These live *outside* the stage and must cover the actual viewport.

That's the whole mental model. If you follow it, new elements inherit the no-collision guarantee.

---

## How to add / change things

**A new UI element on the game screen**
1. Build it reading `useStage()` for `w`/`h`/`mode`.
2. Add it inside the `<DesignStage>` in the game screen (see
   [`GameScreen.tsx`](../src/game/fortune-teller/GameScreen.tsx)).
3. Position it in design coordinates (e.g. `x = w/2`, `y = h - 120`). It will scale automatically.

**A new overlay / modal / drawer**
```tsx
return (
  <PixiContainer>
    <OverlayScrim alpha={0.6} />       {/* real screen — dims everything, blocks clicks */}
    <DesignStage>
      {/* panel content, laid out with useStage() */}
    </DesignStage>
  </PixiContainer>
);
```
A non-blocking transient (like `Toast`) skips the scrim and just uses `<DesignStage>`.

**Change the design size** (e.g. designer hands over a different desktop frame)
Edit [`design.ts`](../src/constants/design.ts). Only the **aspect ratio** changes the result. After a
change, do a quick visual pass of that mode.

**Add a dedicated tablet layout later**
Tablet currently reuses the phone canvas centered with background margins. If the designer supplies a
real tablet layout, add a mode + canvas entry — no architectural change.

---

## Common pitfalls

- **Element still collides / drifts** → it's reading `useScreen()` instead of `useStage()`, or it's
  rendered *outside* the `DesignStage`. Move it inside and switch the hook.
- **Modal content isn't centered / is the wrong size on tablet** → its panel is using `useScreen()`
  (real px) but sitting inside `DesignStage`. Switch it to `useStage()`.
- **Background bars aren't dimmed behind an overlay** → the scrim is inside `DesignStage` (so it only
  covers the canvas). Use `<OverlayScrim>` *outside* the stage (real screen).
- **Background/decor looks scaled or cropped wrong** → those must stay **outside** `DesignStage` and use
  `useScreen()` + the cover transform (`src/utils/cover.ts`).
- **Desktop looks slightly off after this change** → desktop is now a fixed `1280×720` space (not the
  live window). Tune `CONTROLS.desktop` / `REEL.desktop`, or set the desktop size in `design.ts` to the
  real Figma desktop frame.
- **Reaching for a `min-width`/breakpoint** → you don't need one. Adjust the per-mode design size or the
  per-mode sizing tables (`CONTROLS`, `REEL`, …); the scaler handles the rest.
