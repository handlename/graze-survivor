export class SoundController {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private bgmTimer: number | null = null;
  private bgmStep = 0;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopBgm();
    }
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
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  public playGraze(comboMultiplier: number, isCritical: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const baseFreq = isCritical ? 880 : 620;
      const pitchBoost = Math.min(1200, (comboMultiplier - 1) * 18);
      osc.type = isCritical ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(baseFreq + pitchBoost, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq + pitchBoost + 460, now + 0.045);

      gain.gain.setValueAtTime(isCritical ? 0.14 : 0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.052);
    } catch {
      // Ignore audio errors
    }
  }

  public playWarning(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.07;
        osc.type = 'square';
        osc.frequency.setValueAtTime(1480, start);
        gain.gain.setValueAtTime(0.06, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.045);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.05);
      }
    } catch {
      // Ignore audio errors
    }
  }

  public playLaserFire(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.24);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    } catch {
      // Ignore audio errors
    }
  }

  public playBombDetonate(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.28);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.31);
    } catch {
      // Ignore audio errors
    }
  }

  public playDirectHit(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(52, now + 0.38);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.42);
    } catch {
      // Ignore audio errors
    }
  }

  public startBgm(): void {
    this.stopBgm();
    if (!this.enabled || typeof window === 'undefined') return;
    const notes = [55, 55, 65.41, 55, 73.42, 69.3, 61.74, 58.27];
    this.bgmStep = 0;
    this.bgmTimer = window.setInterval(() => {
      if (!this.enabled) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        const freq = notes[this.bgmStep % notes.length];
        this.bgmStep++;
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
      } catch {
        // Ignore audio errors
      }
    }, 200);
  }

  public stopBgm(): void {
    if (this.bgmTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}
