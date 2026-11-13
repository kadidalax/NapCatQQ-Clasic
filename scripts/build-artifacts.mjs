// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import { cpSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyServerModules } from '../docker/verify-server-modules.mjs';

export const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const RUNTIME_DEPENDENCIES = [
  { name: 'express', directory: '.' },
  { name: 'ws', directory: '.' },
  { name: 'json5', directory: 'packages/napcat-core', version: '2.2.3' },
];
export const LICENSE_FILES = ['LICENSE', 'THIRD_PARTY_NOTICES.md'];

export function normalizeVersion (input, { release = false } = {}) {
  const value = String(input ?? '').trim().replace(/^v/, '');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(value);
  if (!match || (release && (match[4] || match[5]))) throw new Error('Version must be X.Y.Z' + (release ? '' : '[-prerelease][+build]'));
  for (const identifier of match[4]?.split('.') ?? []) {
    if (!identifier || /^0\d+$/.test(identifier)) throw new Error('Invalid prerelease identifier');
  }
  if (match[5]?.split('.').some(identifier => !identifier)) throw new Error('Invalid build identifier');
  return value;
}

export function normalizeRepository (input, { required = false } = {}) {
  const repository = String(input ?? '').trim();
  if (!repository && !required) return '';
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('Repository must be a GitHub owner/repository pair');
  }
  return repository;
}

export function getProject (root = ROOT) {
  const project = JSON.parse(readFileSync(path.join(root, 'project.json'), 'utf8'));
  if (project.name !== 'NapCatQQ-clasic' || project.slug !== 'napcatqq-clasic' || project.frozen !== true) {
    throw new Error('project.json must describe the frozen NapCatQQ-clasic project');
  }
  return { ...project, version: normalizeVersion(project.version), repository: normalizeRepository(process.env.NAPCAT_REPOSITORY || process.env.GITHUB_REPOSITORY || project.repository) };
}

export function parseArguments (args, defaults = {}) {
  const options = { ...defaults };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--') continue;
    const key = args[index];
    if (!['--target', '--version', '--repository', '--dist', '--out'].includes(key) || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error(`Unexpected argument: ${key}`);
    }
    options[key.slice(2)] = args[++index];
  }
  return options;
}

export function assertGeneratedDirectory (root, output, allowedRoots) {
  const target = path.resolve(output);
  const relative = path.relative(path.resolve(root), target);
  const parts = relative.split(path.sep);
  if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !allowedRoots.includes(parts[0])) {
    throw new Error(`Output must be inside these generated directories: ${allowedRoots.join(', ')}`);
  }
  let current = path.resolve(root);
  for (const part of parts) {
    current = path.join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Generated output paths must not traverse symlinks');
  }
  return target;
}

function runPnpm (args, env) {
  const pnpmScript = process.env.PNPM_SCRIPT || (process.env.npm_execpath && /pnpm\.(?:mjs|cjs|js)$/i.test(process.env.npm_execpath) ? process.env.npm_execpath : '');
  const command = pnpmScript ? process.execPath : (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
  const commandArgs = pnpmScript ? [pnpmScript, ...args] : args;
  const result = spawnSync(command, commandArgs, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pnpm ${args.join(' ')} exited with ${result.status ?? result.signal}`);
}

function requireFile (file) {
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`Required artifact is missing: ${path.relative(ROOT, file)}`);
}

function findInstalledPackage (name, fromDirectory) {
  let directory = fromDirectory;
  while (true) {
    const candidate = path.join(directory, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) return realpathSync(path.dirname(candidate));
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`Locked runtime dependency is missing: ${name} (from ${fromDirectory})`);
}

// Copy the exact installed pnpm dependency graph, not a fresh npm resolution.
// Ordinary directories (no pnpm symlinks) keep the ZIP usable on Windows too.
export function copyRuntimeDependencies (root, destination) {
  const modulesDirectory = path.join(destination, 'node_modules');
  mkdirSync(modulesDirectory, { recursive: true });
  const hoisted = new Map();
  const installedDestinations = new Set();
  const versions = {};
  function install (name, source, declaringDestination = destination) {
    const manifest = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
    const existing = hoisted.get(name);
    if (existing?.version === manifest.version) return;
    const target = existing ? path.join(declaringDestination, 'node_modules', name) : path.join(modulesDirectory, name);
    if (installedDestinations.has(target)) return;
    installedDestinations.add(target);
    if (!existing) hoisted.set(name, { version: manifest.version, target });
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target, {
      recursive: true,
      dereference: true,
      filter: entry => entry === source || !path.relative(source, entry).split(path.sep).some(part => part === 'node_modules' || part === '.git'),
    });
    const optional = manifest.optionalDependencies ?? {};
    for (const dependency of Object.keys({ ...manifest.dependencies, ...optional }).sort()) {
      let dependencySource;
      try { dependencySource = findInstalledPackage(dependency, source); } catch (error) {
        if (Object.hasOwn(optional, dependency)) continue;
        throw error;
      }
      install(dependency, dependencySource, target);
    }
  }
  for (const dependency of RUNTIME_DEPENDENCIES) {
    const source = findInstalledPackage(dependency.name, path.join(root, dependency.directory));
    const version = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8')).version;
    if (dependency.version && version !== dependency.version) throw new Error(`Locked ${dependency.name} runtime version must be ${dependency.version}`);
    versions[dependency.name] = version;
    install(dependency.name, source);
  }
  return versions;
}

export function copyLicenses (root, destination) {
  for (const name of LICENSE_FILES) {
    requireFile(path.join(root, name));
    copyFileSync(path.join(root, name), path.join(destination, name));
  }
  requireFile(path.join(root, 'licenses', 'qrcode-terminal.LICENSE'));
  requireFile(path.join(root, 'licenses', 'qrcode-generator.LICENSE'));
  requireFile(path.join(root, 'licenses', 'node-pty.LICENSE'));
  cpSync(path.join(root, 'licenses'), path.join(destination, 'licenses'), { recursive: true, dereference: true });
  requireFile(path.join(root, 'pnpm-lock.yaml'));
  copyFileSync(path.join(root, 'pnpm-lock.yaml'), path.join(destination, 'pnpm-lock.yaml'));
  function walk (directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(entry.name)) {
        const target = path.join(destination, path.relative(root, file));
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(file, target);
      }
    }
  }
  walk(path.join(root, 'packages'));
}

export function assembleArtifact (target, project, version, destination) {
  const source = path.join(ROOT, 'packages', `napcat-${target}`, 'dist');
  const required = target === 'shell'
    ? ['napcat.mjs', 'loadNapCat.js', 'NapCatWinBootHook.dll', 'NapCatWinBootMain.exe', 'qqnt.json']
    : ['napcat.mjs', 'napcat.cjs', 'nativeLoader.cjs', 'napiloader.dll'];
  for (const relative of [...required, 'static/index.html', 'config/napcat.json', 'native/packet/MoeHoo.linux.x64.node', 'native/napi2native/napi2native.linux.x64.node']) requireFile(path.join(source, relative));
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true, dereference: true });
  // The source Vite configurations copy the root manifest. Keep only runtime
  // metadata here; a release never resolves or installs build dependencies.
  rmSync(path.join(destination, 'node_modules'), { recursive: true, force: true });
  const dependencies = copyRuntimeDependencies(ROOT, destination);
  const manifest = {
    name: `${project.slug}-${target}`,
    version,
    private: true,
    type: 'commonjs',
    main: 'napcat.mjs',
    description: `${project.name} ${target === 'shell' ? 'Shell' : 'Framework'} (frozen standalone distribution)`,
    author: project.maintainer,
    license: 'SEE LICENSE IN LICENSE',
    ...(project.repository ? { repository: { type: 'git', url: `https://github.com/${project.repository}.git` } } : {}),
    engines: { node: '>=22 <25' },
    dependencies,
    napcatqqClasic: { name: project.name, frozen: true, maintainer: project.maintainer },
  };
  writeFileSync(path.join(destination, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  const pluginDirectory = path.join(destination, 'plugins', 'napcat-plugin-builtin');
  mkdirSync(pluginDirectory, { recursive: true });
  requireFile(path.join(ROOT, 'packages', 'napcat-plugin-builtin', 'dist', 'index.mjs'));
  cpSync(path.join(ROOT, 'packages', 'napcat-plugin-builtin', 'dist'), pluginDirectory, { recursive: true, dereference: true });
  const plugin = JSON.parse(readFileSync(path.join(ROOT, 'packages', 'napcat-plugin-builtin', 'package.json'), 'utf8'));
  for (const key of ['dependencies', 'devDependencies', 'scripts']) delete plugin[key];
  plugin.license = 'SEE LICENSE IN ../../LICENSE';
  writeFileSync(path.join(pluginDirectory, 'package.json'), JSON.stringify(plugin, null, 2) + '\n');
  copyLicenses(ROOT, destination);
  if (existsSync(path.join(ROOT, 'README.md'))) copyFileSync(path.join(ROOT, 'README.md'), path.join(destination, 'README.md'));
  requireFile(path.join(ROOT, 'logo.svg'));
  copyFileSync(path.join(ROOT, 'logo.svg'), path.join(destination, 'logo.svg'));
  writeFileSync(path.join(destination, 'project.json'), JSON.stringify({ ...project, version }, null, 2) + '\n');
  const modules = verifyServerModules(destination);
  console.log(`${target} server module graph PASS: ${modules.length} ESM/CJS files`);
  return destination;
}

export function buildArtifacts (args = process.argv.slice(2)) {
  const project = getProject();
  const options = parseArguments(args, { target: 'all', version: process.env.NAPCAT_VERSION || project.version, dist: path.join(ROOT, 'dist') });
  if (!['all', 'shell', 'framework'].includes(options.target)) throw new Error('Target must be all, shell or framework');
  if (options.out !== undefined) throw new Error('Use --dist for build artifacts; --out belongs to package-release');
  const version = normalizeVersion(options.version);
  project.repository = normalizeRepository(options.repository ?? project.repository);
  const dist = assertGeneratedDirectory(ROOT, options.dist, ['dist', 'out']);
  const environment = { NAPCAT_VERSION: version, NAPCAT_REPOSITORY: project.repository, CI: 'true' };
  mkdirSync(dist, { recursive: true });
  runPnpm(['run', 'build:webui'], environment);
  runPnpm(['run', 'build:plugin-builtin'], environment);
  const targets = options.target === 'all' ? ['shell', 'framework'] : [options.target];
  for (const target of targets) {
    runPnpm(['run', `build:${target}`], environment);
    assembleArtifact(target, project, version, path.join(dist, target));
  }
  if (options.target === 'all') {
    runPnpm(['run', 'build:openapi'], environment);
    const openapiPath = path.join(ROOT, 'packages', 'napcat-schema', 'dist', 'openapi.json');
    requireFile(openapiPath);
    const openapi = JSON.parse(readFileSync(openapiPath, 'utf8'));
    if (!/^3\./.test(openapi.openapi) || !Object.keys(openapi.paths ?? {}).length) throw new Error('OpenAPI document has no operations');
    writeFileSync(path.join(dist, 'openapi.json'), JSON.stringify(openapi, null, 2) + '\n');
  }
  writeFileSync(path.join(dist, 'build-info.json'), JSON.stringify({
    name: project.name, version, repository: project.repository, revision: process.env.NAPCAT_REVISION || process.env.GITHUB_SHA || '', frozen: true, targets,
  }, null, 2) + '\n');
  console.log(`${project.name} ${version}: ${targets.join(', ')} artifacts ready in ${path.relative(ROOT, dist)}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { buildArtifacts(); } catch (error) { console.error(error); process.exitCode = 1; }
}
