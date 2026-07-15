import SettingsDrawer from "./SettingsDrawer";
import Stepper from "./Stepper";
import {
  useGameControlsStore,
  BET_LINES,
  MIN_BET,
  MAX_BET,
  MIN_COINS_PER_LINE,
  MAX_COINS_PER_LINE,
  MIN_COIN_VALUE,
  MAX_COIN_VALUE,
} from "@/store/useGameControlsStore";

export interface BettingScreenProps {
  onClose: () => void;
}

/**
 * Betting settings: Coins per line, Coin value, and Total bet steppers, plus a BET MAX button. Total
 * bet is the shared footer `bet`; coins per line and coin value are independent placeholders (no
 * payline math yet). All chrome/layout lives in SettingsDrawer; this just declares the rows.
 */
export function BettingScreen({ onClose }: BettingScreenProps) {
  const bet = useGameControlsStore((s) => s.bet);
  const increaseBet = useGameControlsStore((s) => s.increaseBet);
  const decreaseBet = useGameControlsStore((s) => s.decreaseBet);
  const coinsPerLine = useGameControlsStore((s) => s.coinsPerLine);
  const increaseCoinsPerLine = useGameControlsStore(
    (s) => s.increaseCoinsPerLine,
  );
  const decreaseCoinsPerLine = useGameControlsStore(
    (s) => s.decreaseCoinsPerLine,
  );
  const coinValue = useGameControlsStore((s) => s.coinValue);
  const increaseCoinValue = useGameControlsStore((s) => s.increaseCoinValue);
  const decreaseCoinValue = useGameControlsStore((s) => s.decreaseCoinValue);
  const betMax = useGameControlsStore((s) => s.betMax);

  return (
    <SettingsDrawer
      title={`BETTING ON ${BET_LINES} LINES`}
      onClose={onClose}
      footer={{ label: "BET MAX", onPress: betMax }}
      sections={[
        {
          label: "Coins per line",
          render: (r) => (
            <Stepper
              value={coinsPerLine}
              onDecrease={decreaseCoinsPerLine}
              onIncrease={increaseCoinsPerLine}
              decDisabled={coinsPerLine <= MIN_COINS_PER_LINE}
              incDisabled={coinsPerLine >= MAX_COINS_PER_LINE}
              {...r}
            />
          ),
        },
        {
          label: "Coin value",
          render: (r) => (
            <Stepper
              value={`$${coinValue}`}
              onDecrease={decreaseCoinValue}
              onIncrease={increaseCoinValue}
              decDisabled={coinValue <= MIN_COIN_VALUE}
              incDisabled={coinValue >= MAX_COIN_VALUE}
              {...r}
            />
          ),
        },
        {
          label: "Total bet",
          render: (r) => (
            <Stepper
              value={`$${bet}`}
              onDecrease={decreaseBet}
              onIncrease={increaseBet}
              decDisabled={bet <= MIN_BET}
              incDisabled={bet >= MAX_BET}
              {...r}
            />
          ),
        },
      ]}
    />
  );
}

export default BettingScreen;
