/**
 * Heavy Industrial / Persona-Style Synth Audio Controller
 *
 * Why voice limiting & node disconnection are required:
 * Continuous 20Hz multi-laser grazing can trigger 60+ sound requests per second.
 * Without a minimum trigger cooldown, node `.onended` disconnection, and a master
 * DynamicsCompressor, mobile WebKit/Blink hits its active AudioNode limit (~64-100)
 * or clips the audio bus and mutes all sound mid-game.
 */
export class SoundController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private distortionCurve: Float32Array<ArrayBuffer> | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private enabled = true;
  private bgmTimer: number | null = null;
  private bgmStep = 0;

  private lastGrazeTimeMs = 0;
  private lastWarningTimeMs = 0;
  private activeVoices = 0;
  private static readonly MAX_ACTIVE_VOICES = 24;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopBgm();
    }
  }

  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 256;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtor) {
          this.ctx = new AudioCtor();
          this.compressor = this.ctx.createDynamicsCompressor();
          this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
          this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
          this.compressor.ratio.setValueAtTime(8, this.ctx.currentTime);
          this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
          this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);

          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

          this.compressor.connect(this.masterGain);
          this.masterGain.connect(this.ctx.destination);

          this.distortionCurve = this.makeDistortionCurve(140);

          // Pre-allocate 0.4s white/metallic noise buffer once
          const sampleRate = this.ctx.sampleRate;
          const length = Math.floor(sampleRate * 0.4);
          this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
          const data = this.noiseBuffer.getChannelData(0);
          for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
          }
        }
      }
      if (this.ctx && (this.ctx.state === 'suspended' || (this.ctx.state as string) === 'interrupted')) {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private getOutputNode(ctx: AudioContext): AudioNode {
    return this.compressor ?? ctx.destination;
  }

  public playGraze(comboMultiplier: number, isCritical: boolean): void {
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // Throttle rapid multi-graze audio to max 1 heavy hit every 32ms so voices never saturate
    if (nowPerf - this.lastGrazeTimeMs < 32) return;
    if (this.activeVoices >= SoundController.MAX_ACTIVE_VOICES) return;

    const ctx = this.ensureContext();
    if (!ctx) return;
    this.lastGrazeTimeMs = nowPerf;

    try {
      const now = ctx.currentTime;
      const dest = this.getOutputNode(ctx);
      this.activeVoices += 2;

      // 1. Heavy Low-End Sub Punch (gives physical weight to every graze)
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      const subStartFreq = isCritical ? 155 : 120;
      subOsc.frequency.setValueAtTime(subStartFreq, now);
      subOsc.frequency.exponentialRampToValueAtTime(38, now + 0.085);
      subGain.gain.setValueAtTime(isCritical ? 0.38 : 0.26, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      subOsc.connect(subGain);
      subGain.connect(dest);
      subOsc.onended = () => {
        subOsc.disconnect();
        subGain.disconnect();
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      };
      subOsc.start(now);
      subOsc.stop(now + 0.095);

      // 2. Metallic Distorted Crunch Spark (scales pitch with combo)
      const crunchOsc = ctx.createOscillator();
      const shaper = ctx.createWaveShaper();
      const crunchGain = ctx.createGain();
      if (this.distortionCurve) {
        shaper.curve = this.distortionCurve;
      }
      crunchOsc.type = 'sawtooth';
      const pitchBoost = Math.min(900, (comboMultiplier - 1) * 14);
      const baseFreq = (isCritical ? 520 : 380) + pitchBoost;
      crunchOsc.frequency.setValueAtTime(baseFreq, now);
      crunchOsc.frequency.exponentialRampToValueAtTime(baseFreq * 1.85, now + 0.065);

      crunchGain.gain.setValueAtTime(isCritical ? 0.22 : 0.14, now);
      crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      crunchOsc.connect(shaper);
      shaper.connect(crunchGain);
      crunchGain.connect(dest);
      crunchOsc.onended = () => {
        crunchOsc.disconnect();
        shaper.disconnect();
        crunchGain.disconnect();
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      };
      crunchOsc.start(now);
      crunchOsc.stop(now + 0.075);
    } catch {
      // Ignore audio errors
    }
  }

  public playWarning(): void {
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowPerf - this.lastWarningTimeMs < 140) return;
    if (this.activeVoices >= SoundController.MAX_ACTIVE_VOICES) return;

    const ctx = this.ensureContext();
    if (!ctx) return;
    this.lastWarningTimeMs = nowPerf;

    try {
      const now = ctx.currentTime;
      const dest = this.getOutputNode(ctx);
      this.activeVoices += 1;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.setValueAtTime(880, now + 0.045);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

      osc.connect(gain);
      gain.connect(dest);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      };
      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Ignore audio errors
    }
  }

  public playLaserFire(): void {
    if (this.activeVoices >= SoundController.MAX_ACTIVE_VOICES) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const dest = this.getOutputNode(ctx);
      this.activeVoices += 2;

      // Heavy tearing bass rip
      const bassOsc = ctx.createOscillator();
      const shaper = ctx.createWaveShaper();
      const bassGain = ctx.createGain();
      if (this.distortionCurve) shaper.curve = this.distortionCurve;

      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(280, now);
      bassOsc.frequency.exponentialRampToValueAtTime(48, now + 0.28);
      bassGain.gain.setValueAtTime(0.28, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      bassOsc.connect(shaper);
      shaper.connect(bassGain);
      bassGain.connect(dest);
      bassOsc.onended = () => {
        bassOsc.disconnect();
        shaper.disconnect();
        bassGain.disconnect();
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      };
      bassOsc.start(now);
      bassOsc.stop(now + 0.31);

      // Noise transient burst
      if (this.noiseBuffer) {
        const noise = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const nGain = ctx.createGain();
        noise.buffer = this.noiseBuffer;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(260, now + 0.22);
        nGain.gain.setValueAtTime(0.22, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(dest);
        noise.onended = () => {
          noise.disconnect();
          filter.disconnect();
          nGain.disconnect();
          this.activeVoices = Math.max(0, this.activeVoices - 1);
        };
        noise.start(now);
        noise.stop(now + 0.25);
      } else {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      }
    } catch {
      // Ignore audio errors
    }
  }

  public playBombDetonate(): void {
    if (this.activeVoices >= SoundController.MAX_ACTIVE_VOICES) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const dest = this.getOutputNode(ctx);
      this.activeVoices += 2;

      // Deep seismic 808-style sub drop
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(140, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + 0.36);
      subGain.gain.setValueAtTime(0.48, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      sub.connect(subGain);
      subGain.connect(dest);
      sub.onended = () => {
        sub.disconnect();
        subGain.disconnect();
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      };
      sub.start(now);
      sub.stop(now + 0.39);

      // Low-pass filtered explosion rumble
      if (this.noiseBuffer) {
        const noise = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const nGain = ctx.createGain();
        noise.buffer = this.noiseBuffer;
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(480, now);
        filter.frequency.exponentialRampToValueAtTime(80, now + 0.32);
        nGain.gain.setValueAtTime(0.32, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(dest);
        noise.onended = () => {
          noise.disconnect();
          filter.disconnect();
          nGain.disconnect();
          this.activeVoices = Math.max(0, this.activeVoices - 1);
        };
        noise.start(now);
        noise.stop(now + 0.35);
      } else {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      }
    } catch {
      // Ignore audio errors
    }
  }

  public playDirectHit(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const dest = this.getOutputNode(ctx);

      const osc = ctx.createOscillator();
      const shaper = ctx.createWaveShaper();
      const gain = ctx.createGain();
      if (this.distortionCurve) shaper.curve = this.distortionCurve;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.45);
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

      osc.connect(shaper);
      shaper.connect(gain);
      gain.connect(dest);
      osc.onended = () => {
        osc.disconnect();
        shaper.disconnect();
        gain.disconnect();
      };
      osc.start(now);
      osc.stop(now + 0.5);
    } catch {
      // Ignore audio errors
    }
  }

  public playLastLifeSirens(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const dest = this.getOutputNode(ctx);
      this.playDirectHit();

      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.18;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, start);
        osc.frequency.linearRampToValueAtTime(880, start + 0.14);
        gain.gain.setValueAtTime(0.24, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
        osc.connect(gain);
        gain.connect(dest);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(start);
        osc.stop(start + 0.17);
      }
    } catch {
      // Ignore audio errors
    }
  }

  public playPlayerExplosion(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const dest = this.getOutputNode(ctx);

      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const shaper = ctx.createWaveShaper();
        const gain = ctx.createGain();
        if (this.distortionCurve) shaper.curve = this.distortionCurve;
        const start = now + i * 0.24;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150 - i * 22, start);
        osc.frequency.exponentialRampToValueAtTime(24, start + 0.5);
        gain.gain.setValueAtTime(0.4, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);

        osc.connect(shaper);
        shaper.connect(gain);
        gain.connect(dest);
        osc.onended = () => {
          osc.disconnect();
          shaper.disconnect();
          gain.disconnect();
        };
        osc.start(start);
        osc.stop(start + 0.56);
      }
    } catch {
      // Ignore audio errors
    }
  }

  public startBgm(): void {
    this.stopBgm();
    if (!this.enabled || typeof window === 'undefined') return;
    // Heavy driving dark synth bassline + kick pulse
    const bassNotes = [55, 55, 65.41, 55, 73.42, 69.3, 61.74, 58.27];
    this.bgmStep = 0;
    this.bgmTimer = window.setInterval(() => {
      if (!this.enabled) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const dest = this.getOutputNode(ctx);
        const step = this.bgmStep++;

        // Bass synth
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(340, now);
        const freq = bassNotes[step % bassNotes.length];
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(dest);
        osc.onended = () => {
          osc.disconnect();
          filter.disconnect();
          gain.disconnect();
        };
        osc.start(now);
        osc.stop(now + 0.17);

        // Four-on-the-floor low kick thump every 2 steps
        if (step % 2 === 0) {
          const kick = ctx.createOscillator();
          const kGain = ctx.createGain();
          kick.type = 'sine';
          kick.frequency.setValueAtTime(115, now);
          kick.frequency.exponentialRampToValueAtTime(36, now + 0.11);
          kGain.gain.setValueAtTime(0.18, now);
          kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          kick.connect(kGain);
          kGain.connect(dest);
          kick.onended = () => {
            kick.disconnect();
            kGain.disconnect();
          };
          kick.start(now);
          kick.stop(now + 0.13);
        }
      } catch {
        // Ignore audio errors
      }
    }, 185);
  }

  public stopBgm(): void {
    if (this.bgmTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}
