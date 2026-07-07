import Background from "../../components/ui/Background";
import PixiContainer from "../../components/pixi/PixiContainer";
import { useScreen } from "@/hooks/useScreen";
import Footer from "@/components/ui/Footer";

export function GameScreen() {
  const { portrait } = useScreen();
  const balance = 100000;
  const totalBet = 5;

  return (
    <PixiContainer>
      <Background bgTexture={portrait ? "bg_vertical" : "bg_horizontal"} />
      <Footer balance={balance} totalBet={totalBet} />
    </PixiContainer>
  );
}

export default GameScreen;
