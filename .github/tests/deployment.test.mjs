// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyServerModules } from '../../docker/verify-server-modules.mjs';
import { assertGeneratedDirectory, buildArtifacts, copyLicenses, copyRuntimeDependencies, getProject, LICENSE_FILES, normalizeRepository, normalizeVersion, parseArguments, ROOT } from '../../scripts/build-artifacts.mjs';
import { crc32, createZip, packageRelease, releaseNotes, renderCompose, renderAstrbotCompose, renderEnvironment, ASTRBOT_MANIFEST } from '../../scripts/package-release.mjs';
import { validateReleaseInput } from '../scripts/release-metadata.mjs';
import { initialiseConfig } from '../../docker/init-config.mjs';
import { patchQq } from '../../docker/patch-qq.mjs';
import { squashfsOffset, verifyDownload } from '../../docker/fetch-qq.mjs';
import { ASTRBOT_CONNECTION_NAME, ASTRBOT_MEDIA_PATH, DEFAULT_ONEBOT_WS_URL, applyAstrbotPreset, astrbotPresetSettings, initialiseOneBotPreset, loadRuntimeJson5 } from '../../docker/onebot-preset.mjs';
const JSON5 = createRequire(path.join(ROOT, 'packages/napcat-core/package.json'))('json5');

const cleanup = [];
function fixture () {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'clasic-deployment-test-'));
  cleanup.push(directory);
  return directory;
}
function write (file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
}
function json (file, value) { write(file, JSON.stringify(value, null, 2) + '\n'); }
afterEach(() => { for (const directory of cleanup.splice(0)) rmSync(directory, { recursive: true, force: true }); });

for (const version of ['1.0.0', 'v1.0.0', '0.0.0', '123.45.6']) {
  test(`release version accepts ${version}`, () => {
    assert.equal(validateReleaseInput(version).tag, `v${version.replace(/^v/, '')}`);
  });
}
for (const version of ['', '1.0', '01.0.0', 'v1.00.0', 'v1.0.0-beta', '1.0.0+build', ' v1.0.0', 'v1.0.0 ', 'v1.0.0\ncontents: write', 'v1.0.0; echo injected', '$(id)', 'v1.0.0`id`', 'v1.0.0"']) {
  test(`release version rejects malformed input ${JSON.stringify(version)}`, () => assert.throws(() => validateReleaseInput(version)));
}
test('CI versions permit SemVer prerelease/build metadata without upstream lookup', () => {
  assert.equal(normalizeVersion('1.0.0-ci.12+deadbeef'), '1.0.0-ci.12+deadbeef');
  assert.throws(() => normalizeVersion('1.0.0-01'));
  assert.throws(() => normalizeVersion('1.0.0-ci..1'));
  assert.throws(() => normalizeVersion('1.0.0+build..1'));
});
test('repository metadata is validated and not a shell command', () => {
  assert.equal(normalizeRepository('kadidalax/NapCatQQ-Clasic'), 'kadidalax/NapCatQQ-Clasic');
  assert.equal(normalizeRepository(''), '');
  for (const value of ['https://github.com/kadidalax/repo', 'kadidalax/repo;echo x', 'kadidalax/repo\nfoo=bar', '../repo', 'owner/repo/extra']) assert.throws(() => normalizeRepository(value));
  assert.throws(() => normalizeRepository('', { required: true }));
});
test('CLI parsing accepts the pnpm separator, applies repository input and rejects unknown flags', () => {
  assert.deepEqual(parseArguments(['--', '--target', 'shell', '--repository', 'kadidalax/NapCatQQ-Clasic']), { target: 'shell', repository: 'kadidalax/NapCatQQ-Clasic' });
  assert.throws(() => parseArguments(['--version']));
  assert.throws(() => parseArguments(['--run', 'something']));
});
test('project metadata keeps the exact clasic spelling and freeze', () => {
  const project = getProject();
  assert.equal(project.name, 'NapCatQQ-clasic');
  assert.equal(project.slug, 'napcatqq-clasic');
  assert.equal(project.frozen, true);
});
test('original license is copied without adding a project-level MIT grant', () => {
  assert.deepEqual(LICENSE_FILES, ['LICENSE', 'THIRD_PARTY_NOTICES.md']);
  const license = readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  assert.match(license, /^Limited Redistribution License for NapCat/);
  assert.ok(license.includes('Copyright © 2024 Mlikiowa'));
  assert.ok(!existsSync(path.join(ROOT, 'LICENSE-MIT')));
  for (const file of ['scripts/build-artifacts.mjs', 'scripts/package-release.mjs', '.github/workflows/ci.yml', '.github/workflows/release.yml', 'Dockerfile', '.env.example']) {
    const header = readFileSync(path.join(ROOT, file), 'utf8').split('\n').slice(0, 2).join('\n');
    assert.doesNotMatch(header, /SPDX-License-Identifier: MIT|Copyright.*YG/);
    assert.match(header, /kadidalax/);
  }
});
test('the concrete source deployment image matches the supplied GitHub owner', () => {
  const project = getProject();
  const expectedImage = `NAPCAT_IMAGE=ghcr.io/${project.repository.split('/')[0].toLowerCase()}/${project.slug}:${project.version}`;
  assert.ok(readFileSync(path.join(ROOT, '.env.example'), 'utf8').split(/\r?\n/).includes(expectedImage));
});

for (const directory of ['.', '..', 'packages', '.github', '.github/scripts', 'scripts', 'docker', 'node_modules', 'README.md']) {
  test(`output paths reject source/dependency directory ${directory} before any deletion/build`, () => {
    assert.throws(() => assertGeneratedDirectory(ROOT, path.join(ROOT, directory), ['dist', 'out']));
    assert.throws(() => assertGeneratedDirectory(ROOT, path.join(ROOT, directory), ['release-assets', 'out']));
    assert.throws(() => buildArtifacts(['--dist', directory]), /Output must be inside/);
    assert.throws(() => packageRelease(['--repository', 'kadidalax/NapCatQQ-Clasic', '--out', directory]), /Output must be inside/);
  });
}
test('generated output directories are accepted but symlink ancestors are rejected', () => {
  const root = fixture();
  assert.equal(assertGeneratedDirectory(root, path.join(root, 'dist', 'shell'), ['dist']), path.join(root, 'dist', 'shell'));
  mkdirSync(path.join(root, 'out'));
  mkdirSync(path.join(root, 'source'));
  symlinkSync(path.join(root, 'source'), path.join(root, 'out', 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => assertGeneratedDirectory(root, path.join(root, 'out', 'link', 'artifact'), ['out']), /symlinks/);
});

test('runtime dependencies use installed versions, preserve licenses and nested version conflicts', () => {
  const root = fixture();
  const source = path.join(root, 'source');
  const destination = path.join(root, 'release');
  for (const [name, version, debugVersion] of [['express', '5.2.1', '4.4.3'], ['ws', '8.18.3', '3.2.0']]) {
    const directory = path.join(source, 'node_modules', name);
    json(path.join(directory, 'package.json'), { name, version, main: 'index.js', dependencies: { debug: '^' + debugVersion }, optionalDependencies: { optionalMissing: '1.0.0' } });
    write(path.join(directory, 'index.js'), 'module.exports = require("debug");');
    write(path.join(directory, 'LICENSE'), 'original runtime dependency license');
    json(path.join(directory, 'node_modules/debug/package.json'), { name: 'debug', version: debugVersion, main: 'index.js' });
    write(path.join(directory, 'node_modules/debug/index.js'), `module.exports = ${JSON.stringify(debugVersion)};`);
    write(path.join(directory, 'node_modules/debug/LICENSE'), 'debug original license');
  }
  const json5Directory = path.join(source, 'packages/napcat-core/node_modules/json5');
  json(path.join(json5Directory, 'package.json'), { name: 'json5', version: '2.2.3', main: 'index.js' });
  write(path.join(json5Directory, 'index.js'), 'module.exports = {parse:JSON.parse,stringify:JSON.stringify};');
  write(path.join(json5Directory, 'LICENSE.md'), 'json5 original license');
  const versions = copyRuntimeDependencies(source, destination);
  assert.deepEqual(versions, { express: '5.2.1', ws: '8.18.3', json5: '2.2.3' });
  assert.equal(loadRuntimeJson5(destination).parse('{"fixture":true}').fixture, true);
  assert.ok(existsSync(path.join(destination, 'node_modules/json5/LICENSE.md')));
  const require = createRequire(path.join(destination, 'index.cjs'));
  assert.equal(require('express'), '4.4.3');
  assert.equal(require('ws'), '3.2.0');
  assert.equal(readFileSync(path.join(destination, 'node_modules/express/LICENSE'), 'utf8'), 'original runtime dependency license');
  assert.equal(lstatSync(path.join(destination, 'node_modules/express')).isSymbolicLink(), false);
  assert.ok(existsSync(path.join(destination, 'node_modules/ws/node_modules/debug/LICENSE')));
});
test('mandatory runtime dependencies must exist', () => {
  const root = fixture();
  assert.throws(() => copyRuntimeDependencies(root, path.join(root, 'release')), /Locked runtime dependency is missing/);
});
test('all applicable root and nested source license paths remain usable in an artifact', () => {
  const destination = fixture();
  copyLicenses(ROOT, destination);
  for (const file of [...LICENSE_FILES, 'pnpm-lock.yaml', 'licenses/qrcode-terminal.LICENSE', 'licenses/qrcode-generator.LICENSE', 'licenses/node-pty.LICENSE', 'packages/napcat-webui-frontend/LICENSE', 'packages/napcat-dpapi/LICENSE']) {
    assert.deepEqual(readFileSync(path.join(destination, file)), readFileSync(path.join(ROOT, file)));
  }
});

test('CRC32 matches ZIP reference values', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});
test('ZIP output is deterministic, UTF-8 and decompressible without platform symlinks', () => {
  const root = fixture();
  const source = path.join(root, 'source');
  write(path.join(source, 'hello.txt'), 'hello');
  write(path.join(source, '中文 space/文件.txt'), 'unicode file');
  assert.equal(createZip(source, path.join(root, 'one.zip')), 2);
  assert.equal(createZip(source, path.join(root, 'two.zip')), 2);
  const zip = readFileSync(path.join(root, 'one.zip'));
  assert.deepEqual(zip, readFileSync(path.join(root, 'two.zip')));
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt16LE(6), 0x0800);
  assert.equal(zip.readUInt16LE(12), 33);
  const nameLength = zip.readUInt16LE(26);
  const length = zip.readUInt32LE(18);
  assert.equal(zip.subarray(30, 30 + nameLength).toString(), 'hello.txt');
  assert.equal(inflateRawSync(zip.subarray(30 + nameLength, 30 + nameLength + length)).toString(), 'hello');
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), 2);
});
test('ZIP input symlinks are an explicit error', () => {
  const root = fixture();
  write(path.join(root, 'source/original/file.txt'), 'original');
  symlinkSync(path.join(root, 'source/original'), path.join(root, 'source/link'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => createZip(path.join(root, 'source'), path.join(root, 'out.zip')), /symlink/);
});

test('Compose release assets concrete the owner/version but keep image override and original Docker defaults', () => {
  const template = readFileSync(path.join(ROOT, 'compose.yaml'), 'utf8');
  const result = renderCompose(template, 'ghcr.io/kadidalax/napcatqq-clasic:1.0.0');
  assert.ok(result.includes('${NAPCAT_IMAGE:-ghcr.io/kadidalax/napcatqq-clasic:1.0.0}'));
  assert.ok(result.includes('${WEBUI_BIND:-}'));
  assert.ok(result.includes('user: "1000:1000"'));
  assert.ok(result.includes('read_only: true'));
  assert.throws(() => renderCompose(template, 'ghcr.io/kadidalax/napcatqq-clasic:latest'));
  const env = renderEnvironment(readFileSync(path.join(ROOT, '.env.example'), 'utf8'), 'ghcr.io/kadidalax/napcatqq-clasic:1.0.0');
  assert.match(env, /^NAPCAT_IMAGE=ghcr\.io\/kadidalax\/napcatqq-clasic:1\.0\.0$/m);
  assert.match(env, /^WEBUI_BIND=$/m);
  assert.match(env, /^ASTRBOT_DASHBOARD_BIND=$/m);
});
test('release deployment commands are one command per block and use the real asset name', () => {
  const notes = releaseNotes({ name: 'NapCatQQ-clasic', maintainer: 'kadidalax' }, '1.0.0', 'kadidalax/NapCatQQ-Clasic', 'ghcr.io/kadidalax/napcatqq-clasic:1.0.0');
  const blocks = [...notes.matchAll(/```sh\n([\s\S]*?)\n```/g)].map(match => match[1]);
  assert.ok(blocks.length >= 12);
  for (const command of blocks) assert.equal(command.split('\n').length, 1);
  assert.ok(notes.includes('raw.githubusercontent.com/kadidalax/NapCatQQ-Clasic/main/compose.yaml'));
  assert.ok(!notes.includes('/releases/download/v1.0.0/compose.yaml'));
  assert.ok(!notes.includes('/releases/download/v1.0.0/astrbot.yml'));
  assert.ok(notes.includes('docker compose config -q'));
  assert.ok(notes.includes('http://[SERVER_IP]:6099/webui/'));
  assert.ok(notes.includes('http://[SERVER_IP]:6185'));
  assert.ok(notes.includes('原始 6099:6099 发布行为'));
  assert.ok(notes.includes('原始 6185:6185 发布行为'));
  assert.ok(notes.includes('默认不指定宿主 IP'));
  assert.ok(notes.includes('http://127.0.0.1:6099/webui/'), 'Explicit localhost override retains the optional SSH access instructions');
  assert.ok(!notes.includes('默认只在宿主 127.0.0.1'));
});

test('first container startup generates a strong persisted token and seeds the writable volumes', async () => {
  const root = fixture();
  const workDirectory = path.join(root, 'work');
  const shellDirectory = path.join(root, 'shell');
  const qqDirectory = path.join(root, 'qq');
  json(path.join(shellDirectory, 'config/napcat.json'), { fileLog: true });
  write(path.join(shellDirectory, 'plugins/napcat-plugin-builtin/index.mjs'), 'export const fixture = true;');
  const first = await initialiseConfig({ environment: {}, workDirectory, shellDirectory, qqDirectory });
  assert.match(first.token, /^[a-f0-9]{48}$/);
  assert.equal(first.host, '0.0.0.0');
  assert.equal(first.port, 6099);
  const next = await initialiseConfig({ environment: {}, workDirectory, shellDirectory, qqDirectory });
  assert.equal(next.token, first.token);
  assert.ok(existsSync(path.join(workDirectory, 'config/napcat.json')));
  assert.ok(existsSync(path.join(workDirectory, 'plugins/napcat-plugin-builtin/index.mjs')));
});
test('configured token and QQ account override only relevant persisted fields', async () => {
  const root = fixture();
  const workDirectory = path.join(root, 'work');
  json(path.join(workDirectory, 'config/webui.json'), { token: 'persisted-short', theme: 'dark', loginRate: 5 });
  const environment = { WEBUI_TOKEN: 'clasic-explicit-token-123456789', NAPCAT_QUICK_ACCOUNT: '123456789' };
  const result = await initialiseConfig({ environment, workDirectory, shellDirectory: path.join(root, 'shell'), qqDirectory: path.join(root, 'qq') });
  assert.equal(result.token, environment.WEBUI_TOKEN);
  assert.equal(result.autoLoginAccount, '123456789');
  assert.equal(result.theme, 'dark');
  assert.equal(result.loginRate, 5);
});
test('user-edited persisted tokens are retained on restart; malformed files are not silently reset', async () => {
  const root = fixture();
  const workDirectory = path.join(root, 'work');
  const options = { environment: {}, workDirectory, shellDirectory: path.join(root, 'shell'), qqDirectory: path.join(root, 'qq') };
  json(path.join(workDirectory, 'config/webui.json'), { token: 'custom-token' });
  assert.equal((await initialiseConfig(options)).token, 'custom-token');
  write(path.join(workDirectory, 'config/webui.json'), '{broken');
  await assert.rejects(initialiseConfig(options), SyntaxError);
  assert.equal(readFileSync(path.join(workDirectory, 'config/webui.json'), 'utf8'), '{broken');
});
test('short explicit tokens and malformed QQ accounts fail clearly', async () => {
  const root = fixture();
  const options = { workDirectory: path.join(root, 'work'), shellDirectory: path.join(root, 'shell'), qqDirectory: path.join(root, 'qq') };
  await assert.rejects(initialiseConfig({ ...options, environment: { WEBUI_TOKEN: 'short' } }), /at least 16/);
  await assert.rejects(initialiseConfig({ ...options, environment: { NAPCAT_QUICK_ACCOUNT: 'not-a-QQ-number' } }), /numeric QQ/);
});
test('QQ patch uses the repository Shell loader while retaining real Tencent metadata and rollback', async () => {
  const root = fixture();
  const qq = path.join(root, 'QQ');
  const shell = path.join(root, 'shell');
  const original = { name: 'QQ', version: '3.2.34-53644', buildVersion: '53644', main: './original/index.js', appid: { linux: '537391511' }, author: { name: 'Tencent' }, eleArch: 'arm64' };
  json(path.join(qq, 'resources/app/package.json'), original);
  json(path.join(qq, 'napcatqq-clasic-qq-manifest.json'), { version: original.version });
  write(path.join(shell, 'loadNapCat.js'), 'console.log("repository loader");');
  await patchQq(qq, shell);
  const patched = JSON.parse(readFileSync(path.join(qq, 'resources/app/package.json'), 'utf8'));
  assert.equal(patched.main, './loadNapCat.js');
  assert.equal(patched.version, original.version);
  assert.deepEqual(patched.appid, original.appid);
  assert.deepEqual(patched.author, original.author);
  assert.equal(patched.eleArch, original.eleArch);
  const pinnedVersion = JSON.parse(readFileSync(path.join(qq, 'resources/app/napcatqq-clasic-version.json'), 'utf8'));
  assert.equal(pinnedVersion.curVersion, original.version);
  assert.equal(pinnedVersion.buildId, original.buildVersion);
  assert.deepEqual(JSON.parse(readFileSync(path.join(qq, 'resources/app/package.qq-original.json'), 'utf8')), original);
  assert.deepEqual(readFileSync(path.join(qq, 'resources/app/loadNapCat.js')), readFileSync(path.join(shell, 'loadNapCat.js')));
});
test('AppImage SquashFS extraction validates the superblock rather than a false magic string', async () => {
  const root = fixture();
  const data = Buffer.alloc(8192);
  data.write('hsqs', 8);
  const offset = 1024;
  data.write('hsqs', offset);
  data.writeUInt32LE(131072, offset + 12);
  data.writeUInt16LE(4, offset + 28);
  data.writeUInt16LE(0, offset + 30);
  data.writeBigUInt64LE(4096n, offset + 40);
  write(path.join(root, 'qq.AppImage'), data);
  assert.equal(await squashfsOffset(path.join(root, 'qq.AppImage')), offset);
  write(path.join(root, 'bad.AppImage'), 'not an AppImage');
  await assert.rejects(squashfsOffset(path.join(root, 'bad.AppImage')), /No valid SquashFS/);
});
test('QQ download verification requires exact SHA256 and byte length', async () => {
  const root = fixture();
  const file = path.join(root, 'download');
  const bytes = Buffer.from('pinned synthetic download');
  write(file, bytes);
  const expected = { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  assert.equal(await verifyDownload(file, expected), expected.sha256);
  await assert.rejects(verifyDownload(file, { ...expected, size: expected.size + 1 }), /integrity/);
  await assert.rejects(verifyDownload(file, { ...expected, sha256: '0'.repeat(64) }), /integrity/);
});

test('release packaging creates complete visible assets and checksums with a concrete lowercase image', () => {
  const token = `deployment-test-${process.pid}`;
  const dist = path.join(ROOT, 'dist', token);
  const output = path.join(ROOT, 'release-assets', token);
  cleanup.push(dist, output);
  for (const target of ['shell', 'framework']) {
    json(path.join(dist, target, 'package.json'), { name: `napcatqq-clasic-${target}`, version: '1.0.0', type: 'commonjs' });
    write(path.join(dist, target, 'napcat.mjs'), 'export const fixture = true;');
    write(path.join(dist, target, 'worker/conoutSocketWorker.mjs'), 'export const fixture = true;');
    for (const file of LICENSE_FILES) copyFileSync(path.join(ROOT, file), path.join(dist, target, file));
  }
  json(path.join(dist, 'build-info.json'), { name: 'NapCatQQ-clasic', version: '1.0.0', frozen: true, targets: ['shell', 'framework'], repository: 'kadidalax/NapCatQQ-Clasic' });
  json(path.join(dist, 'openapi.json'), { openapi: '3.1.0', info: { title: 'Fixture', version: '1.0.0' }, paths: { '/fixture': { get: {} } } });
  const result = packageRelease(['--version', 'v1.0.0', '--repository', 'kadidalax/NapCatQQ-Clasic', '--dist', dist, '--out', output]);
  assert.equal(result.image, 'ghcr.io/kadidalax/napcatqq-clasic:1.0.0');
  assert.ok(existsSync(path.join(output, 'NapCatQQ-clasic.Shell.zip')));
  assert.ok(existsSync(path.join(output, 'NapCatQQ-clasic.Framework.zip')));
  for (const file of ['compose.yaml', 'astrbot.yml', 'env.example', '.env.example']) {
    assert.ok(!existsSync(path.join(output, file)), `Deployment configuration must stay in repository root: ${file}`);
  }
  assert.equal(JSON.parse(readFileSync(path.join(output, 'image-manifest.json'), 'utf8')).astrbot.image, ASTRBOT_MANIFEST.image);
  assert.ok(!existsSync(path.join(output, '.env.example')), 'Leading-dot duplicate asset names are not published');
  for (const line of readFileSync(path.join(output, 'SHA256SUMS'), 'utf8').trim().split('\n')) {
    const [hash, name] = line.split('  ');
    assert.equal(hash, createHash('sha256').update(readFileSync(path.join(output, name))).digest('hex'), name);
  }
  assert.throws(() => packageRelease(['--repository', 'kadidalax/NapCatQQ-Clasic', '--dist', dist, '--out', path.join(dist, 'release-assets')]), /Output must be inside|separate/);
});

test('Docker and workflows use frozen source builds, exact QQ downloads and native architecture smoke gates', () => {
  const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  const qqManifest = JSON.parse(readFileSync(path.join(ROOT, 'docker/qq-manifest.json'), 'utf8'));
  assert.match(dockerfile, /AS builder/);
  assert.match(dockerfile, /pnpm run build:artifacts/);
  assert.match(dockerfile, /LicenseRef-NapCat-Limited-Redistribution AND MIT AND Apache-2.0 AND LicenseRef-Tencent-QQ/);
  assert.doesNotMatch(dockerfile, /FROM\s+.*napneko|releases\/latest/i);
  assert.equal(qqManifest.version, '3.2.34-53644');
  for (const architecture of ['amd64', 'arm64']) {
    assert.match(qqManifest.architectures[architecture].sha256, /^[a-f0-9]{64}$/);
    assert.ok(qqManifest.architectures[architecture].url.includes('3.2.34-53644'));
    assert.ok(qqManifest.architectures[architecture].size > 200000000);
  }
  for (const name of ['ci.yml', 'release.yml']) {
    const workflow = readFileSync(path.join(ROOT, '.github/workflows', name), 'utf8');
    assert.doesNotMatch(workflow, /NapNeko|NAPCAT_BUILD|APIFOX_TOKEN|write-all|pull_request_target|repository_dispatch|workflow_run/);
    assert.match(workflow, /--frozen-lockfile/);
    assert.match(workflow, /runner: ubuntu-24\.04-arm/);
    assert.match(workflow, /smoke-docker\.sh/);
  }
});

function onebotOptions (root, environment = { MODE: 'astrbot' }) {
  return { configDirectory: path.join(root, 'config'), environment, json5: JSON5 };
}
function readOnebot (root, name = 'onebot11.json') {
  return JSON5.parse(readFileSync(path.join(root, 'config', name), 'utf8'));
}
function managedClient (document) {
  return document.network.websocketClients.find(client => client.name === ASTRBOT_CONNECTION_NAME);
}
function composeConfiguration (file, overrides = {}) {
  const command = process.env.COMPOSE_CLI || 'docker';
  const args = [...(process.env.COMPOSE_CLI ? [] : ['compose']), '--env-file', path.join(ROOT, '.env.example'), '-f', path.join(ROOT, file), 'config', '--format', 'json'];
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, COMPOSE_PROJECT_NAME: 'napcatqq-clasic', NAPCAT_IMAGE: 'ghcr.io/kadidalax/napcatqq-clasic:1.0.0', WEBUI_TOKEN: 'unit-test-webui-token-123456', ONEBOT_ACCESS_TOKEN: 'unit-test-onebot-token', ASTRBOT_DASHBOARD_INITIAL_PASSWORD: '', ...overrides } });
  if (result.error && ['ENOENT', 'EPERM'].includes(result.error.code)) return null;
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('MODE empty does not create, read, rewrite or back up OneBot configurations', async () => {
  const root = fixture();
  const configDirectory = path.join(root, 'not-created');
  assert.deepEqual(await initialiseOneBotPreset({ environment: { MODE: '' }, configDirectory }), { mode: '', changed: [], backups: [] });
  assert.ok(!existsSync(configDirectory));
  write(path.join(root, 'config/onebot11.json'), '{intentionally malformed');
  const before = readFileSync(path.join(root, 'config/onebot11.json'));
  await initialiseOneBotPreset(onebotOptions(root, { MODE: '' }));
  assert.deepEqual(readFileSync(path.join(root, 'config/onebot11.json')), before);
  assert.ok(!existsSync(path.join(root, 'config/onebot11.json.astrbot.bak')));
});
test('new astrbot preset uses one array-format reverse client with explicit heartbeat/reconnect defaults', async () => {
  const root = fixture();
  const report = await initialiseOneBotPreset(onebotOptions(root, { MODE: 'astrbot', ONEBOT_ACCESS_TOKEN: 'protocol-token' }));
  const config = readOnebot(root);
  assert.deepEqual(report.changed, ['onebot11.json']);
  assert.equal(config.network.websocketClients.length, 1);
  assert.deepEqual(managedClient(config), { name: 'astrbot', enable: true, url: DEFAULT_ONEBOT_WS_URL, messagePostFormat: 'array', token: 'protocol-token', heartInterval: 30000, reconnectInterval: 5000, reportSelfMessage: false, debug: false });
  assert.deepEqual(report.backups, []);
});
test('the preset preserves every unrelated network entry, plugin and custom property', () => {
  const original = { customRoot: { nested: ['keep'] }, timeout: { maxTimeout: 9000 }, network: { httpServers: [{ name: 'api', enable: true, port: 3010 }], httpClients: [{ name: 'hook', url: 'http://callback' }], websocketServers: [{ name: 'server', port: 3011 }], websocketClients: [{ name: 'another', url: 'ws://other-service/ws', token: 'keep-other' }], plugins: [{ name: 'builtin', custom: 'preserve' }], customNetwork: 42 } };
  const before = structuredClone(original);
  const next = applyAstrbotPreset(original, astrbotPresetSettings({ MODE: 'astrbot' }));
  assert.deepEqual(original, before, 'Pure transformation must not mutate input');
  for (const key of ['httpServers', 'httpClients', 'websocketServers', 'plugins', 'customNetwork']) assert.deepEqual(next.network[key], original.network[key]);
  assert.deepEqual(next.network.websocketClients[0], original.network.websocketClients[0]);
  assert.deepEqual(next.customRoot, original.customRoot);
  assert.deepEqual(next.timeout, original.timeout);
});
test('legacy rws with the same canonical endpoint is adopted without a duplicate or token loss', () => {
  const original = { network: { websocketClients: [{ name: 'rws', url: 'ws://ASTRBOT:6199/ws', token: 'legacy-token', debug: true, heartInterval: 45000, reconnectInterval: 7000, customHeaders: { keep: 'yes' } }, { name: 'different', url: 'ws://elsewhere/ws' }] } };
  const result = applyAstrbotPreset(original, astrbotPresetSettings({ MODE: 'astrbot', ONEBOT_ACCESS_TOKEN: '' }));
  assert.equal(result.network.websocketClients.length, 2);
  const client = managedClient(result);
  assert.equal(client.token, 'legacy-token');
  assert.equal(client.debug, true);
  assert.equal(client.heartInterval, 45000);
  assert.equal(client.reconnectInterval, 7000);
  assert.deepEqual(client.customHeaders, { keep: 'yes' });
  assert.deepEqual(result.network.websocketClients[1], original.network.websocketClients[1]);
  assert.deepEqual(applyAstrbotPreset(result, astrbotPresetSettings({ MODE: 'astrbot' })), result);
});
test('nonempty protocol token overrides only the managed connection; empty preserves its token', () => {
  const input = { network: { websocketClients: [{ name: 'astrbot', url: DEFAULT_ONEBOT_WS_URL, token: 'old-token' }, { name: 'keep', url: 'ws://another/ws', token: 'untouched' }] } };
  const changed = applyAstrbotPreset(input, astrbotPresetSettings({ MODE: 'astrbot', ONEBOT_ACCESS_TOKEN: 'new-token' }));
  assert.equal(managedClient(changed).token, 'new-token');
  assert.equal(changed.network.websocketClients[1].token, 'untouched');
  assert.equal(managedClient(applyAstrbotPreset(changed, astrbotPresetSettings({ MODE: 'astrbot', ONEBOT_ACCESS_TOKEN: '' }))).token, 'new-token');
  assert.equal(managedClient(applyAstrbotPreset({}, astrbotPresetSettings({ MODE: 'astrbot', ONEBOT_ACCESS_TOKEN: '' }))).token, '');
});
test('duplicate managed names, duplicate target URLs and legacy/new conflicts abort before edits', () => {
  const settings = astrbotPresetSettings({ MODE: 'astrbot' });
  for (const clients of [
    [{ name: 'astrbot', url: 'ws://one/ws' }, { name: 'astrbot', url: 'ws://two/ws' }],
    [{ name: 'rws', url: DEFAULT_ONEBOT_WS_URL }, { name: 'rws-2', url: DEFAULT_ONEBOT_WS_URL }],
    [{ name: 'astrbot', url: 'ws://old/ws' }, { name: 'rws', url: DEFAULT_ONEBOT_WS_URL }],
  ]) {
    const original = { network: { websocketClients: clients } };
    const before = structuredClone(original);
    assert.throws(() => applyAstrbotPreset(original, settings), /Duplicate|conflicts/);
    assert.deepEqual(original, before);
  }
});
test('enabled adapters of other kinds cannot be replaced through the shared name Map', () => {
  const settings = astrbotPresetSettings({ MODE: 'astrbot' });
  for (const kind of ['httpServers', 'httpSseServers', 'httpClients', 'websocketServers', 'plugins']) {
    for (const enable of [true, 1, 'true', '1', 'TRUE', 'True', ' TRUE ']) {
      const original = { network: { [kind]: [{ name: 'astrbot', enable, custom: 'keep-running' }], websocketClients: [] } };
      const before = structuredClone(original);
      assert.throws(() => applyAstrbotPreset(original, settings), /conflicts.*enabled/);
      assert.deepEqual(original, before);
      original.network[kind][0].enable = false;
      assert.doesNotThrow(() => applyAstrbotPreset(original, settings));
    }
  }
});
for (const url of ['http://astrbot/ws', 'ws://user:password@astrbot:6199/ws', 'ws://astrbot:6199/ws#fragment', 'ws://astrbot:6199/ws#', 'ws://astrbot:6199/ws\n', 'ws://astrbot:6199/\tws']) {
  test(`OneBot URL validation blocks incompatible or credential-bearing URI ${JSON.stringify(url)}`, () => assert.throws(() => astrbotPresetSettings({ MODE: 'astrbot', ONEBOT_WS_URL: url })));
}
test('control characters in protocol tokens and invalid websocket client types are errors', () => {
  assert.throws(() => astrbotPresetSettings({ MODE: 'astrbot', ONEBOT_ACCESS_TOKEN: 'secret\r\nInjected: yes' }), /control/);
  assert.throws(() => astrbotPresetSettings({ MODE: 'unexpected' }), /MODE/);
  for (const clients of ['not-an-array', [null], ['invalid'], [123]]) assert.throws(() => applyAstrbotPreset({ network: { websocketClients: clients } }, astrbotPresetSettings({ MODE: 'astrbot' })), /array|object/);
  assert.doesNotThrow(() => applyAstrbotPreset({ network: { websocketClients: [{ enable: false }] } }, astrbotPresetSettings({ MODE: 'astrbot' })));
});
test('global and existing account configurations both retain their own settings and Core account precedence', async () => {
  const root = fixture();
  const global = { rootCustom: 'global', network: { httpServers: [{ port: 3000 }], websocketClients: [] } };
  const account = { rootCustom: 'account-only', network: { httpServers: [{ port: 4300 }], websocketClients: [{ name: 'rws', url: DEFAULT_ONEBOT_WS_URL, token: 'account-token' }], plugins: [{ name: 'custom-plugin' }] } };
  json(path.join(root, 'config/onebot11.json'), global);
  json(path.join(root, 'config/onebot11_123456789.json'), account);
  write(path.join(root, 'config/onebot11_archive.json'), '{archive marker}');
  const report = await initialiseOneBotPreset(onebotOptions(root, { MODE: 'astrbot', ONEBOT_ACCESS_TOKEN: 'shared-protocol-token' }));
  assert.deepEqual(report.changed, ['onebot11.json', 'onebot11_123456789.json']);
  assert.equal(readOnebot(root).rootCustom, 'global');
  const effective = readOnebot(root, 'onebot11_123456789.json');
  assert.equal(effective.rootCustom, 'account-only');
  assert.equal(effective.network.httpServers[0].port, 4300);
  assert.deepEqual(effective.network.plugins, account.network.plugins);
  assert.equal(managedClient(effective).token, 'shared-protocol-token');
  assert.equal(readFileSync(path.join(root, 'config/onebot11_archive.json'), 'utf8'), '{archive marker}');
  assert.deepEqual(JSON5.parse(readFileSync(path.join(root, 'config/onebot11_123456789.json.astrbot.bak'), 'utf8')), account);
});
test('legal JSON5 comments, quotes, commas and nonfinite custom data survive semantically with original bytes backed up', async () => {
  const root = fixture();
  const original = "// operator comment\n{ custom: { infinity: Infinity, notNumber: NaN }, network: { websocketClients: [{ name: 'rws', url: 'ws://astrbot:6199/ws', token: 'retained-token', }], }, }\n";
  write(path.join(root, 'config/onebot11.json'), original);
  await initialiseOneBotPreset(onebotOptions(root));
  const output = readOnebot(root);
  assert.equal(output.custom.infinity, Infinity);
  assert.ok(Number.isNaN(output.custom.notNumber));
  assert.equal(managedClient(output).token, 'retained-token');
  assert.equal(readFileSync(path.join(root, 'config/onebot11.json.astrbot.bak'), 'utf8'), original);
});
test('first-change backups and idempotency survive repeated starts and later token overrides', async () => {
  const root = fixture();
  const original = '{ network: { websocketClients: [] }, custom: 5 }';
  write(path.join(root, 'config/onebot11.json'), original);
  await initialiseOneBotPreset(onebotOptions(root));
  const first = readFileSync(path.join(root, 'config/onebot11.json'));
  const second = await initialiseOneBotPreset(onebotOptions(root));
  assert.deepEqual(second.changed, []);
  assert.deepEqual(readFileSync(path.join(root, 'config/onebot11.json')), first);
  await initialiseOneBotPreset(onebotOptions(root, { MODE: 'astrbot', ONEBOT_ACCESS_TOKEN: 'different-token' }));
  assert.equal(readFileSync(path.join(root, 'config/onebot11.json.astrbot.bak'), 'utf8'), original);
  if (process.platform !== 'win32') assert.equal(lstatSync(path.join(root, 'config/onebot11.json.astrbot.bak')).mode & 0o777, 0o600);
});
test('a damaged account file prevents all planned writes, including a new global default', async () => {
  const root = fixture();
  write(path.join(root, 'config/onebot11_123456789.json'), '{broken');
  await assert.rejects(initialiseOneBotPreset(onebotOptions(root)), /Invalid JSON5/);
  assert.ok(!existsSync(path.join(root, 'config/onebot11.json')));
  assert.ok(!existsSync(path.join(root, 'config/onebot11_123456789.json.astrbot.bak')));
  assert.equal(readFileSync(path.join(root, 'config/onebot11_123456789.json'), 'utf8'), '{broken');
});
test('backup directories and symlinks are rejected without changing the original configuration', async () => {
  for (const symbolic of [false, true]) {
    const root = fixture();
    const file = path.join(root, 'config/onebot11.json');
    const original = '{network:{websocketClients:[]}}';
    write(file, original);
    const target = path.join(root, 'external-backup-directory');
    mkdirSync(target);
    if (symbolic) symlinkSync(target, file + '.astrbot.bak', process.platform === 'win32' ? 'junction' : 'dir');
    else mkdirSync(file + '.astrbot.bak');
    await assert.rejects(initialiseOneBotPreset(onebotOptions(root)), /regular file/);
    assert.equal(readFileSync(file, 'utf8'), original);
  }
});
test('the integrated container initializer applies the preset while retaining the independent WebUI token', async () => {
  const root = fixture();
  const environment = { MODE: 'astrbot', WEBUI_TOKEN: 'independent-webui-token-long', ONEBOT_ACCESS_TOKEN: 'separate-onebot-token' };
  const result = await initialiseConfig({ environment, workDirectory: path.join(root, 'work'), shellDirectory: path.join(root, 'shell'), qqDirectory: path.join(root, 'qq'), json5: JSON5 });
  assert.equal(result.token, environment.WEBUI_TOKEN);
  assert.equal(managedClient(JSON5.parse(readFileSync(path.join(root, 'work/config/onebot11.json'), 'utf8'))).token, environment.ONEBOT_ACCESS_TOKEN);
});
test('runtime JSON5 comes from the installed locked core graph with its original license', () => {
  const destination = fixture();
  const versions = copyRuntimeDependencies(ROOT, destination);
  assert.equal(versions.json5, '2.2.3');
  const parser = loadRuntimeJson5(destination);
  assert.deepEqual(parser.parse("{quoted:'json5', trailing:true,}"), { quoted: 'json5', trailing: true });
  assert.ok(existsSync(path.join(destination, 'node_modules/json5/LICENSE.md')));
});
test('joint release rendering fixes both images while preserving independent variable overrides', () => {
  const template = readFileSync(path.join(ROOT, 'astrbot.yml'), 'utf8');
  const result = renderAstrbotCompose(template, 'ghcr.io/kadidalax/napcatqq-clasic:2.0.0');
  assert.ok(result.includes('${NAPCAT_IMAGE:-ghcr.io/kadidalax/napcatqq-clasic:2.0.0}'));
  assert.ok(result.includes('${ASTRBOT_IMAGE:-' + ASTRBOT_MANIFEST.image + '}'));
  assert.ok(result.includes('${WEBUI_BIND:-}'));
  assert.ok(result.includes('${ASTRBOT_DASHBOARD_BIND:-}'));
  assert.throws(() => renderAstrbotCompose(template, 'ghcr.io/kadidalax/napcatqq-clasic:1.0.0', 'soulter/astrbot:latest'));
  assert.equal(ASTRBOT_MEDIA_PATH, '/AstrBot/data');
  assert.deepEqual(ASTRBOT_MANIFEST.platforms, ['linux/amd64', 'linux/arm64']);
});
test('real Compose parsing proves the base Classic contract is unchanged in the standalone joint file', t => {
  const base = composeConfiguration('compose.yaml');
  const joint = composeConfiguration('astrbot.yml');
  if (!base || !joint) return t.skip('Compose CLI is not installed; native workflow smoke still validates it');
  assert.equal(base.name, 'napcatqq-clasic');
  assert.equal(joint.name, base.name);
  const classic = joint.services.napcat;
  assert.equal(base.services.napcat.container_name, 'napcat');
  assert.equal(joint.services.astrbot.container_name, 'astrbot');
  assert.equal(base.services.napcat.ports[0].host_ip, undefined);
  for (const field of ['image', 'container_name', 'user', 'hostname', 'read_only', 'cap_drop', 'security_opt', 'shm_size', 'tmpfs', 'ports', 'stop_grace_period', 'logging']) assert.deepEqual(classic[field], base.services.napcat[field], field);
  for (const volume of base.services.napcat.volumes) assert.deepEqual(classic.volumes.find(item => item.target === volume.target), volume);
  for (const name of Object.keys(base.volumes)) assert.equal(joint.volumes[name].name, base.volumes[name].name);
  const sharedClassic = classic.volumes.find(item => item.target === ASTRBOT_MEDIA_PATH);
  const sharedAstrbot = joint.services.astrbot.volumes.find(item => item.target === ASTRBOT_MEDIA_PATH);
  assert.equal(sharedClassic.source, sharedAstrbot.source);
  assert.equal(sharedClassic.read_only, true);
  assert.ok(!sharedAstrbot.read_only);
  assert.equal(joint.services.astrbot.image, ASTRBOT_MANIFEST.image);
  assert.ok(!joint.services.astrbot.user, 'Preserve the verified root image user');
  assert.ok(!joint.services.astrbot.read_only, 'System plugin installation remains writable');
  assert.equal(joint.services.astrbot.working_dir, '/AstrBot');
  assert.equal(joint.services.astrbot.environment.DASHBOARD_HOST, '0.0.0.0');
  assert.equal(joint.services.astrbot.environment.DASHBOARD_PORT, '6185');
  assert.equal(joint.services.astrbot.ports[0].host_ip, undefined);
  assert.equal(Number(joint.services.astrbot.ports[0].target), 6185);
  assert.ok(!joint.services.astrbot.ports.some(port => Number(port.target) === 6199));
  assert.equal(classic.environment.ONEBOT_WS_URL, DEFAULT_ONEBOT_WS_URL);
  assert.equal(composeConfiguration('astrbot.yml', { MODE: '' }).services.napcat.environment.MODE, '');
  assert.ok(!('MODE' in base.services.napcat.environment));
  assert.doesNotMatch(readFileSync(path.join(ROOT, 'astrbot.yml'), 'utf8'), /^\s*(extends|include):/m);
});
test('root deployment templates work without an env file or exported overrides', t => {
  const command = process.env.COMPOSE_CLI || 'docker';
  const environment = { ...process.env, COMPOSE_DISABLE_ENV_FILE: '1' };
  for (const key of ['NAPCAT_IMAGE', 'ASTRBOT_IMAGE', 'WEBUI_TOKEN', 'QQ_ACCOUNT', 'MODE', 'ONEBOT_WS_URL', 'ONEBOT_ACCESS_TOKEN', 'WEBUI_BIND', 'WEBUI_PORT', 'ASTRBOT_DASHBOARD_BIND', 'ASTRBOT_DASHBOARD_PORT', 'ASTRBOT_DASHBOARD_INITIAL_PASSWORD', 'COMPOSE_FILE', 'COMPOSE_PROJECT_NAME']) delete environment[key];
  for (const file of ['compose.yaml', 'astrbot.yml']) {
    const args = [...(process.env.COMPOSE_CLI ? [] : ['compose']), '-f', path.join(ROOT, file), 'config', '--format', 'json'];
    const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', env: environment });
    if (result.error && ['ENOENT', 'EPERM'].includes(result.error.code)) return t.skip('Compose CLI is not installed');
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    const configuration = JSON.parse(result.stdout);
    const project = getProject();
    assert.equal(configuration.services.napcat.image, `ghcr.io/kadidalax/${project.slug}:${project.version}`);
    assert.equal(configuration.services.napcat.container_name, 'napcat');
    assert.equal(configuration.services.napcat.ports[0].host_ip, undefined);
    if (file === 'astrbot.yml') {
      assert.equal(configuration.services.napcat.environment.MODE, 'astrbot');
      assert.equal(configuration.services.astrbot.image, ASTRBOT_MANIFEST.image);
      assert.equal(configuration.services.astrbot.container_name, 'astrbot');
      assert.equal(configuration.services.astrbot.ports[0].host_ip, undefined);
    }
  }
});
test('explicit panel bind and port overrides remain independent in both deployment templates', t => {
  const overrides = { WEBUI_BIND: '127.0.0.1', WEBUI_PORT: '16099', ASTRBOT_DASHBOARD_BIND: '192.0.2.10', ASTRBOT_DASHBOARD_PORT: '16185' };
  for (const file of ['compose.yaml', 'astrbot.yml']) {
    const configuration = composeConfiguration(file, overrides);
    if (!configuration) return t.skip('Compose CLI is not installed');
    const classic = configuration.services.napcat.ports[0];
    assert.equal(classic.host_ip, overrides.WEBUI_BIND);
    assert.equal(Number(classic.published), Number(overrides.WEBUI_PORT));
    assert.equal(Number(classic.target), 6099);
    if (file === 'astrbot.yml') {
      const dashboard = configuration.services.astrbot.ports[0];
      assert.equal(dashboard.host_ip, overrides.ASTRBOT_DASHBOARD_BIND);
      assert.equal(Number(dashboard.published), Number(overrides.ASTRBOT_DASHBOARD_PORT));
      assert.equal(Number(dashboard.target), 6185);
      assert.equal(configuration.services.astrbot.environment.DASHBOARD_HOST, '0.0.0.0');
      assert.ok(!configuration.services.astrbot.ports.some(port => Number(port.target) === 6199));
    }
  }
});
test('empty panel bind and port overrides fall back to original Docker deployment defaults', t => {
  const overrides = { WEBUI_BIND: '', WEBUI_PORT: '', ASTRBOT_DASHBOARD_BIND: '', ASTRBOT_DASHBOARD_PORT: '' };
  for (const file of ['compose.yaml', 'astrbot.yml']) {
    const configuration = composeConfiguration(file, overrides);
    if (!configuration) return t.skip('Compose CLI is not installed');
    const classic = configuration.services.napcat.ports[0];
    assert.equal(classic.host_ip, undefined);
    assert.equal(Number(classic.published), 6099);
    assert.equal(Number(classic.target), 6099);
    if (file === 'astrbot.yml') {
      const dashboard = configuration.services.astrbot.ports[0];
      assert.equal(dashboard.host_ip, undefined);
      assert.equal(Number(dashboard.published), 6185);
      assert.equal(Number(dashboard.target), 6185);
    }
  }
});
test('server library chunks retain ESM extensions in commonjs loader distributions', () => {
  for (const target of ['shell', 'framework']) {
    const config = readFileSync(path.join(ROOT, 'packages', `napcat-${target}`, 'vite.config.ts'), 'utf8');
    assert.match(config, /chunkFileNames:\s*['"]\[name\]-\[hash\]\.mjs['"]/);
  }
});
test('actual Vite shared chunks import correctly inside the packaged CommonJS scope', async () => {
  const { build } = await import('vite');
  const root = fixture();
  // Vite's default shared-chunk suffix follows the SOURCE package type.
  json(path.join(root, 'package.json'), { type: 'module' });
  write(path.join(root, 'shared.js'), 'export const C = 20; export function g() { return 22; }');
  write(path.join(root, 'main.js'), 'import { C, g } from "./shared.js"; export const value = C + g();');
  write(path.join(root, 'worker.js'), 'import { C, g } from "./shared.js"; export const value = C + g();');
  const outputPatterns = new Set();
  for (const target of ['shell', 'framework']) {
    const configuration = readFileSync(path.join(ROOT, 'packages', `napcat-${target}`, 'vite.config.ts'), 'utf8');
    outputPatterns.add(configuration.match(/chunkFileNames:\s*['"]([^'"]+)['"]/)?.[1]);
  }
  assert.deepEqual([...outputPatterns], ['[name]-[hash].mjs']);
  async function bundle (directory, fixed) {
    await build({
      configFile: false, root, logLevel: 'silent',
      build: {
        outDir: directory, emptyOutDir: true, minify: false, target: 'esnext',
        lib: { entry: { napcat: path.join(root, 'main.js'), 'worker/conoutSocketWorker': path.join(root, 'worker.js') }, formats: ['es'], fileName: (_, name) => `${name}.mjs` },
        rollupOptions: fixed ? { output: { chunkFileNames: [...outputPatterns][0] } } : {},
      },
    });
    json(path.join(directory, 'package.json'), { type: 'commonjs' });
  }
  const good = path.join(root, 'good');
  await bundle(good, true);
  const modules = verifyServerModules(good);
  const shared = modules.find(file => /^shared-.*\.mjs$/.test(file));
  assert.ok(shared, 'Two actual entry points must emit a shared chunk');
  write(path.join(good, 'loadNapCat.js'), 'module.exports = {};');
  write(path.join(good, 'static/browser.js'), 'export const browser = true;');
  write(path.join(good, 'node_modules/example/index.js'), 'module.exports = {};');
  assert.deepEqual(verifyServerModules(good), modules);
  const probe = 'const modules = await Promise.all(process.argv.slice(1).map(url => import(url))); console.log(JSON.stringify(modules.map(module => module.value)));';
  const urls = ['napcat.mjs', 'worker/conoutSocketWorker.mjs'].map(file => pathToFileURL(path.join(good, file)).href);
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', probe, ...urls], { encoding: 'utf8' });
  assert.equal(imported.status, 0, imported.stderr);
  assert.deepEqual(JSON.parse(imported.stdout), [42, 42]);
  rmSync(path.join(good, shared));
  assert.throws(() => verifyServerModules(good), /Missing server import target/);
  const broken = path.join(root, 'broken');
  await bundle(broken, false);
  assert.throws(() => verifyServerModules(broken), /Generated server JavaScript must use \.mjs/);
});
test('server module validation catches missing workers and malformed emitted syntax', () => {
  const root = fixture();
  json(path.join(root, 'package.json'), { type: 'commonjs' });
  write(path.join(root, 'napcat.mjs'), 'export const value = 42;');
  assert.throws(() => verifyServerModules(root), /Missing server module: worker/);
  write(path.join(root, 'worker/conoutSocketWorker.mjs'), 'export const value = ;');
  assert.throws(() => verifyServerModules(root), /Server module syntax validation failed/);
});
test('release updates prune only obsolete deployment template attachments', () => {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
  assert.match(workflow, /gh release delete-asset "\$RELEASE_TAG" "\$asset" --yes/);
  assert.match(workflow, /compose\.yaml\|astrbot\.yml\|env\.example\|\.env\.example/);
  assert.ok(workflow.indexOf('gh release upload') < workflow.indexOf('gh release delete-asset'), 'Upload replacements before pruning old template assets');
});
test('the exact joint Compose Python wrapper removes only an empty initial password before stock execution', t => {
  const joint = composeConfiguration('astrbot.yml');
  if (!joint) return t.skip('Compose CLI is not installed');
  const python = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');
  const source = Buffer.from(joint.services.astrbot.command[2]).toString('base64');
  const harness = 'import os,sys,json,base64\nfrom unittest.mock import patch\nsource=base64.b64decode(sys.argv[1]).decode()\ndef fake_exec(program,args):\n print(json.dumps({"program":program,"args":args,"password":os.environ.get("ASTRBOT_DASHBOARD_INITIAL_PASSWORD")}))\n raise SystemExit(0)\nwith patch("os.execvp",fake_exec):\n exec(source,{})\n';
  for (const password of ['', 'StrongInitialPassword123']) {
    const result = spawnSync(python, ['-c', harness, source], { encoding: 'utf8', env: { ...process.env, ASTRBOT_DASHBOARD_INITIAL_PASSWORD: password } });
    if (result.error && result.error.code === 'ENOENT') return t.skip('Python is not installed');
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    const captured = JSON.parse(result.stdout);
    assert.deepEqual(captured.args, ['python', 'main.py']);
    assert.equal(captured.program, 'python');
    assert.equal(captured.password, password || null);
  }
});
