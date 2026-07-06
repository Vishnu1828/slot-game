import { sound } from '@pixi/sound'
import PixiContainer from '../../components/pixi/PixiContainer'
import PixiLayout from '../../components/pixi/PixiLayout'
import PixiNineSliceSprite from '../../components/pixi/PixiNineSliceSprite'
import IconButton from '../../components/pixi/IconButton'
import StatBlock from './StatBlock'
import { useScreen } from '../useScreen'
import { useNavigationStore } from '../../store/useNavigationStore'
import { formatMoney } from '../../utils/format'

// Design constants — tune once the real `footer` texture size is known.
const BAR_H = 64 // footer bar height (px)
const PAD_X = 24 // horizontal inner padding
const ICON = 44 // icon button size
const LEFT_GAP = 28 // gap between Balance and Total Bet
const RIGHT_GAP = 12 // gap between icon buttons
// Nine-slice insets for the `footer` frame: corners kept, middle stretched to full width.
const INSET_X = 48
const INSET_Y = 24

export interface FooterProps {
  balance: number
  totalBet: number
}

/**
 * Bottom HUD bar: full-width `footer` frame (nine-slice) with Balance + Total Bet on the left and
 * sound / info / exit icon buttons on the right. Re-fits to the viewport width on resize/rotate.
 */
export function Footer({ balance, totalBet }: FooterProps) {
  const { w, h } = useScreen()
  const showOverlay = useNavigationStore((s) => s.showOverlay)

  return (
    <PixiContainer x={0} y={h - BAR_H}>
      {/* Background frame — stretches to full width, corners/border stay crisp */}
      <PixiNineSliceSprite
        texture="footer"
        leftWidth={INSET_X}
        rightWidth={INSET_X}
        topHeight={INSET_Y}
        bottomHeight={INSET_Y}
        width={w}
        height={BAR_H}
      />

      {/* Content row on top of the frame */}
      <PixiLayout
        layout={{
          width: w,
          height: BAR_H,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingLeft: PAD_X,
          paddingRight: PAD_X,
        }}
      >
        {/* Left: stats */}
        <PixiLayout layout={{ flexDirection: 'row', alignItems: 'center', gap: LEFT_GAP }}>
          <StatBlock label="Balance" value={formatMoney(balance)} />
          <StatBlock label="Total Bet" value={formatMoney(totalBet)} />
        </PixiLayout>

        {/* Right: controls */}
        <PixiLayout layout={{ flexDirection: 'row', alignItems: 'center', gap: RIGHT_GAP }}>
          <IconButton
            icon="sound_idle"
            size={ICON}
            layout={{ width: ICON, height: ICON }}
            onPress={() => sound.toggleMuteAll()}
          />
          <IconButton
            icon="info_idle"
            size={ICON}
            layout={{ width: ICON, height: ICON }}
            onPress={() => showOverlay('info')}
          />
          <IconButton
            icon="exit_idle"
            size={ICON}
            layout={{ width: ICON, height: ICON }}
            onPress={() => showOverlay('quit')}
          />
        </PixiLayout>
      </PixiLayout>
    </PixiContainer>
  )
}

export default Footer
