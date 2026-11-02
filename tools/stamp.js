// index.html の game.js 参照に中身のハッシュを付ける。
// Cloudflare が game.js をブラウザに4時間保存させるため、URLを変えないと更新が届かない
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const dir = process.env.OUT_DIR || 'public';
const html = `${dir}/index.html`;
if (existsSync(html)) {
  const hash = createHash('sha256').update(readFileSync(`${dir}/game.js`)).digest('hex').slice(0, 10);
  const s = readFileSync(html, 'utf8');
  const out = s.replace(/src="game\.js(\?v=[^"]*)?"/, `src="game.js?v=${hash}"`);
  if (out === s && !s.includes(`game.js?v=${hash}`)) throw new Error('index.html に game.js の参照が見つかりません');
  writeFileSync(html, out);
  console.log(`game.js?v=${hash}`);
}
