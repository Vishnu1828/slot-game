import { Assets, type Spritesheet, type Texture } from "pixi.js";

/**
 * `Assets.get` for aliases that MAY not be loaded yet.
 *
 * Pixi's cache treats a miss as a mistake and logs `[Assets] Asset id <id> was not found in the
 * Cache` on every one. Here a miss is routine and expected: components render before their bundle
 * resolves, win-presentation art is demand-loaded and freed per beat (`game/winAssets.ts`), and
 * `PixiGameAnimation` probes several alias spellings to find out which exporter produced a sheet.
 * Every one of those is a normal "not yet / not this one", and left on `Assets.get` they bury the
 * real warnings under hundreds of lines of console noise.
 *
 * `Cache.has` is the same lookup on the same map without the warning, so this is `Assets.get` minus
 * the shouting. Use `Assets.get` directly only where a miss is genuinely a bug.
 */
export const getAsset = <T = unknown>(alias: string): T | undefined =>
  Assets.cache.has(alias) ? Assets.cache.get<T>(alias) : undefined;

/**
 * Has any part of this asset's GPU memory been destroyed?
 *
 * Being in the cache is not the same as being usable. `Assets.unload` removes the cache entry and destroys
 * the texture, but if an unload lands on a load that is still IN FLIGHT the two interleave badly:
 * `Cache.remove` runs first and finds nothing (the load has not finished), then `loader.unload` awaits that
 * same load, the load's own continuation wins the race and calls `Cache.set`, and only then does the unload
 * destroy the texture. The alias is left in the cache pointing at a dead `TextureSource`, and nothing will
 * ever clean it up.
 *
 * The consequences are exactly the "win animation sometimes doesn't show" symptom: `PixiGameAnimation`
 * builds its frames over `atlas.source`, whose `pixelWidth` is now 0, so every frame rect collapses and the
 * sprite draws nothing — silently, with no error. Worse, a sprite still bound to a destroyed source makes
 * the renderer bind a deleted GL texture, which is a route to losing the WebGL context outright.
 *
 * So liveness has to be part of "is this loaded", or `ensureSheets` skips re-fetching a sheet that can never
 * render again and the symbol stays broken for the rest of the session.
 */
const isDead = (asset: unknown): boolean => {
  if (!asset || typeof asset !== "object") return false;

  const texture = asset as Partial<Texture>;
  if (texture.destroyed) return true;
  // A destroyed source leaves the Texture object itself intact, so it has to be checked separately.
  if (texture.source && (texture.source.destroyed || texture.source.pixelWidth === 0)) return true;

  // A Spritesheet holds its own reference; its textures are worthless once the shared source is gone.
  const sheet = asset as Partial<Spritesheet>;
  if (sheet.textureSource && (sheet.textureSource.destroyed || sheet.textureSource.pixelWidth === 0))
    return true;

  return false;
};

/**
 * Is this alias loaded AND still usable? Warning-free, unlike a truthiness check on `Assets.get`.
 *
 * Reports `false` for a cached-but-destroyed asset (see `isDead`), which is what lets a lost load/unload
 * race repair itself on the next attempt instead of leaving the art permanently missing.
 */
export const hasAsset = (alias: string): boolean =>
  Assets.cache.has(alias) && !isDead(Assets.cache.get(alias));
