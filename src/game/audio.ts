/** Procedural WebAudio bed: nothing to download, starts only after a user gesture. */

type Volumes = { music: number; ambience: number; effects: number };

class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private constructionGain: GainNode | null = null;
  private timers: number[] = [];
  private volumes: Volumes = { music: 0.35, ambience: 0.5, effects: 0.7 };
  private started = false;
  private rain = false;
  private construction = false;

  unlock() {
    if (typeof window === "undefined") return;
    if (!this.context) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.context = new Ctx();
      this.master = this.context.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.context.destination);
      this.ambienceGain = this.context.createGain();
      this.ambienceGain.connect(this.master);
      this.musicGain = this.context.createGain();
      this.musicGain.connect(this.master);
      this.effectsGain = this.context.createGain();
      this.effectsGain.connect(this.master);
      this.rainGain = this.context.createGain();
      this.rainGain.gain.value = 0;
      this.rainGain.connect(this.ambienceGain);
      this.constructionGain = this.context.createGain();
      this.constructionGain.gain.value = 0;
      this.constructionGain.connect(this.ambienceGain);
      this.buildAmbience();
      this.buildMusic();
      this.setRain(this.rain);
      this.setConstruction(this.construction);
      this.setVolumes(this.volumes);
    }
    if (this.context.state === "suspended") void this.context.resume().catch(() => { /* Tentar novamente no próximo gesto. */ });
    this.started = true;
  }

  private noiseBuffer(seconds = 2): AudioBuffer | null {
    if (!this.context) return null;
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  private buildAmbience() {
    if (!this.context || !this.ambienceGain) return;
    const buffer = this.noiseBuffer(3);
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    const gain = this.context.createGain();
    gain.gain.value = 0.22;
    source.connect(filter).connect(gain).connect(this.ambienceGain);
    source.start();

    // distant schoolyard murmur
    const murmur = this.context.createOscillator();
    murmur.type = "sine";
    murmur.frequency.value = 92;
    const murmurGain = this.context.createGain();
    murmurGain.gain.value = 0.012;
    murmur.connect(murmurGain).connect(this.ambienceGain);
    murmur.start();

    const rain = this.noiseBuffer(2);
    if (rain) {
      const rainSource = this.context.createBufferSource();
      rainSource.buffer = rain;
      rainSource.loop = true;
      const rainFilter = this.context.createBiquadFilter();
      rainFilter.type = "highpass";
      rainFilter.frequency.value = 1200;
      const rainVol = this.context.createGain();
      rainVol.gain.value = 0.5;
      rainSource.connect(rainFilter).connect(rainVol).connect(this.rainGain!);
      rainSource.start();
    }

    this.timers.push(window.setInterval(() => {
      if (!this.context || !this.ambienceGain || this.context.state !== "running" || !this.volumes.ambience) return;
      if (!this.rain && Math.random() > 0.55) this.bird();
    }, 6500));
    this.timers.push(window.setInterval(() => {
      if (!this.context || !this.constructionGain || !this.construction ||
          !this.volumes.ambience || this.context.state !== "running") return;
      const when = this.context.currentTime;
      this.impact(this.constructionGain, when, 0.09);
      if (Math.random() < 0.4) this.impact(this.constructionGain, when + 0.23, 0.06);
    }, 2100));

  }

  private buildMusic() {
    if (!this.context || !this.musicGain) return;
    const notes = [261.63, 329.63, 392.0, 523.25, 440.0, 349.23];
    let step = 0;
    this.timers.push(window.setInterval(() => {
      if (!this.context || !this.musicGain || !this.volumes.music || this.context.state !== "running") return;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = "triangle";
      osc.frequency.value = notes[step % notes.length] / 2;
      step += 1;
      gain.gain.setValueAtTime(0, this.context.currentTime);
      gain.gain.linearRampToValueAtTime(0.05, this.context.currentTime + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 3.6);
      osc.connect(gain).connect(this.musicGain);
      osc.start();
      osc.stop(this.context.currentTime + 3.8);
    }, 3800));
  }

  private bird() {
    if (!this.context || !this.ambienceGain) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(2200 + Math.random() * 900, now);
    osc.frequency.exponentialRampToValueAtTime(1500 + Math.random() * 600, now + 0.18);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.connect(gain).connect(this.ambienceGain);
    osc.start();
    osc.stop(now + 0.3);
  }

  setVolumes(volumes: Volumes) {
    this.volumes = { ...volumes };
    this.fade(this.ambienceGain, volumes.ambience * 0.8);
    this.fade(this.musicGain, volumes.music * 0.7);
    this.fade(this.effectsGain, volumes.effects);
  }

  private fade(node: GainNode | null, value: number) {
    if (!node || !this.context) return;
    const now = this.context.currentTime;
    node.gain.setTargetAtTime(value, now, 0.02);
  }

  setRain(active: boolean) {
    this.rain = active;
    this.fade(this.rainGain, active ? 0.22 : 0);
  }

  setConstruction(active: boolean) {
    this.construction = active;
    this.fade(this.constructionGain, active ? 0.35 : 0);
  }

  click() {
    if (!this.context || !this.effectsGain || !this.started) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "sine";
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.06, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.12);
    osc.connect(gain).connect(this.effectsGain);
    osc.start();
    osc.stop(this.context.currentTime + 0.14);
  }

  bell() {
    if (!this.context || !this.effectsGain || !this.started) return;
    const now = this.context.currentTime;
    [0, 0.34, 0.68].forEach((offset) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      osc.type = "triangle";
      osc.frequency.value = offset === 0.68 ? 880 : 660;
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.12, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.6);
      osc.connect(gain).connect(this.effectsGain!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.7);
    });
  }

  thud() {
    if (!this.context || !this.effectsGain || !this.started) return;
    this.impact(this.effectsGain, this.context.currentTime, 0.10);
  }

  private impact(output: GainNode, when: number, level: number) {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(165, when);
    osc.frequency.exponentialRampToValueAtTime(58, when + 0.12);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.19);
    osc.connect(gain).connect(output);
    osc.start(when);
    osc.stop(when + 0.2);
  }

  // ---------------------------------------------------------------- ambiente por local (no máximo 3 camadas audíveis)
  private zones: Record<string, GainNode> = {};
  private zoneTimer = 0;
  private zoneLevels: Record<string, number> = {};
  private ensureZones() {
    if (!this.context || !this.ambienceGain || Object.keys(this.zones).length) return;
    const ctx = this.context;
    const mk = (name: string, type: BiquadFilterType, freq: number, q: number) => {
      const buf = this.noiseBuffer(3);
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.ambienceGain!);
      src.start();
      this.zones[name] = g;
    };
    mk("patio", "bandpass", 700, 2.5);
    mk("aula", "lowpass", 380, 0.7);
    mk("rua", "lowpass", 160, 0.5);
    mk("telhado", "highpass", 2400, 0.6);
    for (const n of ["quadra", "cantina", "jardim"]) { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.ambienceGain!); this.zones[n] = g; }
    // eventos pontuais: bola e torcida, louça, pássaros — só tocam se a camada estiver ativa
    this.zoneTimer = window.setInterval(() => {
      if (!this.context) return;
      const t = this.context.currentTime;
      const ping = (bus: string, freq: number, dur: number, type: OscillatorType, vol: number, slide?: number) => {
        const lv = this.zoneLevels[bus] ?? 0;
        if (lv < 0.05) return;
        const o = this.context!.createOscillator(); const g = this.context!.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * lv, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(this.zones[bus]); o.start(t); o.stop(t + dur + 0.05);
      };
      if (Math.random() < 0.5) ping("quadra", 120, 0.12, "sine", 0.5, 80);
      if (Math.random() < 0.08) ping("quadra", 600, 0.9, "sawtooth", 0.05, 900);
      if (Math.random() < 0.45) ping("cantina", 2600 + Math.random() * 1500, 0.08, "triangle", 0.12);
      if (Math.random() < 0.3) ping("jardim", 3000 + Math.random() * 1200, 0.1, "sine", 0.08, 4200);
    }, 450);
    this.timers.push(this.zoneTimer);
  }
  /** Níveis 0..1 por local; transições suaves e só as 3 camadas mais altas ficam audíveis. */
  setZones(levels: Record<string, number>) {
    if (!this.context || !this.started) return;
    this.ensureZones();
    const top = Object.entries(levels).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    const t = this.context.currentTime;
    const base: Record<string, number> = { patio: 0.35, aula: 0.25, rua: 0.4, telhado: 0.3, quadra: 1, cantina: 1, jardim: 1 };
    for (const [k, g] of Object.entries(this.zones)) {
      const lv = top.includes(k) ? Math.max(0, Math.min(1, levels[k] ?? 0)) : 0;
      this.zoneLevels[k] = lv;
      g.gain.setTargetAtTime(lv * (base[k] ?? 0.3), t, 0.8);
    }
  }

  dispose() {
    for (const timer of this.timers) window.clearInterval(timer);
    this.timers = [];
    const context = this.context;
    this.master?.disconnect();
    this.context = null;
    this.master = this.musicGain = this.ambienceGain = this.effectsGain = null;
    this.rainGain = this.constructionGain = null;
    this.zones = {};
    this.started = false;
    if (context && context.state !== "closed") void context.close().catch(() => {});
  }

  isStarted() {
    return this.started;
  }

  isRain() {
    return this.rain;
  }

  isConstruction() {
    return this.construction;
  }
}

export const audio = new GameAudio();
