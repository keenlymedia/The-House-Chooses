// Tiny synth-only audio cue layer. No assets required, no upload pipeline,
// nothing to license. The browser AudioContext starts suspended until the
// first user gesture; resume() is idempotent so call it freely.

class AudioCues {
  private ctx: AudioContext | null = null;
  private muted = false;

  private getCtx(): AudioContext | null {
    if (this.muted) return null;
    if (this.ctx) return this.ctx;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      return this.ctx;
    } catch {
      return null;
    }
  }

  resume(): void {
    const ctx = this.getCtx();
    if (ctx?.state === "suspended") void ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  // Heartbeat thump used at high fear. Higher intensity = deeper + louder.
  thump(intensity = 0.5): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.05, Math.min(0.6, intensity)),
      t + 0.02,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  // Three-pulse alarm for meetings.
  alarm(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t0 + i * 0.18;
      osc.type = "square";
      osc.frequency.setValueAtTime(440 + (i % 2) * 220, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    }
  }

  // Long ascending chime for ritual start; descending for match end.
  chime(direction: "up" | "down"): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    if (direction === "up") {
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.linearRampToValueAtTime(660, t + 0.6);
    } else {
      osc.frequency.setValueAtTime(330, t);
      osc.frequency.linearRampToValueAtTime(110, t + 1.0);
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.0);
  }
}

export const audio = new AudioCues();
