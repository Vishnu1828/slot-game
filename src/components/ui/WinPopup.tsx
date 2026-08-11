import { useCallback, useRef, useState } from "react";
import { extend, useTick } from "@pixi/react";
import { Container, type Ticker } from "pixi.js";
import PixiContainer from "../pixi/PixiContainer";
import PixiBitmapText from "../pixi/PixiBitmapText";
import { PixiSprite } from "../pixi/PixiSprite";
import PixiGameAnimation from "../pixi/PixiGameAnimation";
import DesignStage from "../pixi/DesignStage";
import OverlayScrim from "../pixi/OverlayScrim";
import { useStage } from "@/hooks/useStage";
import { reelFrameRect } from "@/utils/reelCells";
import { REEL } from "@/constants/reel";
import { formatGuarani } from "@/utils/format";
import type { ReelArt, WinAnimation } from "@/types/theme";

// Register <pixiContainer> for direct JSX use (event handlers aren't on the wrapper's typed props).
extend({ Container });

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * Aspect (width / height) of the win frame art — 1850x685. The panel is a fixed-aspect decorative
 * piece: its gold rail is only ~2% of the width at the sides but ~13% of the height top/bottom, and it
 * carries ornate flourishes CENTRED on the top and bottom edges. So it is drawn as a plain sprite and
 * never nine-sliced (nine-slice stretches the middle band, which is exactly where those flourishes are).
 */
const FRAME_ASPECT = 1850 / 685;

/**
 * The popup is sized against the SLOT FRAME, not the screen: the celebration is meant to land on the
 * slot, so both are derived from `reelFrameRect` and stay locked together at any window size. The whole
 * composite (celebration + panel) is fit into `WIDTH_OF_REEL` of the frame's width and its full height,
 * then centred on it.
 */
const WIDTH_OF_REEL = 0.75;

/* Text metrics as fractions of PANEL HEIGHT, matched to the reference comp: the title reads larger
 * than the amount, both sitting inside the gold rail (~13% of the height top and bottom). */
const TITLE_SIZE_FRAC = 0.35;
const AMOUNT_SIZE_FRAC = 0.25;
/** Baseline centres, as fractions of panel height from its top edge. */
const TITLE_Y_FRAC = 0.3;
const AMOUNT_Y_FRAC = 0.6;

/** Scale-up entrance (ms). */
const SCALE_MS = 300;
/** Count-up from 0 to the win amount (ms). */
const COUNT_MS = 2000;
/**
 * Default time for ONE full pass of the celebration — it runs alongside the entrance and count-up and
 * lands its final frame exactly as the number does. Every frame in the sheet is shown regardless of how
 * many there are (`PixiGameAnimation` derives speed from the frame count), and a game whose art wants a
 * livelier or slower read overrides it with `winAnimation.durationMs`.
 */
const ANIM_MS = SCALE_MS + COUNT_MS;
/**
 * How long the settled popup stays on screen before it starts leaving (ms) — measured from the moment
 * the popup has actually SETTLED (see `settledAt`), not from mount, so the player always gets the full
 * 3s reading the final amount no matter how long the celebration ran.
 */
const HOLD_MS = 3000;
/** Fade + settle out, so the popup dissolves instead of being cut mid-frame (ms). */
const FADE_MS = 600;
/** Ignore taps for this long so a tap that triggered the spin can't dismiss the popup instantly. */
const SKIP_LOCK_MS = 400;

export interface WinPopupProps {
  /** Total win amount in tokens. */
  winTokens: number;
  /** Bitmap font family (theme's `font`) — must be the .fnt's internal `face` name. */
  font: string;
  /** Panel image alias (theme's `winFrame`). */
  winFrame: string;
  /** Celebration animation behind the panel (theme's `winAnimation`). Omit → panel only. */
  winAnimation?: WinAnimation;
  /** Reel art (theme's `reel`) — the popup is sized and centred on the slot frame's box. */
  reel: ReelArt;
  /** Called when the popup should close (auto-dismiss or tap). */
  onDone: () => void;
}

/**
 * Animated win popup — the game's celebration animation with the themed panel over it, a "YOU WIN!"
 * title, and the amount counting up from 0. Scales up on entrance, auto-dismisses after a hold, and can
 * be tapped to skip. Laid out in DESIGN-canvas units inside a <DesignStage> so it scales as one piece
 * with the reel frame; only the dim backdrop stays at real-screen size.
 *
 * Motion is driven by one `useTick` that mutates the Pixi objects through refs — never per-frame React
 * state, so the tree doesn't re-render 60x/second (same pattern as `Toast` and `PaylineOverlay`).
 */
export function WinPopup({
  winTokens,
  font,
  winFrame,
  winAnimation,
  reel,
  onDone,
}: WinPopupProps) {
  const { w, h, mode, portrait } = useStage();

  // ---- sizing: fit the whole composite to the slot frame ----
  // Lay the composite out in units of panelW = 1 first, so its bounds are known before a size is
  // chosen; then one scale factor fits those bounds to the slot and everything derives from it.
  const panelHU = 1 / FRAME_ASPECT;
  const animWU = winAnimation ? (winAnimation.widthFrac ?? 1) : 0;
  const animHU = winAnimation ? animWU / winAnimation.aspect : 0;
  const animCYU = winAnimation ? (winAnimation.offsetYFrac ?? 0) * panelHU : 0;
  const topU = Math.min(-panelHU / 2, animCYU - animHU / 2);
  const bottomU = Math.max(panelHU / 2, animCYU + animHU / 2);
  const compWU = Math.max(1, animWU);
  const compHU = bottomU - topU;

  // The slot frame's box. Until its texture resolves, fall back to the same per-mode policy box
  // without the aspect correction — never the whole canvas, which would size the popup absurdly.
  const s = REEL[mode];
  const slot = reelFrameRect(reel, mode, portrait, w, h) ?? {
    x: (w * (1 - s.widthFrac)) / 2,
    y: s.centerYFrac * h - (s.heightFrac * h) / 2,
    w: s.widthFrac * w,
    h: s.heightFrac * h,
  };

  const panelW = Math.min((WIDTH_OF_REEL * slot.w) / compWU, slot.h / compHU);
  const panelH = panelW / FRAME_ASPECT;
  const titleSize = panelH * TITLE_SIZE_FRAC;
  const amountSize = panelH * AMOUNT_SIZE_FRAC;
  const animW = animWU * panelW;

  // Centre the COMPOSITE (not the panel) on the slot — the animation sits above the panel, so the
  // panel's own centre is below the composite's.
  const cx = slot.x + slot.w / 2;
  const cy = slot.y + slot.h / 2 - ((topU + bottomU) / 2) * panelW;

  // ---- timeline ----
  // The celebration can outlast the count-up (a game sets its own `durationMs`), so the popup has only
  // SETTLED once BOTH have landed — holding from the earlier of the two would spend part of the 3s with
  // the animation still running.
  const animMs = winAnimation?.durationMs ?? ANIM_MS;
  const settledAt = Math.max(SCALE_MS + COUNT_MS, animMs);
  const fadeAt = settledAt + HOLD_MS;
  const totalMs = fadeAt + FADE_MS;

  const rootRef = useRef<Container>(null);
  const amountRef = useRef<Container>(null);
  const elapsed = useRef(0);
  const shown = useRef(-1); // last amount pushed to the text, so we only re-render on change
  const done = useRef(false);

  // The counting number is the one thing that has to go through React — `text` is a prop, not a
  // mutable display value. Guarded by `shown` below so it updates only when the integer changes.
  const [amount, setAmount] = useState(0);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    onDone();
  }, [onDone]);

  const skip = useCallback(() => {
    if (elapsed.current < SKIP_LOCK_MS) return;
    finish();
  }, [finish]);

  useTick((ticker: Ticker) => {
    if (done.current) return;
    elapsed.current += ticker.deltaMS;
    const t = elapsed.current;

    // Entrance: ease-out cubic scale 0 -> 1. Exit: the popup eases away and fades out over the last
    // FADE_MS instead of being cut mid-frame — a hard unmount after a frozen last frame reads as a hang.
    const root = rootRef.current;
    if (root) {
      const inP = Math.min(1, t / SCALE_MS);
      const outP = clamp((t - fadeAt) / FADE_MS, 0, 1);
      root.scale.set((1 - Math.pow(1 - inP, 3)) * (1 - 0.06 * outP));
      root.alpha = 1 - outP * outP; // ease-in: holds visible, then drops away
    }

    // Count-up: ease-out quad, pushed to React only when the displayed integer actually changes.
    const cp = clamp((t - SCALE_MS) / COUNT_MS, 0, 1);
    const next = Math.round((1 - Math.pow(1 - cp, 2)) * winTokens);
    if (next !== shown.current) {
      shown.current = next;
      setAmount(next);
    }

    // A gentle pulse on the amount once it has landed, so the final figure reads as the payoff.
    const amt = amountRef.current;
    if (amt) {
      const s =
        cp >= 1
          ? 1 + 0.06 * Math.sin((2 * Math.PI * (t - SCALE_MS - COUNT_MS)) / 700)
          : 1;
      amt.scale.set(s);
    }

    if (t >= totalMs) finish();
  });

  return (
    <PixiContainer>
      {/* Dim backdrop — covers the real screen and blocks input to the game underneath. */}
      <OverlayScrim />

      <DesignStage>
        {/* Scaled popup, centred. Raw pixiContainer because the wrapper doesn't type pointer handlers.
            `scale` is mutated by the ticker, so it is deliberately NOT passed as a prop here. */}
        <pixiContainer
          ref={rootRef}
          x={cx}
          y={cy}
          scale={0}
          eventMode="static"
          cursor="pointer"
          onPointerTap={skip}
        >
          {/* Celebration animation FIRST so the panel and text draw over it — the frame is meant to
              overlap the art. Exactly one pass, every frame, finishing as the amount lands; the popup
              then fades rather than freezing on the last frame. */}
          {winAnimation && (
            <PixiGameAnimation
              sheet={winAnimation.sheets}
              animation={winAnimation.animation}
              x={0}
              y={animCYU * panelW}
              width={animW}
              height={animW / winAnimation.aspect}
              loop={true}
              durationMs={winAnimation.durationMs ?? ANIM_MS}
            />
          )}

          {/* Panel — plain sprite at the art's own aspect, centred on the container origin. */}
          <PixiSprite
            texture={winFrame}
            anchor={0.5}
            x={0}
            y={0}
            width={panelW}
            height={panelH}
          />

          <PixiBitmapText
            text="You Win!"
            font={font}
            size={titleSize}
            tint={0xffd700}
            anchor={0.5}
            x={0}
            y={-panelH / 2 + panelH * TITLE_Y_FRAC}
          />

          {/* Amount wrapped in a container so the ticker can scale it without remounting the text
              (PixiBitmapText re-keys itself whenever `size` changes). */}
          <PixiContainer
            ref={amountRef}
            x={0}
            y={-panelH / 2 + panelH * AMOUNT_Y_FRAC}
          >
            <PixiBitmapText
              text={formatGuarani(amount)}
              font={font}
              size={amountSize}
              tint={0xffd700}
              anchor={0.5}
            />
          </PixiContainer>
        </pixiContainer>
      </DesignStage>
    </PixiContainer>
  );
}

export default WinPopup;
