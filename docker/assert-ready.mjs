// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const response = await fetch('http://127.0.0.1:6099/webui/', { signal: AbortSignal.timeout(10000) });
assert.equal(response.status, 200, 'WebUI should serve its built frontend');
assert.match(await response.text(), /<html[\s>]/i);
const config = JSON.parse(await readFile('/app/napcat/config/webui.json', 'utf8'));
assert.equal(config.host, '0.0.0.0');
assert.equal(config.port, 6099);
assert.equal(config.disableWebUI, false);
assert.equal(config.token, process.env.WEBUI_TOKEN, 'Runtime must use the configured token');
assert.ok(config.token.length >= 16);
assert.equal(process.getuid(), 1000, 'The process should run without root');
for (const directory of ['/app/napcat/config', '/app/napcat/logs', '/app/napcat/plugins', '/app/napcat/cache', '/home/napcat/.config/QQ']) assert.ok((await stat(directory)).isDirectory());
assert.equal((await stat('/app/napcat/config/webui.json')).mode & 0o777, 0o600);
console.log('WebUI/native startup, token configuration, persistent paths and UID=1000 PASS');
