// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax. Dedicated CI fixtures, not a real QQ account test.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const JSON5 = createRequire('/app/shell/package.json')('json5');
const configDirectory = '/app/napcat/config';
for (const name of ['onebot11.json', 'onebot11_123456789.json']) {
  const document = JSON5.parse(await readFile(`${configDirectory}/${name}`, 'utf8'));
  const clients = document.network.websocketClients;
  assert.equal(clients.length, 1, 'Legacy rws must not become a duplicate connection');
  assert.equal(clients[0].name, 'astrbot');
  assert.equal(clients[0].enable, true);
  assert.equal(clients[0].url, 'ws://astrbot:6199/ws');
  assert.equal(clients[0].messagePostFormat, 'array');
  assert.equal(clients[0].token, process.env.ONEBOT_ACCESS_TOKEN);
  assert.equal(clients[0].heartInterval, 30000);
  assert.equal(clients[0].reconnectInterval, 5000);
  const backup = JSON5.parse(await readFile(`${configDirectory}/${name}.astrbot.bak`, 'utf8'));
  assert.equal(backup.network.websocketClients[0].name, 'rws', 'First-change backup is retained across restarts');
  if (name === 'onebot11.json') {
    assert.equal(document.operatorGlobal, 'preserved');
    assert.equal(document.network.httpServers[0].name, 'keep-global');
  } else {
    assert.equal(document.operatorAccount, 'preserved');
    assert.equal(document.network.httpClients[0].name, 'keep-account');
  }
}
assert.equal(process.getuid(), 1000);
assert.equal(await readFile('/AstrBot/data/ci-media/published.txt', 'utf8'), 'shared-published-media');
await assert.rejects(readFile('/AstrBot/data/ci-media/private.txt'), error => error.code === 'EACCES');
await assert.rejects(writeFile('/AstrBot/data/ci-media/published.txt', 'changed'), error => ['EROFS', 'EACCES'].includes(error.code));
console.log('Joint preset/global/account/JSON5/backup and UID=1000 shared-media checks PASS; real QQ message delivery remains a separate acceptance test');
