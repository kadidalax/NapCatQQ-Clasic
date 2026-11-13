// const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function initializeNapCat (session, loginService, registerCallback) {
  // const logFile = path.join(currentPath, 'napcat.log');

  console.log('[NapCatQQ-clasic] [Info] 开始初始化 NapCatQQ-clasic');

  // fs.writeFileSync(logFile, '', { flag: 'w' });

  // fs.writeFileSync(logFile, '[NapCatQQ-clasic] [Info] NapCatQQ-clasic 初始化成功\n', { flag: 'a' });

  try {
    const currentPath = path.dirname(__filename);
    const { NCoreInitFramework } = await import(pathToFileURL(path.join(currentPath, './napcat.mjs')).href);
    await NCoreInitFramework(session, loginService, (callback) => { registerCallback(callback); });
  } catch (error) {
    console.log('[NapCatQQ-clasic] [Error] 初始化 NapCatQQ-clasic', error);
    // fs.writeFileSync(logFile, `[NapCatQQ-clasic] [Error] 初始化 NapCatQQ-clasic失败: ${error.message}\n`, { flag: 'a' });
  }
}

module.exports = {
  initializeNapCat,
};
