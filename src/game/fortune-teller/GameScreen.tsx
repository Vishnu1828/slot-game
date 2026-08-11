import { type Texture } from "pixi.js";
import { getAsset } from "@/utils/assets";
import Background from "../../components/ui/Background";
import PixiContainer from "../../components/pixi/PixiContainer";
import Header from "@/components/ui/Header";
import Controls from "@/components/ui/Controls";
import Footer from "@/components/ui/Footer";
import WinPopup from "@/components/ui/WinPopup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScreen } from "@/hooks/useScreen";
import { useGameControlsStore, BET_LINES } from "@/store/useGameControlsStore";
import { useNavigationStore, isModalOverlay } from "@/store/useNavigationStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useRoundStore } from "@/store/useRoundStore";
import { useReelSpin } from "../useReelSpin";
import { useMathConfig } from "@/api/useMathConfig";
import { useSpin } from "@/api/useSpin";
import { useBalance } from "@/api/useBalance";
import { buildStrips } from "@/game/math/engine";
import type { SpinResult } from "@/game/math/types";
import { formatGuarani } from "@/utils/format";
import GameState from "@/components/ui/GameState";
import { PixiGameAnimation } from "@/components/pixi/PixiGameAnimation";
import DecorAnimation from "@/components/ui/DecorAnimation";
import ReelFrame, { type SymbolAnimControl } from "@/components/ui/ReelFrame";
import SpinningBall from "./SpinningBall";
import ReelLandingBounce from "./ReelLandingBounce";
import { winningCells } from "@/utils/symbolAnimations";
import { PAYLINE_MS, PAYLINE_CYCLES } from "@/constants/winPresentation";
import { useWinPresentation } from "../useWinPresentation";
import DesignStage from "@/components/pixi/DesignStage";
import SceneBlur from "@/components/pixi/SceneBlur";
import { anchorToScreen } from "@/utils/cover";
import {
  CANDLE_FX,
  CANDLE_FY,
  CANDLE_ART_W,
  CANDLE_ASPECT,
  BG_W,
  BG_H,
  LAMP_X_FRAC,
  LAMP_H_FRAC,
  LAMP_Y_FRAC,
  LAMP_ASPECT,
  CHANDELIER_X_FRAC,
  CHANDELIER_Y_FRAC,
  CHANDELIER_H_FRAC,
  CHANDELIER_ASPECT,
  theme,
} from "./constant";

export function GameScreen() {
  const { w, h, portrait } = useScreen();
  const totalBet = useGameControlsStore((s) => s.bet);
  const autoplay = useGameControlsStore((s) => s.autoplay);
  const speed = useGameControlsStore((s) => s.speed);
  const showOverlay = useNavigationStore((s) => s.showOverlay);
  const activeOverlay = useNavigationStore((s) => s.activeOverlay);

  // Wallet: React Query fetches the server balance; we hydrate the Zustand wallet once, then mutate it
  // live (deduct on spin, credit on win). Balance is TOKENS (1 token = ₲1.000).
  const { data: serverBalance } = useBalance();
  const balance = useWalletStore((s) => s.balance);
  const hydrated = useWalletStore((s) => s.hydrated);
  const setBalance = useWalletStore((s) => s.setBalance);
  const deduct = useWalletStore((s) => s.deduct);
  const credit = useWalletStore((s) => s.credit);
  useEffect(() => {
    if (!hydrated && serverBalance != null) setBalance(serverBalance);
  }, [hydrated, serverBalance, setBalance]);

  // Last spin result (for the win line + any future win UI), stored so it's readable app-wide.
  const lastResult = useRoundStore((s) => s.lastResult);
  const settleRound = useRoundStore((s) => s.settleRound);

  // Math config + spin engine (React Query seam — local now, swap to the server later).
  const { data: config } = useMathConfig("fortune-teller");

  // The reels travel the REAL per-reel strips (50/55/60/55/55 here), so what scrolls past is always a
  // genuine consecutive slice of that reel in its true symbol frequencies — the same data the engine
  // pays from. Built once per config; buildStrips also validates the partition and warns on
  // provisional reels, so both the engine and the animation must share this one array.
  const strips = useMemo(() => buildStrips(config), [config]);
  const stripAliases = useMemo(
    () =>
      strips.map((reel) => reel.map((id) => theme.symbols[id]?.asset ?? "")),
    [strips],
  );

  const spinMutation = useSpin(config, strips);
  const requestSpin = useCallback(
    (betPerLineTokens: number) =>
      spinMutation.mutateAsync({ betPerLineTokens }),
    [spinMutation],
  );

  // `useWinPresentation` needs `isSpinning` from `useReelSpin`, and `useReelSpin` needs to call back into
  // the presentation the moment a result arrives — a cycle. A ref breaks it: `useReelSpin` reads its
  // options at fire time, so the indirection costs nothing and the order of the two hooks stays free.
  const prefetchWinRef = useRef<((result: SpinResult) => void) | null>(null);

  const { spinId, finalStops, isSpinning, spin, handleSettled } = useReelSpin({
    reelLengths: config.reelLengths,
    balance,
    bet: totalBet,
    betPerLineTokens: totalBet / BET_LINES,
    requestSpin,
    onInsufficient: () => showOverlay("repeat-insufficient"),
    onCommit: (bet) => deduct(bet), // remove the stake at spin start
    onAbort: (bet) => credit(bet), // refund if the request fails
    // Result known, reels still spinning: start pulling the celebration art now. Player-invisible —
    // it only warms the cache, so the outcome stays secret until the reels land.
    onResult: (result) => prefetchWinRef.current?.(result),
    onSettle: (result) => {
      credit(result.totalWinTokens); // pay the win when the reels stop
      settleRound(result); // stores it AND starts the win presentation when it paid
    },
  });

  // Win presentation (lines glow -> win screen -> idle). Shared across all games; the phase itself
  // lives in `useRoundStore` so the overlay and the win screen can read it too.
  const { phase, dismiss, prefetchWin } = useWinPresentation(isSpinning, theme);
  useEffect(() => {
    prefetchWinRef.current = prefetchWin;
  });

  // Blur the scene behind anything modal — the win screen, and any overlay that blocks the game. The
  // landscape settings/rules cards are deliberately excluded: they stay playable, so blurring the game
  // under them would fight that (see `isModalOverlay`).
  const sceneBlurred =
    phase === "popup" || isModalOverlay(activeOverlay, portrait);

  // The best-paying line of the last spin (drives the win row's symbol icon + "LINE n PAYS …").
  const topWin = useMemo(() => {
    const wins = lastResult?.wins ?? [];
    if (wins.length === 0) return null;
    return wins.reduce((best, w) =>
      w.amountTokens > best.amountTokens ? w : best,
    );
  }, [lastResult]);

  // Status line: "GOOD LUCK!" while spinning; a win row (total + symbol + line) for as long as the win
  // is being PRESENTED; else the default "PLACE YOUR BET!". Gating the win row on `phase` rather than on
  // `lastResult` is what makes it revert once the win screen closes — `lastResult` is kept on purpose.
  const status: { message?: string; icon?: string; detail?: string } =
    isSpinning
      ? { message: "GOOD LUCK!" }
      : phase !== "none" && topWin
        ? {
            message: `YOU WON ${formatGuarani(lastResult?.totalWinTokens ?? 0)}`,
            icon: theme.symbols[topWin.symbolId]?.asset,
            detail: `LINE ${topWin.lineId + 1} PAYS ${formatGuarani(topWin.amountTokens)}`,
          }
        : {};

  // Per-symbol animations for the current beat. `bounce` hits as the reels land, then `winning` runs
  // alongside the payline glow; every other phase animates nothing.
  //
  // The winning cells are de-duped, so a cell paying on two lines animates ONCE rather than twice at
  // double brightness. `winning` loops with a duration of one glow cycle, so it breathes in step with the
  // lines (`PAYLINE_CYCLES` times across the beat) off the same constants.
  const symbolAnims: SymbolAnimControl | undefined = useMemo(() => {
    if (phase !== "paylines") return undefined;
    const cells = winningCells(lastResult?.wins ?? []);
    if (cells.length === 0) return undefined;
    return {
      kind: "winning",
      cells,
      symbols: theme.symbols,
      durationMs: PAYLINE_MS / PAYLINE_CYCLES,
      runId: `${spinId}-winning`,
    };
  }, [phase, lastResult, spinId]);

  // Which reels have landed this spin — appended by `Reels` as each one comes home, cleared when the
  // next spin starts. Drives the staggered landing bounce.
  const [landedCols, setLandedCols] = useState<number[]>([]);
  useEffect(() => {
    if (isSpinning) setLandedCols([]);
  }, [isSpinning]);
  const onReelLanded = useCallback(
    (col: number) => setLandedCols((prev) => [...prev, col]),
    [],
  );

  // Anchor the flame to the candles by mapping the art fraction through the SAME cover transform
  // the Background uses, so it tracks the candles as the screen resizes. Landscape/desktop only.
  const bg = getAsset<Texture>(theme.background_h);
  const { x, y, scale } = anchorToScreen(
    CANDLE_FX,
    CANDLE_FY,
    w,
    h,
    bg?.width ?? BG_W,
    bg?.height ?? BG_H,
  );

  return (
    <PixiContainer>
      {/* Everything a modal overlay sits ON TOP of. Wrapped so it can be blurred as a unit — which
          is also why WinPopup is a sibling below rather than a child: inside here it would blur too. */}
      <SceneBlur active={sceneBlurred}>
        <Background
          bgTexture={portrait ? theme.background_v : theme.background_h}
        />
        {!portrait && (
          <PixiGameAnimation
            sheet="candle_light"
            x={-(CANDLE_ART_W * scale) / 0.235 + x}
            y={-(CANDLE_ART_W * scale * CANDLE_ASPECT) / 1.1 + y}
            width={CANDLE_ART_W * scale}
            height={CANDLE_ART_W * scale * CANDLE_ASPECT}
            anchor={{ x: 0.5, y: 0.85 }} // flame base sits on the wick
            loop
            animationSpeed={0.4}
          />
        )}
        {/* Hanging lanterns — landscape/desktop (hung from the top-right). */}
        {!portrait && (
          <DecorAnimation
            sheet="hanging_lamps"
            xFrac={LAMP_X_FRAC}
            yFrac={LAMP_Y_FRAC}
            heightFrac={LAMP_H_FRAC}
            aspect={LAMP_ASPECT}
          />
        )}
        {/* Chandelier — portrait (hung from the top-center). */}
        {portrait && (
          <DecorAnimation
            sheet="chandelier"
            xFrac={CHANDELIER_X_FRAC}
            yFrac={CHANDELIER_Y_FRAC}
            heightFrac={CHANDELIER_H_FRAC}
            aspect={CHANDELIER_ASPECT}
            animationSpeed={0.7}
          />
        )}
        {/* UI cluster — laid out in the fixed DESIGN canvas (useStage) and uniformly scaled to fit.
            Background + decor above stay at REAL screen size so art fills any letterbox margins. */}
        <DesignStage>
          {/* Slot playfield: frame + reel bg + symbol grid + theme-driven decor animations. */}
          <ReelFrame
            reel={theme.reel}
            reels={{
              strips: stripAliases,
              spinId,
              stops: finalStops,
              speed,
              onSettled: handleSettled,
              onReelLanded,
            }}
            paylines={{
              lines: config.lines,
              // Only during the `paylines` beat: the line clears when the win screen opens, and
              // `lastResult` persists after a spin so it must never leak into the next one.
              wins: phase === "paylines" ? (lastResult?.wins ?? []) : [],
              runId: spinId,
            }}
            symbolAnims={symbolAnims}
          />
          {/* Landing feedback: each reel bounces its own symbols as it comes home, every spin. */}
          <ReelLandingBounce
            reel={theme.reel}
            strips={strips}
            stops={finalStops}
            symbols={theme.symbols}
            landedCols={landedCols}
            spinId={spinId}
          />
          {/* Crystal ball on the frame's top-centre orb — after ReelFrame so it draws over the frame
              art. Always on screen; it only turns while the reels do. */}
          {isSpinning && (
            <SpinningBall reel={theme.reel} spinning={isSpinning} />
          )}
          {/* Themed chrome — art comes from this game's theme descriptor */}
          <Header art={theme.header} />
          {/* Game controls: spin + bet +/- + autoplay + speed + bet-settings */}
          <Controls
            spin={theme.spin}
            // The hook runs the pre-spin credit check and shows INSUFFICIENT CREDIT when short, and
            // no-ops during a run. Clearing a presentation still on screen is `useWinPresentation`'s job.
            onSpin={spin}
            // Disabled through the win presentation too, so a spin can't skip past the glow and the win
            // screen, and for the whole of an autoplay run — the autoplay button is the stop control now.
            spinDisabled={autoplay || isSpinning || phase !== "none"}
          />
        </DesignStage>

        {/* Footer bar — full REAL screen width, pinned to the real bottom (chrome, not letterboxed). */}
        <Footer balance={balance} totalBet={totalBet} />
        <GameState
          message={status.message}
          icon={status.icon}
          detail={status.detail}
        />
      </SceneBlur>

      {/* Win screen — opens once the payline animation has had its PAYLINE_MS. Deliberately OUTSIDE
          SceneBlur: it's what the blurred scene sits behind, so it must stay sharp. */}
      {phase === "popup" && (
        <WinPopup
          winTokens={lastResult?.totalWinTokens ?? 0}
          font={theme.font}
          winFrame={theme.winFrame}
          winAnimation={theme.winAnimation}
          reel={theme.reel}
          onDone={dismiss}
        />
      )}
    </PixiContainer>
  );
}

export default GameScreen;
