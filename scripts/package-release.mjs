// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import { closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertGeneratedDirectory, getProject, LICENSE_FILES, normalizeRepository, normalizeVersion, parseArguments, ROOT } from './build-artifacts.mjs';
import { verifyServerModules } from '../docker/verify-server-modules.mjs';

export const ASTRBOT_MANIFEST = JSON.parse(readFileSync(new URL('../docker/astrbot-manifest.json', import.meta.url), 'utf8'));

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});
export function crc32 (buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// A dependency-free deterministic ZIP writer. Both generated distributions are
// below ZIP32 limits; fail explicitly rather than silently producing broken ZIPs.
export function createZip (directory, output) {
  const entries = [];
  function walk (current) {
    for (const name of readdirSync(current).sort()) {
      const file = path.join(current, name);
      const info = lstatSync(file);
      if (info.isSymbolicLink()) throw new Error(`ZIP input contains a symlink: ${file}`);
      if (info.isDirectory()) walk(file);
      else if (info.isFile()) entries.push({ file, name: path.relative(directory, file).split(path.sep).join('/'), mode: info.mode });
    }
  }
  walk(directory);
  if (entries.length > 65535) throw new Error('ZIP32 entry limit exceeded');
  mkdirSync(path.dirname(output), { recursive: true });
  const descriptor = openSync(output, 'w');
  const central = [];
  let offset = 0;
  // Fixed 1980-01-01 timestamps make identical inputs reproducible.
  const dosDate = 33;
  try {
    for (const entry of entries) {
      const name = Buffer.from(entry.name, 'utf8');
      const contents = readFileSync(entry.file);
      const compressed = deflateRawSync(contents, { level: 9 });
      if (contents.length > 0xffffffff || compressed.length > 0xffffffff || name.length > 65535) throw new Error('ZIP32 file limit exceeded');
      const crc = crc32(contents);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6);
      local.writeUInt16LE(8, 8);
      local.writeUInt16LE(dosDate, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(contents.length, 22);
      local.writeUInt16LE(name.length, 26);
      for (const buffer of [local, name, compressed]) writeSync(descriptor, buffer);
      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50, 0);
      record.writeUInt16LE(0x0314, 4);
      record.writeUInt16LE(20, 6);
      record.writeUInt16LE(0x0800, 8);
      record.writeUInt16LE(8, 10);
      record.writeUInt16LE(dosDate, 14);
      record.writeUInt32LE(crc, 16);
      record.writeUInt32LE(compressed.length, 20);
      record.writeUInt32LE(contents.length, 24);
      record.writeUInt16LE(name.length, 28);
      const executable = Boolean(entry.mode & 0o111) || /\.(?:exe|sh)$/.test(entry.name);
      record.writeUInt32LE(((executable ? 0o100755 : 0o100644) << 16) >>> 0, 38);
      record.writeUInt32LE(offset, 42);
      central.push(record, name);
      offset += local.length + name.length + compressed.length;
      if (offset > 0xffffffff) throw new Error('ZIP32 archive limit exceeded');
    }
    const centralOffset = offset;
    for (const buffer of central) { writeSync(descriptor, buffer); offset += buffer.length; }
    if (offset > 0xffffffff) throw new Error('ZIP32 archive limit exceeded');
    const footer = Buffer.alloc(22);
    footer.writeUInt32LE(0x06054b50, 0);
    footer.writeUInt16LE(entries.length, 8);
    footer.writeUInt16LE(entries.length, 10);
    footer.writeUInt32LE(offset - centralOffset, 12);
    footer.writeUInt32LE(centralOffset, 16);
    writeSync(descriptor, footer);
  } finally { closeSync(descriptor); }
  return entries.length;
}

export function renderCompose (template, image) {
  if (!/^ghcr\.io\/[a-z0-9-]+\/napcatqq-clasic:[0-9]+\.[0-9]+\.[0-9]+$/.test(image)) throw new Error('Invalid release image');
  if (!/^    image:.*\$\{NAPCAT_IMAGE/m.test(template)) throw new Error('Compose template is missing NAPCAT_IMAGE');
  return template.replace(/^    image:.*\$\{NAPCAT_IMAGE.*$/m, '    image: "${NAPCAT_IMAGE:-' + image + '}"');
}

export function renderAstrbotCompose (template, image, astrbotImage = ASTRBOT_MANIFEST.image) {
  if (!/^soulter\/astrbot:v[0-9]+\.[0-9]+\.[0-9]+@sha256:[a-f0-9]{64}$/.test(astrbotImage)) throw new Error('AstrBot release image must be a version plus its pinned digest');
  const rendered = renderCompose(template, image);
  if (!/^    image:.*\$\{ASTRBOT_IMAGE/m.test(rendered)) throw new Error('Joint Compose template is missing ASTRBOT_IMAGE');
  return rendered.replace(/^    image:.*\$\{ASTRBOT_IMAGE.*$/m, '    image: "${ASTRBOT_IMAGE:-' + astrbotImage + '}"');
}

export function renderEnvironment (template, image, astrbotImage = ASTRBOT_MANIFEST.image) {
  if (!/^NAPCAT_IMAGE=/m.test(template) || !/^ASTRBOT_IMAGE=/m.test(template)) throw new Error('Environment template must include both image variables');
  return template.replace(/^NAPCAT_IMAGE=.*$/m, `NAPCAT_IMAGE=${image}`).replace(/^ASTRBOT_IMAGE=.*$/m, `ASTRBOT_IMAGE=${astrbotImage}`);
}

export function releaseNotes (project, version, repository, image) {
  const url = `https://github.com/${repository}/releases/download/v${version}`;
  const source = `https://raw.githubusercontent.com/${repository}/main`;
  return [
    `# ${project.name} v${version}`,
    '',
    `维护者：${project.maintainer}。固定源码快照；不追踪上游、不发布 latest 镜像。`,
    '',
    '## Linux Docker 部署（已安装 Docker Engine 与 Compose 插件）',
    '',
    '部署模板位于仓库根目录，不作为 Release 附件；模板自带固定镜像默认值，.env 文件可选。',
    '',
    ...[
      'mkdir -p ~/napcatqq-clasic',
      'cd ~/napcatqq-clasic',
      `wget -O compose.yaml "${source}/compose.yaml"`,
      'docker compose config -q',
      'docker compose up -d',
      'docker compose ps',
      'docker compose logs --tail=100 napcat',
      'docker compose exec napcat node -p "require(\'/app/napcat/config/webui.json\').token"',
    ].flatMap(command => ['```sh', command, '```', '']),
    'WebUI 沿用原始 6099:6099 发布行为，默认不指定宿主 IP，遵循 Docker 默认绑定。通过 http://[SERVER_IP]:6099/webui/ 访问，使用上面查询出的 token，并扫码登录 QQ。服务器防火墙 / 云安全组需允许该端口。',
    '若希望仅本机访问，在 .env 设置 WEBUI_BIND=127.0.0.1 后执行 docker compose up -d，再在自己的电脑建立隧道：',
    '',
    '```sh',
    'ssh -N -L 6099:127.0.0.1:6099 [SSH_USER]@[SERVER_IP]',
    '```',
    '',
    '再访问 http://127.0.0.1:6099/webui/，使用上面查询出的 token，并扫码登录 QQ。',
    '`WEBUI_TOKEN` 留空会生成随机 token 并保存在 config 卷；再次启动保留它。.env 文件不是启动条件，需要覆盖默认值时才使用根目录 .env.example。',
    '`QQ_ACCOUNT` 只用于已有登录记录的快速登录，首次仍需扫码。',
    '',
    '## AstrBot 单文件联部署（可选）',
    '',
    '使用同一个 project name 与原五个 named volumes；切换前停止原独立服务，省略 -v 以保留数据。',
    '',
    ...[
      'docker compose down',
      `wget -O astrbot.yml "${source}/astrbot.yml"`,
      'docker compose -f astrbot.yml config -q',
      'docker compose -f astrbot.yml up -d',
      'docker compose -f astrbot.yml ps',
      'docker compose -f astrbot.yml logs --tail=100 astrbot',
    ].flatMap(command => ['```sh', command, '```', '']),
    'AstrBot 面板沿用原始 6185:6185 发布行为，默认不指定宿主 IP。通过 http://[SERVER_IP]:6185 访问；首次用户名 astrbot。空初始密码变量被移除，由程序生成随机 24 字符密码并在日志 Initial password 显示。设置显式初始密码时需满足其原生强度校验。',
    '已有 .env 或终端环境中的非空 WEBUI_BIND / ASTRBOT_DASHBOARD_BIND 仍会显式覆盖绑定；恢复原始默认时清空或删除这两项，再执行 docker compose -f astrbot.yml up -d 更新端口映射。Docker 默认 IPv4 / IPv6 入口与容器原生 IPv6 网络是不同配置。',
    '第一次必须在 AstrBot WebUI 手动添加 aiocqhttp / OneBot v11 平台：enable=true、ws_reverse_host=0.0.0.0、ws_reverse_port=6199，ws_reverse_token 与 Classic astrbot 连接实际生效的 token 一致。非空 ONEBOT_ACCESS_TOKEN 覆盖该 token；空值迁移时应沿用已有连接 token。AstrBot 原始 platform=[]，启动容器不代表已连通 QQ。',
    'Classic 的 MODE=astrbot 预设为单一 astrbot 反向客户端，默认 ws://astrbot:6199/ws 与 array 消息格式；现有全局和账号配置只修改该条目、首次备份、重复启动幂等。唯一旧 rws 同 URL 条目会被接管；重复目标或命名冲突会先报错，避免双重消息。',
    'ONEBOT_ACCESS_TOKEN 非空覆盖该条目；空或未设置保留已有 token，新条目才为空。它与 WEBUI_TOKEN 独立，不自动生成。MODE 显式空值不改 OneBot 配置。',
    '两服务共同挂载 /AstrBot/data，Classic 只读。普通已发布媒体需目录可遍历、UID 1000 可读；root 创建的 mkstemp 0600 文件仍不可读，不会全树 chmod。需要 HTTP 交付时可在 AstrBot 配置 callback_api_base=http://astrbot:6185，并注意下载方可达性、短期/单次 token 与重试限制。',
    '本工作流只验证双服务启动、配置预设和指定共享测试文件；实际消息收发需要真实 QQ 账号另行验收。',
    '',
    '## 下载内容',
    '',
    '- `NapCatQQ-clasic.Shell.zip`：源码构建的 Shell、仓库 Windows loaders、WebUI、运行依赖和完整许可。未捆绑 Windows QQ / Node；Windows 使用仓库 loader 时需先安装相应 QQ。',
    '- `NapCatQQ-clasic.Framework.zip`：Framework、WebUI、运行依赖和完整许可；需已有 QQ / 对应 Framework 加载环境。',
    '- `openapi.json`、`SHA256SUMS`、`build-info.json`、`image-manifest.json`；部署配置只在仓库根目录维护。',
    `- AstrBot 独立镜像：\`${ASTRBOT_MANIFEST.image}\`，默认 root / Python ${ASTRBOT_MANIFEST.pythonVersion}；未将其或依赖重新许可为本项目许可。`,
    `- Docker 镜像：\`${image}\`，支持 linux/amd64、linux/arm64；两架构均须通过本次工作流的启动测试后才发布。`,
    '',
    '维护者首次发布后需在 GitHub Packages → napcatqq-clasic → Package settings → Change visibility 中设置 Public；公开镜像支持匿名拉取，私有镜像需先登录 GHCR。仓库公开与包的可见性是独立设置。',
    'QQ 登录成功与聊天功能仍需真实账号手动验收；构建检查覆盖原生依赖和扫码前 WebUI 启动，不使用 CI 账号登录。',
    '',
    '## 校验下载',
    '',
    ...[
      `wget -O SHA256SUMS "${url}/SHA256SUMS"`,
      `wget -O NapCatQQ-clasic.Shell.zip "${url}/NapCatQQ-clasic.Shell.zip"`,
      'sha256sum --ignore-missing -c SHA256SUMS',
    ].flatMap(command => ['```sh', command, '```', '']),
    '配置与日志分别保存在 config/logs 卷，QQ 数据在 qq 卷；plugins/cache 也持久化。',
    '停止使用 `docker compose down`；保留数据时省略 `-v`。固定版本不会自动升级。',
    '',
    '## 许可',
    '',
    '本项目完整保留原 NapCat Limited Redistribution License（根 LICENSE），没有为本次构建、部署或文档新增 MIT 授权；第三方原有 MIT / Apache-2.0 许可分别保留。',
    '各 ZIP 包附带 THIRD_PARTY_NOTICES.md、嵌套源许可和运行依赖的原始许可；Tencent QQ 属独立专有组件。',
    '',
  ].join('\n');
}

export function packageRelease (args = process.argv.slice(2)) {
  const project = getProject();
  const options = parseArguments(args, { version: process.env.NAPCAT_VERSION || project.version, repository: project.repository, dist: path.join(ROOT, 'dist'), out: path.join(ROOT, 'release-assets') });
  if (options.target !== undefined) throw new Error('--target belongs to build-artifacts; a release packages both targets');
  const version = normalizeVersion(options.version, { release: true });
  const repository = normalizeRepository(options.repository, { required: true });
  const dist = assertGeneratedDirectory(ROOT, options.dist, ['dist', 'out']);
  const output = assertGeneratedDirectory(ROOT, options.out, ['release-assets', 'out']);
  if (output === dist || output.startsWith(dist + path.sep) || dist.startsWith(output + path.sep)) throw new Error('Release output must be separate from its artifact input');
  const image = `ghcr.io/${repository.split('/')[0].toLowerCase()}/${project.slug}:${version}`;
  for (const target of ['shell', 'framework']) {
    const manifest = JSON.parse(readFileSync(path.join(dist, target, 'package.json'), 'utf8'));
    if (manifest.version !== version || manifest.name !== `${project.slug}-${target}`) throw new Error(`${target} artifact version/name mismatch`);
    for (const name of LICENSE_FILES) if (!existsSync(path.join(dist, target, name))) throw new Error(`${target} is missing ${name}`);
    verifyServerModules(path.join(dist, target));
  }
  const buildInfo = JSON.parse(readFileSync(path.join(dist, 'build-info.json'), 'utf8'));
  if (buildInfo.version !== version || buildInfo.frozen !== true || !['shell', 'framework'].every(target => buildInfo.targets.includes(target))) throw new Error('Build metadata does not describe this complete release');
  const openapi = JSON.parse(readFileSync(path.join(dist, 'openapi.json'), 'utf8'));
  if (!/^3\./.test(openapi.openapi) || !Object.keys(openapi.paths ?? {}).length) throw new Error('OpenAPI document has no operations');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const target of ['shell', 'framework']) {
    const name = `NapCatQQ-clasic.${target === 'shell' ? 'Shell' : 'Framework'}.zip`;
    console.log(`Packing ${name}: ${createZip(path.join(dist, target), path.join(output, name))} files`);
  }
  copyFileSync(path.join(dist, 'openapi.json'), path.join(output, 'openapi.json'));
  copyFileSync(path.join(dist, 'build-info.json'), path.join(output, 'build-info.json'));
  // Deployment templates and the optional .env.example belong to the repository
  // root, not to Release assets. Runtime ZIPs and checksums are packaged here.
  const notes = releaseNotes(project, version, repository, image);
  writeFileSync(path.join(output, 'DEPLOYMENT.md'), notes);
  writeFileSync(path.join(output, 'RELEASE.md'), notes);
  for (const name of LICENSE_FILES) copyFileSync(path.join(ROOT, name), path.join(output, name));
  const digestsPath = path.join(dist, 'image-digests.json');
  const imageManifest = { image, version, repository, platforms: ['linux/amd64', 'linux/arm64'], astrbot: { image: ASTRBOT_MANIFEST.image, version: ASTRBOT_MANIFEST.version, revision: ASTRBOT_MANIFEST.revision, platforms: ASTRBOT_MANIFEST.platforms }, ...(existsSync(digestsPath) ? { digests: JSON.parse(readFileSync(digestsPath, 'utf8')) } : {}) };
  writeFileSync(path.join(output, 'image-manifest.json'), JSON.stringify(imageManifest, null, 2) + '\n');
  const checksums = readdirSync(output).sort().map(name => `${createHash('sha256').update(readFileSync(path.join(output, name))).digest('hex')}  ${name}`).join('\n') + '\n';
  writeFileSync(path.join(output, 'SHA256SUMS'), checksums);
  console.log(`${project.name} v${version}: release files ready in ${path.relative(ROOT, output)}; image ${image}`);
  return { version, repository, image, output };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { packageRelease(); } catch (error) { console.error(error); process.exitCode = 1; }
}
