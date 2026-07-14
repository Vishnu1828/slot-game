import Background from "../../components/ui/Background";
import PixiContainer from "../../components/pixi/PixiContainer";
import Header from "@/components/ui/Header";
import Controls from "@/components/ui/Controls";
import Footer from "@/components/ui/Footer";
import { useScreen } from "@/hooks/useScreen";
import { getTheme } from "../registry";
import { useGameControlsStore } from "@/store/useGameControlsStore";

const theme = getTheme("fortune-teller-trove");

export function GameScreen() {
  const { portrait } = useScreen();
  const balance = 100000; // TODO: from server state (React Query) once wired
  const totalBet = useGameControlsStore((s) => s.bet);

  return (
    <PixiContainer>
      <Background
        bgTexture={portrait ? theme.background_v : theme.background_h}
      />

      {/* Themed chrome — art comes from this game's theme descriptor */}
      <Header art={theme.header} />

      {/* Game controls: spin + bet +/- + autoplay + speed + bet-settings */}
      <Controls spin={theme.spin} />

      <Footer balance={balance} totalBet={totalBet} />
    </PixiContainer>
  );
}

export default GameScreen;
