// 最後の刻のワンチャンと、人ごとのイイネのルールを確かめる
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'sd-'));
const W = await import('../shared/world.js');
const { Room } = await import('../server/room.js');
const { likes } = await import('../server/likes.js');
const sent = [];
const fake = () => ({ readyState: 1, bufferedAmount: 0, send(d) { if (typeof d === 'string') sent.push(JSON.parse(d)); } });
const room = new Room(1, () => {});
clearInterval(room.timer);
const a = room.addHuman(fake(), '甲'), b = room.addHuman(fake(), '乙');
assert.equal(a.life, W.START_LIFE);
const last = W.EPOCHS.length - 1;

// 最後の刻より前は何度でも蘇れる
room.epoch = 0; room.setPhase(W.PHASE.RUN, 60);
room.die(a); assert(room.canRebirth(a)); room.rebirth(a, 20); assert(!a.finalUsed);

// 最後の刻: 粒で一度だけ蘇る
room.epoch = last; room.setPhase(W.PHASE.RUN, 30);
const grainAt = (p, v) => { room.grains.clear(); const g = room.addGrain(p.x, p.z, p.y >= 0, v, 0); g.born = room.tickN - 60; return g; };
room.die(a); assert(a.ghost);
a.y = W.groundY(Math.hypot(a.x, a.z), a.y, room.env); grainAt(a, 10); room.touchGrains();
assert(!a.ghost, 'ワンチャンで蘇る'); assert(a.finalUsed); assert.equal(a.life, W.REBIRTH_LIFE);
// 2回目は粒を拾えず、命も分けてもらえない
for (const q of room.list) if (q !== a) { q.x = -a.x; q.z = -a.z; } // ほかの人に粒を拾われないように離す
room.die(a); const g2 = grainAt(a, 10); room.touchGrains();
assert(a.ghost, '2回目は蘇らない'); assert(room.grains.has(g2.id), '使えない亡霊は粒を消さない');
for (const q of room.list) if (q !== a && q !== b) { q.ghost = false; q.x = 40; q.z = 40; }
b.x = a.x + 1; b.z = a.z; b.y = a.y; b.life = 50; a.soul = 0; room.tryGive(b);
assert.equal(b.life, 50, '使い切った亡霊には分けられない');
// 使っていない亡霊には命を分けて蘇らせられる（途中参加も）
const c = room.addHuman(fake(), '丙'); assert(c.ghost, '最後の刻の途中参加は亡霊'); assert(!c.finalUsed);
c.x = b.x + 1; c.z = b.z; c.y = b.y; room.tryGive(b);
assert(!c.ghost, '分けて蘇る'); assert(c.finalUsed); assert.equal(b.life, 50 - W.GIFT);
// 全滅でも最後の刻は打ち切らない
for (const q of room.list) q.ghost = true;
room.tick(W.TICK); assert.equal(room.phase, W.PHASE.RUN, '全員亡霊でも時間まで続く');

// イイネは結果発表の間だけ、人ごとに数える
const t0 = likes.total;
room.onLike(a, b.id, 5); assert.equal(b.likesGot, 0, '試合中は増えない');
room.timeLeft = 0; room.tick(W.TICK); assert.equal(room.phase, W.PHASE.END);
const end = sent.filter((m) => m.t === 'end').pop();
for (const q of [a, b, c]) assert(end.top.some((r) => r.id === q.id), '人間は全員が一覧に載る');
assert(end.top.every((r) => r.r >= 1));
room.onLike(a, b.id, 3); room.onLike(b, b.id, 2); room.onLike(a, c.id, 1);
room.onLike(a, b.id, 999); assert.equal(b.likesGot, 55, '1通の上限で切る');
room.onLike(a, 59999, 5); room.onLike(a, b.id, -4); room.onLike(a, b.id, 'x'); room.onLike(a, '1;x', 3);
assert.equal(b.likesGot, 55); assert.equal(c.likesGot, 1); assert.equal(likes.total - t0, 56);
for (let i = 0; i < 3; i++) room.tick(W.TICK);
const lk = sent.filter((m) => m.t === 'lk').pop();
assert.deepEqual(new Map(lk.c).get(b.id), 55);
// 次の巡りで個人の数は0に、累計は残る
room.timeLeft = 0; room.tick(W.TICK);
assert.equal(room.phase, W.PHASE.WAIT); assert.equal(b.likesGot, 0); assert(!a.finalUsed); assert.equal(likes.total - t0, 56);
console.log('OK'); process.exit(0);
