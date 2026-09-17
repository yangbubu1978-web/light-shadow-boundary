// ============================================================
// 產生 images.json（作品索引）
// ============================================================
// 為什麼需要這個：網站原本在瀏覽器端現場遞迴 7 層 Google Drive 資料夾
// 才拿得到照片清單，實測要 9.6 秒，是首屏最大的瓶頸。
// 改成由 CI 產出靜態 images.json，訪客直接從 GitHub Pages CDN 取用。
//
// 執行：node .github/scripts/build-image-index.mjs
// 需要：GOOGLE_DRIVE_API_KEY / DRIVE_FOLDER_ID 環境變數，
//       未設定時自動從 script.js 讀取（該 key 本來就公開在前端）。
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const scriptSrc = readFileSync(join(root, 'script.js'), 'utf8');

function fromScript(re) {
  const m = scriptSrc.match(re);
  return m ? m[1] : null;
}

const API_KEY = process.env.GOOGLE_DRIVE_API_KEY
  || fromScript(/GOOGLE_DRIVE_API_KEY\s*=\s*'([^']+)'/);
const ROOT_FOLDER = process.env.DRIVE_FOLDER_ID
  || fromScript(/DRIVE_FOLDER_ID\s*=\s*'([^']+)'/);

if (!API_KEY || !ROOT_FOLDER) {
  console.error('缺少 GOOGLE_DRIVE_API_KEY 或 DRIVE_FOLDER_ID');
  process.exit(1);
}

// 帶 Referer 以通過 API key 的 referrer 白名單
const HEADERS = {
  Referer: 'https://yangbubu1978-web.github.io/',
  Origin: 'https://yangbubu1978-web.github.io',
  'User-Agent': 'Mozilla/5.0 (compatible; image-index-builder)',
};

async function api(params) {
  const url = 'https://www.googleapis.com/drive/v3/files?'
    + new URLSearchParams(params).toString();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) return await res.json();
      if (res.status >= 500 || res.status === 429) throw new Error('HTTP ' + res.status);
      throw Object.assign(new Error('HTTP ' + res.status), { fatal: true });
    } catch (err) {
      if (err.fatal || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return {};
}

async function listAll(folderId, kind) {
  const out = [];
  let pageToken = null;
  do {
    const params = {
      q: kind === 'img'
        ? `'${folderId}' in parents and mimeType contains 'image/'`
        : `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
      fields: 'files(id,name,createdTime,shortcutDetails),nextPageToken',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      key: API_KEY,
    };
    if (pageToken) params.pageToken = pageToken;
    const data = await api(params);
    out.push(...(data.files || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return out;
}

const collected = [];

async function walk(folderId) {
  const [images, subfolders] = await Promise.all([
    listAll(folderId, 'img'),
    listAll(folderId, 'folder'),
  ]);
  collected.push(...images);
  console.log(`folder ${folderId.slice(0, 8)}: ${images.length} imgs, ${subfolders.length} subfolders`);

  // 各子資料夾並行
  await Promise.all(subfolders.map((sf) => {
    const target = (sf.shortcutDetails && sf.shortcutDetails.targetId) || sf.id;
    return walk(target).catch((err) => {
      console.warn(`  子資料夾 ${target} 失敗：${err.message}`);
    });
  }));
}

console.log('開始抓取 Google Drive 作品索引…');
const t0 = Date.now();
await walk(ROOT_FOLDER);
console.log(`抓取完成：${collected.length} 張，耗時 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// 去重（同一張圖可能透過捷徑出現多次）
const seen = new Set();
const deduped = [];
for (const f of collected) {
  if (!f.id || seen.has(f.id)) continue;
  seen.add(f.id);
  deduped.push(f);
}

// 索引精簡：用陣列取代物件（省掉重複的 key 名稱），
// 並移除 width/height/rotation —— 前端已不再使用（CLS aspect-ratio 已移除）
const images = deduped.map((f) => [
  f.id,
  f.name || 'Untitled',
  f.createdTime || null,
]);

const payload = {
  v: 2,
  generated: new Date().toISOString(),
  count: images.length,
  images,
};

const outPath = join(root, 'images.json');
writeFileSync(outPath, JSON.stringify(payload));

const bytes = JSON.stringify(payload).length;
console.log(`已寫入 images.json：${(bytes / 1024).toFixed(1)} KB（${images.length} 張）`);
