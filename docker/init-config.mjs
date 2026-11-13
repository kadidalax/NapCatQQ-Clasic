// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import { chmod, copyFile, cp, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialiseOneBotPreset } from './onebot-preset.mjs';

async function exists (file) {
  try { await stat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function initialiseConfig ({ environment = process.env, workDirectory = environment.NAPCAT_WORKDIR || '/app/napcat', shellDirectory = '/app/shell', qqDirectory = environment.NAPCAT_QQ_DATA_DIR || '/home/napcat/.config/QQ', json5 } = {}) {
  for (const name of ['config', 'logs', 'plugins', 'cache']) await mkdir(path.join(workDirectory, name), { recursive: true });
  await mkdir(qqDirectory, { recursive: true });
  const file = path.join(workDirectory, 'config', 'webui.json');
  const current = (await exists(file)) ? JSON.parse(await readFile(file, 'utf8')) : {};
  if (typeof current !== 'object' || current === null || Array.isArray(current)) throw new Error('Persisted webui.json must be a JSON object');
  const overrideToken = environment.WEBUI_TOKEN || environment.NAPCAT_WEBUI_SECRET_KEY || '';
  if (overrideToken && overrideToken.length < 16) throw new Error('WEBUI_TOKEN must contain at least 16 characters, or remain empty for random generation');
  const validExisting = typeof current.token === 'string' && current.token.length > 0 && !['napcat', 'napcatqq'].includes(current.token);
  const token = overrideToken || (validExisting ? current.token : randomBytes(24).toString('hex'));
  const account = environment.NAPCAT_QUICK_ACCOUNT || '';
  if (account && !/^[1-9][0-9]{4,19}$/.test(account)) throw new Error('QQ_ACCOUNT must be a numeric QQ account');
  // Bind inside the container on IPv4. Compose publishes it on localhost only.
  const config = { ...current, host: '0.0.0.0', port: 6099, token, disableWebUI: false, ...(account ? { autoLoginAccount: account } : {}) };
  await initialiseOneBotPreset({ environment, configDirectory: path.join(workDirectory, 'config'), shellDirectory, json5 });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, file);
  await chmod(file, 0o600);
  const defaultConfig = path.join(shellDirectory, 'config', 'napcat.json');
  if (!(await exists(path.join(workDirectory, 'config', 'napcat.json'))) && await exists(defaultConfig)) {
    await copyFile(defaultConfig, path.join(workDirectory, 'config', 'napcat.json'));
  }
  const builtin = path.join('plugins', 'napcat-plugin-builtin');
  if (!(await exists(path.join(workDirectory, builtin))) && await exists(path.join(shellDirectory, builtin))) {
    await cp(path.join(shellDirectory, builtin), path.join(workDirectory, builtin), { recursive: true });
  }
  console.log('NapCatQQ-clasic configuration ready; WebUI token persisted in config/webui.json');
  return config;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { await initialiseConfig(); } catch (error) { console.error(error); process.exitCode = 1; }
}
