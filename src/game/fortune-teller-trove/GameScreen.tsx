import Background from "../../components/ui/Background";
import PixiContainer from "../../components/pixi/PixiContainer";
import Header from "@/components/ui/Header";
import SpinButton from "@/components/ui/SpinButton";
import Footer from "@/components/ui/Footer";
import { useScreen } from "@/hooks/useScreen";
import { getTheme } from "../registry";

const theme = getTheme("fortune-teller-trove");

export function GameScreen() {
  const { w, h, portrait } = useScreen();
  const balance = 100000;
  const totalBet = 5;
  console.log("theme", theme);

  return (
    <PixiContainer>
      <Background
        bgTexture={portrait ? theme.background_v : theme.background_h}
      />

      {/* Themed chrome — art comes from this game's theme descriptor */}
      <Header art={theme.header} />
      <SpinButton art={theme.spin} x={w / 2} y={h - 120} size={96} />

      <Footer balance={balance} totalBet={totalBet} />
    </PixiContainer>
  );
}

export default GameScreen;
