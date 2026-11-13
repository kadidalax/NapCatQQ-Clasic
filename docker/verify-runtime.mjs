// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const qq = '/opt/QQ';
const shell = '/app/shell';
const manifest = JSON.parse(readFileSync(path.join(qq, 'napcatqq-clasic-qq-manifest.json'), 'utf8'));
const qqPackage = JSON.parse(readFileSync(path.join(qq, 'resources/app/package.json'), 'utf8'));
const versionConfig = JSON.parse(readFileSync(path.join(qq, 'resources/app/napcatqq-clasic-version.json'), 'utf8'));
const project = JSON.parse(readFileSync(path.join(shell, 'project.json'), 'utf8'));
if (qqPackage.version !== manifest.version || versionConfig.curVersion !== manifest.version || qqPackage.main !== './loadNapCat.js' || project.name !== 'NapCatQQ-clasic' || project.frozen !== true) throw new Error('Runtime identity/version/loader validation failed');
const architecture = process.arch === 'x64' ? 'amd64' : process.arch;
if (architecture !== manifest.architecture) throw new Error('QQ runtime architecture mismatch');
const libraryPath = [qq, `${qq}/resources/app`, `${qq}/resources/app/sharp-lib`, `${qq}/usr/lib`, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const binaries = ['qq', 'resources/app/wrapper.node', 'resources/app/major.node'].map(file => path.join(qq, file));
binaries.push(path.join(shell, `native/packet/MoeHoo.linux.${process.arch}.node`), path.join(shell, `native/napi2native/napi2native.linux.${process.arch}.node`));
for (const binary of binaries) {
  if (!existsSync(binary)) throw new Error(`Missing required binary: ${binary}`);
  const result = spawnSync('ldd', [binary], { env: { ...process.env, LD_LIBRARY_PATH: libraryPath }, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0 || /not found/.test(result.stdout + result.stderr)) throw new Error(`Missing native dependency: ${binary}\n${result.stdout}\n${result.stderr}`);
  console.log(`ELF dependency check PASS: ${binary}`);
}
const json5 = JSON.parse(readFileSync(path.join(shell, 'node_modules/json5/package.json'), 'utf8'));
if (json5.version !== '2.2.3') throw new Error('Locked runtime JSON5 parser is missing or drifted');
for (const file of ['node_modules/json5/LICENSE.md', 'napcat.mjs', 'loadNapCat.js', 'static/index.html', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'packages/napcat-webui-frontend/LICENSE', 'packages/napcat-dpapi/LICENSE', 'licenses/qrcode-terminal.LICENSE', 'licenses/qrcode-generator.LICENSE', 'licenses/node-pty.LICENSE']) {
  if (!existsSync(path.join(shell, file))) throw new Error(`Missing packaged runtime file: ${file}`);
}
console.log(`NapCatQQ-clasic ${project.version}, QQ ${manifest.version} ${architecture}: runtime layout and native dependencies PASS`);
