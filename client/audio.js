// 効果音はすべてその場で合成する（音声ファイルなし）
export class Sound {
  constructor() { this.ctx = null; this.muted = false; try { this.muted = localStorage.getItem('sd-mute') === '1'; } catch {} }
  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : .8;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate * 2, nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // 砂の流れる音（常時）
    const src = c.createBufferSource(); src.buffer = nb; src.loop = true;
    this.hissF = c.createBiquadFilter(); this.hissF.type = 'bandpass'; this.hissF.frequency.value = 3400; this.hissF.Q.value = .5;
    this.hiss = c.createGain(); this.hiss.gain.value = 0;
    src.connect(this.hissF); this.hissF.connect(this.hiss); this.hiss.connect(this.master); src.start();
    // 低い持続音
    this.pad = c.createGain(); this.pad.gain.value = .0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    for (const [f, t] of [[55, 'sawtooth'], [82.4, 'triangle'], [110.3, 'sine'], [164.8, 'sine']]) {
      const o = c.createOscillator(); o.type = t; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = t === 'sawtooth' ? .05 : .09;
      o.connect(g); g.connect(lp); o.start();
    }
    lp.connect(this.pad); this.pad.connect(this.master);
  }
  padOff() { if (this.pad) this.pad.gain.setTargetAtTime(0, this.ctx.currentTime, .4); }
  padOn() { if (this.pad) this.pad.gain.setTargetAtTime(.5, this.ctx.currentTime, 3); }
  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem('sd-mute', this.muted ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.value = this.muted ? 0 : .8;
    return this.muted;
  }
  ambient(hiss, tone) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.hiss.gain.setTargetAtTime(hiss, t, .4);
    this.hissF.frequency.setTargetAtTime(2200 + tone * 2600, t, .4);
  }
  tone(freq, dur, { type = 'sine', vol = .2, slide = 0, delay = 0 } = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .03);
  }
  burst(dur, freq, vol, q = .8, type = 'bandpass', slide = 1) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur); f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + .03);
  }
  pick(big) {
    const scale = [880, 987.8, 1174.7, 1318.5, 1568, 1760];
    this.n = ((this.n || 0) + 1) % scale.length;
    const f = scale[this.n];
    this.tone(f, .22, { vol: big ? .2 : .11 }); this.tone(f * 2, .14, { vol: .04 });
    if (big) this.tone(f * 1.5, .3, { vol: .13, delay: .06 });
  }
  uiTap() { this.tone(1180, .07, { type: 'triangle', vol: .13 }); this.tone(1770, .05, { vol: .05, delay: .02 }); this.burst(.06, 5200, .05, .6, 'highpass'); }
  uiOk() { this.tone(660, .12, { type: 'triangle', vol: .14 }); this.tone(990, .22, { type: 'triangle', vol: .14, delay: .08 }); this.burst(.18, 4600, .06, .5, 'highpass', .6); }
  like() { this.tone(660 + Math.random() * 500, .09, { type: 'triangle', vol: .1, slide: 1.5 }); }
  dash() { this.burst(.24, 900, .24, .7, 'bandpass', 2.4); }
  hit() { this.tone(120, .22, { type: 'square', vol: .22, slide: .35 }); this.burst(.3, 1800, .42, .5, 'bandpass', .4); }
  hurt() { this.tone(180, .4, { type: 'sawtooth', vol: .28, slide: .3 }); this.burst(.7, 3000, .5, .3, 'highpass', .4); }
  jump() { this.tone(330, .12, { vol: .05, slide: 1.8 }); }
  give() { [523.3, 659.3, 784, 1047].forEach((f, i) => this.tone(f, .6, { vol: .12, delay: i * .08, type: 'triangle' })); }
  reborn() { [392, 523.3, 659.3, 784, 1047, 1318].forEach((f, i) => this.tone(f, .8, { vol: .13, delay: i * .07, type: 'triangle' })); }
  die() { [440, 370, 311, 247, 196].forEach((f, i) => this.tone(f, .9, { vol: .14, delay: i * .14, type: 'triangle' })); this.burst(2.2, 4200, .4, .3, 'highpass', .2); }
  tick() { this.tone(1500, .05, { type: 'square', vol: .06 }); }
  heart() { this.tone(62, .17, { vol: .55, slide: .6 }); this.tone(52, .2, { vol: .38, slide: .6, delay: .2 }); }
  warn() { this.tone(622, .28, { type: 'triangle', vol: .15 }); this.tone(466, .3, { type: 'triangle', vol: .13, delay: .26 }); }
  flip() {
    this.tone(40, 5.5, { type: 'sawtooth', vol: .3, slide: 2.4 }); this.tone(60, 5.5, { type: 'triangle', vol: .3, slide: 2 });
    this.burst(5.5, 500, .35, .6, 'lowpass', 5);
  }
  land() { this.burst(.5, 700, .32, .5, 'lowpass', .4); this.tone(70, .4, { vol: .45, slide: .5 }); }
  bell() { for (const [f, v] of [[220, .22], [441, .14], [663, .08], [1102, .04]]) this.tone(f, 3.5, { vol: v }); }
}
