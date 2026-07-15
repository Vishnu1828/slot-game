import PixiContainer from "../pixi/PixiContainer";
import { PixiSprite } from "../pixi/PixiSprite";
import PixiBitmapText from "../pixi/PixiBitmapText";
import { commonTheme } from "@/constants/commonTheme";

export interface SegmentedOption<T> {
  label: string;
  value: T;
}

export interface SegmentedTabsProps<T> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Top-left of the row. */
  x: number;
  y: number;
  /** Total row width (split evenly across options) and segment height. */
  width: number;
  height: number;
  font?: string;
  textSize?: number;
}

/**
 * Reusable segmented selector built from the `tabs` box art. The pieces tile into one rounded bar:
 * first = left cap, last = right cap, any in-between = middle (so 2 options → left+right, 3 →
 * left+middle+right, and so on). The selected segment shows its `.active` texture. Segments are plain
 * (stretched) sprites — the box art lives in an atlas, so nine-slice is intentionally NOT used.
 */
export function SegmentedTabs<T>({
  options,
  value,
  onChange,
  x,
  y,
  width,
  height,
  font = commonTheme.fonts.alexandria_semibold,
  textSize = 16,
}: SegmentedTabsProps<T>) {
  const n = options.length;
  const step = width / n;
  // Each segment is drawn later than the previous one, so extending every inner segment a few px past
  // its slot lets the NEXT segment's border sit on top of the previous segment's border — one shared
  // divider line instead of two borders with a gap between them.
  const overlap = Math.round(step * 0.02);

  return (
    <PixiContainer x={x} y={y}>
      {options.map((opt, i) => {
        const piece =
          i === 0
            ? commonTheme.tabs.left
            : i === n - 1
              ? commonTheme.tabs.right
              : commonTheme.tabs.middle;
        const selected = opt.value === value;
        // Integer-rounded slot bounds (avoids sub-pixel gaps); inner segments extend by `overlap`.
        const start = Math.round(i * step);
        const end =
          i === n - 1
            ? Math.round(width)
            : Math.round((i + 1) * step) + overlap;
        return (
          <PixiContainer key={i}>
            <PixiSprite
              texture={selected ? piece.active : piece.idle}
              x={start}
              y={0}
              width={end - start}
              height={height}
              eventMode="static"
              cursor="pointer"
              onPointerTap={() => onChange(opt.value)}
            />
            <PixiBitmapText
              text={opt.label}
              font={font}
              size={textSize}
              tint={0xffffff}
              anchor={0.5}
              x={Math.round(i * step + step / 2)}
              y={height / 2}
            />
          </PixiContainer>
        );
      })}
    </PixiContainer>
  );
}

export default SegmentedTabs;
