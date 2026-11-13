// License: see repository LICENSE and original component licenses.
// Maintainer: kadidalax.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bytes = file => readFile(path.join(root, file));
const text = async file => (await bytes(file)).toString('utf8');
const json = async file => JSON.parse(await text(file));
const project = await json('project.json');
const pkg = await json('package.json');
assert.equal(project.name, 'NapCatQQ-clasic');
assert.equal(project.slug, 'napcatqq-clasic');
assert.equal(project.frozen, true, 'Core updates must remain disabled');
assert.match(project.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
assert.equal(pkg.name, project.slug);
assert.equal(pkg.version, project.version);
assert.equal(pkg.author, project.maintainer);
assert.equal(pkg.packageManager, 'pnpm@9.15.9');
assert.equal(pkg.license, 'SEE LICENSE IN LICENSE');
assert.ok(project.repository === 'kadidalax/NapCatQQ-Clasic');
const testPackage = await json('packages/napcat-test/package.json');
assert.match(testPackage.scripts.test, /\bvitest run\b/, 'Tests must terminate rather than enter watch mode');
assert.ok(!(await text('.gitignore')).split(/\r?\n/).includes('pnpm-lock.yaml'), 'The lockfile must be tracked');

const required = [
  'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'SECURITY.md',
  'pnpm-lock.yaml', 'Dockerfile', '.dockerignore', 'compose.yaml', 'compose/astrbot.yml', '.env.example',
  '.github/workflows/ci.yml', '.github/workflows/release.yml',
  'scripts/build-artifacts.mjs', 'scripts/package-release.mjs',
  'licenses/qrcode-terminal.LICENSE', 'licenses/qrcode-generator.LICENSE', 'licenses/node-pty.LICENSE',
];
await Promise.all(required.map(file => access(path.join(root, file))));
const originalLicenses = {
  LICENSE: '2bbc0dba0c62fcde4adfe38ebadad0b7d4e23b06b88d9551904bbe07769dc46f',
  'packages/napcat-webui-frontend/LICENSE': '4bf3b6adccbce88ab8dd3b476e4a9055593082be1a040cf5f6a9e70e262cb11c',
  'packages/napcat-dpapi/LICENSE': '5c13695a0cc9263a72b497ce678054495e9e07485111e6f7cc973c2926c87839',
};
for (const [file, expected] of Object.entries(originalLicenses)) {
  assert.equal(createHash('sha256').update(await bytes(file)).digest('hex'), expected, `Original license changed: ${file}`);
}
await assert.rejects(access(path.join(root, 'LICENSE-MIT')), { code: 'ENOENT' });
const logos = ['logo.svg', 'packages/napcat-webui-frontend/public/favicon.svg', 'packages/napcat-webui-frontend/src/assets/images/logo.svg'];
const logo = await bytes(logos[0]);
for (const file of logos.slice(1)) assert.deepEqual(await bytes(file), logo, 'Brand assets must use the same original SVG');

const workflows = (await readdir(path.join(root, '.github/workflows'))).filter(name => /\.ya?ml$/.test(name));
assert.deepEqual(workflows.sort(), ['ci.yml', 'release.yml']);
for (const name of workflows) {
  const content = await text(`.github/workflows/${name}`);
  assert.doesNotMatch(content, /NapNeko|NAPCAT_BUILD|APIFOX_TOKEN|write-all|pull_request_target|repository_dispatch|workflow_run/);
  assert.doesNotMatch(content, /^\s*schedule\s*:/m, 'The frozen fork must not schedule upstream synchronization');
  assert.match(content, /--frozen-lockfile/);
}

for (const file of ['README.md', 'THIRD_PARTY_NOTICES.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', 'packages/napcat-webui-frontend/README.md']) {
  const content = await text(file);
  assert.doesNotMatch(content, /LICENSE-MIT|\bYG\b|qm\.qq\.com|t\.me\/napcatqq|napneko\.icu|napcat\.top/);
}
const readme = await text('README.md');
assert.match(readme, /^# NapCatQQ-clasic\b/m);
for (const item of ['compose/astrbot.yml', 'MODE', 'ONEBOT', 'Docker', '迁移', '验收']) {
  assert.ok(readme.includes(item), `README is missing deployment contract: ${item}`);
}
console.log(`Project checks passed: ${project.name} ${project.version}; original licenses preserved; updates disabled; standalone and AstrBot deployment contracts present.`);
