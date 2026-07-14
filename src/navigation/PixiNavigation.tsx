import { Suspense } from "react";
import { GAMES, isGameId, type GameId } from "@/game/registry";
import { useNavigationStore } from "@/store/useNavigationStore";
import { useToastStore } from "@/store/useToastStore";
import InfoScreen from "@/components/ui/InfoScreen";
import PopupModal from "@/components/ui/PopupModal";
import Toast from "@/components/ui/Toast";

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
  const toast = useToastStore((s) => s.toast);
  const clearToast = useToastStore((s) => s.clearToast);

  // Show the "ARE YOU STILL THERE" popup after a stretch of no user activity.
  // add this back in once full code done
  // useInactivityOverlay();

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

      {/* Modal popups — all share the reusable PopupModal (title + message + buttons). */}
      {activeOverlay === "quit" && (
        <PopupModal
          title="ARE YOU SURE YOU WANT TO QUIT?"
          message="All chips on the table will be cleared."
          buttons={[
            { label: "NO", variant: "secondary", onPress: hideOverlay },
            // TODO: wire "back to lobby" to real lobby navigation once it exists.
            { label: "YES, BACK TO LOBBY", onPress: hideOverlay },
          ]}
        />
      )}

      {activeOverlay === "balance" && (
        <PopupModal
          title="YOU'VE RUN OUT OF MONEY"
          message="Add more to your balance to continue playing."
          buttons={[{ label: "GO BACK TO LOBBY", onPress: hideOverlay }]}
        />
      )}

      {activeOverlay === "inactive" && (
        <PopupModal
          title="ARE YOU STILL THERE"
          message="Game paused due to inactivity."
          buttons={[{ label: "CONTINUE PLAYING", onPress: hideOverlay }]}
        />
      )}

      {/* Transient toasts ("BET INCREASED / SPEED ENABLED"). Keyed by id so re-showing restarts
          the fade. Drive via useToastStore.getState().showToast(...). */}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          icon={toast.icon}
          durationMs={toast.durationMs}
          onDone={clearToast}
        />
      )}

      {/* Add as it's specced:
          {activeOverlay === "repeat-insufficient" && <PopupModal … />} */}
    </>
  );
};

export default PixiNavigation;
