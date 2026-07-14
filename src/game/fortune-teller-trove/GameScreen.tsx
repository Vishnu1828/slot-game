import Background from "../../components/ui/Background";
import PixiContainer from "../../components/pixi/PixiContainer";
import Header from "@/components/ui/Header";
import SpinButton from "@/components/ui/SpinButton";
import Footer from "@/components/ui/Footer";
import { useScreen } from "@/hooks/useScreen";
import { getTheme } from "../registry";
import { useToastStore } from "@/store/useToastStore";
import { commonTheme } from "@/constants/commonTheme";

const theme = getTheme("fortune-teller-trove");

export function GameScreen() {
  const { w, h, portrait } = useScreen();
  const balance = 100000;
  const totalBet = 5;
  console.log("theme", theme);
  const showToast = useToastStore((s) => s.showToast);
  return (
    <PixiContainer>
      <Background
        bgTexture={portrait ? theme.background_v : theme.background_h}
      />

      {/* Themed chrome — art comes from this game's theme descriptor */}
      <Header art={theme.header} />
      <SpinButton
        art={theme.spin}
        x={w / 2}
        y={h - 120}
        size={96}
        onPress={() => {
          showToast("BET INCREASED TO $3", {
            icon: commonTheme.buttons.exit.idle,
            durationMs: 5000,
          });
        }}
      />

      <Footer balance={balance} totalBet={totalBet} />
    </PixiContainer>
  );
}

export default GameScreen;
