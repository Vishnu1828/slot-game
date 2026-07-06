import { useMemo } from 'react'
import { extend } from '@pixi/react'
import {
  BitmapText,
  Cache,
  type ColorSource,
  type PointData,
  type TextStyleOptions,
} from 'pixi.js'

// Register <pixiBitmapText> as a JSX element (idempotent — safe to call from every module).
extend({ BitmapText })

export interface PixiBitmapTextProps {
  /** The text to render (numbers are coerced to string, handy for scores/win amounts). */
  text: string | number
  /**
   * Bitmap font family. MUST equal the `.fnt`'s internal `face` name, and the font must already
   * be loaded (e.g. via the asset bundle) before this renders — see `hideUntilFontReady`.
   */
  font: string
  /**
   * Font size in px. Bitmap fonts scale from their native size: MSDF fonts stay crisp at any
   * size, plain bitmap fonts soften when enlarged past their baked size.
   */
  size?: number
  align?: 'left' | 'center' | 'right' | 'justify'
  lineHeight?: number
  letterSpacing?: number
  /** Enable word-wrapping and wrap at this pixel width. Omit for single-line text. */
  maxWidth?: number

  // ---- transform / display (pass-through to the underlying BitmapText) ----
  x?: number
  y?: number
  /** 0..1 — a single number for both axes, or `{ x, y }`. Default 0 (top-left). */
  anchor?: number | PointData
  /** Multiplies the glyph atlas color (0xffffff = unchanged). Use for recoloring, e.g. win gold. */
  tint?: ColorSource
  alpha?: number
  angle?: number
  rotation?: number
  scale?: number | PointData
  visible?: boolean

  /**
   * If the bitmap font isn't installed yet, render nothing instead of letting Pixi silently
   * substitute a wrong fallback font. Default true. Re-renders automatically once the parent
   * re-renders after the font finishes loading.
   */
  hideUntilFontReady?: boolean
}

/**
 * Reusable wrapper around Pixi's BitmapText for @pixi/react. Turns a flat, ergonomic prop set
 * into the `{ text, style, ...transform }` shape the raw `<pixiBitmapText>` expects, and guards
 * against rendering before the font is loaded.
 *
 * @example
 * <PixiBitmapText text="Loading..." font="roulette_title_font_mobile" size={34} anchor={0.5} />
 * <PixiBitmapText text={winAmount} font="chip_font" size={48} tint={0xffd21e} anchor={0.5} />
 */
export function PixiBitmapText({
  text,
  font,
  size = 24,
  align,
  lineHeight,
  letterSpacing,
  maxWidth,
  hideUntilFontReady = true,
  ...transform
}: PixiBitmapTextProps) {
  const style = useMemo<TextStyleOptions>(
    () => ({
      fontFamily: font,
      fontSize: size,
      ...(align ? { align } : {}),
      ...(lineHeight != null ? { lineHeight } : {}),
      ...(letterSpacing != null ? { letterSpacing } : {}),
      ...(maxWidth != null ? { wordWrap: true, wordWrapWidth: maxWidth } : {}),
    }),
    [font, size, align, lineHeight, letterSpacing, maxWidth],
  )

  // Pixi caches a loaded bitmap font under `${fontFamily}-bitmap`. If it isn't there yet, skip
  // rendering so we never flash a substituted DOM-font fallback.
  if (hideUntilFontReady && !Cache.has(`${font}-bitmap`)) return null

  return <pixiBitmapText text={String(text)} style={style} {...transform} />
}

export default PixiBitmapText
