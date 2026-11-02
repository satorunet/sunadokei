// 砂時計の形と砂の量がゲームとして破綻していないかの検算
import * as W from '../shared/world.js';
import assert from 'node:assert';
const env = W.makeEnv();
console.log('V_TOTAL', Math.round(W.V_TOTAL));
for (const f of [1, .75, .5, .25, .1, .02, 0]) {
  W.setSand(env, f);
  console.log(`f=${f}`.padEnd(8), `L=${env.L.toFixed(1)}`.padEnd(9), `P=${env.P.toFixed(1)}`.padEnd(9), 'top r30', W.surfaceTop(30, env.L).toFixed(1), 'bot r0', W.surfaceBot(0, env.P).toFixed(1), 'bot r30', W.surfaceBot(30, env.P).toFixed(1));
}
// 砂山がくびれに届かず、砂が全部下へ収まる
W.setSand(env, 0);
assert(env.P < -8, '砂山がくびれに届いてしまう: P=' + env.P);
// 粒の位置が常にガラス内
for (const f of [1, .5, 0]) { W.setSand(env, f); for (let r = 0; r < W.RMAX - 1; r += .5) {
  const t = W.surfaceTop(r, env.L), b = W.surfaceBot(r, env.P);
  assert(t >= 0 && t < W.H, `top ${r} ${t}`); assert(b <= 0 && b >= -W.H, `bot ${r} ${b}`);
} }
// 上の球で放っておくと中心に吸われて下へ落ちる／全力で外へ走れば耐えられる
W.setSand(env, .9);
let p = W.newBody(30, 40, 0); let t = 0;
while (p.y > -5 && t < 120) { W.stepBody(p, 0, 0, false, false, env, W.TICK); t += W.TICK; }
console.log('放置で下の球へ落ちるまで', t.toFixed(1), 's');
assert(t < 60 && p.y <= -5, '流砂で落ちない');
p = W.newBody(30, 40, 0); for (let i = 0; i < 600; i++) W.stepBody(p, 1, 0, false, false, env, W.TICK);
console.log('外へ走り続けた結果 r=', Math.hypot(p.x, p.z).toFixed(1), 'y=', p.y.toFixed(1), 'ground', p.ground);
assert(p.y > 10, '外へ走っても落ちた');
// どの高さから落ちても接地する
for (const f of [1, .5, .05]) { W.setSand(env, f); for (const [x, y] of [[20, 60], [40, 45], [0, 30], [30, -30], [10, -60]]) {
  p = W.newBody(x, y, 3); for (let i = 0; i < 300; i++) W.stepBody(p, 0, 0, false, false, env, W.TICK);
  assert(Number.isFinite(p.y) && Math.hypot(p.x, p.z) <= W.glassR(p.y) + .1, `外に出た ${x},${y},${f}: ${p.x},${p.y}`);
} }
// 反転してもガラスの内側
p = W.newBody(25, 30, 4); W.mirror(p); assert(p.x === -25 && p.y === -30);
console.log('OK');
