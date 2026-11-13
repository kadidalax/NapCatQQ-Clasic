// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import { constants } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';

export const ASTRBOT_CONNECTION_NAME = 'astrbot';
export const DEFAULT_ONEBOT_WS_URL = 'ws://astrbot:6199/ws';
export const ASTRBOT_MEDIA_PATH = '/AstrBot/data';

export function loadRuntimeJson5 (shellDirectory) {
  const require = createRequire(path.join(shellDirectory, 'package.json'));
  const manifest = require('json5/package.json');
  if (manifest.version !== '2.2.3') throw new Error('Deployment initialization requires the locked json5@2.2.3 runtime package');
  return require('json5');
}

function isObject (value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hasNonFiniteNumber (value) {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (value !== null && typeof value === 'object') return Object.values(value).some(hasNonFiniteNumber);
  return false;
}

export function astrbotPresetSettings (environment) {
  const mode = String(environment.MODE ?? '').trim().toLowerCase();
  if (!mode) return null;
  if (mode !== 'astrbot') throw new Error('MODE must be empty or astrbot');
  const url = environment.ONEBOT_WS_URL || DEFAULT_ONEBOT_WS_URL;
  if (typeof url !== 'string' || /[\u0000-\u001f\u007f]/.test(url)) throw new Error('ONEBOT_WS_URL must be a string without control characters');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('ONEBOT_WS_URL must be a valid WebSocket URL'); }
  if (!['ws:', 'wss:'].includes(parsed.protocol)) throw new Error('ONEBOT_WS_URL must use ws:// or wss://');
  if (parsed.username || parsed.password || url.includes('#')) throw new Error('ONEBOT_WS_URL must not contain userinfo or a fragment; use ONEBOT_ACCESS_TOKEN for authentication');
  if (environment.ONEBOT_ACCESS_TOKEN !== undefined && typeof environment.ONEBOT_ACCESS_TOKEN !== 'string') throw new Error('ONEBOT_ACCESS_TOKEN must be a string');
  if (/[\u0000-\u001f\u007f]/.test(environment.ONEBOT_ACCESS_TOKEN || '')) throw new Error('ONEBOT_ACCESS_TOKEN must not contain control characters');
  return { url: parsed.href, token: environment.ONEBOT_ACCESS_TOKEN };
}

export function applyAstrbotPreset (document, settings) {
  if (!isObject(document)) throw new Error('OneBot configuration must be an object');
  const network = document.network === undefined ? {} : document.network;
  if (!isObject(network)) throw new Error('OneBot network configuration must be an object');
  // Core stores all adapter kinds in the same name-keyed Map. A reverse WS
  // must never replace an already enabled HTTP/SSE/server/plugin adapter.
  for (const kind of ['httpServers', 'httpSseServers', 'httpClients', 'websocketServers', 'plugins']) {
    if (network[kind] !== undefined && !Array.isArray(network[kind])) throw new Error(`OneBot network.${kind} must be an array`);
    if ((network[kind] || []).some(adapter => isObject(adapter) && adapter.name === ASTRBOT_CONNECTION_NAME && (adapter.enable === true || adapter.enable === 1 || (typeof adapter.enable === 'string' && ['true', '1'].includes(adapter.enable.trim().toLowerCase()))))) {
      throw new Error(`OneBot astrbot name conflicts with an enabled ${kind} adapter; configuration was left intact`);
    }
  }
  const clients = network.websocketClients === undefined ? [] : network.websocketClients;
  if (!Array.isArray(clients)) throw new Error('OneBot network.websocketClients must be an array');
  if (clients.some(client => !isObject(client))) throw new Error('Every OneBot websocketClients entry must be an object');
  const managed = clients.filter(client => isObject(client) && client.name === ASTRBOT_CONNECTION_NAME);
  const sameTarget = clients.filter(client => {
    if (!isObject(client) || typeof client.url !== 'string') return false;
    try { return new URL(client.url).href === new URL(settings.url).href; } catch { return false; }
  });
  if (managed.length > 1 || sameTarget.length > 1) throw new Error('Duplicate OneBot astrbot name or target URL; resolve duplicate entries before initializing the preset');
  if (managed.length && sameTarget.length && managed[0] !== sameTarget[0]) throw new Error('OneBot astrbot entry conflicts with another entry targeting the same URL; configuration was left intact');
  // Adopt a legacy rws (or other name) using this endpoint, rather than sending
  // every message twice through a newly appended connection.
  const previous = managed[0] ?? sameTarget[0] ?? {};
  const adopted = managed.length > 0 || sameTarget.length > 0;
  const token = settings.token ? settings.token : (previous.token ?? '');
  if (typeof token !== 'string' || /[\u0000-\u001f\u007f]/.test(token)) throw new Error('Managed OneBot token must be a string without control characters');
  const desired = {
    reportSelfMessage: false,
    reconnectInterval: 5000,
    debug: false,
    heartInterval: 30000,
    ...previous,
    name: ASTRBOT_CONNECTION_NAME,
    enable: true,
    url: settings.url,
    messagePostFormat: 'array',
    token,
  };
  const updatedClients = adopted
    ? clients.map(client => client === previous ? desired : client)
    : [...clients, desired];
  return { ...document, network: { ...network, websocketClients: updatedClients } };
}

// Core ConfigBase prefers onebot11_<uin>.json. Update its managed entry too,
// instead of assuming a global preset overrides an existing account file.
export async function initialiseOneBotPreset ({ environment = process.env, configDirectory, shellDirectory = '/app/shell', json5 } = {}) {
  const settings = astrbotPresetSettings(environment);
  if (!settings) return { mode: '', changed: [], backups: [] };
  if (!configDirectory) throw new Error('configDirectory is required');
  const parser = json5 || loadRuntimeJson5(shellDirectory);
  if (typeof parser.parse !== 'function' || typeof parser.stringify !== 'function') throw new Error('A real JSON5 parser and serializer are required');
  await mkdir(configDirectory, { recursive: true });
  const entries = await readdir(configDirectory, { withFileTypes: true });
  const accounts = entries.filter(entry => /^onebot11_[0-9]+\.json$/.test(entry.name)).map(entry => entry.name).sort();
  const files = ['onebot11.json', ...accounts];
  const planned = [];
  // Parse and validate every target before changing any target or backup.
  for (const name of files) {
    const file = path.join(configDirectory, name);
    let original;
    let mode = 0o600;
    try {
      const information = await lstat(file);
      if (!information.isFile() || information.isSymbolicLink()) throw new Error(`OneBot configuration must be a regular file: ${name}`);
      original = await readFile(file);
      mode = information.mode & 0o777;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    let document;
    try { document = original ? parser.parse(original.toString('utf8')) : {}; } catch (error) {
      throw new Error(`Invalid JSON5 in ${name}; existing configuration was left intact: ${error.message}`, { cause: error });
    }
    const updated = applyAstrbotPreset(document, settings);
    if (original && isDeepStrictEqual(document, updated)) continue;
    // Keep JSON5-only numeric values in unrelated custom fields. Ordinary
    // documents remain strict JSON, even if their input used JSON5 comments.
    const serialized = (hasNonFiniteNumber(updated) ? parser.stringify(updated, null, 2) : JSON.stringify(updated, null, 2)) + '\n';
    planned.push({ file, name, original, mode, serialized, temporary: path.join(configDirectory, `.${name}.astrbot-${randomUUID()}.tmp`) });
  }
  // A directory/symlink can yield EPERM rather than EEXIST on Windows. Check
  // existing backups up front and never attempt to replace a valid old backup.
  for (const item of planned) {
    if (!item.original) continue;
    item.backup = item.file + '.astrbot.bak';
    try {
      const information = await lstat(item.backup);
      if (!information.isFile() || information.isSymbolicLink()) throw new Error(`Existing backup must be a regular file: ${path.basename(item.backup)}`);
      item.backupExists = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const backups = [];
  try {
    for (const item of planned) {
      if (item.original && !item.backupExists) {
        const backup = item.backup;
        try {
          await copyFile(item.file, backup, constants.COPYFILE_EXCL);
          await chmod(backup, 0o600);
          backups.push(path.basename(backup));
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          const information = await lstat(backup);
          if (!information.isFile() || information.isSymbolicLink()) throw new Error(`Existing backup must be a regular file: ${path.basename(backup)}`);
        }
      }
      await writeFile(item.temporary, item.serialized, { mode: item.mode, flag: 'wx' });
      await chmod(item.temporary, item.mode);
    }
    for (const item of planned) await rename(item.temporary, item.file);
  } finally {
    for (const item of planned) await rm(item.temporary, { force: true });
  }
  console.log(`NapCatQQ-clasic MODE=astrbot: managed one reverse-WS entry in ${planned.length} config file(s); first-change backups retained`);
  return { mode: 'astrbot', changed: planned.map(item => item.name), backups };
}
