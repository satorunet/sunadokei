// 砂時計イイネの累計。全部屋で共有し、ファイルに保存して再起動後も引き継ぐ
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(DIR, 'likes.json');
let total = 0, dirty = false;
try {
  const v = JSON.parse(readFileSync(FILE, 'utf8')).total;
  if (Number.isSafeInteger(v) && v >= 0) total = v;
} catch (e) { if (e.code !== 'ENOENT') console.error('[likes] 読み込み失敗', e); }

function save() {
  if (!dirty) return;
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE + '.tmp', JSON.stringify({ total }));
    renameSync(FILE + '.tmp', FILE);
    dirty = false;
  } catch (e) { console.error('[likes] 保存失敗', e); }
}
setInterval(save, 5000).unref();

export const likes = {
  save,
  add(n) { total += n; dirty = true; return total; },
  get total() { return total; },
};
