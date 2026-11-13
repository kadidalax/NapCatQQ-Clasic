// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RESOURCE_DIRECTORIES = new Set(['config', 'licenses', 'native', 'node_modules', 'packages', 'plugins', 'static']);

// The QQ loaders require a CommonJS package scope. Generated server entries and
// shared chunks must therefore retain .mjs, independently of browser/dependency JS.
export function verifyServerModules (directory) {
  const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
  if (manifest.type !== 'commonjs') throw new Error('Runtime package must preserve the CommonJS loader scope');
  const modules = [];
  function walk (current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (current === directory && RESOURCE_DIRECTORIES.has(entry.name)) continue;
      const file = path.join(current, entry.name);
      const relative = path.relative(directory, file).split(path.sep).join('/');
      if (entry.isSymbolicLink()) throw new Error(`Server module path must not be a symlink: ${relative}`);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        if (entry.name.endsWith('.js') && relative !== 'loadNapCat.js') {
          throw new Error(`Generated server JavaScript must use .mjs, not .js: ${relative}`);
        }
        if (/\.(?:mjs|cjs)$/.test(entry.name)) modules.push(relative);
      }
    }
  }
  walk(directory);
  for (const required of ['napcat.mjs', 'worker/conoutSocketWorker.mjs']) {
    if (!modules.includes(required)) throw new Error(`Missing server module: ${required}`);
  }
  const esmFiles = modules.filter(file => file.endsWith('.mjs')).map(file => path.join(directory, file));
  // Parse, never execute, the actual emitted modules. The native parser avoids
  // mistaking source-code strings or comments for import declarations.
  const parser = 'import {readFileSync} from "node:fs"; import {SourceTextModule} from "node:vm"; console.log(JSON.stringify(process.argv.slice(1).map(file => ({file, imports: new SourceTextModule(readFileSync(file, "utf8")).dependencySpecifiers}))));';
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', parser, ...esmFiles], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Server module syntax validation failed:\n${result.stderr}`);
  for (const module of JSON.parse(result.stdout)) {
    for (const specifier of module.imports) {
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;
      const target = fileURLToPath(new URL(specifier, pathToFileURL(module.file)));
      const relative = path.relative(path.resolve(directory), target);
      if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        throw new Error(`Server import escapes its distribution: ${specifier}`);
      }
      if (!existsSync(target) || !statSync(target).isFile()) {
        throw new Error(`Missing server import target: ${specifier} (from ${path.relative(directory, module.file)})`);
      }
    }
  }
  return modules.sort();
}
