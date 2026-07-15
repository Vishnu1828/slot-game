import { commonTheme } from "@/constants/commonTheme";
import { measureBitmapText } from "./measureBitmapText";

export const BUTTON_DEFAULT_TEXT_SIZE = 16;
export const BUTTON_DEFAULT_PADDING_X = 32; // space between the label and each rounded cap
export const BUTTON_DEFAULT_FONT = commonTheme.fonts.alexandria_semibold;

export interface ButtonMetrics {
  textSize?: number;
  paddingX?: number;
  /** Minimum width; defaults to `height * 2` (so short labels stay pill-shaped). */
  minWidth?: number;
  height?: number;
  font?: string;
}

/**
 * The display width a Button will take for a given label — exported so callers (e.g. PopupModal)
 * can lay out a row of self-sizing buttons. Must use the SAME options the Button is rendered with.
 */
export function measureButtonWidth(
  label: string,
  o: ButtonMetrics = {},
): number {
  const textSize = o.textSize ?? BUTTON_DEFAULT_TEXT_SIZE;
  const paddingX = o.paddingX ?? BUTTON_DEFAULT_PADDING_X;
  const font = o.font ?? BUTTON_DEFAULT_FONT;
  const minWidth = o.minWidth ?? (o.height ? o.height * 2 : 0);
  const textW = measureBitmapText(label, font, textSize).w;
  return Math.max(minWidth, Math.ceil(textW + 2 * paddingX));
}
