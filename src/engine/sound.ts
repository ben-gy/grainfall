/**
 * sound.ts — procedural Web Audio SFX, zero asset files (adapted from patterns/).
 * Call sfx.unlock() from the first user gesture, then sfx.play('harvest').
 */

export type SfxName =
  | 'click'
  | 'slide'
  | 'harvest'
  | 'rats'
  | 'plague'
  | 'starve'
  | 'year'
  | 'coin'
  | 'reign'
  | 'fail';

interface Patch {
  type: OscillatorType;
  /** [startFreq, endFreq] Hz — glides between them over `dur`. */
  freq: [number, number];
  dur: number;
  gain?: number;
  /** Add a short noise burst (rats scurry / plague). */
  noise?: boolean;
}

const PATCHES: Record<SfxName, Patch> = {
  click: { type: 'triangle', freq: [440, 560], dur: 0.05, gain: 0.16 },
  slide: { type: 'sine', freq: [360, 400], dur: 0.03, gain: 0.08 },
  harvest: { type: 'triangle', freq: [520, 990], dur: 0.28, gain: 0.22 },
  rats: { type: 'sawtooth', freq: [220, 90], dur: 0.22, gain: 0.16, noise: true },
  plague: { type: 'sine', freq: [180, 70], dur: 0.6, gain: 0.3, noise: true },
  starve: { type: 'sine', freq: [300, 150], dur: 0.4, gain: 0.22 },
  year: { type: 'triangle', freq: [392, 588], dur: 0.22, gain: 0.18 },
  coin: { type: 'square', freq: [740, 1180], dur: 0.1, gain: 0.16 },
  reign: { type: 'triangle', freq: [523, 1046], dur: 0.6, gain: 0.26 },
  fail: { type: 'sawtooth', freq: [330, 70], dur: 0.7, gain: 0.3 },
};

export interface Sfx {
  unlock(): void;
  play(name: SfxName): void;
  muted(): boolean;
  setMuted(m: boolean): void;
}

export function createSfx(initialMuted = false): Sfx {
  let ctx: AudioContext | null = null;
  let muted = initialMuted;

  const ensure = (): AudioContext | null => {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };

  const noiseBuffer = (ac: AudioContext, dur: number): AudioBuffer => {
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  };

  return {
    unlock() {
      ensure();
    },
    play(name) {
      if (muted) return;
      const ac = ensure();
      if (!ac) return;
      const p = PATCHES[name];
      const t0 = ac.currentTime;
      const g = ac.createGain();
      g.gain.setValueAtTime(p.gain ?? 0.2, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.dur);
      g.connect(ac.destination);

      const osc = ac.createOscillator();
      osc.type = p.type;
      osc.frequency.setValueAtTime(p.freq[0], t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, p.freq[1]), t0 + p.dur);
      osc.connect(g);
      osc.start(t0);
      osc.stop(t0 + p.dur);

      if (p.noise) {
        const n = ac.createBufferSource();
        n.buffer = noiseBuffer(ac, p.dur);
        const ng = ac.createGain();
        ng.gain.setValueAtTime((p.gain ?? 0.2) * 0.6, t0);
        ng.gain.exponentialRampToValueAtTime(0.0001, t0 + p.dur);
        n.connect(ng);
        ng.connect(ac.destination);
        n.start(t0);
        n.stop(t0 + p.dur);
      }
    },
    muted: () => muted,
    setMuted(m) {
      muted = m;
    },
  };
}
