// 人間役の接続を N 本つないで、サーバーの処理時間・通信量・1巡の生存数を測る。使い方: node tools/loadtest.js <N> <秒>
import WebSocket from 'ws';
const N = Number(process.argv[2] || 150), SEC = Number(process.argv[3] || 60), PORT = process.env.PORT || 3049, BASE = '/sunadokei';
let rx = 0, msgs = 0, closed = 0, snaps = 0, ends = [];
const socks = [];
for (let i = 0; i < N; i++) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}${BASE}/ws`);
  socks.push(ws);
  let seq = 0, ax = Math.random() * 6;
  ws.on('open', () => {
    ws.send(JSON.stringify({ t: 'join', name: `負荷${i}` }));
    ws.timer = setInterval(() => {
      const b = Buffer.alloc(6);
      seq = (seq + 1) & 0xffff; ax += (Math.random() - .5) * .6;
      b[0] = 2; b.writeUInt16LE(seq, 1); b.writeInt8(Math.round(Math.cos(ax) * 100), 3); b.writeInt8(Math.round(Math.sin(ax) * 100), 4);
      b[5] = (Math.random() < .03 ? 1 : 0) | (Math.random() < .03 ? 2 : 0) | (Math.random() < .03 ? 4 : 0);
      ws.send(b);
    }, 66);
  });
  ws.on('message', (d, bin) => { rx += d.length; msgs++; if (bin) snaps++; else if (i === 0) { const m = JSON.parse(d.toString()); if (m.t === 'end') ends.push({ alive: m.alive, total: m.total, top: m.top.slice(0, 3).map((t) => `${t.n}:${t.l}`) }); } });
  ws.on('close', () => { closed++; clearInterval(ws.timer); });
  ws.on('error', () => {});
}
let t = 0;
const iv = setInterval(async () => {
  t += 5;
  const s = await (await fetch(`http://127.0.0.1:${PORT}${BASE}/status`)).json();
  console.log(`t=${t}s server=${JSON.stringify(s)} 1人あたり受信=${(rx / 5 / N / 1024).toFixed(1)}KB/s スナップ=${(snaps / 5 / N).toFixed(1)}/s 切断=${closed}`);
  rx = 0; msgs = 0; snaps = 0;
  if (t >= SEC) { clearInterval(iv); if (ends.length) console.log('END', JSON.stringify(ends)); for (const w of socks) w.terminate(); setTimeout(() => process.exit(0), 200); }
}, 5000);
