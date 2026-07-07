import { Suspense } from "react";
import { GAMES, isGameId, type GameId } from "@/game/registry";
import { useNavigationStore } from "@/store/useNavigationStore";

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
  // const activeOverlay = useNavigationStore((s) => s.activeOverlay); // enable when overlays exist

  const GameScreen = isGameId(game) ? GAMES[game]?.Screen : undefined;

  return (
    <>
      {currentScreen === "game" && GameScreen && (
        <Suspense fallback={null}>
          <GameScreen />
        </Suspense>
      )}

      {/* Common overlays (shared across all games) — add as their screens are built:
          {activeOverlay === "info" && <InfoScreen />}
          {activeOverlay === "quit" && <QuitWarningPopUp />}
          {activeOverlay === "inactive" && <InactiveWarningPopUp />}
          {activeOverlay === "balance" && <BalanceWarningPopUp />}
          {activeOverlay === "repeat-insufficient" && <RepeatBetWarningPopUp />}
          <Toast /> */}
    </>
  );
};

export default PixiNavigation;
