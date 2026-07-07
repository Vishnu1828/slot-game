import { Sound, sound, type PlayOptions } from "@pixi/sound";
import gsap from "gsap";

let audioUnlockPromise: Promise<void> | null = null;

const getAudioContext = () =>
  (sound.context as { audioContext?: AudioContext })?.audioContext;

/**
 * A class to handle background music within the game.
 * It automatically loops audio and fades between tracks.
 */
class BGM {
  /** The alias so it doesn't swap audio to the same one. */
  public currentAlias?: string;
  /** The current sound instance. */
  public current?: Sound;

  /** A global volume that affects all bgm sounds. Default 30%. */
  private _globalVolume = 0.3;
  /** An instance volume that affects the current sound. */
  private _instanceVolume = 0.15;

  /**
   * Play background music.
   * @param alias - Name of the audio file.
   * @param options - Options to be passed to the sound instance.
   */
  public async play(alias: string, options?: PlayOptions) {
    // Do nothing if the requested music is already being played
    if (this.currentAlias === alias) return;

    if (!sound.exists(alias)) {
      return;
    }

    // Browsers suspend the audio context until a user gesture (autoplay
    // policy). Resume it first, otherwise play() is silent and the music
    // never starts. Call this from within / after a user interaction.
    const audioContext = getAudioContext();
    if (audioContext && audioContext.state !== "running") {
      await audio.unlockAudioContext();
    }

    // Fade out then stop current music
    if (this.current) {
      const current = this.current;

      gsap.killTweensOf(current);
      gsap.to(current, { volume: 0, duration: 1, ease: "linear" }).then(() => {
        current.stop();
      });
    }

    // Find out the new instance to be played
    this.current = sound.find(alias);
    this.currentAlias = alias;

    // Loudness is driven by the master volume below (global × instance). Do NOT
    // forward `volume` into play(): that also sets the INSTANCE volume, so it
    // gets applied twice (instance × master) and the track ends up near-silent
    // — which looked like "the music won't play". Pull it out and use it only
    // as the instance factor for the master fade.
    const { volume: instanceVolume, ...playOptions } = options ?? {};
    this._instanceVolume = instanceVolume ?? 1;

    // Start muted, then fade in to the target (global × instance) volume.
    this.current.play({ loop: true, ...playOptions });
    this.current.volume = 0;
    gsap.killTweensOf(this.current);
    gsap.to(this.current, {
      volume: this._globalVolume * this._instanceVolume,
      duration: 1,
      ease: "linear",
    });
  }

  /**
   * Set the global volume.
   * @param v - Target volume.
   */
  public setVolume(v: number) {
    this._globalVolume = v;
    if (this.current)
      this.current.volume = this._globalVolume * this._instanceVolume;
  }

  /**
   * Get the global volume.
   */
  public getVolume() {
    return this._globalVolume;
  }
}

/**
 * A class to handle sound effects within the game.
 */
class SFX {
  /** A global volume that affects all sfx sounds. */
  private _volume = 0.5;

  /**
   * Play sound effects.
   * @param alias - Name of the audio file.
   * @param options - Options to be passed to the sound instance.
   */
  public play(alias: string, options?: PlayOptions) {
    if (!sound.exists(alias)) {
      return;
    }
    const volume = this._volume * (options?.volume ?? 1);
    const playNow = () => {
      try {
        sound.play(alias, { ...options, volume });
      } catch {
        // Some browsers may still suspend momentarily; retry once.
        setTimeout(() => {
          try {
            sound.play(alias, { ...options, volume });
          } catch (retryError) {
            console.warn("[audio] sfx.play failed:", retryError);
          }
        }, 30);
      }
    };

    const audioContext = getAudioContext();
    if (audioContext && audioContext.state !== "running") {
      void audio.unlockAudioContext().then(playNow);
      return;
    }

    playNow();
  }

  /**
   * Set the global volume.
   * @param v - Target volume.
   */
  public setVolume(v: number) {
    this._volume = v;
  }

  /**
   * Get the global volume.
   */
  public getVolume() {
    return this._volume;
  }
}

/**
 * A object to hold methods that handle certain features on the global sound instance
 */
export const audio = {
  /**
   * Mute the global sound instance.
   * @param value - The audio mute state.
   */
  muted(value: boolean) {
    if (value) sound.muteAll();
    else sound.unmuteAll();
  },
  /** Get the volume of the global sound instance. */
  getMasterVolume() {
    return sound.volumeAll;
  },
  /** Set the volume of the global sound instance.
   * @param v - The target global volume.
   */
  setMasterVolume(v: number) {
    sound.volumeAll = v;
    if (!v) {
      sound.muteAll();
    } else {
      sound.unmuteAll();
    }
  },

  /**
   * Resume WebAudio context after a user gesture.
   * Safe to call multiple times.
   */
  async unlockAudioContext() {
    const existingContext = getAudioContext();
    if (existingContext?.state === "running") {
      return;
    }

    if (audioUnlockPromise) return audioUnlockPromise;

    audioUnlockPromise = (async () => {
      try {
        const audioContext = getAudioContext();
        if (audioContext && audioContext.state !== "running") {
          await audioContext.resume();
        }
      } catch (error) {
        console.warn("[audio] unlockAudioContext failed:", error);
      } finally {
        audioUnlockPromise = null;
      }
    })();

    return audioUnlockPromise;
  },
};

/**
 * A class to handle background music within the game.
 * It automatically loops audio and fades between tracks.
 */
export const bgm = new BGM();
/**
 * A class to handle sound effects within the game.
 */
export const sfx = new SFX();
