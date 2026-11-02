// 1つの砂時計（部屋）。シミュレーションはすべてサーバーが決める
import * as W from '../shared/world.js';
import { likes } from './likes.js';
const { PHASE, F, EPOCHS } = W;

export const MAX_HUMANS = 150;
const BOT_TARGET = 48;      // 人が少なくても賑わうよう、砂人形でこの人数まで埋める
const NEAR_DIST2 = 55 * 55;
const SNAP_NEAR = 30, SNAP_TOTAL = 42; // 1回のスナップショットに載せる人数（遠くの人は順番に）
const MAX_GRAINS = 420;
const POS_SCALE = 300;
const buf = Buffer.alloc(32 + SNAP_TOTAL * 11);
const view = new DataView(buf.buffer, buf.byteOffset, buf.length);
const BOT_NAMES = '朝霧 白露 夕凪 薄氷 木洩 残照 瑠璃 浅葱 東雲 宵闇 霜夜 千草 青嵐 花曇 水面 星屑 雪解 若葉 落葉 陽炎 虹彩 時雨 月影 暁 蛍火 雲雀 燕 鈴音 小波 風花 山吹 紫苑 藍 琥珀 翡翠 珊瑚 黒曜 銀杏 楓 葵 菫 椿 蓮 萩 桔梗 撫子 芒 柊 樒 楠'.split(' ');
const TIME_SCALE = Number(process.env.TIME_SCALE || 1); // テスト用: 結果発表までを早送りする
const MAX_LIKES_PER_MSG = 50; // 通信の乱用だけを防ぐ。回数そのものに上限はない
const rand = (a, b) => a + Math.random() * (b - a);

export class Room {
  constructor(id, onEmpty) {
    this.id = id;
    this.onEmpty = onEmpty;
    this.players = new Map();
    this.list = [];
    this.humanCount = 0;
    this.nextId = 1;
    this.grains = new Map();
    this.nextGrain = 1;
    this.env = W.setSand(W.makeEnv(), 1);
    this.env.flow = 0;
    this.phase = PHASE.WAIT;
    this.epoch = -1;
    this.flipCount = 0;
    this.timeLeft = W.WAIT_TIME;
    this.tickN = 0;
    this.tickMs = 0;
    this.spawnAcc = 0;
    this.ev = { g: [], r: [], e: [] };
    this.roundLikes = 0;
    this.likesDirty = false;
    this.last = Date.now();
    this.acc = 0;
    this.timer = setInterval(() => this.loop(), 16);
  }

  // ───────── 入退室 ─────────
  makePlayer(name, ws) {
    let id = this.nextId++;
    if (this.nextId > 60000) this.nextId = 1;
    const p = W.newBody();
    Object.assign(p, {
      id, name, ws, bot: !ws, hue: Math.random(), life: W.START_LIFE, soul: 0, inp: { mx: 0, mz: 0, jump: false, dash: false, give: false, seq: 0 },
      safeT: 0, giveCd: 0, gave: 0, hits: 0, lastBy: 0, lastByT: 0, survived: 0, diedAt: -1, rr: 0, ai: { t: 0, tx: 0, tz: 0, seek: 0 },
    });
    this.players.set(id, p);
    this.list.push(p);
    return p;
  }
  place(p) { // 上の球の砂の平らなところに置く
    const a = rand(0, Math.PI * 2), maxR = Math.max(26, Math.min(44, W.glassR(this.env.L) - 4)), r = rand(24, maxR);
    p.x = Math.cos(a) * r; p.z = Math.sin(a) * r;
    p.y = W.surfaceTop(r, this.env.L);
    p.vx = p.vy = p.vz = 0; p.ground = true;
    p.yaw = Math.atan2(-p.x, -p.z);
  }
  rosterEntry(p) { return [p.id, p.name, Math.round(p.hue * 1000), p.bot ? 1 : 0]; }

  addHuman(ws, name) {
    const p = this.makePlayer(name, ws);
    this.humanCount++;
    this.fillBots();
    if (this.phase === PHASE.WAIT || this.phase === PHASE.END) { this.place(p); p.life = W.START_LIFE; }
    else if (this.epoch < EPOCHS.length - 1) { this.place(p); p.life = W.LATE_LIFE; p.safeT = 3; }
    else { this.place(p); this.killSilently(p); } // 最後の刻には蘇れないので次の巡りを待つ
    if (this.phase === PHASE.FLIP) { p.y = W.H * 0.5; p.x = p.z = 5; }
    this.send(p, {
      t: 'hello', id: p.id, room: this.id, phase: this.phase, epoch: this.epoch, flipCount: this.flipCount, f: this.env.f, left: this.timeLeft,
      roster: this.list.map((q) => this.rosterEntry(q)),
      grains: [...this.grains.values()].map((g) => this.grainWire(g)),
    });
    this.ev.e.push(['join', ...this.rosterEntry(p)]);
    return p;
  }
  fillBots() {
    const want = Math.max(0, BOT_TARGET - this.humanCount);
    let bots = this.list.filter((p) => p.bot);
    while (bots.length > want) { this.remove(bots.pop()); }
    while (bots.length < want) {
      const name = '砂・' + BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      const b = this.makePlayer(name, null);
      this.place(b);
      if (this.phase === PHASE.RUN || this.phase === PHASE.FLIP) b.life = W.LATE_LIFE;
      this.ev.e.push(['join', ...this.rosterEntry(b)]);
      bots.push(b);
    }
  }
  remove(p) {
    if (!this.players.delete(p.id)) return;
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    this.ev.e.push(['leave', p.id]);
    if (!p.bot) {
      this.humanCount--;
      if (this.humanCount <= 0) { // 誰もいない部屋は閉じる
        clearInterval(this.timer);
        this.onEmpty(this);
        return;
      }
      this.fillBots();
    }
  }
  onInput(p, data) {
    if (data.length !== 6 || data[0] !== 2) return;
    const i = p.inp;
    i.seq = data.readUInt16LE(1);
    i.mx = Math.max(-1, Math.min(1, data.readInt8(3) / 100));
    i.mz = Math.max(-1, Math.min(1, data.readInt8(4) / 100));
    const b = data[5];
    if (b & 1) i.jump = true;
    if (b & 2) i.dash = true;
    if (b & 4) i.give = true;
  }
  // 砂時計イイネ。結果発表の間だけ、何回でも押せる
  onLike(p, n) {
    if (this.phase !== PHASE.END) return;
    n = Math.floor(Number(n));
    if (!(n >= 1)) return;
    n = Math.min(n, MAX_LIKES_PER_MSG);
    this.roundLikes += n;
    likes.add(n);
    this.likesDirty = true;
  }
  send(p, obj) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(obj));
  }
  broadcastRaw(s) {
    for (const p of this.list) if (p.ws && p.ws.readyState === 1 && p.ws.bufferedAmount < 256 * 1024) p.ws.send(s);
  }

  // ───────── 進行 ─────────
  loop() {
    const now = Date.now();
    this.acc += Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    while (this.acc >= W.TICK) {
      this.acc -= W.TICK;
      const t0 = performance.now();
      try { this.tick(W.TICK); } catch (e) { console.error('[tick]', e); }
      this.tickMs += (performance.now() - t0 - this.tickMs) * 0.05;
    }
  }
  setPhase(ph, left) {
    this.phase = ph; this.timeLeft = left;
    this.env.flip = ph === PHASE.FLIP;
    this.env.flow = ph === PHASE.RUN ? EPOCHS[this.epoch].flow : 0; // 待機中と終了後は流砂を止める
  }
  startRound() {
    this.epoch = 0;
    this.setPhase(PHASE.RUN, EPOCHS[0].dur);
    this.spawnTopGrains(Math.min(50, 10 + Math.round(this.list.length * .5)));
    this.ev.e.push(['epoch', 0]);
  }
  beginFlip() { this.setPhase(PHASE.FLIP, W.FLIP_TIME); this.ev.e.push(['flip']); }
  endFlip() {
    // 砂時計が半回転した瞬間。座標と上下の砂を入れ替える
    this.flipCount = (this.flipCount + 1) & 255;
    for (const p of this.list) W.mirror(p);
    W.setSand(this.env, 1 - this.env.f);
    for (const id of this.grains.keys()) this.ev.r.push([id, 0]);
    this.grains.clear();
    this.epoch++;
    this.setPhase(PHASE.RUN, EPOCHS[this.epoch].dur);
    this.spawnTopGrains(Math.min(50, 10 + Math.round(this.alive() * .5)));
    this.ev.e.push(['epoch', this.epoch]);
  }
  endRound() {
    const ranked = [...this.list].sort((a, b) => (b.ghost ? 0 : 1) - (a.ghost ? 0 : 1) || (a.ghost ? b.survived - a.survived : b.life - a.life));
    const top = ranked.slice(0, 10).map((p) => ({ n: p.name, id: p.id, a: p.ghost ? 0 : 1, l: Math.round(p.life), s: Math.round(p.survived), g: p.gave, h: p.hits, b: p.bot ? 1 : 0 }));
    let hero = null;
    for (const p of this.list) if (p.gave > 0 && (!hero || p.gave > hero.gave)) hero = p;
    const heroWire = hero ? { n: hero.name, g: hero.gave } : null;
    const alive = this.alive();
    ranked.forEach((p, i) => {
      this.send(p, { t: 'end', likes: likes.total, top, hero: heroWire, rank: i + 1, total: ranked.length, alive, you: { a: p.ghost ? 0 : 1, l: Math.round(p.life), s: Math.round(p.survived), g: p.gave, h: p.hits } });
    });
    this.setPhase(PHASE.END, W.END_TIME);
  }
  resetRound() {
    for (const id of this.grains.keys()) this.ev.r.push([id, 0]);
    this.grains.clear();
    W.setSand(this.env, 1);
    this.epoch = -1;
    this.roundLikes = 0;
    for (const p of this.list) {
      Object.assign(p, { ghost: false, life: W.START_LIFE, soul: 0, gave: 0, hits: 0, survived: 0, diedAt: -1, lastBy: 0, safeT: 0, stunT: 0, dashT: 0, dashCd: 0 });
      this.place(p);
    }
    this.setPhase(PHASE.WAIT, W.WAIT_TIME);
    this.ev.e.push(['reset']);
  }
  alive() { let n = 0; for (const p of this.list) if (!p.ghost) n++; return n; }

  tick(dt) {
    this.tickN++;
    this.timeLeft -= this.phase === PHASE.END ? dt : dt * TIME_SCALE;
    const running = this.phase === PHASE.RUN;

    if (running) {
      const ep = EPOCHS[this.epoch];
      if (this.env.f > 0) W.setSand(this.env, Math.max(0, this.env.f - ep.rate * dt));
      this.spawnStream(dt);
      if (this.timeLeft <= 0) {
        if (this.epoch >= EPOCHS.length - 1) this.endRound();
        else this.beginFlip();
      } else if (this.epoch === EPOCHS.length - 1 && this.alive() === 0) {
        this.endRound(); // 最後の刻で全員の砂が尽きたら終わり
      }
    } else if (this.timeLeft <= 0) {
      if (this.phase === PHASE.WAIT) this.startRound();
      else if (this.phase === PHASE.FLIP) this.endFlip();
      else if (this.phase === PHASE.END) this.resetRound();
    }

    const ai = this.tickN % 6 === 0;
    for (const p of this.list) {
      if (p.bot && ai && this.phase !== PHASE.END) this.think(p);
      this.stepPlayer(p, dt);
    }
    if (this.tickN % 2 === 0) this.touchGrains();
    if (this.tickN % 3 === 0) this.separate();
    if (this.phase === PHASE.RUN || this.phase === PHASE.WAIT) this.resolveDashes();
    if (this.tickN % 2 === 0) this.sendSnapshots();
    if (this.tickN % 3 === 0) this.flushEvents();
    if (this.tickN % 30 === 0) this.sendRanking();
    if (this.likesDirty && this.tickN % 3 === 0) {
      this.likesDirty = false;
      this.broadcastRaw(JSON.stringify({ t: 'lk', r: this.roundLikes, a: likes.total }));
    }
  }

  stepPlayer(p, dt) {
    const i = p.inp;
    p.safeT = Math.max(0, p.safeT - dt);
    p.giveCd = Math.max(0, p.giveCd - dt);
    const playing = this.phase !== PHASE.END;
    const dashed = W.stepBody(p, playing ? i.mx : 0, playing ? i.mz : 0, i.jump && playing, i.dash && playing && !(p.life <= 1.5 && this.phase === PHASE.RUN), this.env, dt);
    if (dashed && this.phase === PHASE.RUN) p.life -= 1;
    if (i.give) this.tryGive(p);
    i.jump = i.dash = i.give = false;
    if (this.phase !== PHASE.RUN || p.ghost) return;
    // 命が減る。上の球はゆっくり、落ちてくる砂に埋もれると速い
    const ep = EPOCHS[this.epoch];
    let d = ep.drain * (p.y >= 0 ? W.TOP_DRAIN : 1);
    if (p.buried) d *= W.BURY_DRAIN;
    p.life -= d * dt;
    p.survived += dt;
    if (p.life <= 0) this.die(p);
  }
  die(p) {
    const by = p.lastBy && this.tickN - p.lastByT < 180 ? p.lastBy : 0;
    p.life = 0; p.ghost = true; p.soul = 0; p.ground = false; p.stunT = 0; p.dashT = 0;
    this.ev.e.push(['die', p.id, by]);
  }
  killSilently(p) { p.life = 0; p.ghost = true; p.soul = 0; p.ground = false; }
  rebirth(p, life) {
    p.ghost = false; p.life = life; p.soul = 0; p.safeT = 2.5; p.vy = 6; p.ground = false;
    this.ev.e.push(['reb', p.id]);
  }
  canRebirth() { return this.phase === PHASE.RUN && this.epoch < EPOCHS.length - 1; }

  // 近くの亡霊に命を分ける
  tryGive(p) {
    if (p.ghost || p.giveCd > 0 || p.life <= W.GIFT + 2 || !this.canRebirth()) return;
    let best = null, bd = 9 * 9;
    for (const q of this.list) {
      if (!q.ghost) continue;
      const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) return;
    p.life -= W.GIFT; p.gave += W.GIFT; p.giveCd = 0.8;
    best.soul += W.GIFT;
    this.ev.e.push(['give', p.id, best.id]);
    if (best.soul >= W.REBIRTH_SOUL) this.rebirth(best, best.soul);
  }

  // ───────── 命の粒 ─────────
  grainWire(g) { return [g.id, Math.round(g.x * 10) / 10, Math.round(g.z * 10) / 10, g.top ? 1 : 0, g.v, Math.round((this.tickN - g.born) * W.TICK * 1000), g.vr, g.fall]; }
  addGrain(x, z, top, v, fall) {
    if (this.grains.size >= MAX_GRAINS) return null;
    const g = { id: this.nextGrain++, x, z, top, v, vr: top ? 0.55 * (this.epoch >= 0 ? EPOCHS[this.epoch].flow : 1) : 0, born: this.tickN, fall };
    if (this.nextGrain > 1e9) this.nextGrain = 1;
    this.grains.set(g.id, g);
    this.ev.g.push(this.grainWire(g));
    return g;
  }
  spawnTopGrains(n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.283), r = rand(16, Math.max(18, W.glassR(this.env.L) - 2));
      this.addGrain(Math.cos(a) * r, Math.sin(a) * r, true, Math.random() < 0.12 ? 6 : 2, 0);
    }
  }
  spawnStream(dt) {
    if (this.env.f <= 0) return;
    // 全員が平均的に拾うと命の減りとほぼ釣り合う量を落とす
    this.spawnAcc += dt * (2.5 + this.list.length * 0.17);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const rmax = Math.min(46, Math.max(10, (this.env.P + W.H) / 0.55));
      const a = rand(0, 6.283), r = 6 + Math.pow(Math.random(), 0.7) * (rmax - 6);
      this.addGrain(Math.cos(a) * r, Math.sin(a) * r, false, Math.random() < 0.07 ? 6 : 2, W.GRAIN_FALL);
    }
  }
  touchGrains() {
    if (this.phase === PHASE.END || this.phase === PHASE.FLIP) return;
    const pos = { x: 0, y: 0, z: 0, r: 0 };
    const canSoul = this.canRebirth();
    for (const g of this.grains.values()) {
      const age = (this.tickN - g.born) * W.TICK;
      if (age < g.fall) continue;
      if (age > 16) { this.grains.delete(g.id); this.ev.r.push([g.id, 0]); continue; } // 古い粒は砂に沈む
      W.grainPos(g, age, this.env, pos);
      if (g.top && pos.r < 4) { this.grains.delete(g.id); this.ev.r.push([g.id, 0]); continue; }
      for (const p of this.list) {
        const dx = p.x - pos.x, dz = p.z - pos.z;
        if (dx * dx + dz * dz > 3.2) continue;
        if (Math.abs(p.y - pos.y) > 3.2) continue;
        if (p.ghost && !canSoul) continue;
        if (p.ghost) { p.soul += g.v; if (p.soul >= W.REBIRTH_SOUL) this.rebirth(p, p.soul); }
        else p.life = Math.min(W.MAX_LIFE, p.life + g.v);
        this.grains.delete(g.id);
        this.ev.r.push([g.id, p.id]);
        break;
      }
    }
  }

  // ───────── ぶつかり合い ─────────
  resolveDashes() {
    for (const a of this.list) {
      if (a.dashT <= 0 || a.ghost) continue;
      for (const b of this.list) {
        if (a === b || b.ghost || b.safeT > 0 || b.stunT > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        if (dx * dx + dz * dz > 5.0 || Math.abs(dy) > 2.6) continue;
        const d = Math.hypot(dx, dz) || 1;
        b.vx = (dx / d) * 21; b.vz = (dz / d) * 21; b.vy = 9; b.ground = false; b.stunT = 0.8;
        a.hits++; b.lastBy = a.id; b.lastByT = this.tickN; a.dashT = 0; a.vx *= -0.2; a.vz *= -0.2;
        this.ev.e.push(['hit', a.id, b.id]);
        if (this.phase === PHASE.RUN) {
          const spill = Math.min(b.life - 0.5, Math.max(4, b.life * 0.14));
          if (spill > 0) {
            b.life -= spill;
            this.spill(b, spill);
          }
        }
        break;
      }
    }
  }
  spill(b, amount) { // 奪われた命は粒になって周りに散らばる（早い者勝ち）
    const n = Math.max(1, Math.min(6, Math.round(amount / 3)));
    const v = Math.round(amount / n * 10) / 10;
    const top = b.y >= 0;
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.283), rr = rand(2.5, 7);
      let x = b.x + Math.cos(a) * rr, z = b.z + Math.sin(a) * rr;
      const r = Math.hypot(x, z), max = W.glassR(b.y) - 1.5;
      if (r > max) { x *= max / r; z *= max / r; }
      this.addGrain(x, z, top, v, 0.15);
    }
  }
  separate() { // 重ならないように軽く押し合う
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.ghost) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (b.ghost) continue;
        const dx = b.x - a.x; if (dx > 1.1 || dx < -1.1) continue;
        const dz = b.z - a.z; if (dz > 1.1 || dz < -1.1) continue;
        if (Math.abs(b.y - a.y) > 2) continue;
        const d2 = dx * dx + dz * dz; if (d2 > 1.21) continue;
        const d = Math.sqrt(d2) || 0.01, push = (1.1 - d) * 0.5;
        a.x -= (dx / d) * push; a.z -= (dz / d) * push; b.x += (dx / d) * push; b.z += (dz / d) * push;
      }
    }
  }

  // ───────── 砂人形の頭 ─────────
  think(p) {
    const i = p.inp, r = Math.hypot(p.x, p.z), ai = p.ai;
    const top = p.y >= 0;
    if (this.phase === PHASE.FLIP) { i.mx = i.mz = 0; return; }
    let tx = 0, tz = 0, go = false;
    let best = null, bd = Infinity;
    const pos = { x: 0, y: 0, z: 0, r: 0 };
    for (const g of this.grains.values()) {
      if (g.top !== top) continue;
      W.grainPos(g, (this.tickN - g.born) * W.TICK, this.env, pos);
      const d = (pos.x - p.x) ** 2 + (pos.z - p.z) ** 2 - g.v * 8;
      if (d < bd) { bd = d; best = { x: pos.x, z: pos.z }; }
    }
    if (best && bd < 45 * 45) { tx = best.x; tz = best.z; go = true; }
    if (top && !p.ghost) {
      // 命に余裕がなければ流砂に身を任せて粒の多い下へ。余裕があれば中心から逃げる
      const dive = (p.life < 45 || p.id % 5 < 2) && this.env.f > 0.05; // 5人に2人は最初から下の球へ向かう
      if (dive) { tx = 0; tz = 0; go = true; }
      else if (r < 16) { tx = p.x * 3; tz = p.z * 3; go = true; }
    } else if (!top && !p.ghost && r < 7) { tx = p.x * 3 + 1; tz = p.z * 3 + 1; go = true; }
    if (!go) {
      ai.t -= 0.2;
      if (ai.t <= 0) { const a = rand(0, 6.283), rr = rand(18, 40); ai.tx = Math.cos(a) * rr; ai.tz = Math.sin(a) * rr; ai.t = rand(2, 6); }
      tx = ai.tx; tz = ai.tz;
    }
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1;
    const sway = (p.id % 7 - 3) * 0.04;
    i.mx = dx / d + sway; i.mz = dz / d - sway;
    if (p.ghost) return;
    if (p.ground && Math.random() < 0.012) i.jump = true;
    // 近くの人に体当たり／亡霊に命を分ける
    if (this.phase === PHASE.RUN && Math.random() < 0.2) {
      for (const q of this.list) {
        if (q === p) continue;
        const qd = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
        if (qd > 90 || Math.abs(q.y - p.y) > 3) continue;
        if (q.ghost) {
          if (p.life > 45 && (p.id + this.epoch) % 4 === 0 && Math.random() < 0.3) i.give = true;
        } else if (p.dashCd <= 0 && p.life > 6 && Math.random() < 0.3 && (!q.bot || Math.random() < 0.3)) {
          const qq = Math.sqrt(qd) || 1;
          i.mx = (q.x - p.x) / qq; i.mz = (q.z - p.z) / qq; i.dash = true;
        }
        break;
      }
    }
  }

  // ───────── 送信 ─────────
  writeEntry(o, p) {
    view.setUint16(o, p.id, true);
    view.setInt16(o + 2, Math.max(-32000, Math.min(32000, p.x * POS_SCALE)), true);
    view.setInt16(o + 4, Math.max(-32000, Math.min(32000, p.y * POS_SCALE)), true);
    view.setInt16(o + 6, Math.max(-32000, Math.min(32000, p.z * POS_SCALE)), true);
    buf[o + 8] = Math.round(((p.yaw % 6.2832) + 6.2832) % 6.2832 / 6.2832 * 255);
    let fl = 0;
    if (p.ghost) fl |= F.GHOST;
    if (p.dashT > 0) fl |= F.DASH;
    if (p.ground) fl |= F.GROUND;
    if (p.stunT > 0) fl |= F.STUN;
    if (p.buried) fl |= F.BURIED;
    if (p.bot) fl |= F.BOT;
    if (p.safeT > 0) fl |= F.SAFE;
    buf[o + 9] = fl;
    buf[o + 10] = Math.min(255, Math.ceil(p.ghost ? p.soul : p.life));
    return o + 11;
  }
  sendSnapshots() {
    const alive = this.alive();
    const L = this.list, near = [];
    const left = Math.max(0, Math.min(65535, Math.round(this.timeLeft * 100)));
    const fw = Math.round(this.env.f * 65535);
    for (const me of L) {
      if (!me.ws || me.ws.readyState !== 1 || me.ws.bufferedAmount > 128 * 1024) continue;
      near.length = 0;
      for (const q of L) {
        if (q === me) continue;
        const d = (q.x - me.x) ** 2 + (q.y - me.y) ** 2 + (q.z - me.z) ** 2;
        if (d < NEAR_DIST2) near.push(q, d);
      }
      // 距離の近い順に SNAP_NEAR 人（near は [人, 距離, 人, 距離…]）
      const n = near.length / 2;
      const order = new Array(n);
      for (let i = 0; i < n; i++) order[i] = i;
      if (n > SNAP_NEAR) order.sort((x, y) => near[x * 2 + 1] - near[y * 2 + 1]);
      view.setUint8(0, 1);
      buf[1] = this.phase; buf[2] = this.epoch + 1; buf[3] = this.flipCount;
      view.setUint16(4, left, true); view.setUint16(6, fw, true);
      view.setUint16(8, alive, true); view.setUint16(10, L.length, true);
      view.setUint16(12, this.humanCount, true); view.setUint16(14, me.inp.seq, true);
      view.setUint16(16, Math.round(me.life * 10), true);
      buf[18] = Math.min(255, Math.round(me.soul));
      view.setInt16(20, me.vx * 100, true); view.setInt16(22, me.vy * 100, true); view.setInt16(24, me.vz * 100, true);
      buf[26] = Math.round(Math.min(1, me.dashCd / W.DASH_CD) * 255);
      let o = this.writeEntry(28, me), count = 1;
      const taken = Math.min(n, SNAP_NEAR);
      const seen = new Set();
      for (let i = 0; i < taken; i++) { const q = near[order[i] * 2]; seen.add(q); o = this.writeEntry(o, q); count++; }
      // 残りは順番に載せる（遠くの人も止まって見えないように）
      if (L.length > 1) {
        let tries = L.length;
        while (count < SNAP_TOTAL && tries-- > 0) {
          me.rr = (me.rr + 1) % L.length;
          const q = L[me.rr];
          if (q === me || seen.has(q)) continue;
          o = this.writeEntry(o, q); count++;
        }
      }
      buf[27] = count;
      me.ws.send(Buffer.from(buf.subarray(0, o)));
    }
  }
  flushEvents() {
    const ev = this.ev;
    if (!ev.g.length && !ev.r.length && !ev.e.length) return;
    this.broadcastRaw(JSON.stringify({ t: 'ev', g: ev.g, r: ev.r, e: ev.e }));
    this.ev = { g: [], r: [], e: [] };
  }
  sendRanking() {
    const top = [...this.list].filter((p) => !p.ghost).sort((a, b) => b.life - a.life).slice(0, 6).map((p) => [p.id, Math.ceil(p.life)]);
    this.broadcastRaw(JSON.stringify({ t: 'rk', top }));
  }
}
