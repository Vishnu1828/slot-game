import { Assets, type Texture } from "pixi.js";
import PixiContainer from "../pixi/PixiContainer";
import { PixiSprite } from "../pixi/PixiSprite";
import { PixiGameAnimation } from "../pixi/PixiGameAnimation";
import ReelGrid from "./ReelGrid";
import { useScreen } from "@/hooks/useScreen";
import { REEL } from "@/constants/reel";
import type { Rect } from "@/utils/reelCells";
import type { ReelArt } from "@/types/theme";

const CORNER_KEYS = ["tl", "tr", "bl", "br"] as const;

export interface ReelFrameProps {
  /** Per-game reel descriptor (theme.reel): frame/bg art, grid shape, decorative animations. */
  reel: ReelArt;
  /** Optional symbols to show in the grid (rows × cols aliases). Omit for the empty scaffold. */
  symbols?: (string | undefined)[][];
}

/**
 * Reusable, data-driven slot playfield: ornate frame + purple reel background + a rows×cols symbol
 * grid + theme-driven corner/edge animations. Self-positioning (centered, sized per layout mode);
 * portrait uses the vertical art, landscape/desktop the horizontal. All decoration positions are
 * FRAME-local, so they track the frame at any size. Renders nothing until the frame texture loads.
 */
export function ReelFrame({ reel, symbols }: ReelFrameProps) {
  const { w, h, mode, portrait } = useScreen();
  const o = portrait ? reel.vertical : reel.horizontal;

  const frameTex = Assets.get<Texture>(o.frame);
  if (!frameTex) return null; // need the frame's aspect to lay everything out

  // Fit the frame inside the per-mode box, preserving its texture aspect; then center it.
  const s = REEL[mode];
  const aspect = frameTex.width / frameTex.height;
  let fw = s.widthFrac * w;
  let fh = fw / aspect;
  if (fh > s.heightFrac * h) {
    fh = s.heightFrac * h;
    fw = fh * aspect;
  }
  const cx = w / 2;
  const cy = s.centerYFrac * h;
  const frameRect: Rect = { x: cx - fw / 2, y: cy - fh / 2, w: fw, h: fh };

  // Symbol grid opening = frame minus its border insets. Pure fractions → scales with the frame.
  const inner: Rect = {
    x: frameRect.x + o.inset.left * fw,
    y: frameRect.y + o.inset.top * fh,
    w: fw * (1 - o.inset.left - o.inset.right),
    h: fh * (1 - o.inset.top - o.inset.bottom),
  };

  // BG = the opening expanded by the theme's fractional `bleed`, so the purple tucks under the
  // frame's inner border with no gap. Fractional → adapts to any frame size, tuned per theme.
  const b = o.bleed ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const bg: Rect = {
    x: inner.x - b.left * fw,
    y: inner.y - b.top * fh,
    w: inner.w + (b.left + b.right) * fw,
    h: inner.h + (b.top + b.bottom) * fh,
  };

  // Corner animations → the frame corners. `sameForAll` lights all 4; `perCorner` lights only the
  // corners present (a subset, e.g. top-only). Each is nudged INWARD by its `inset` (onto the gem).
  const cornerPt = {
    tl: [frameRect.x, frameRect.y, 1, 1],
    tr: [frameRect.x + fw, frameRect.y, -1, 1],
    bl: [frameRect.x, frameRect.y + fh, 1, -1],
    br: [frameRect.x + fw, frameRect.y + fh, -1, -1],
  } as const;
  const corners = reel.corners;
  const cornerAnims = !corners
    ? []
    : CORNER_KEYS.flatMap((k) => {
        const anim =
          "sameForAll" in corners ? corners.sameForAll : corners.perCorner[k];
        if (!anim) return [];
        const [px, py, sx, sy] = cornerPt[k];
        const d = (anim.inset ?? 0) * fw;
        return [{ key: k, anim, cx: px + sx * d, cy: py + sy * d }];
      });

  return (
    <PixiContainer>
      {/* Purple reel background — the opening plus the theme's bleed (tucked under the frame border). */}
      <PixiSprite texture={o.bg} x={bg.x} y={bg.y} width={bg.w} height={bg.h} />

      {/* Symbol grid (empty until `symbols` is supplied). */}
      <ReelGrid
        innerRect={inner}
        rows={reel.rows}
        cols={reel.cols}
        symbols={symbols}
      />

      {/* Ornate frame on top — its transparent center shows the grid; edges cover bg/symbol edges. */}
      <PixiSprite
        texture={frameTex}
        anchor={0.5}
        x={cx}
        y={cy}
        width={fw}
        height={fh}
      />

      {/* Corner animations (theme-driven; square, sized as a fraction of frame width). */}
      {cornerAnims.map(({ key, anim, cx: ax, cy: ay }) => (
        <PixiGameAnimation
          key={key}
          sheet={anim.sheet}
          x={ax}
          y={ay}
          width={anim.sizeFrac * fw}
          height={anim.sizeFrac * fw}
          anchor={0.5}
          loop
          animationSpeed={anim.animationSpeed ?? 0.4}
        />
      ))}

      {/* Extra animations at arbitrary frame-relative spots (e.g. top-center). */}
      {reel.extraAnimations?.map((e, i) => {
        const width = e.widthFrac * fw;
        return (
          <PixiGameAnimation
            key={`extra-${i}`}
            sheet={e.sheet}
            x={frameRect.x + e.xFrac * fw}
            y={frameRect.y + e.yFrac * fh}
            width={width}
            height={width / e.aspect}
            anchor={0.5}
            loop
            animationSpeed={e.animationSpeed ?? 0.4}
          />
        );
      })}
    </PixiContainer>
  );
}

export default ReelFrame;
