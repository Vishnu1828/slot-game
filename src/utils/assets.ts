import { Assets } from "pixi.js";

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

/** Is this alias loaded? Warning-free, unlike a truthiness check on `Assets.get`. */
export const hasAsset = (alias: string): boolean => Assets.cache.has(alias);
