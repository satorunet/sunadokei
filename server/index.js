// 命の砂時計 サーバー: 静的ファイル配信 + WebSocket
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room, MAX_HUMANS } from './room.js';

const PORT = Number(process.env.PORT || 3049);
const BASE = process.env.BASE_PATH || '/sunadokei';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MAX_CONN = Number(process.env.MAX_CONN || 600);
const MAX_PER_IP = Number(process.env.MAX_PER_IP || 16);
const MIME = { '.mp3': 'audio/mpeg', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const cache = new Map();

async function serve(req, res) {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (p === BASE) { res.writeHead(301, { Location: BASE + '/' }); return res.end(); }
  if (p.startsWith(BASE + '/')) p = p.slice(BASE.length);
  if (p === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(status()));
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const st = await stat(file);
    let entry = cache.get(file);
    if (!entry || entry.mtime !== st.mtimeMs) {
      const raw = await readFile(file);
      entry = { mtime: st.mtimeMs, raw, gz: path.extname(file) === '.mp3' || path.extname(file) === '.png' ? null : gzipSync(raw), type: MIME[path.extname(file)] || 'application/octet-stream' };
      cache.set(file, entry);
    }
    const headers = { 'Content-Type': entry.type, 'Cache-Control': 'no-cache', ETag: `"${st.mtimeMs.toString(36)}"`, Vary: 'Accept-Encoding' };
    // 音声は途中から再生できるように（スマホのブラウザは Range が必須）。圧縮はしない
    if (entry.type === 'audio/mpeg') {
      headers['Accept-Ranges'] = 'bytes';
      const size = entry.raw.length, m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m && (m[1] !== '' || m[2] !== '')) {
        const a = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
        const b = m[1] !== '' && m[2] !== '' ? Math.min(size - 1, Number(m[2])) : size - 1;
        if (a > b || a >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
        headers['Content-Range'] = `bytes ${a}-${b}/${size}`;
        headers['Content-Length'] = b - a + 1;
        res.writeHead(206, headers);
        return res.end(entry.raw.subarray(a, b + 1));
      }
      headers['Content-Length'] = size;
      res.writeHead(200, headers);
      return res.end(entry.raw);
    }
    if (req.headers['if-none-match'] === headers.ETag) { res.writeHead(304, headers); return res.end(); }
    if (entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      return res.end(entry.gz);
    }
    res.writeHead(200, headers);
    res.end(entry.raw);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}

const rooms = new Set();
let roomSeq = 1;
function pickRoom() {
  for (const r of rooms) if (r.humanCount < MAX_HUMANS) return r;
  const r = new Room(roomSeq++, (x) => rooms.delete(x));
  rooms.add(r);
  return r;
}
function status() {
  let players = 0, ms = 0;
  for (const r of rooms) { players += r.humanCount; ms = Math.max(ms, r.tickMs); }
  return { players, rooms: rooms.size, tickMs: Math.round(ms * 100) / 100 };
}

const server = http.createServer((req, res) => { serve(req, res).catch(() => { res.writeHead(500); res.end(); }); });
const wss = new WebSocketServer({ server, path: BASE + '/ws', maxPayload: 1024, perMessageDeflate: false });
const perIP = new Map();

// 名前から制御文字と文字方向の上書きを取り除く
const cleanName = (s) => {
  const n = String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, 12);
  return n || `旅人${Math.floor(Math.random() * 900 + 100)}`;
};

wss.on('connection', (ws, req) => {
  // Cloudflare 経由だと X-Real-IP は中継点の住所になるので、本来の接続元を優先する
  const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.socket.remoteAddress || '?';
  if (wss.clients.size > MAX_CONN || (perIP.get(ip) || 0) >= MAX_PER_IP) { ws.close(1013, 'busy'); return; }
  perIP.set(ip, (perIP.get(ip) || 0) + 1);
  let player = null, room = null, count = 0, windowStart = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data, isBinary) => {
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; count = 0; }
    if (++count > 60) return; // 送りすぎは捨てる
    try {
      if (isBinary) { if (player) room.onInput(player, data); return; }
      const m = JSON.parse(data.toString());
      if (m && m.t === 'join' && !player) {
        room = pickRoom();
        player = room.addHuman(ws, cleanName(m.name));
      } else if (m && m.t === 'like' && player) {
        room.onLike(player, m.n);
      }
    } catch (err) { console.error('[message]', err); }
  });
  ws.on('close', () => {
    const c = (perIP.get(ip) || 1) - 1;
    if (c <= 0) perIP.delete(ip); else perIP.set(ip, c);
    if (player) room.remove(player);
  });
  ws.on('error', () => {});
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 20000);

server.listen(PORT, '127.0.0.1', () => console.log(`sunadokei listening on 127.0.0.1:${PORT}${BASE}`));
process.on('uncaughtException', (e) => console.error('[uncaught]', e));
