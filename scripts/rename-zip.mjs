import { readdir, rename } from 'node:fs/promises';
import path from 'node:path';

/**
 * Chrome、Edge 和其它 Chromium 浏览器共用同一份 MV3 包，WXT 默认却把它命名成
 * `<name>-<version>-chrome.zip`，看起来像是 Chrome 专用。这里统一改成 `chromium`，
 * 让产物名和实际适用范围一致，也避免有人再为 Edge 单独跑一次构建。
 *
 * `wxt zip -b firefox` 产物不含 `-chrome`，不会被误改。
 */
const outDir = path.resolve('.output');
const zips = await readdir(outDir).catch(() => []);

for (const file of zips) {
  if (!file.endsWith('-chrome.zip')) continue;
  const renamed = file.replace(/-chrome\.zip$/, '-chromium.zip');
  await rename(path.join(outDir, file), path.join(outDir, renamed));
  console.log(`[zip] ${file} -> ${renamed}`);
}
