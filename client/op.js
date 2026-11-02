// オープニングムービー: 主題歌「イノチノスナドケイ」に合わせてゲームの3Dをその場で動かす
import * as W from '../shared/world.js';

const $ = (id) => document.getElementById(id);
const END = 162.4;

// [開始, 終了, 歌詞]。時刻は音源から測った歌い出し
const LYRICS = [
  [1.9, 5.9, 'イノチノスナドケイ　追いつけない速度で'],
  [5.9, 9.4, '新しい知能が　昨日を塗り替える'],
  [9.4, 13.1, 'イノチノスナドケイ　便利さのその先で'],
  [13.1, 17, '誰の声が消えたか　忘れないでいたい'],
  [22.9, 26.4, '画面の向こうで　答えが育ってく'],
  [26.4, 30.3, '名前も知らない手が　明日を組み替える'],
  [30.3, 33.8, '学ぶほど賢く　迷いなく進むほど'],
  [33.8, 37.5, '小さな間違いが　誰かの席を奪う'],
  [37.6, 44.3, '止まらない更新の　白い波の下'],
  [44.4, 48.9, '置き去りの心が　助けを呼んでいる'],
  [49.1, 53, 'イノチノスナドケイ　追いつけない速度で'],
  [53, 56.5, '新しい知能が　昨日を塗り替える'],
  [56.5, 60.3, 'イノチノスナドケイ　便利さのその先で'],
  [60.3, 64.2, '誰の声が消えたか　忘れないでいたい'],
  [77.3, 81.3, '届いた偽の通知　開かれた私書箱'],
  [81.3, 85, '知らない誰かが　私の名で笑う'],
  [85, 88.5, '鍵をすり抜けた指　奪われた写真'],
  [88.5, 92.1, '「大丈夫」の一言じゃ　戻らないものがある'],
  [92.2, 96.3, '見えない侵入者　数字の裏側で'],
  [96.3, 99.7, '眠れない人の　暮らしを踏み越える'],
  [99.8, 103.5, '速さを誇るだけで　誰を守れるの'],
  [103.5, 107.2, '便利の名のもとに　傷を隠さないで'],
  [107.2, 110.6, '作る手にも使う手にも　責任を残して'],
  [110.6, 116.5, '境界を越えた痛みを　なかったことにしない'],
  [118, 121.8, 'イノチノスナドケイ　追いつけない速度で'],
  [121.8, 125.4, '新しい知能が　昨日を塗り替える'],
  [125.4, 129.1, 'イノチノスナドケイ　便利さのその先で'],
  [129.1, 132.5, '誰の声が消えたか　忘れないでいたい'],
  [132.6, 136.2, 'イノチノスナドケイ　守るべきものは'],
  [136.2, 139.9, '数字じゃ測れない　ひとりの暮らしだ'],
  [140, 141.9, 'イノチノスナドケイ'],
  [141.9, 147, '誰の声も消さないで'],
];
const FLIPS = [[44.4, 49.1], [72.5, 77.3], [111, 118], [141.9, 146.5]];
const CHORUS = [[49.1, 64.2], [118, 132.5]];
const LOGOS = [[17.3, 22.6], [65, 72.3], [147.5, 160.5]];
const GHOST_TIME = [77.3, 99.8];

// カット割り。[開始, 種類, 設定]
const SHOTS = [
  [0, 'neck', { y0: 20, y1: 8, R: 16, spd: .25 }],
  [5.9, 'fly', { z: 18, h: 2.2, x0: -44, x1: 22 }],
  [9.4, 'top', { y0: 66, y1: 54 }],
  [13.1, 'orbit', { R0: 120, R1: 205, y: 20, ty: 6, spd: .12 }],
  [22.9, 'follow', { a: 0, dist: 7, pitch: .22, spin: .1 }],
  [26.4, 'follow', { a: 1, dist: 5, pitch: .05, yaw: 2.7, spin: -.12 }],
  [30.3, 'fly', { z: -26, h: 5, x0: 34, x1: -34 }],
  [33.8, 'follow', { a: 2, dist: 4.5, pitch: .1, yaw: 3.14, spin: .08 }],
  [37.6, 'under', { spd: .1 }],
  [44.4, 'orbit', { R0: 215, R1: 190, y: 8, ty: 0, spd: .1 }],
  [49.1, 'follow', { a: 3, dist: 8, pitch: .3, spin: .4 }],
  [51, 'fly', { z: 12, h: 1.8, x0: -30, x1: 34 }],
  [53, 'neck', { y0: 4, y1: -22, R: 13, spd: .7 }],
  [55, 'follow', { a: 4, dist: 6, pitch: .15, yaw: 3, spin: -.5 }],
  [56.5, 'orbit', { R0: 62, R1: 50, y: -30, ty: -38, spd: .5 }],
  [58.5, 'follow', { a: 5, dist: 10, pitch: .55, spin: .4 }],
  [60.3, 'top', { y0: 62, y1: 42 }],
  [62.2, 'follow', { a: 6, dist: 5, pitch: .08, yaw: 3.1, spin: .3 }],
  [64.2, 'orbit', { R0: 150, R1: 225, y: 34, ty: 4, spd: .08 }],
  [72.5, 'follow', { a: 7, dist: 12, pitch: .4, spin: .1, pull: 34 }],
  [77.3, 'follow', { a: 8, dist: 7, pitch: .25, spin: .08 }],
  [81.3, 'fly', { z: 26, h: 2.6, x0: 30, x1: -14 }],
  [85, 'follow', { a: 9, dist: 4.5, pitch: .05, yaw: 3.14, spin: -.08 }],
  [88.5, 'follow', { a: 10, dist: 16, pitch: .7, spin: .05 }],
  [92.2, 'under', { spd: .06 }],
  [96.3, 'orbit', { R0: 95, R1: 72, y: 46, ty: 28, spd: .1 }],
  [99.8, 'neck', { y0: -30, y1: -8, R: 12, spd: .22 }],
  [103.5, 'follow', { a: 11, dist: 6, pitch: .2, yaw: .5, spin: .2 }],
  [107.2, 'fly', { z: -10, h: 2.2, x0: -36, x1: 32 }],
  [111, 'orbit', { R0: 230, R1: 170, y: 0, ty: 0, spd: .14 }],
  [118, 'follow', { a: 12, dist: 7, pitch: .3, spin: .5 }],
  [120, 'neck', { y0: 2, y1: -24, R: 13, spd: .9 }],
  [121.8, 'fly', { z: 8, h: 1.8, x0: 36, x1: -34 }],
  [123.6, 'top', { y0: 60, y1: 40 }],
  [125.4, 'follow', { a: 13, dist: 5, pitch: .1, yaw: 2.9, spin: -.5 }],
  [127.3, 'orbit', { R0: 58, R1: 48, y: 36, ty: 30, spd: .6 }],
  [129.1, 'follow', { a: 14, dist: 12, pitch: .55, spin: .3 }],
  [130.8, 'neck', { y0: 12, y1: -14, R: 10, spd: .6 }],
  [132.6, 'follow', { a: 15, dist: 9, pitch: .3, spin: .12 }],
  [136.2, 'follow', { a: 16, dist: 3.4, pitch: .05, yaw: 3.14, spin: .04 }],
  [140, 'follow', { a: 16, dist: 5, pitch: .5, yaw: 3.14, spin: .05, rise: 8 }],
  [141.9, 'orbit', { R0: 180, R1: 215, y: 6, ty: 0, spd: .08 }],
  [147.5, 'orbit', { R0: 215, R1: 300, y: 24, ty: 8, spd: .05 }],
];

// 主題歌の再生（トップのBGMとOPで共用）
export class Music {
  constructor(sound) {
    this.sound = sound;
    this.el = new Audio('theme.mp3');
    this.el.preload = 'auto';
    this.el.loop = true;
    this.gain = null; this.an = null; this.data = null;
    this.want = true;
    try { this.want = localStorage.getItem('sd-bgm') !== '0'; } catch {}
  }
  // 再生の許可が出たあと（クリックやキー入力の中）で音量と解析の経路をつなぐ
  route() {
    if (this.gain) return;
    this.sound.start();
    const c = this.sound.ctx;
    if (!c) return;
    try {
      const src = c.createMediaElementSource(this.el);
      this.gain = c.createGain(); this.an = c.createAnalyser();
      this.an.fftSize = 256; this.data = new Uint8Array(this.an.frequencyBinCount);
      src.connect(this.an); this.an.connect(this.gain); this.gain.connect(c.destination);
    } catch {}
  }
  setVol(v, sec = 0) {
    if (this.gain) {
      const t = this.sound.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      if (sec > 0) { this.gain.gain.setValueAtTime(this.gain.gain.value, t); this.gain.gain.linearRampToValueAtTime(v, t + sec); }
      else this.gain.gain.setValueAtTime(v, t);
    } else this.el.volume = v;
  }
  fadeOut(sec = 1.2) {
    this.setVol(0, sec);
    clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => this.el.pause(), sec * 1000 + 50);
  }
  stop() { clearTimeout(this.fadeTimer); this.el.pause(); }
  play(fromStart = false, vol = .85) {
    clearTimeout(this.fadeTimer);
    if (fromStart) { try { this.el.currentTime = 0; } catch {} }
    this.setVol(vol);
    return this.el.play();
  }
  level() { // 低音の強さ 0〜1
    if (!this.an) return 0;
    this.an.getByteFrequencyData(this.data);
    let s = 0;
    for (let i = 1; i < 6; i++) s += this.data[i];
    return Math.max(0, (s / 5 / 255 - .55) * 2.4);
  }
}

export class Opening {
  constructor({ world, actors, grains, sparks, music, env, canvas, lite, onClose }) {
    Object.assign(this, { world, actors, grains, sparks, music, env, canvas, onClose });
    this.count = lite ? 60 : 96;
    this.on = false;
    this.pos = { x: 0, y: 0, z: 0 }; this.target = { x: 0, y: 0, z: 0 };
    this.roll = 0;
    this.list = [];
    $('opclose').addEventListener('click', () => this.close());
    addEventListener('keydown', (e) => { if (this.on && e.code === 'Escape') this.close(); });
    music.el.addEventListener('ended', () => { if (this.on) this.close(); });
  }
  open() {
    this.on = true;
    this.t = 0; this.lastT = 0; this.acc = 0; this.f = .96; this.flipsDone = 0; this.lineIdx = -2; this.logoOn = false; this.nextBurst = 0; this.grainId = 1e9; this.shotIdx = -1; this.shotT = 0; this.ghostPhase = false; this.reborn = 0;
    this.grains.map.clear();
    W.setSand(this.env, this.f);
    this.env.flow = .55; this.env.flip = false;
    this.list = [];
    for (let i = 0; i < this.count; i++) {
      const top = i % 3 !== 2;
      const a = Math.random() * 6.283, r = 22 + Math.random() * 20;
      const p = W.newBody(Math.cos(a) * r, 0, Math.sin(a) * r);
      p.y = top ? W.surfaceTop(r, this.env.L) : W.surfaceBot(r, this.env.P);
      p.ground = true;
      Object.assign(p, { id: i + 1, hue: Math.random(), life: 30 + Math.random() * 60, walk: Math.random() * 6, speed: 0, gy: p.y, flash: 0, dash: false, stun: false, safe: false, dir: Math.random() < .5 ? 1 : -1, ax: 0, az: 0 });
      this.list.push(p);
    }
    $('op').classList.add('on');
    $('title').classList.add('gone');
    $('opfade').style.opacity = 1;
    this.music.el.loop = false;
    this.music.route();
    this.music.sound.ctx?.resume?.();
    const pl = this.music.play(true, 1);
    pl?.catch?.(() => {});
  }
  close() {
    if (!this.on) return;
    this.on = false;
    this.music.el.loop = true;
    this.grains.map.clear();
    this.actors.draw([], 0, 0, this.env);
    this.sparks.clear(performance.now() / 1000);
    this.world.neck.scale.set(34, 34, 1);
    this.env.flip = false;
    this.canvas.classList.remove('dead');
    $('op').classList.remove('on');
    $('oplogo').classList.remove('on');
    $('oplyric').classList.remove('on');
    $('title').classList.remove('gone');
    this.onClose();
  }
  worldOf(p, out, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    out.x = p.x * c - p.y * s; out.y = p.x * s + p.y * c; out.z = p.z;
    return out;
  }
  actorAI(p) {
    const r = Math.hypot(p.x, p.z) || 1;
    const want = p.y >= 0 ? 34 : 24 + (p.id % 12);
    const inOut = Math.max(-1, Math.min(1, (want - r) * .2));
    const tx = -p.z / r * p.dir, tz = p.x / r * p.dir;
    p.ax = tx * .75 + (p.x / r) * inOut;
    p.az = tz * .75 + (p.z / r) * inOut;
  }
  burst(now, t) { // サビ: 体当たりと粒が飛び交う
    const a = this.list[Math.floor(Math.random() * this.list.length)];
    if (a.ghost) return;
    a.vx = Math.cos(t * 7) * 18; a.vz = Math.sin(t * 7) * 18; a.vy = 8; a.ground = false; a.flash = .35; a.stunT = .6;
    this.sparks.emit(a.x, a.y + 1, a.z, 40, { speed: 9, up: 8, life: .9, grav: 8 }, now);
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * 6.283, rr = 2 + Math.random() * 6;
      let x = a.x + Math.cos(ang) * rr, z = a.z + Math.sin(ang) * rr;
      const r = Math.hypot(x, z), max = Math.max(1, W.glassR(a.y) - 2);
      if (r > max) { x *= max / r; z *= max / r; }
      this.grains.add([this.grainId++, x, z, a.y >= 0 ? 1 : 0, 2, 0, .3, .2], now);
    }
  }
  tick(dt, now) {
    const el = this.music.el;
    if (!el.paused && el.currentTime > 0) this.t = el.currentTime; else this.t += dt; // 音が出せない環境でも映像は進める
    const t = this.t;
    if (t >= END) { this.close(); return null; }

    // 反転
    let flipT = 0;
    for (const [a, b] of FLIPS) if (t >= a && t < b) flipT = (t - a) / (b - a);
    const done = FLIPS.filter(([, b]) => t >= b).length;
    if (done > this.flipsDone) {
      this.flipsDone = done;
      this.f = 1 - this.f;
      for (const p of this.list) W.mirror(p);
      this.grains.map.clear();
      this.sparks.clear(now);
    }
    if (flipT === 0) this.f = Math.max(.04, this.f - .011 * dt);
    W.setSand(this.env, this.f);
    this.env.flip = flipT > 0;
    const e = flipT > 0 ? flipT * flipT * flipT * (flipT * (flipT * 6 - 15) + 10) : 0;
    const angle = e * Math.PI;

    // 人の動き
    const ghostTime = t >= GHOST_TIME[0] && t < GHOST_TIME[1];
    if (ghostTime !== this.ghostPhase) {
      this.ghostPhase = ghostTime;
      this.canvas.classList.toggle('dead', ghostTime);
      for (const p of this.list) {
        if (p.id % 4 === 0) continue; // 4人に1人だけ生きている
        p.ghost = ghostTime;
        if (!ghostTime) { p.vy = 7; p.ground = false; p.life = 30 + Math.random() * 60; this.sparks.emit(p.x, p.y, p.z, 26, { speed: 2.5, up: 15, life: 1.3, grav: 1, spread: 1.2, color: [1, .9, .5] }, now); }
      }
    }
    this.acc += dt;
    let n = 0;
    while (this.acc >= W.TICK && n++ < 4) {
      this.acc -= W.TICK;
      for (const p of this.list) {
        this.actorAI(p);
        const px = p.x, pz = p.z;
        W.stepBody(p, p.ax, p.az, p.ground && Math.random() < .004, false, this.env, W.TICK);
        p.speed += (Math.hypot(p.x - px, p.z - pz) / W.TICK - p.speed) * .2;
      }
    }
    if (this.acc > .5) this.acc = 0;
    for (const p of this.list) {
      p.walk += p.speed * dt * 1.5;
      p.flash = Math.max(0, p.flash - dt);
      p.stun = p.stunT > 0;
      const g = W.groundY(Math.hypot(p.x, p.z), p.y, this.env);
      p.gy = g === -Infinity ? p.y - 30 : g;
    }
    this.actors.draw(this.list, 0, now, this.env);

    // サビの賑わいと、橋の「命を分ける」光
    const chorus = CHORUS.some(([a, b]) => t >= a && t < b);
    if (t >= this.nextBurst && flipT === 0) {
      if (chorus) { this.burst(now, t); this.burst(now, t); this.nextBurst = t + .45; }
      else if (t >= 99.8 && t < 111) {
        const p = this.list[Math.floor(Math.random() * this.list.length)];
        this.sparks.emit(p.x, p.y + 1, p.z, 30, { speed: 3, up: 6, life: 1.1, grav: 2, color: [.65, .85, 1] }, now);
        this.nextBurst = t + .3;
      } else this.nextBurst = t + .5;
    }
    for (const g of this.grains.map.values()) if (now - g.t0 > 7) this.grains.map.delete(g.id);
    if (flipT === 0 && this.f > .05 && Math.random() < dt * 6 && t > 17) {
      const a = Math.random() * 6.283, r = 7 + Math.random() * 26;
      this.grains.add([this.grainId++, Math.cos(a) * r, Math.sin(a) * r, 0, 2, 0, 0, W.GRAIN_FALL], now);
    }
    this.grains.draw(now, this.env, now);

    this.camera(t, angle, flipT, dt);
    this.overlay(t);

    const lv = this.music.level();
    // 首の光はカメラが近いほど小さくして、白飛びを防ぐ
    const nd = Math.hypot(this.pos.x, this.pos.y, this.pos.z);
    this.world.neck.scale.setScalar(34 * Math.min(1, nd / 70) * (1 + lv * .7));
    return { f: this.f, flipT, flipE: e };
  }
  camera(t, angle, flipT, dt) {
    let i = 0;
    while (i + 1 < SHOTS.length && SHOTS[i + 1][0] <= t) i++;
    const [t0, kind, o] = SHOTS[i];
    const t1 = i + 1 < SHOTS.length ? SHOTS[i + 1][0] : END;
    const k = Math.min(1, (t - t0) / Math.max(.01, t1 - t0)), lt = t - t0;
    const P = this.pos, T = this.target;
    this.roll = 0;
    if (kind === 'neck') {
      const y = o.y0 + (o.y1 - o.y0) * k, a = t * o.spd + i;
      P.x = Math.sin(a) * o.R; P.z = Math.cos(a) * o.R; P.y = y + 1.5;
      T.x = 0; T.y = y - 1; T.z = 0;
    } else if (kind === 'fly') {
      const x = o.x0 + (o.x1 - o.x0) * k;
      const r = Math.hypot(x, o.z);
      P.x = x; P.z = o.z; P.y = W.sandTop(r, this.env.L) + o.h;
      const dir = Math.sign(o.x1 - o.x0);
      T.x = x + dir * 14; T.z = o.z * .6; T.y = P.y - .6;
    } else if (kind === 'top') {
      const y = o.y0 + (o.y1 - o.y0) * k;
      P.x = .1; P.z = .1; P.y = y; T.x = 0; T.y = 0; T.z = 0;
      this.roll = 0; this.topUp = t * .25;
    } else if (kind === 'orbit') {
      const R = o.R0 + (o.R1 - o.R0) * k, a = t * o.spd + .6;
      P.x = Math.sin(a) * R; P.z = Math.cos(a) * R; P.y = o.y; T.x = 0; T.y = o.ty; T.z = 0;
    } else if (kind === 'under') { // 砂山から首を見上げる
      const a = t * o.spd;
      const r = 26, top = W.surfaceBot(r, this.env.P);
      P.x = Math.sin(a) * r; P.z = Math.cos(a) * r; P.y = top + 2.2; T.x = 0; T.y = 6; T.z = 0;
    } else { // follow
      const p = this.list[o.a % this.list.length];
      this.worldOf({ x: p.x, y: p.y + 1.3, z: p.z }, T, angle);
      const pull = o.pull ? Math.sin(flipT * Math.PI) * o.pull : 0;
      const d = o.dist + pull, yaw = (o.yaw || 0) + p.yaw + lt * (o.spin || 0) + Math.PI;
      const pit = o.pitch + (o.rise ? k * .7 : 0);
      const dd = d + (o.rise ? k * o.rise : 0);
      P.x = T.x + Math.sin(yaw) * Math.cos(pit) * dd;
      P.y = T.y + Math.sin(pit) * dd;
      P.z = T.z + Math.cos(yaw) * Math.cos(pit) * dd;
      if (flipT === 0) {
        const r = Math.hypot(P.x, P.z);
        const g = P.y >= 0 ? W.sandTop(r, this.env.L) : W.sandBot(r, this.env.P);
        if (P.y < g + .7) P.y = g + .7;
      }
    }
    this.topMode = kind === 'top';
    if (i !== this.shotIdx) {
      this.shotIdx = i;
      // サビ頭だけ白く光らせる
      if (t0 === 49.1 || t0 === 118) { const f = $('opflash'); f.style.transition = 'none'; f.style.opacity = 1; requestAnimationFrame(() => { f.style.transition = 'opacity 1s'; f.style.opacity = 0; }); }
    }
  }
  overlay(t) {
    const fade = t < 2 ? 1 - t / 2 : t > 158 ? Math.min(1, (t - 158) / 3.5) : 0;
    $('opfade').style.opacity = fade;
    let idx = -1;
    for (let i = 0; i < LYRICS.length; i++) if (t >= LYRICS[i][0] && t < LYRICS[i][1]) { idx = i; break; }
    const box = $('oplyric');
    if (idx !== this.lineIdx) {
      this.lineIdx = idx;
      if (idx >= 0) { box.textContent = LYRICS[idx][2]; box.classList.add('on'); } else box.classList.remove('on');
    }
    if (idx >= 0) box.style.setProperty('--p', `${((t - LYRICS[idx][0]) / (LYRICS[idx][1] - LYRICS[idx][0] - .25)) * 100}%`);
    const logo = LOGOS.some(([a, b]) => t >= a && t < b);
    if (logo !== this.logoOn) { this.logoOn = logo; $('oplogo').classList.toggle('on', logo); }
    $('opbar').style.width = `${(t / END) * 100}%`;
  }
}
