import { BitmapFontManager, Cache, TextStyle } from "pixi.js";

/**
 * Measure the ACTUAL rendered pixel size of bitmap text (optionally word-wrapped), so panels can be
 * sized to fit their text. Pixi reports layout width/height in the font's base units; multiply by
 * `scale` for pixels. Returns a rough single-line fallback if the font isn't cached yet.
 */
export function measureBitmapText(
  text: string,
  fontFamily: string,
  fontSize: number,
  wrapWidth?: number,
): { w: number; h: number } {
  if (!Cache.has(`${fontFamily}-bitmap`)) {
    return { w: 0, h: fontSize * 1.3 };
  }
  const layout = BitmapFontManager.measureText(
    text,
    new TextStyle({
      fontFamily,
      fontSize,
      ...(wrapWidth != null
        ? { wordWrap: true, wordWrapWidth: wrapWidth, align: "center" }
        : {}),
    }),
  );
  return { w: layout.width * layout.scale, h: layout.height * layout.scale };
}
