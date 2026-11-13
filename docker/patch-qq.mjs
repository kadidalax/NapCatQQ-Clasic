// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function patchQq (qqDirectory, shellDirectory) {
  const packageFile = path.join(qqDirectory, 'resources', 'app', 'package.json');
  const original = await readFile(packageFile, 'utf8');
  const manifest = JSON.parse(original);
  const expected = JSON.parse(await readFile(path.join(qqDirectory, 'napcatqq-clasic-qq-manifest.json'), 'utf8'));
  if (manifest.version !== expected.version) throw new Error('QQ version differs from its verified download manifest');
  // Preserve the real QQ version, appid, architecture, copyrights and notices.
  // The runtime uses QQ's own Electron, not a mismatched standalone Node ABI.
  await writeFile(path.join(qqDirectory, 'resources', 'app', 'package.qq-original.json'), original);
  manifest.main = './loadNapCat.js';
  manifest.type = 'commonjs';
  manifest.isPureShell = true;
  manifest.isByteCodeShell = true;
  await copyFile(path.join(shellDirectory, 'loadNapCat.js'), path.join(qqDirectory, 'resources', 'app', 'loadNapCat.js'));
  await writeFile(packageFile, JSON.stringify(manifest, null, 2) + '\n');
  // Persistent QQ data can contain another desktop installation's versions
  // config. Read this immutable image-owned version file instead of that state.
  await writeFile(path.join(qqDirectory, 'resources', 'app', 'napcatqq-clasic-version.json'), JSON.stringify({
    baseVersion: manifest.version, curVersion: manifest.version, prevVersion: '', onErrorVersions: [], buildId: manifest.buildVersion || manifest.version.split('-')[1],
  }, null, 2) + '\n');
  console.log(`QQ ${manifest.version}: repository Shell loader installed; original package metadata preserved`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [qqDirectory, shellDirectory] = process.argv.slice(2);
    if (!qqDirectory || !shellDirectory || process.argv.length !== 4) throw new Error('Usage: node patch-qq.mjs <QQ directory> <built Shell directory>');
    await patchQq(path.resolve(qqDirectory), path.resolve(shellDirectory));
  } catch (error) { console.error(error); process.exitCode = 1; }
}
