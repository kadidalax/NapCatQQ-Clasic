// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import { createWriteStream } from 'node:fs';
import { access, mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function squashfsOffset (file) {
  const length = (await stat(file)).size;
  const handle = await open(file, 'r');
  const prefix = Buffer.alloc(Math.min(length, 8 * 1024 * 1024));
  try { await handle.read(prefix, 0, prefix.length, 0); } finally { await handle.close(); }
  let offset = -1;
  while ((offset = prefix.indexOf('hsqs', offset + 1)) !== -1) {
    if (offset + 96 > prefix.length) continue;
    const blockSize = prefix.readUInt32LE(offset + 12);
    const bytesUsed = prefix.readBigUInt64LE(offset + 40);
    if (prefix.readUInt16LE(offset + 28) === 4 && prefix.readUInt16LE(offset + 30) === 0 && blockSize >= 4096 && blockSize <= 1048576 && (blockSize & (blockSize - 1)) === 0 && bytesUsed > 96n && bytesUsed <= BigInt(length - offset)) return offset;
  }
  throw new Error('No valid SquashFS 4 filesystem found in the verified AppImage');
}

export async function verifyDownload (file, expected) {
  const handle = await open(file, 'r');
  const hash = createHash('sha256');
  try { for await (const chunk of handle.createReadStream()) hash.update(chunk); } finally { await handle.close(); }
  const digest = hash.digest('hex');
  const size = (await stat(file)).size;
  if (digest !== expected.sha256 || size !== expected.size) throw new Error(`QQ integrity check failed (${size} bytes, sha256:${digest})`);
  return digest;
}

async function download (url, output) {
  const response = await fetch(url, { signal: AbortSignal.timeout(600000), redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`QQ download returned HTTP ${response.status}`);
  let bytes = 0;
  const limiter = new Transform({
    transform (chunk, encoding, callback) {
      bytes += chunk.length;
      callback(bytes > 400 * 1024 * 1024 ? new Error('QQ download exceeds expected limits') : null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(output, { flags: 'wx' }));
}

export async function fetchQq (architecture, destination) {
  const manifest = JSON.parse(await readFile(new URL('./qq-manifest.json', import.meta.url), 'utf8'));
  const expected = manifest.architectures[architecture];
  if (!expected || !['amd64', 'arm64'].includes(architecture)) throw new Error('QQ supports amd64 and arm64 only');
  if (!/^[a-f0-9]{64}$/.test(expected.sha256) || !/^https:\/\/qqdl\.gtimg\.cn\//.test(expected.url)) throw new Error('Invalid fixed QQ manifest');
  const archive = path.join(os.tmpdir(), `napcatqq-clasic-qq-${architecture}.AppImage`);
  for (let attempt = 0; attempt < 3; attempt++) {
    await rm(archive, { force: true });
    try { await download(expected.url, archive); await verifyDownload(archive, expected); break; } catch (error) {
      if (attempt === 2) throw error;
      console.warn(`QQ download attempt ${attempt + 1} failed: ${error.message}; retrying`);
    }
  }
  const offset = await squashfsOffset(archive);
  await mkdir(path.dirname(destination), { recursive: true });
  const result = spawnSync('unsquashfs', ['-no-progress', '-offset', String(offset), '-d', destination, archive], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`unsquashfs exited with ${result.status}`);
  for (const file of ['qq', 'resources/app/package.json', 'resources/app/wrapper.node', 'resources/app/major.node', 'LICENSE.electron.txt', 'LICENSES.chromium.html']) await access(path.join(destination, file));
  const qqPackage = JSON.parse(await readFile(path.join(destination, 'resources/app/package.json'), 'utf8'));
  if (qqPackage.version !== manifest.version || qqPackage.eleArch !== (architecture === 'amd64' ? 'x64' : 'arm64')) throw new Error('QQ package version or architecture does not match its pinned manifest');
  await writeFile(path.join(destination, 'napcatqq-clasic-qq-manifest.json'), JSON.stringify({ version: manifest.version, architecture, url: expected.url, sha256: expected.sha256, size: expected.size, squashfsOffset: offset, license: manifest.license }, null, 2) + '\n');
  await rm(archive, { force: true });
  console.log(`Verified QQ ${manifest.version} ${architecture}: sha256:${expected.sha256}, SquashFS offset ${offset}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [architecture, destination] = process.argv.slice(2);
  try {
    if (!architecture || !destination || process.argv.length !== 4) throw new Error('Usage: node fetch-qq.mjs <amd64|arm64> <destination>');
    await fetchQq(architecture, path.resolve(destination));
  } catch (error) { console.error(error); process.exitCode = 1; }
}
