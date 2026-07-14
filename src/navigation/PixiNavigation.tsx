import { Suspense } from "react";
import { GAMES, isGameId, type GameId } from "@/game/registry";
import { useNavigationStore } from "@/store/useNavigationStore";
import InfoScreen from "@/components/ui/InfoScreen";

export interface PixiNavigationProps {
  /** The active game id — selects which game's screen renders (see src/game/registry.ts). */
  game: GameId;
}

/**
 * Routes what's on screen from store state. The GAME screen is looked up by `game` in the registry
 * (so each game renders its own screen), while overlays (info/quit/…) and Toast are COMMON to all
 * games and rendered here regardless of which game is active.
 */
const PixiNavigation = ({ game }: PixiNavigationProps) => {
  const currentScreen = useNavigationStore((s) => s.currentScreen);
  const activeOverlay = useNavigationStore((s) => s.activeOverlay);
  const hideOverlay = useNavigationStore((s) => s.hideOverlay);

  const GameScreen = isGameId(game) ? GAMES[game]?.Screen : undefined;

  return (
    <>
      {currentScreen === "game" && GameScreen && (
        <Suspense fallback={null}>
          <GameScreen />
        </Suspense>
      )}

      {/* Common overlays (shared across all games), drawn on top of the game screen. */}
      {activeOverlay === "info" && <InfoScreen onClose={hideOverlay} />}

      {/* Add as their screens are built:
          {activeOverlay === "quit" && <QuitWarningPopUp />}
          {activeOverlay === "inactive" && <InactiveWarningPopUp />}
          {activeOverlay === "balance" && <BalanceWarningPopUp />}
          {activeOverlay === "repeat-insufficient" && <RepeatBetWarningPopUp />}
          <Toast /> */}
    </>
  );
};

export default PixiNavigation;
