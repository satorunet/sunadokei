// 命の砂時計 クライアント本体
import * as THREE from 'three';
import * as W from '../shared/world.js';
import { World } from './world3d.js';
import { Actors, Grains, Sparks, tiltToGround, makeArrow } from './actors.js';
import { Sound } from './audio.js';
import { Music, Opening } from './op.js';

const { PHASE, F, EPOCHS } = W;
const $ = (id) => document.getElementById(id);
const BASE = location.pathname.replace(/\/[^/]*$/, '');
const isTouch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
if (isTouch) document.documentElement.classList.add('touch');
const lite = isTouch || /[?&]lite\b/.test(location.search);

// ───────── 描画の準備 ─────────
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, powerPreference: 'high-performance' });
} catch {
  $('nogl').style.display = 'flex';
  throw new Error('WebGL2 unavailable');
}
let pixelRatio = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // シェーダー側で色を決める
const world = new World(lite);
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 3000);
const actors = new Actors(world.group, world.glowTex);
const grains = new Grains(world.group, world.glowTex);
const sparks = new Sparks(world.group, lite ? 1200 : 2400);
const sound = new Sound();
const arrow = makeArrow();
world.group.add(arrow);
const ARROW_RANGE = 34;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
const pxScale = () => renderer.getPixelRatio() * (innerHeight / 800);

// ───────── 状態 ─────────
const S = {
  joined: false, id: 0, phase: PHASE.WAIT, epoch: -1, flipCount: 0, f: 0.62, left: 0, leftAt: 0,
  alive: 0, total: 0, humans: 0, ack: 0, life: 60, soul: 0, dashCd: 0, ghost: false, buried: false, rankTop: [],
};
const roster = new Map();          // id → {id,name,hue,bot,...描画用の値}
const me = W.newBody(40, 40, 0);
const env = W.setSand(W.makeEnv(), S.f);
const history = new Map();
let seq = 0;
const view = { yaw: 0.6, pitch: 0.32, dist: 8.5, blend: 0 };
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
const tmpV = new THREE.Vector3();
let ws = null;
let clockNow = 0;

function entity(id, name, hue, bot) {
  const e = { id, name, hue, bot, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, yaw: 0, tyaw: 0, flags: 0, life: 60, ghost: false, ground: true, dash: false, stun: false, safe: false, walk: Math.random() * 6, speed: 0, gy: 0, flash: 0, seen: false, lastSeen: 0 };
  roster.set(id, e);
  return e;
}
const nameOf = (id) => roster.get(id)?.name || '誰か';

// ───────── 通信 ─────────
function connect(name) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}${BASE}/ws`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name }));
  ws.onmessage = (m) => {
    if (typeof m.data === 'string') onJSON(JSON.parse(m.data));
    else onSnapshot(new DataView(m.data));
  };
  ws.onclose = (e) => {
    if (e.code === 1012) { // サーバーの更新。少し待って自動で入り直す
      $('lostmsg').textContent = 'ゲームを更新しました。入り直します…';
      $('lost').style.display = 'flex';
      setTimeout(() => location.reload(), 1500 + Math.random() * 2500);
      return;
    }
    $('lostmsg').textContent = e.code === 1013 ? '砂時計が満員か、同じ接続先からの参加が多すぎます' : '接続が切れました';
    $('lost').style.display = 'flex';
  };
}

function onJSON(m) {
  if (m.t === 'hello') {
    S.joined = true; S.id = m.id; S.phase = m.phase; S.epoch = m.epoch; S.flipCount = m.flipCount;
    S.f = m.f; setLeft(m.left);
    roster.clear();
    for (const r of m.roster) entity(r[0], r[1], r[2] / 1000, !!r[3]);
    grains.map.clear();
    for (const g of m.grains) grains.add(g, clockNow);
    history.clear();
    startPlaying();
    return;
  }
  if (m.t === 'ev') {
    for (const g of m.g) grains.add(g, clockNow);
    for (const r of m.r) onGrainGone(r[0], r[1]);
    for (const e of m.e) onEvent(e);
    return;
  }
  if (m.t === 'rk') { S.rankTop = m.top; drawRank(); return; }
  if (m.t === 'lk') { onLikes(m.c, m.a); return; }
  if (m.t === 'end') showResult(m);
}

function onSnapshot(d) {
  if (d.getUint8(0) !== 1) return;
  const phase = d.getUint8(1), epoch = d.getUint8(2) - 1, flip = d.getUint8(3);
  if (flip !== S.flipCount) { S.flipCount = flip; flipFrame(); }
  if (phase !== S.phase) onPhase(phase, epoch);
  S.phase = phase; S.epoch = epoch;
  setLeft(d.getUint16(4, true) / 100);
  S.f = d.getUint16(6, true) / 65535;
  S.alive = d.getUint16(8, true); S.total = d.getUint16(10, true); S.humans = d.getUint16(12, true); S.ack = d.getUint16(14, true);
  S.life = d.getUint16(16, true) / 10; S.soul = d.getUint8(18);
  const svx = d.getInt16(20, true) / 100, svy = d.getInt16(22, true) / 100, svz = d.getInt16(24, true) / 100;
  S.dashCd = d.getUint8(26) / 255;
  const count = d.getUint8(27);
  let o = 28;
  for (let i = 0; i < count; i++, o += 11) {
    const id = d.getUint16(o, true);
    const x = d.getInt16(o + 2, true) / 300, y = d.getInt16(o + 4, true) / 300, z = d.getInt16(o + 6, true) / 300;
    const yaw = (d.getUint8(o + 8) / 255) * Math.PI * 2, fl = d.getUint8(o + 9), life = d.getUint8(o + 10);
    const e = roster.get(id);
    if (!e) continue;
    if (!e.seen) { e.x = x; e.y = y; e.z = z; e.seen = true; }
    e.tx = x; e.ty = y; e.tz = z; e.tyaw = yaw; e.flags = fl; e.life = life;
    e.ghost = !!(fl & F.GHOST); e.ground = !!(fl & F.GROUND); e.dash = !!(fl & F.DASH); e.stun = !!(fl & F.STUN); e.safe = !!(fl & F.SAFE);
    if (id === S.id) reconcile(x, y, z, svx, svy, svz, fl, e);
  }
}

// 自分の位置はこちらで先に動かしておき、サーバーとのずれをなめらかに直す
function reconcile(x, y, z, vx, vy, vz, fl, e) {
  if (!S.placed) { // 最初の1回は出現位置へ移動し、中心を向く
    S.placed = true;
    me.x = x; me.y = y; me.z = z; me.vx = me.vy = me.vz = 0;
    view.yaw = Math.atan2(x, z);
  }
  const wasGhost = S.ghost;
  S.ghost = !!(fl & F.GHOST);
  me.ghost = S.ghost;
  S.buried = !!(fl & F.BURIED);
  S.noChance = !!(fl & F.NOCHANCE);
  if (wasGhost !== S.ghost) canvas.classList.toggle('dead', S.ghost);
  if (S.phase === PHASE.FLIP) { // 反転中はサーバーの位置に合わせる
    me.x += (x - me.x) * .3; me.y += (y - me.y) * .3; me.z += (z - me.z) * .3;
    me.vx = vx; me.vy = vy; me.vz = vz;
    return;
  }
  const h = history.get(S.ack);
  const hx = h ? h.x : me.x, hy = h ? h.y : me.y, hz = h ? h.z : me.z;
  const ex = x - hx, ey = y - hy, ez = z - hz;
  const dist = Math.hypot(ex, ez);
  if (dist > 14 || Math.abs(ey) > 14) { me.x = x; me.y = y; me.z = z; me.vx = vx; me.vy = vy; me.vz = vz; return; }
  if (fl & F.STUN) { // 吹き飛ばされている間は力ごとサーバーに合わせる
    me.stunT = Math.max(me.stunT, .15);
    me.vx = vx; me.vy = vy; me.vz = vz;
    me.x += ex * .4; me.y += ey * .4; me.z += ez * .4;
    return;
  }
  if (dist > 1.6) { me.x += ex * .3; me.z += ez * .3; me.vx = vx; me.vz = vz; }
  else if (dist > .45) { me.x += ex * .08; me.z += ez * .08; }
  if (Math.abs(ey) > 2.5) { me.y += ey * .3; me.vy = vy; }
}

// 砂時計が半回転し終わった瞬間、座標系を入れ替える
function flipFrame() {
  W.mirror(me);
  history.clear();
  for (const e of roster.values()) { e.x = -e.x; e.y = -e.y; e.tx = -e.tx; e.ty = -e.ty; }
  sparks.clear(clockNow);
  sound.land();
  shake = 1.3;
}

function setLeft(v) {
  const est = S.leftAt ? S.left - (clockNow - S.leftAt) : v;
  if (Math.abs(est - v) > .25 || !S.leftAt) { S.left = v; S.leftAt = clockNow; }
}
const timeLeft = () => Math.max(0, S.left - (clockNow - S.leftAt));

// ───────── 出来事 ─────────
function onGrainGone(id, by) {
  const g = grains.map.get(id);
  if (!g) return;
  grains.map.delete(id);
  if (!by) return;
  const p = grains.posOf(g, clockNow, env, {});
  if (dist2Me(p.x, p.y, p.z) < 3600) sparks.emit(p.x, p.y + .4, p.z, g.v >= 6 ? 26 : 10, { speed: 5, up: 5, life: .7 }, clockNow);
  if (by === S.id) {
    sound.pick(g.v >= 6);
    addFloat(`+${Number.isInteger(g.v) ? g.v : g.v.toFixed(1)}`);
    S.life = Math.min(W.MAX_LIFE, S.life + g.v);
  }
}
function dist2Me(x, y, z) { return (x - me.x) ** 2 + (y - me.y) ** 2 + (z - me.z) ** 2; }

function onEvent(e) {
  const k = e[0];
  if (k === 'join') {
    if (!roster.has(e[1])) entity(e[1], e[2], e[3] / 1000, !!e[4]);
    if (!e[4] && e[1] !== S.id) feed(`${e[2]} が砂時計に入った`);
  } else if (k === 'leave') {
    roster.delete(e[1]);
  } else if (k === 'flip') {
    sound.flip();
    banner('砂時計が返る', '上下が入れ替わる', 2.6);
  } else if (k === 'epoch') {
    const ep = EPOCHS[e[1]];
    sound.bell();
    const final = e[1] === EPOCHS.length - 1;
    banner(ep.name, final ? `亡霊にもワンチャン。粒を${W.REBIRTH_SOUL}秒ぶん集めれば一度だけ蘇る` : e[1] === 0 ? '砂が落ちはじめた' : `命の減りが ${ep.drain} 倍に`, 2.6, final);
  } else if (k === 'reset') {
    $('result').classList.remove('on');
    $('hud').classList.add('on');
    gameMusic(GAME_VOL); // 次の巡りでは小さな音量に戻す
    if (!isTouch && !document.pointerLockElement) $('gate').style.display = 'block';
    grains.map.clear();
    banner('次の巡り', 'すべての砂が上に戻る', 2.2);
  } else if (k === 'hit') onHit(e[1], e[2]);
  else if (k === 'die') onDie(e[1], e[2]);
  else if (k === 'reb') onReborn(e[1]);
  else if (k === 'give') onGive(e[1], e[2]);
}
function onHit(a, b) {
  const v = roster.get(b);
  if (v) {
    v.flash = .4;
    if (dist2Me(v.x, v.y, v.z) < 3600) { sparks.emit(v.x, v.y + 1, v.z, 42, { speed: 10, up: 8, life: .9, grav: 9 }, clockNow); if (a === S.id || b === S.id) sound.hit(); }
  }
  if (b === S.id) { sound.hurt(); hitFlash(); shake = Math.max(shake, 1); feed(`${nameOf(a)} に命を砕かれた`, 'red'); }
  else if (a === S.id) { feed(`${nameOf(b)} の命を砕いた`, 'gold'); shake = Math.max(shake, .35); }
  else if (!roster.get(a)?.bot && !v?.bot) feed(`${nameOf(a)} → ${nameOf(b)} 突進`);
}
function onDie(id, by) {
  const v = roster.get(id);
  if (v && dist2Me(v.x, v.y, v.z) < 3600) sparks.emit(v.x, v.y + 1, v.z, 70, { speed: 4, up: 3, life: 1.8, grav: 3, spread: 1.2, color: [.8, .85, 1] }, clockNow);
  if (id === S.id) {
    sound.die();
    banner('砂が尽きた', S.noChance ? 'この巡りでは、もう蘇れない' : `亡霊として粒を${W.REBIRTH_SOUL}秒ぶん集めれば蘇る`, 3.2, true);
    feed(by ? `${nameOf(by)} に命を奪われた` : '命が尽きた', 'red');
  } else if (by === S.id) feed(`${nameOf(id)} の命を終わらせた`, 'gold');
  else if (!v?.bot) feed(by ? `${nameOf(id)} が ${nameOf(by)} に倒された` : `${nameOf(id)} の砂が尽きた`);
}
function onReborn(id) {
  const v = roster.get(id);
  if (v && dist2Me(v.x, v.y, v.z) < 3600) sparks.emit(v.x, v.y, v.z, 80, { speed: 2.5, up: 15, life: 1.3, grav: 1, spread: 1.4, color: [1, .9, .5] }, clockNow);
  if (id === S.id) { sound.reborn(); banner('蘇った', '', 1.8); feed('もう一度、生きる', 'gold'); }
  else if (!v?.bot) feed(`${nameOf(id)} が蘇った`, 'gold');
}
function onGive(a, b) {
  const v = roster.get(b);
  if (v && dist2Me(v.x, v.y, v.z) < 3600) sparks.emit(v.x, v.y + 1, v.z, 30, { speed: 3, up: 6, life: 1, grav: 2, color: [.65, .85, 1] }, clockNow);
  if (a === S.id) { sound.give(); feed(`${nameOf(b)} に命を分けた (-${W.GIFT})`, 'blue'); }
  else if (b === S.id) { sound.give(); feed(`${nameOf(a)} が命を分けてくれた`, 'blue'); }
  else feed(`${nameOf(a)} が ${nameOf(b)} に命を分けた`, 'blue');
}
function onPhase(ph, ep) {
  if (ph === PHASE.WAIT) $('result').classList.remove('on');
  flipWarned = false;
}

// ───────── HUD ─────────
const feedBox = $('feed');
function feed(text, cls = '') {
  const d = document.createElement('div');
  d.textContent = text;
  if (cls) d.className = cls;
  feedBox.appendChild(d);
  while (feedBox.children.length > 6) feedBox.firstChild.remove();
  setTimeout(() => d.remove(), 6500);
}
let bannerT = 0;
function banner(title, sub, sec, warn = false) {
  $('bannerT').textContent = title; $('bannerS').textContent = sub;
  $('banner').classList.add('on');
  $('banner').classList.toggle('warn', !!warn);
  bannerT = sec;
}
function hitFlash() {
  const f = $('hitflash');
  f.style.transition = 'none'; f.style.opacity = 1;
  requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = 0; });
}
const floatPool = [];
function addFloat(text) {
  const d = floatPool.pop() || document.createElement('div');
  d.textContent = text;
  d.style.cssText = `position:absolute;left:50%;top:44%;color:#ffe2a6;font-weight:800;font-size:24px;text-shadow:0 0 12px #ff9b2a,0 1px 4px #000;transition:transform .9s ease-out,opacity .9s;transform:translate(calc(-50% + ${Math.random() * 60 - 30}px),0);opacity:1`;
  $('hud').appendChild(d);
  requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform += ' translateY(-70px)'; d.style.opacity = 0; }));
  setTimeout(() => { d.remove(); floatPool.push(d); }, 950);
}
function drawRank() {
  const box = $('rank');
  let html = '';
  for (const [id, life] of S.rankTop) {
    const e = roster.get(id);
    if (!e) continue;
    const safe = e.name.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    html += `<div class="${id === S.id ? 'me' : ''}"><span>${safe}</span><span>${life}</span></div>`;
  }
  box.innerHTML = html;
}
function showResult(m) {
  $('rhead').textContent = m.you.a ? (m.rank === 1 ? '最も長く生きた' : '生き残った') : '砂は尽きた';
  $('rsum').textContent = `${m.total}人中 ${m.rank}位 ／ 生存 ${m.alive}人 ／ 与えた命 ${m.you.g}秒 ／ 砕いた数 ${m.you.h}`;
  const list = $('rlist');
  list.textContent = '';
  LK.count.clear(); LK.pending.clear(); LK.unacked.clear(); LK.rows.clear(); LK.total = m.likes;
  m.top.forEach((r) => {
    const li = document.createElement('li');
    if (r.id === S.id) li.className = 'me';
    const a = document.createElement('span'); a.textContent = r.r; a.className = 'd';
    const n = document.createElement('span'); n.textContent = r.n; n.className = 'n';
    const v = document.createElement('span'); v.className = 'v'; v.textContent = r.a ? `残り ${r.l}秒` : `${r.s}秒生きた`;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'lk sans'; btn.dataset.id = r.id;
    btn.setAttribute('aria-label', `${r.n} に砂時計イイネ`);
    btn.innerHTML = HG;
    const num = document.createElement('b'); num.textContent = '0';
    btn.appendChild(num);
    LK.rows.set(r.id, { btn, num });
    li.append(a, n, v, btn);
    list.appendChild(li);
  });
  LK.rows.get(S.id)?.btn.closest('li').scrollIntoView({ block: 'nearest' }); // 自分の行が見えるように
  $('rhero').textContent = m.hero ? `最も命を分けた人: ${m.hero.n}（${m.hero.g}秒）` : '';
  drawLikes();
  $('hud').classList.remove('on');
  $('banner').classList.remove('on');
  // 結果発表では主題歌を流す（次の巡りが始まると止まる）
  gameMusic(RESULT_VOL, true);
  $('result').classList.add('on');
  sound.bell();
  releasePointer();
}
// 砂時計イイネ: 人ごとに何回でも押せる。押した分はすぐ画面に出し、0.2秒ごとにまとめて送る
const LK = { count: new Map(), pending: new Map(), unacked: new Map(), rows: new Map(), total: 0, floats: 0 };
const HG_PATH = 'M3 2h18v5c0 5-6 7-7 10 1 3 7 5 7 10v5H3v-5c0-5 6-7 7-10-1-3-7-5-7-10z';
const HG = `<svg viewBox="0 0 24 34" aria-hidden="true"><path d="${HG_PATH}"/></svg>`;
const sumMap = (m) => { let n = 0; for (const v of m.values()) n += v; return n; };
const lkShown = (id) => (LK.count.get(id) || 0) + (LK.pending.get(id) || 0) + (LK.unacked.get(id) || 0);
function drawLikes(id) {
  const row = id !== undefined && LK.rows.get(id);
  if (row) row.num.textContent = lkShown(id).toLocaleString();
  $('likeMine').textContent = lkShown(S.id).toLocaleString();
  $('likeTotal').textContent = (LK.total + sumMap(LK.pending) + sumMap(LK.unacked)).toLocaleString();
}
function likeFloat(el) {
  if (LK.floats >= 36 || !el) return;
  LK.floats++;
  const d = document.createElement('div');
  d.className = 'lkf';
  d.innerHTML = HG;
  const r = el.getBoundingClientRect();
  const s = .6 + Math.random() * .9, dx = (Math.random() - .5) * 90, rot = (Math.random() - .5) * 200;
  d.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top}px;transform:scale(${s})`;
  document.body.appendChild(d);
  d.animate([{ transform: `scale(${s})`, opacity: 1 }, { transform: `translate(${dx}px,-${110 + Math.random() * 130}px) rotate(${rot}deg) scale(${s * .7})`, opacity: 0 }], { duration: 900 + Math.random() * 500, easing: 'ease-out' }).onfinish = () => { d.remove(); LK.floats--; };
}
function pressLike(id) {
  const row = LK.rows.get(id);
  if (!row || !$('result').classList.contains('on')) return;
  LK.pending.set(id, (LK.pending.get(id) || 0) + 1);
  row.btn.classList.add('liked');
  likeFloat(row.btn);
  sound.like();
  row.btn.animate([{ transform: 'scale(.86)' }, { transform: 'scale(1)' }], { duration: 110 });
  drawLikes(id);
}
function onLikes(changes, total) {
  LK.total = total;
  for (const [id, count] of changes) {
    const delta = count - (LK.count.get(id) || 0);
    const un = LK.unacked.get(id) || 0, mine = Math.min(un, Math.max(0, delta));
    LK.unacked.set(id, un - mine);
    LK.count.set(id, count);
    // 他の人が押した分も砂時計を飛ばす
    const row = LK.rows.get(id);
    if (row && $('result').classList.contains('on')) { for (let i = 0; i < Math.min(5, delta - mine); i++) likeFloat(row.btn); drawLikes(id); }
  }
  drawLikes();
}
setInterval(() => {
  if (!LK.pending.size || !ws || ws.readyState !== 1) return;
  for (const [id, v] of LK.pending) {
    const n = Math.min(50, v);
    ws.send(JSON.stringify({ t: 'like', id, n }));
    LK.unacked.set(id, (LK.unacked.get(id) || 0) + n);
    if (v - n > 0) LK.pending.set(id, v - n); else LK.pending.delete(id);
  }
}, 200);
{
  const idOf = (e) => { const b = e.target.closest?.('.lk'); return b ? Number(b.dataset.id) : 0; };
  $('rlist').addEventListener('pointerdown', (e) => { const id = idOf(e); if (id) { e.preventDefault(); pressLike(id); } });
  $('rlist').addEventListener('keydown', (e) => {
    const id = idOf(e);
    if (id && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) pressLike(id); }
  });
}

function fmtTime(s) { s = Math.ceil(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

let flipWarned = false, lastBeat = 0, lastTick = -1, shake = 0;
let lifeShown = -1;
function updateHUD(dt) {
  const left = timeLeft();
  const ph = S.phase;
  let name = '', ep = S.epoch;
  if (ph === PHASE.WAIT) name = '集いの刻';
  else if (ph === PHASE.FLIP) name = '反転';
  else if (ph === PHASE.END) name = '巡りの終わり';
  else name = EPOCHS[ep]?.name || '';
  $('epoch').textContent = name;
  $('timer').textContent = fmtTime(left);
  const urgent = ph === PHASE.RUN && left <= 10;
  $('timer').classList.toggle('urgent', urgent);
  const pips = $('pips').children;
  for (let i = 0; i < 4; i++) pips[i].className = i < ep ? 'done' : i === ep ? 'now' : '';

  // 反転前の予告
  if (ph === PHASE.RUN) {
    const last = ep === EPOCHS.length - 1;
    if (!last && left < 5.2 && !flipWarned) { flipWarned = true; banner('まもなく反転', '', 2, true); sound.warn(); }
    const whole = Math.ceil(left);
    if (left <= 5 && whole !== lastTick) { lastTick = whole; sound.tick(); }
  }
  $('rnext').textContent = ph === PHASE.END ? `次の巡りまで ${Math.ceil(left)} 秒` : '';

  // 命
  const box = $('lifebox');
  const ghost = S.ghost;
  box.classList.toggle('ghost', ghost);
  const low = !ghost && S.life < 12 && ph === PHASE.RUN;
  box.classList.toggle('low', low);
  if (ph === PHASE.RUN && !ghost) {
    const d = EPOCHS[ep].drain * (me.y >= 0 ? W.TOP_DRAIN : 1) * (S.buried ? W.BURY_DRAIN : 1);
    S.life = Math.max(0, S.life - d * dt);
    $('drainnote').textContent = S.buried ? '砂に埋もれている！ 中心から離れて' : `${me.y >= 0 ? '上の球' : '下の球'}  毎秒 −${d.toFixed(2)}`;
    $('drainnote').classList.toggle('bad', S.buried);
  } else if (ghost) {
    $('drainnote').textContent = S.noChance ? 'この巡りでは、もう蘇れない' : S.epoch === EPOCHS.length - 1 ? 'ワンチャン！ 金の粒で一度だけ蘇れる' : '金の粒を拾うか、誰かに分けてもらう';
    $('drainnote').classList.remove('bad');
  } else {
    $('drainnote').textContent = ph === PHASE.WAIT ? '命はまだ減らない' : '';
    $('drainnote').classList.remove('bad');
  }
  const val = ghost ? S.soul : S.life;
  const shownKey = ghost ? -1000 - val : Math.floor(val * 10);
  if (shownKey !== lifeShown) {
    lifeShown = shownKey;
    $('lifenum').innerHTML = ghost ? `${Math.floor(val)}<small> / ${W.REBIRTH_SOUL}</small>` : `${Math.floor(val)}<small>.${Math.floor(val * 10) % 10}</small>`;
    $('lifelbl').textContent = ghost ? '亡霊 ─ 魂の砂' : '命の残り秒数';
    const k = ghost ? Math.min(1, val / W.REBIRTH_SOUL) : Math.min(1, val / 90);
    const h = 32 * k;
    $('miniTop').setAttribute('y', String(35 - h));
    $('miniTop').setAttribute('height', String(h));
    const bh = 30 * (1 - k);
    $('miniBot').setAttribute('y', String(67 - bh));
    $('miniBot').setAttribute('height', String(bh));
    $('miniTop').setAttribute('fill', ghost ? '#a9d8ff' : low ? '#ff5a47' : '#f4b860');
    $('miniBot').setAttribute('fill', ghost ? '#a9d8ff' : low ? '#ff5a47' : '#f4b860');
  }
  $('vignette').style.opacity = low ? String(.55 + .35 * Math.sin(clockNow * 6)) : S.buried ? '.5' : '0';
  if (low && clockNow - lastBeat > Math.max(.5, S.life / 12)) { lastBeat = clockNow; sound.heart(); }
  $('dashfill').style.width = `${(1 - S.dashCd) * 100}%`;
  const humans = S.humans, bots = S.total - humans;
  $('count').innerHTML = `<b>${S.alive}</b> / ${S.total} 生存<br><span style="font-size:11.5px;opacity:.8">人 ${humans} ・ 砂人形 ${bots}</span>`;

  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('on'); }

  // 案内
  const hint = $('hint');
  let msg = '';
  if (ph === PHASE.WAIT) msg = '金の粒は下の球に降る。すり鉢の中心に飛び込めば下へ落ちる';
  else if (ph === PHASE.RUN && !ghost && me.y >= 0 && S.life < 25) msg = '命が少ない。中心へ飛び込み、下の球で粒を集めろ';
  hint.textContent = msg;
  hint.classList.toggle('on', !!msg);

  // 近くの亡霊
  let ghostNear = null, gd = 81;
  if (!ghost && S.life > W.GIFT + 2 && ph === PHASE.RUN) {
    for (const e of roster.values()) {
      if (!e.ghost || e.id === S.id || !e.seen || (e.flags & F.NOCHANCE)) continue;
      const d = dist2Me(e.x, e.y, e.z);
      if (d < gd) { gd = d; ghostNear = e; }
    }
  }
  const gh = $('give-hint');
  gh.classList.toggle('on', !!ghostNear);
  if (ghostNear) gh.textContent = `${isTouch ? '「分ける」' : 'E'} で ${ghostNear.name} に命を10秒分ける`;
  $('tgive').classList.toggle('ready', !!ghostNear);
}

// ───────── 名札 ─────────
const LABELS = 12;
const labelEls = [];
for (let i = 0; i < LABELS; i++) { const d = document.createElement('div'); d.className = 'lbl'; $('labels').appendChild(d); labelEls.push(d); }
const nearBuf = [];
function updateLabels() {
  nearBuf.length = 0;
  for (const e of roster.values()) {
    if (e.id === S.id || !e.seen) continue;
    const d = dist2Me(e.x, e.y, e.z);
    if (d < (e.bot ? 900 : 4900)) nearBuf.push([d - (e.bot ? 0 : 1000), e]);
  }
  nearBuf.sort((a, b) => a[0] - b[0]);
  const w = innerWidth, h = innerHeight;
  for (let i = 0; i < LABELS; i++) {
    const el = labelEls[i], it = nearBuf[i];
    if (!it) { el.style.display = 'none'; continue; }
    const e = it[1];
    tmpV.set(e.x, e.y + (e.ghost ? 2.2 : 3.2), e.z).applyMatrix4(world.group.matrixWorld).project(camera);
    if (tmpV.z > 1 || tmpV.x < -1 || tmpV.x > 1 || tmpV.y < -1 || tmpV.y > 1) { el.style.display = 'none'; continue; }
    el.style.display = 'block';
    el.className = `lbl${e.bot ? ' bot' : ''}${e.ghost ? ' ghost' : ''}`;
    const text = e.ghost ? e.name : `${e.name} ${Math.ceil(e.life)}`;
    if (el.textContent !== text) el.textContent = text;
    el.style.transform = `translate(calc(${((tmpV.x + 1) / 2) * w}px - 50%),${((1 - tmpV.y) / 2) * h}px)`;
  }
}

// ───────── 入力 ─────────
const keys = new Set();
const touchMove = { x: 0, y: 0 };
const pressed = { jump: false, dash: false, give: false };
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyF']);
addEventListener('keydown', (e) => {
  if (!S.joined || e.target === $('name')) return;
  if (movementKeys.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') pressed.jump = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyF') pressed.dash = true;
  if (e.code === 'KeyE') pressed.give = true;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
function releasePointer() { if (document.pointerLockElement) document.exitPointerLock?.(); }
canvas.addEventListener('mousedown', (e) => {
  if (!S.joined) return;
  sound.start();
  if (document.pointerLockElement !== canvas && !isTouch) { canvas.requestPointerLock?.(); return; }
  if (e.button === 0) pressed.dash = true;
});
document.addEventListener('pointerlockchange', () => {
  $('gate').style.display = S.joined && !isTouch && !document.pointerLockElement && !$('result').classList.contains('on') ? 'block' : 'none';
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  view.yaw -= e.movementX * 0.0024;
  view.pitch = Math.max(-0.55, Math.min(1.25, view.pitch + e.movementY * 0.0022));
});
canvas.addEventListener('wheel', (e) => { view.dist = Math.max(4.5, Math.min(26, view.dist * (1 + e.deltaY * 0.001))); }, { passive: true });
$('mute').addEventListener('click', (e) => { $('mute').textContent = sound.toggle() ? '音 切' : '音 入'; gameMusic(S.phase === PHASE.END ? RESULT_VOL : GAME_VOL); e.currentTarget.blur(); });
if (sound.muted) $('mute').textContent = '音 切';

// タッチ
let stickId = null, lookId = null, lookX = 0, lookY = 0;
const stick = $('stick'), nub = $('nub');
stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e); });
const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; touchMove.x = touchMove.y = 0; nub.style.transform = ''; };
stick.addEventListener('pointerup', endStick);
stick.addEventListener('pointercancel', endStick);
function moveStick(e) {
  const r = stick.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  touchMove.x = x; touchMove.y = -y;
  nub.style.transform = `translate(${x * 38}px,${y * 38}px)`;
}
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || lookId !== null) return;
  lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  sound.start();
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookId) return;
  view.yaw -= (e.clientX - lookX) * 0.0062;
  view.pitch = Math.max(-0.55, Math.min(1.25, view.pitch + (e.clientY - lookY) * 0.005));
  lookX = e.clientX; lookY = e.clientY;
});
const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
canvas.addEventListener('pointerup', endLook);
canvas.addEventListener('pointercancel', endLook);
for (const [id, k] of [['tjump', 'jump'], ['tdash', 'dash'], ['tgive', 'give']]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); sound.start(); pressed[k] = true; b.classList.add('active'); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => b.classList.remove('active'));
}

// ───────── 主題歌とOP ─────────
const music = new Music(sound);
const bgmBtn = $('bgm');
const drawBgm = () => { bgmBtn.textContent = music.el.paused ? '♪ 曲を流す' : '♪ 曲を止める'; };
music.el.addEventListener('play', drawBgm);
music.el.addEventListener('pause', drawBgm);
drawBgm();
const op = new Opening({ world, actors, grains, sparks, music, env, canvas, lite, onClose: () => {
  S.f = .62;
  W.setSand(env, S.f);
  if (music.want && !S.joined) music.play(true).catch(() => {});
  else music.stop();
} });
const canBgm = () => music.want && !S.joined && !op.on;
// ゲーム中の曲: プレイ中は小さく流し、結果発表では大きく頭から流す
const GAME_VOL = .22, RESULT_VOL = .85;
function gameMusic(vol, fromStart = false) {
  const on = music.want && !sound.muted;
  $('bgmGame').textContent = music.want ? '曲 入' : '曲 切';
  if (!on) { music.stop(); sound.padOn(); return; }
  sound.padOff(); // 低い持続音は曲と重ねない
  music.route();
  if (!fromStart && !music.el.paused) music.setVol(vol, 1.5);
  else music.play(fromStart, vol)?.catch?.(() => {});
}
$('bgmGame').addEventListener('click', () => {
  music.want = !music.want;
  try { localStorage.setItem('sd-bgm', music.want ? '1' : '0'); } catch {}
  gameMusic(S.phase === PHASE.END ? RESULT_VOL : GAME_VOL);
  $('bgmGame').blur();
});
// 自動再生が許される環境ならすぐ流す。ダメなら最初の操作で流す
if (canBgm()) music.el.play().catch(() => {});
const firstGesture = () => {
  removeEventListener('pointerdown', firstGesture, true);
  removeEventListener('keydown', firstGesture, true);
  music.route();
  sound.ctx?.resume?.();
  if (canBgm() && music.el.paused) music.play().catch(() => {});
};
addEventListener('pointerdown', firstGesture, true);
addEventListener('keydown', firstGesture, true);
bgmBtn.addEventListener('click', () => {
  music.route();
  if (music.el.paused) { music.want = true; music.play().catch(() => {}); }
  else { music.want = false; music.stop(); }
  try { localStorage.setItem('sd-bgm', music.want ? '1' : '0'); } catch {}
});
$('opbtn').addEventListener('click', () => { sound.start(); op.open(); });

// トップ画面のボタンを押すと効果音
addEventListener('click', (e) => {
  const b = e.target.closest?.('button,a');
  if (!b || !b.closest('#title,#help,#op')) return;
  sound.start();
  if (b.id === 'go' || b.id === 'opbtn' || b.id === 'menuOp') sound.uiOk(); else sound.uiTap();
}, true);

// トップ画面の ≡ メニュー
const menuBtn = $('menuBtn'), menuPanel = $('menuPanel');
function setMenu(open) {
  menuPanel.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
}
menuBtn.addEventListener('click', () => setMenu(menuPanel.hidden));
$('menuOp').addEventListener('click', () => { setMenu(false); sound.start(); op.open(); });
const help = $('help');
function setHelp(open) {
  help.hidden = !open;
  if (open) { setMenu(false); help.scrollTop = 0; $('helpClose').focus(); }
  else menuBtn.focus();
}
$('menuHelp').addEventListener('click', () => setHelp(true));
$('helpClose').addEventListener('click', () => setHelp(false));
help.addEventListener('click', (e) => { if (e.target === help) setHelp(false); });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && !help.hidden) setHelp(false); });
addEventListener('pointerdown', (e) => { if (!menuPanel.hidden && !$('menu').contains(e.target)) setMenu(false); });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && !menuPanel.hidden) { setMenu(false); menuBtn.focus(); } });

// ───────── タイトル → 参加 ─────────
const nameInput = $('name');
try { nameInput.value = localStorage.getItem('sd-name') || ''; } catch {}
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  sound.start();
  $('go').disabled = true;
  const name = nameInput.value.trim();
  try { localStorage.setItem('sd-name', name); } catch {}
  nameInput.blur();
  connect(name);
});
function startPlaying() {
  $('title').classList.add('gone');
  $('hud').classList.add('on');
  $('touch').classList.add('on');
  gameMusic(GAME_VOL);
  if (!isTouch) canvas.requestPointerLock?.();
  firstFrame = true;
}
let firstFrame = false;
async function pollOnline() {
  if (S.joined) return;
  try {
    const r = await fetch(`${BASE}/status`, { cache: 'no-store' });
    const s = await r.json();
    $('online').textContent = s.players > 0 ? `いま ${s.players} 人が砂時計の中にいます` : '砂人形たちと一緒に遊べます。URLを送って大人数で';
  } catch { $('online').textContent = ''; }
  setTimeout(pollOnline, 5000);
}
pollOnline();

// ───────── 自分の動き ─────────
let acc = 0, sendStep = 0;
function currentInput() {
  let ix = touchMove.x, iy = touchMove.y;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iy += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iy -= 1;
  const l = Math.hypot(ix, iy);
  if (l > 1) { ix /= l; iy /= l; }
  const s = Math.sin(view.yaw), c = Math.cos(view.yaw);
  return { mx: ix * c - iy * s, mz: -ix * s - iy * c };
}
const out = new ArrayBuffer(6), outV = new DataView(out);
let pendingBits = 0;
function fixedStep() {
  const { mx, mz } = currentInput();
  const blocked = S.phase === PHASE.END;
  const jump = pressed.jump && !blocked, dash = pressed.dash && !blocked && !(S.life <= 1.5 && S.phase === PHASE.RUN);
  if (pressed.jump) pendingBits |= 1;
  if (pressed.dash) pendingBits |= 2;
  if (pressed.give) pendingBits |= 4;
  pressed.jump = pressed.dash = pressed.give = false;
  env.flip = S.phase === PHASE.FLIP;
  env.flow = S.phase === PHASE.RUN && S.epoch >= 0 ? EPOCHS[S.epoch].flow : 0;
  const wasGround = me.ground;
  const dashed = W.stepBody(me, blocked ? 0 : mx, blocked ? 0 : mz, jump, dash, env, W.TICK);
  if (dashed) { sound.dash(); sparks.emit(me.x, me.y + .4, me.z, 18, { speed: 5, up: 3, life: .55 }, clockNow); if (S.phase === PHASE.RUN) S.life -= 1; }
  if (jump && wasGround && !me.ground) sound.jump();
  if (!wasGround && me.ground && lastAirSpeed < -22) { sound.land(); sparks.emit(me.x, me.y + .2, me.z, 34, { speed: 8, up: 4, life: .8 }, clockNow); shake = Math.max(shake, .7); }
  lastAirSpeed = me.vy;
  if (++sendStep >= 2) {
    sendStep = 0;
    if (ws && ws.readyState === 1) {
      seq = (seq + 1) & 0xffff;
      outV.setUint8(0, 2); outV.setUint16(1, seq, true);
      outV.setInt8(3, Math.round(mx * 100)); outV.setInt8(4, Math.round(mz * 100)); outV.setUint8(5, pendingBits);
      pendingBits = 0;
      ws.send(out);
      history.set(seq, { x: me.x, y: me.y, z: me.z });
      if (history.size > 90) history.delete(history.keys().next().value);
    }
  }
}
let lastAirSpeed = 0;

// 一番近い粒（拾える範囲にいる大粒は優先）へ矢印を向ける
const ap = { x: 0, y: 0, z: 0, r: 0 };
let arrowGrain = null, arrowScan = 0;
function updateArrow(flipE) {
  const usable = S.phase === PHASE.RUN && flipE === 0 && !(S.ghost && S.noChance);
  if (!usable) { arrow.visible = false; arrowGrain = null; return; }
  if (--arrowScan <= 0 || (arrowGrain && !grains.map.has(arrowGrain.id))) {
    arrowScan = 6;
    let best = null, bs = Infinity;
    const top = me.y >= 0;
    for (const g of grains.map.values()) {
      if (g.top !== top || clockNow - g.t0 < g.fall) continue;
      grains.posOf(g, clockNow, env, ap);
      const d = Math.hypot(ap.x - me.x, ap.z - me.z);
      if (d > ARROW_RANGE || Math.abs(ap.y - me.y) > 14) continue;
      const score = d - (g.v >= 6 ? 6 : 0);
      if (score < bs) { bs = score; best = g; }
    }
    arrowGrain = best;
  }
  if (!arrowGrain) { arrow.visible = false; return; }
  grains.posOf(arrowGrain, clockNow, env, ap);
  const dx = ap.x - me.x, dz = ap.z - me.z, d = Math.hypot(dx, dz);
  if (d < 2.4) { arrow.visible = false; return; } // もう拾える距離
  const ux = dx / d, uz = dz / d;
  const dist = 2.5 + Math.sin(clockNow * 7) * .2;
  const ax = me.x + ux * dist, az = me.z + uz * dist, r = Math.hypot(ax, az);
  const g = W.groundY(r, me.y, env);
  arrow.position.set(ax, (g === -Infinity ? me.y : Math.max(g, me.y - 1.5)) + .55, az);
  // 斜面に沿わせてから進む向きへ回す
  tiltToGround({ x: ax, y: me.y, z: az }, env, arrow);
  arrow.rotateY(Math.atan2(ux, uz));
  const near = 1 - Math.min(1, d / ARROW_RANGE);
  arrow.scale.setScalar(.8 + near * .55);
  arrow.material.opacity = .55 + near * .4;
  arrow.material.color.setHex(S.ghost ? 0xa9d8ff : arrowGrain.v >= 6 ? 0xfff0a0 : 0xffd778);
  arrow.visible = true;
}

// ───────── 毎フレーム ─────────
const list = [];
const flipEase = (t) => t * t * t * (t * (t * 6 - 15) + 10);
let last = performance.now();
let fpsT = 0, fpsN = 0;
function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  clockNow = nowMs / 1000;

  // 砂の量はサーバーの値を受けて、間はこちらで進める
  if (S.joined && S.phase === PHASE.RUN && EPOCHS[S.epoch]) S.f = Math.max(0, S.f - EPOCHS[S.epoch].rate * dt);
  W.setSand(env, S.f);
  let flipT = S.phase === PHASE.FLIP ? Math.min(1, 1 - timeLeft() / W.FLIP_TIME) : 0;
  let flipE = flipT > 0 ? flipEase(flipT) : 0;

  if (S.joined) {
    acc += dt;
    let n = 0;
    while (acc >= W.TICK && n++ < 5) { acc -= W.TICK; fixedStep(); }
    if (acc > .5) acc = 0;
    // 他の人をなめらかに
    const k = 1 - Math.exp(-dt * 13);
    list.length = 0;
    for (const e of roster.values()) {
      if (!e.seen) continue;
      if (e.id === S.id) {
        const px = e.x, pz = e.z;
        e.x = me.x; e.y = me.y; e.z = me.z; e.ground = me.ground; e.life = S.ghost ? S.soul : S.life;
        e.yaw = me.yaw; e.ghost = S.ghost;
        e.dash = me.dashT > 0; e.stun = me.stunT > 0;
        e.speed = Math.hypot(me.x - px, me.z - pz) / Math.max(dt, .001);
      } else {
        const px = e.x, pz = e.z;
        const gap = Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y) + Math.abs(e.tz - e.z);
        const K = gap > 20 ? 1 : k;
        e.x += (e.tx - e.x) * K; e.y += (e.ty - e.y) * K; e.z += (e.tz - e.z) * K;
        let dy = e.tyaw - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        e.yaw += dy * k;
        const sp = Math.hypot(e.x - px, e.z - pz) / Math.max(dt, .001);
        e.speed += (sp - e.speed) * .2;
      }
      e.walk += e.speed * dt * 1.5;
      e.flash = Math.max(0, e.flash - dt);
      const g = W.groundY(Math.hypot(e.x, e.z), e.y, env);
      e.gy = g === -Infinity ? e.y - 30 : g;
      list.push(e);
    }
    actors.draw(list, S.id, clockNow, env);
    const mine = roster.get(S.id);
    if (mine && !S.ghost && flipE === 0) {
      actors.ring.visible = true;
      actors.ring.position.set(me.x, mine.gy + .12, me.z);
      tiltToGround(mine, env, actors.ring);
    } else actors.ring.visible = false;
    updateHUD(dt);
    grains.draw(clockNow, env, clockNow);
    updateArrow(flipE);
    // 音: 砂の滝との距離
    const dn = Math.hypot(me.x, me.y - env.P * .5, me.z);
    sound.ambient(S.phase === PHASE.END ? 0 : S.f > .001 && flipE === 0 ? Math.min(.18, 4 / (dn + 18)) : .02, me.y >= 0 ? .2 : .8);
  } else if (op.on) {
    const r = op.tick(dt, clockNow);
    if (r) { S.f = r.f; flipT = r.flipT; flipE = r.flipE; }
    else { flipT = 0; flipE = 0; }
  } else {
    S.f = .62 + Math.sin(clockNow * .05) * .02;
  }

  const px = pxScale();
  world.update(dt, S.f, flipE, px);
  grains.glowMat.uniforms.uPx.value = px;
  sparks.update(clockNow, px);

  // カメラ
  if (S.joined) {
    view.blend = firstFrame ? 0.001 : Math.min(1, view.blend + dt * .55);
    firstFrame = false;
  }
  if (op.on) {
    camPos.set(op.pos.x, op.pos.y, op.pos.z);
    camTarget.set(op.target.x, op.target.y, op.target.z);
  } else if (!S.joined) {
    const a = clockNow * .07 + .6, d = innerWidth < innerHeight ? 300 : 215;
    camPos.set(Math.sin(a) * d, 28 + Math.sin(clockNow * .05) * 22, Math.cos(a) * d);
    camTarget.set(0, innerWidth < innerHeight ? -6 : 12, 0);
  } else {
    // プレイヤーの位置（回転する砂時計の中）をワールド座標へ
    tmpV.set(me.x, me.y + 1.5, me.z).applyMatrix4(world.group.matrixWorld);
    const flipPull = flipT > 0 ? Math.sin(flipT * Math.PI) : 0;
    const d = view.dist + flipPull * 30;
    const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    const cx = tmpV.x + Math.sin(view.yaw) * cp * d, cy = tmpV.y + sp * d, cz = tmpV.z + Math.cos(view.yaw) * cp * d;
    const t = view.blend * view.blend * (3 - 2 * view.blend);
    let fy = cy;
    if (flipT === 0) {
      // 砂にカメラが潜らないように
      const r = Math.hypot(cx, cz);
      const onSide = tmpV.y >= 0 ? cy >= 0 : false;
      const g = onSide ? W.sandTop(r, env.L) : (cy < 0 ? W.sandBot(r, env.P) : -Infinity);
      if (g !== -Infinity && fy < g + .8) fy = g + .8;
    }
    const titleA = clockNow * .07 + .6;
    camPos.set(Math.sin(titleA) * 215, 40, Math.cos(titleA) * 215).lerp(tmpV.clone().set(cx, fy, cz), t);
    camTarget.set(0, 12, 0).lerp(tmpV, t);
    if (shake > 0) { camPos.x += (Math.random() - .5) * shake * .35; camPos.y += (Math.random() - .5) * shake * .35; shake = Math.max(0, shake - dt * 2.4); }
    if (S.phase !== PHASE.END) updateLabels();
  }
  camera.position.copy(camPos);
  // 真上からのカットは視線と上方向が重なるので、上方向を水平に回す
  if (op.on && op.topMode) camera.up.set(Math.sin(op.topUp), 0, Math.cos(op.topUp));
  else camera.up.set(0, 1, 0);
  camera.lookAt(camTarget);
  renderer.render(world.scene, camera);

  // 重い端末では自動で解像度を下げる
  fpsT += dt; fpsN++;
  if (fpsT > 3) {
    const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
    if (fps < 28 && pixelRatio > 0.8) { pixelRatio = Math.max(0.8, pixelRatio * 0.82); renderer.setPixelRatio(pixelRatio); resize(); }
  }
}
requestAnimationFrame(frame);
window.__sd = { arrow, sound, op, music, camera, S, me, roster, view, grains, world, env, keys, pressed, timeLeft };
