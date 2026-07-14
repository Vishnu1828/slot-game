import PixiLayout from "../pixi/PixiLayout";
import PixiBitmapText from "../pixi/PixiBitmapText";
import { commonTheme } from "@/constants/commonTheme";

export interface StatBlockProps {
  /** Small dim caption, e.g. "Balance". Rendered in Inter-Regular. */
  label: string;
  /** Bold value, e.g. "$100.000". Rendered in Inter-Bold. */
  value: string;
}

/**
 * A label-over-value stat, as used in the footer (Balance, Total Bet). Label in Inter-Regular,
 * value in Inter-Bold, stacked in a small column via layout.
 */
export function StatBlock({ label, value }: StatBlockProps) {
  return (
    <PixiLayout layout={{ flexDirection: "column", alignItems: "flex-start" }}>
      <PixiBitmapText
        text={label}
        font={commonTheme.fonts.regular}
        size={12}
        tint={0xb8bcc8}
        layout={{}}
      />
      <PixiBitmapText
        text={value}
        font={commonTheme.fonts.bold}
        size={16}
        tint={0xffffff}
        layout={{}}
      />
    </PixiLayout>
  );
}

export default StatBlock;
