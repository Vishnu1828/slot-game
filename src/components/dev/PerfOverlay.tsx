import { useEffect, useRef, useState } from "react";
import { Container, Sprite, type Application, type TextureSource } from "pixi.js";
import { activeTier } from "@/assets/loader";

/**
 * TEMPORARY diagnostic overlay — built to find the mobile "Aw, Snap!" crashes, and meant to be deleted
 * once they are understood.
 *
 * TO REMOVE: delete this file and the three lines it added to `App.tsx` (the import, the `onInit`, and
 * the `<PerfOverlay />` sibling). Nothing else references it.
 *
 * ## Why a DOM overlay rather than Pixi text
 *
 * The failure being chased is the renderer dying. Anything drawn *by* Pixi goes black at exactly the
 * moment the numbers matter, and a phone has no console to fall back on — so this renders as plain HTML
 * over the canvas, and the context-lost banner stays visible after WebGL is gone.
 *
 * ## Visibility
 *
 * Stats are OFF unless the URL carries `?perf=1` (or `localStorage.perf = "1"`), so this can ship to
 * production without players seeing it — open the same link with `?perf=1` on the device that crashes.
 *
 * The context-lost banner is **always armed**, because that event is the crash signal and is worth
 * catching in any session. It costs one listener and nothing else.
 *
 * ## Reading the numbers
 *
 * `Texture Memory` is the estimate that matters on mobile: a texture costs `width × height × 4` bytes of
 * GPU memory once decoded, regardless of how small the compressed file was. A 2 MB `.webp` at 3910×3519
 * occupies ~52 MB live. **PEAK is the number to watch** — a crash happens at the peak, which has usually
 * passed by the time you look at the screen.
 */

/** Set by `App.tsx` via `<Application onInit={capturePerfApp}>`. */
let appInstance: Application | null = null;
// Exported from a component file purely so this whole diagnostic is ONE file to delete; splitting it to
// satisfy fast-refresh would leave a stray module behind when it is removed.
// eslint-disable-next-line react-refresh/only-export-components
export const capturePerfApp = (app: Application) => {
  appInstance = app;
};

/**
 * Deliberately forgiving about how it is switched on — a diagnostic you cannot turn on is worthless, and
 * this gets typed by hand on a phone keyboard. All of these work:
 *   ?perf=1   ?perf   #perf   localStorage.setItem("perf", "1")
 */
const enabled = (): boolean => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("perf") && params.get("perf") !== "0") return true;
    if (window.location.hash.replace("#", "") === "perf") return true;
    return window.localStorage.getItem("perf") === "1";
  } catch {
    return false; // private-mode localStorage can throw; never let diagnostics break the app
  }
};

interface Stats {
  fps: number;
  heapMb: number | null;
  textures: number;
  textureMb: number;
  peakTextureMb: number;
  sprites: number;
  containers: number;
  /** The single biggest live texture — usually the thing to shrink first. */
  biggest: { w: number; h: number; mb: number } | null;
}

const mb = (bytes: number) => bytes / 1048576;

/**
 * Bytes a source occupies on the GPU. Mipmapped textures carry their smaller levels too, which adds
 * about a third — worth including, since it is real memory and mipmaps are on by default for loose art.
 */
function sourceBytes(source: TextureSource): number {
  const base = source.pixelWidth * source.pixelHeight * 4;
  const mipmapped =
    (source as TextureSource & { mipLevelCount?: number }).mipLevelCount ?? 1;
  return mipmapped > 1 ? base * 1.33 : base;
}

/** Count the live display objects by walking the stage once. */
function countNodes(root: Container): { sprites: number; containers: number } {
  let sprites = 0;
  let containers = 0;
  const walk = (node: Container) => {
    if (node instanceof Sprite) sprites += 1;
    else containers += 1;
    for (const child of node.children) walk(child as Container);
  };
  walk(root);
  return { sprites, containers };
}

export function PerfOverlay() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const peakRef = useRef(0);
  const show = enabled();

  // Say once, out loud, whether this thing is on. "I added ?perf=1 and saw nothing" is otherwise
  // indistinguishable from "the overlay never mounted".
  useEffect(() => {
    console.log(
      `[perf] overlay mounted — enabled=${show}  url=${window.location.href}`,
    );
  }, [show]);

  // Context loss — armed regardless of `?perf=1`, since it is the crash signal itself. `preventDefault`
  // is what allows the browser to attempt a restore rather than leaving the canvas dead.
  //
  // The canvas does NOT exist on first render: <Application> initialises asynchronously, so `appInstance`
  // is still null here. Poll briefly until it appears, then attach and stop.
  useEffect(() => {
    let canvas: HTMLCanvasElement | null = null;
    const onLost = (e: Event) => {
      e.preventDefault();
      console.error("[perf] WEBGL CONTEXT LOST — the GPU dropped this page's textures");
      setContextLost(true);
    };
    const onRestored = () => {
      console.warn("[perf] WEBGL CONTEXT RESTORED");
      setContextLost(false);
    };
    const attach = () => {
      if (canvas || !appInstance?.canvas) return;
      canvas = appInstance.canvas;
      canvas.addEventListener("webglcontextlost", onLost);
      canvas.addEventListener("webglcontextrestored", onRestored);
      window.clearInterval(poll);
    };
    const poll = window.setInterval(attach, 250);
    attach();
    return () => {
      window.clearInterval(poll);
      canvas?.removeEventListener("webglcontextlost", onLost);
      canvas?.removeEventListener("webglcontextrestored", onRestored);
    };
  }, []);

  // Sample once a second. Cheap enough to leave running, slow enough not to distort what it measures.
  useEffect(() => {
    if (!show) return;
    const sample = () => {
      const app = appInstance;
      if (!app) return;

      // `managedTextures` is what is actually uploaded to the GPU — not what sits in the asset cache,
      // which is the distinction that matters when hunting an out-of-memory kill.
      const sources: TextureSource[] =
        (app.renderer as { texture?: { managedTextures?: TextureSource[] } })
          .texture?.managedTextures ?? [];

      let bytes = 0;
      let biggest: Stats["biggest"] = null;
      for (const source of sources) {
        const size = sourceBytes(source);
        bytes += size;
        if (!biggest || size > biggest.mb * 1048576) {
          biggest = { w: source.pixelWidth, h: source.pixelHeight, mb: mb(size) };
        }
      }
      peakRef.current = Math.max(peakRef.current, mb(bytes));

      const { sprites, containers } = countNodes(app.stage);
      const heap = (
        performance as Performance & { memory?: { usedJSHeapSize: number } }
      ).memory?.usedJSHeapSize;

      setStats({
        fps: Math.round(app.ticker.FPS),
        heapMb: heap != null ? mb(heap) : null, // Chromium only; null elsewhere
        textures: sources.length,
        textureMb: mb(bytes),
        peakTextureMb: peakRef.current,
        sprites,
        containers,
        biggest,
      });
    };
    sample();
    const id = window.setInterval(sample, 1000);
    return () => window.clearInterval(id);
  }, [show]);

  if (!show && !contextLost) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 99999,
        pointerEvents: "none", // never intercept a tap meant for the game
        font: "12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "#d7ffd7",
        background: "rgba(0,0,0,0.72)",
        padding: "6px 9px",
        borderBottomRightRadius: 8,
        whiteSpace: "pre",
      }}
    >
      {contextLost && (
        <div style={{ color: "#ff6b6b", fontWeight: 700, marginBottom: 4 }}>
          {"WEBGL CONTEXT LOST\n(GPU dropped the textures — this is the crash)"}
        </div>
      )}
      {/* Shown until the first sample lands, so an enabled overlay is NEVER blank — a blank corner and a
          disabled overlay look identical, and that ambiguity costs more than the extra line. */}
      {!stats && !contextLost && "perf: waiting for renderer…"}
      {stats && (
        <>
          {`FPS            : ${stats.fps}\n`}
          {/* Which resolution tier the asset resolver picked. Chosen from screen size and reported RAM
              (src/assets/loader.ts), neither of which can be faked in devtools — so on the device that
              actually crashes, this line is the only way to know art is not silently loading at 4K.
              Override it with `?tier=0.5` to compare. */}
          {`Asset tier     : @${activeTier()}x\n`}
          {`JS Heap        : ${stats.heapMb == null ? "n/a" : `${stats.heapMb.toFixed(0)} MB`}\n`}
          {`Textures       : ${stats.textures}\n`}
          {`Texture Memory : ${stats.textureMb.toFixed(0)} MB\n`}
          <span style={{ color: "#ffd76b" }}>
            {`  PEAK         : ${stats.peakTextureMb.toFixed(0)} MB\n`}
          </span>
          {`Sprites        : ${stats.sprites}\n`}
          {`Containers     : ${stats.containers}`}
          {stats.biggest &&
            `\nBiggest tex    : ${stats.biggest.w}x${stats.biggest.h} (${stats.biggest.mb.toFixed(0)} MB)`}
        </>
      )}
    </div>
  );
}

export default PerfOverlay;
