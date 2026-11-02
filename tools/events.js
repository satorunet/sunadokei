// 指定秒数のあいだ部屋の出来事を数える。使い方: node tools/events.js <秒>
import WebSocket from 'ws';
const SEC = Number(process.argv[2] || 120), PORT = process.env.PORT || 3049;
const n = {}; const ws = new WebSocket(`ws://127.0.0.1:${PORT}/sunadokei/ws`);
ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: '観測' })));
ws.on('message', (d, bin) => { if (bin) return; const m = JSON.parse(d.toString()); if (m.t === 'ev') for (const e of m.e) n[e[0]] = (n[e[0]] || 0) + 1; });
setTimeout(() => { console.log(JSON.stringify(n)); process.exit(0); }, SEC * 1000);
