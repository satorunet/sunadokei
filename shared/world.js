// 砂時計の形・砂の表面・プレイヤーの動き。サーバーとクライアントで同じ計算を使う。
// 座標: くびれが原点、+y が重力の反対向き。反転が終わるたびに (x,y,z)→(-x,-y,z) で座標を入れ替えるので、
// シミュレーションはいつも「上の球 y>0 / 下の球 y<0」だけを考えればよい。
export const H = 70, D1 = 40, RMAX = 52, RNECK = 2.8, HOLE = 2.5;
export const TICK = 1 / 30;
export const MOVE = 9.5, JUMP = 11, GRAV = 30, DASH_SPEED = 25, DASH_TIME = 0.26, DASH_CD = 2.4;
const CRATER_W = 17, L_FULL = 38, PILE_SLOPE = 0.55, FOOT = 0.5;

// 刻（フェーズ）の設定。rate は1秒あたりに落ちる砂の割合、drain は命の減る速さ、flow は流砂の強さ
export const EPOCHS = [
  { name: '第一の刻', dur: 70, rate: 0.011, drain: 1.0, flow: 1.0 },
  { name: '第二の刻', dur: 60, rate: 0.013, drain: 1.25, flow: 1.15 },
  { name: '第三の刻', dur: 50, rate: 0.016, drain: 1.6, flow: 1.3 },
  { name: '最後の刻', dur: 40, rate: 0.02, drain: 2.2, flow: 1.5 },
];
export const WAIT_TIME = 18, FLIP_TIME = 6, END_TIME = 20;
export const START_LIFE = 60, LATE_LIFE = 45, MAX_LIFE = 150, REBIRTH_SOUL = 20, GIFT = 10, TOP_DRAIN = 0.5, BURY_DRAIN = 4;
export const PHASE = { WAIT: 0, RUN: 1, FLIP: 2, END: 3 };
export const F = { GHOST: 1, DASH: 2, GROUND: 4, STUN: 8, BURIED: 16, BOT: 32, SAFE: 64 };

// くびれから距離 d の高さでのガラスの半径
export function glassR(d) {
  d = Math.abs(d);
  if (d >= H) return 0;
  if (d <= D1) return RNECK + (RMAX - RNECK) * Math.pow(Math.sin((d / D1) * Math.PI / 2), 1.3);
  const u = (d - D1) / (H - D1);
  return RMAX * Math.sqrt(1 - u * u);
}
// 半径 r でのじょうご部分の高さ（glassR の逆関数）
export function funnelD(r) {
  if (r <= RNECK) return 0;
  if (r >= RMAX) return D1;
  return (D1 * 2 / Math.PI) * Math.asin(Math.pow((r - RNECK) / (RMAX - RNECK), 1 / 1.3));
}
// 半径 r での丸い底（フタ）までの距離
export function capD(r) {
  if (r >= RMAX) return D1;
  const u = r / RMAX;
  return D1 + (H - D1) * Math.sqrt(1 - u * u);
}

const crater = (r, L) => L * (1 - Math.exp(-Math.pow(r / CRATER_W, 1.6)));
const cone = (r, P) => P - PILE_SLOPE * (Math.sqrt(r * r + 16) - 4);
// 上の球の砂面（すり鉢）。砂がなければガラスの面
export const surfaceTop = (r, L) => Math.max(funnelD(r + FOOT), crater(r, L));
// 下の球の砂面（砂山）
export const surfaceBot = (r, P) => Math.max(-capD(r + FOOT), cone(r, P));

// 描画用の砂面（足の太さ分のずらしなし）
export const sandTop = (r, L) => Math.max(funnelD(r), crater(r, L));
export const sandBot = (r, P) => Math.max(-capD(r), cone(r, P));

// 砂の量 ⇔ 砂面の高さ の対応表
function integrate(fn) {
  let v = 0;
  const n = 240, dr = RMAX / n;
  for (let i = 0; i < n; i++) { const r = (i + 0.5) * dr; v += 2 * Math.PI * r * Math.max(0, fn(r)) * dr; }
  return v;
}
const volTop = (L) => integrate((r) => crater(r, L) - funnelD(r));
const volBot = (P) => integrate((r) => cone(r, P) + capD(r));
const TABLE = 96;
const topTable = [], botTable = [];
for (let i = 0; i <= TABLE; i++) {
  const L = (L_FULL * i) / TABLE, P = -H + ((H - 6) * i) / TABLE;
  topTable.push([volTop(L), L]);
  botTable.push([volBot(P), P]);
}
export const V_TOTAL = volTop(L_FULL);
function lookup(t, v) {
  if (v <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (v <= t[i][0]) { const a = t[i - 1], b = t[i], k = (v - a[0]) / Math.max(1e-6, b[0] - a[0]); return a[1] + (b[1] - a[1]) * k; }
  }
  return t[t.length - 1][1];
}
// f: 上の球に残る砂の割合(0〜1)。結果は使い回して毎フレームの確保を避ける
export function makeEnv() { return { f: 1, L: L_FULL, P: -H, flow: 1, flip: false }; }
export function setSand(env, f) {
  env.f = f;
  env.L = lookup(topTable, f * V_TOTAL);
  env.P = lookup(botTable, (1 - f) * V_TOTAL);
  return env;
}
export function groundY(r, y, env) {
  if (y >= 0) return r < HOLE ? -Infinity : surfaceTop(r, env.L);
  return surfaceBot(r, env.P);
}
// 流砂がプレイヤーを中心へ引く速さ（m/s）
export function flowSpeed(r, env) {
  if (env.f <= 0.001 || crater(r, env.L) < funnelD(r + FOOT)) return 0;
  return (0.9 + 40 / (r + 6) * 0.45 + 6 * Math.exp(-r / 6)) * env.flow;
}
export const isGlass = (r, y, env) => y >= 0 ? crater(r, env.L) <= funnelD(r + FOOT) + 0.02 : cone(r, env.P) <= -capD(r + FOOT) + 0.02;
export const isBuried = (r, y, env) => y < 0 && r < 3.6 && env.f > 0.001 && y < env.P + 3;

export function newBody(x = 0, y = 0, z = 0) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, ground: false, dashT: 0, dashCd: 0, stunT: 0, ghost: false, buried: false };
}

// 1ティック分の移動。jump/dash は押した瞬間だけ true。ダッシュが出たら true を返す
export function stepBody(p, mx, mz, jump, dash, env, dt) {
  let dashed = false;
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.stunT = Math.max(0, p.stunT - dt);
  p.dashT = Math.max(0, p.dashT - dt);
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  if (len > 0.05) p.yaw = Math.atan2(mx, mz);

  if (env.flip) { // 反転中は無重力でゆっくり漂う
    const d = Math.exp(-2.5 * dt);
    p.vx = p.vx * d + mx * 8 * dt; p.vy *= d; p.vz = p.vz * d + mz * 8 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.ground = false; p.dashT = 0; p.buried = false;
    keepInside(p);
    return false;
  }

  const stunned = p.stunT > 0;
  if (dash && !p.ghost && !stunned && p.dashCd <= 0) {
    p.dashT = DASH_TIME; p.dashCd = DASH_CD; dashed = true;
    const dx = len > 0.05 ? mx / Math.max(len, 1e-3) : Math.sin(p.yaw);
    const dz = len > 0.05 ? mz / Math.max(len, 1e-3) : Math.cos(p.yaw);
    p.vx = dx * DASH_SPEED; p.vz = dz * DASH_SPEED;
    if (p.vy < 2) p.vy = 2;
  }

  const r0 = Math.hypot(p.x, p.z);
  const speed = p.ghost ? MOVE * 1.15 : MOVE;
  if (p.dashT <= 0) {
    const tx = stunned ? 0 : mx * speed, tz = stunned ? 0 : mz * speed;
    const glass = p.ground && !p.ghost && isGlass(r0, p.y, env);
    const accel = stunned ? 2 : p.ground ? (glass ? 5 : 16) : 4.5;
    const k = 1 - Math.exp(-accel * dt);
    p.vx += (tx - p.vx) * k; p.vz += (tz - p.vz) * k;
  }

  // 重力・浮遊
  if (p.ghost) {
    const g = groundY(r0, p.y, env);
    if (g === -Infinity) p.vy -= GRAV * 0.5 * dt;
    else { const want = g + 1.6; p.vy += ((want - p.y) * 7 - p.vy) * Math.min(1, 8 * dt); }
  } else {
    if (jump && p.ground && !stunned) { p.vy = JUMP; p.ground = false; }
    p.vy -= GRAV * dt;
    if (p.vy < -60) p.vy = -60;
  }

  // 足元が流れる: 流砂・ガラスの滑り・落ちてくる砂の押し出し
  let cx = 0, cz = 0;
  p.buried = false;
  if (p.ground && !p.ghost && r0 > 0.01) {
    const ux = p.x / r0, uz = p.z / r0;
    if (p.y >= 0) {
      const s = flowSpeed(r0, env) + (isGlass(r0, p.y, env) ? 3.5 : 0);
      cx -= ux * s; cz -= uz * s;
    } else if (isGlass(r0, p.y, env)) {
      cx -= ux * 2.2; cz -= uz * 2.2;
    } else if (isBuried(r0, p.y, env)) {
      p.buried = true;
      cx += ux * 5; cz += uz * 5;
    }
  }

  p.x += (p.vx + cx) * dt; p.y += p.vy * dt; p.z += (p.vz + cz) * dt;
  keepInside(p);

  // 接地
  const r = Math.hypot(p.x, p.z);
  const g = groundY(r, p.y, env);
  if (!p.ghost && g !== -Infinity && p.y <= g + (p.ground && p.vy <= 0 ? 0.55 : 0)) {
    p.y = g; if (p.vy < 0) p.vy = 0;
    p.ground = true;
  } else if (p.ghost && g !== -Infinity && p.y < g + 0.4) {
    p.y = g + 0.4; if (p.vy < 0) p.vy = 0;
  } else if (!p.ghost) {
    p.ground = false;
  }
  return dashed;
}

// ガラスの内側に押し戻す
export function keepInside(p) {
  if (p.y > H - 1) { p.y = H - 1; if (p.vy > 0) p.vy = 0; }
  if (p.y < -H + 0.2) { p.y = -H + 0.2; if (p.vy < 0) p.vy = 0; }
  const r = Math.hypot(p.x, p.z);
  const max = Math.max(0.2, glassR(p.y) + 0.02);
  if (r > max) {
    const k = max / r, ux = p.x / r, uz = p.z / r;
    p.x *= k; p.z *= k;
    const out = p.vx * ux + p.vz * uz;
    if (out > 0) { p.vx -= out * ux; p.vz -= out * uz; }
  }
}

// 反転が終わった瞬間の座標の入れ替え
export function mirror(p) { p.x = -p.x; p.y = -p.y; if ('vx' in p) { p.vx = -p.vx; p.vy = -p.vy; } }

// 命の粒の現在位置。top=上の球ではゆっくり中心へ流れ、下の球では砂山の上に乗る
export function grainPos(g, ageSec, env, out) {
  let x = g.x, z = g.z;
  if (g.top) {
    const r0 = Math.hypot(x, z), r = Math.max(0, r0 - g.vr * ageSec), k = r0 > 0 ? r / r0 : 0;
    x *= k; z *= k;
    out.y = surfaceTop(r, env.L);
    out.r = r;
  } else {
    const r = Math.hypot(x, z);
    out.y = surfaceBot(r, env.P);
    out.r = r;
  }
  out.x = x; out.z = z;
  return out;
}
export const GRAIN_FALL = 1.1; // 下の球の粒が首から着地するまでの秒数（着地まで拾えない）
