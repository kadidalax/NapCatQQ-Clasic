<!-- License: see repository LICENSE and original component licenses. -->
# NapCatQQ-clasic

本分支保留 Shell、Framework、WebUI 与 OneBot 11 接口，提供独立 Docker 镜像以及 AstrBot 联部署配置。核心版本检查、下载更新、启动时覆盖更新和上游同步固定关闭；不承诺未来 QQ 版本兼容。

## 1. 架构与支持范围

```text
Tencent Linux QQ / Electron
          │ repository Shell loader
          ▼
NapCatQQ-clasic ── OneBot 11 reverse WebSocket ──► AstrBot
  │ WebUI :6099                                   │ WebUI :6185
  │ config / logs / plugins / cache / QQ data       │ /AstrBot/data
  └──────────────── optional shared media path ─────┘
```

| 项目 | 固定基线 / 契约 |
| --- | --- |
| Classic 固定版本 | `4.18.42`；沿用已确认版本号，不另开版本系列或生成 CI 后缀 |
| 构建环境 | Node.js `22.22.0`、pnpm `9.15.9`、仓库锁文件 |
| Classic 容器 | Debian bookworm、固定 Node 多架构镜像摘要、普通用户 `1000:1000` |
| QQ 运行环境 | Linux QQ `3.2.34-53644`，使用 QQ 自身 Electron / 原生 ABI |
| 容器平台 | `linux/amd64`、`linux/arm64` |
| 容器名 | 沿用原模板：Classic 为 `napcat`，AstrBot 为 `astrbot` |
| AstrBot 基线 | `soulter/astrbot:v4.29.4`，固定多架构 manifest 摘要 |
| 协议连接 | OneBot 11 反向 WebSocket；默认 `ws://astrbot:6199/ws` |
| 管理端口 | Classic `6099`、AstrBot `6185`；沿用原始端口发布，不指定宿主 IP，遵循 Docker 默认绑定 |

Docker 从本仓库源码生成 Shell / WebUI / 插件，不下载上游 Shell Release，也不继承旧 NapCat 镜像。QQ AppImage 的完整 SHA256 与字节数记录在 [下载清单](<./docker/qq-manifest.json>)；[Dockerfile](<./Dockerfile>) 固定基础镜像摘要并校验 QQ 版本、架构、原生依赖和加载器布局。

QQ 实际登录及消息功能仍受该固定客户端与当前服务端兼容性约束。容器健康不等同于 QQ 已登录或 OneBot 已连接。

## 2. 部署

要求 Docker Engine 与 Compose v2。部署文件直接从项目根目录下载，镜像需已经成功发布；本地存在构建配置不代表 GHCR 镜像已发布。模板内置默认值，不要求 `.env` 文件。需要可重现配置时，可将下载链接中的 `main` 替换为已验收的提交号或标签。

### 2.1 单实例 Classic

[compose.yaml](<./compose.yaml>) 位于项目根目录，管理 Classic 及其持久化卷。模板内置 `4.18.42` 镜像与端口默认值，不作为 Release 附件。

```bash
mkdir -p napcatqq-clasic && cd napcatqq-clasic
```

```bash
wget -O compose.yaml https://raw.githubusercontent.com/kadidalax/NapCatQQ-Clasic/main/compose.yaml
```

可选：需要集中覆盖默认值时再保存环境样例；直接使用默认配置可跳过。

```bash
wget -O .env https://raw.githubusercontent.com/kadidalax/NapCatQQ-Clasic/main/.env.example
```

按 [环境变量契约](<./.env.example>) 设置镜像、管理 token 与宿主绑定，然后验证并启动：

```bash
docker compose config -q && docker compose up -d
```

### 2.2 AstrBot + Classic

[astrbot.yml](<./astrbot.yml>) 位于项目根目录，是独立 Compose 文件，不依赖其他 Compose 文件或 `.env` 文件，也不放入 Release。它与单实例使用相同项目名和 Classic 卷名，便于在相同部署目录保留已有数据。

```bash
mkdir -p napcatqq-clasic && cd napcatqq-clasic
```

```bash
wget -O astrbot.yml https://raw.githubusercontent.com/kadidalax/NapCatQQ-Clasic/main/astrbot.yml
```

可选：需要集中覆盖默认值时再保存环境样例；直接使用默认配置可跳过。

```bash
wget -O .env https://raw.githubusercontent.com/kadidalax/NapCatQQ-Clasic/main/.env.example
```

设置 `ONEBOT_ACCESS_TOKEN`，保持 `ONEBOT_WS_URL` 与 AstrBot 的接收端一致；保留或按策略覆盖固定 `ASTRBOT_IMAGE`。

```bash
docker compose -f astrbot.yml config -q && docker compose -f astrbot.yml up -d
```

联部署启用 `MODE=astrbot`，初始化 OneBot 反向连接预设；单独运行 Classic 不启用该预设。旧模板的 `NAPCAT_UID` / `NAPCAT_GID` 不是本分支的运行用户接口，Classic 固定使用 UID / GID 1000。

### 2.3 首次建立协议连接

1. 打开 Classic 的 `/webui/`，用实际 token 登录并完成 QQ 登录。
2. 打开 AstrBot WebUI，创建并启用 **OneBot v11 / aiocqhttp** 平台：接收监听 `0.0.0.0:6199`，WebSocket 路径 `/ws`，token 与 Classic 中 `astrbot` 连接**实际生效的 token** 相同。显式设置非空 `ONEBOT_ACCESS_TOKEN` 时才由该环境值覆盖；迁移旧配置且环境值为空时，Classic 保留原连接 token，AstrBot 也应沿用它。
3. 核对 Classic 中的反向 WebSocket 已启用，目标为 `ws://astrbot:6199/ws`，消息格式为 `array`；日志应显示协议连接成功。
4. 用实际账号分别验收文本、图片、文件和视频。端口 `6199` 只用于容器内部网络，不要求映射到宿主。

AstrBot `v4.29.4` 初始平台列表为空，容器启动不会自动创建接收平台。首次生成或主动重置管理密码时，启动日志才会输出 `Initial password`；已有密码的普通重启不重复显示。查看日志与一次性重置命令见 [管理凭据查看与重置](<#31-管理凭据查看与重置>)。若指定 `ASTRBOT_DASHBOARD_INITIAL_PASSWORD`，应为非空且满足该版本的长度 / 大小写 / 数字要求；不要向应用直接注入空字符串，也不要持续启用密码重置选项。

## 3. 配置管理

`.env` 文件不是依赖或必需文件。模板已经设置默认镜像、监听端口、账号和联部署参数；Compose 可以直接使用默认值，或由终端环境变量覆盖。只有希望集中管理覆盖项时才使用根目录 [`.env.example`](<./.env.example>) 生成 `.env`。Classic 管理 token 未指定时会随机生成并持久化；OneBot 协议 token 不自动生成，应与 AstrBot 端一致。


| 变量 | 作用 / 默认 |
| --- | --- |
| `NAPCAT_IMAGE` | 可选覆盖；默认 `ghcr.io/kadidalax/napcatqq-clasic:4.18.42` |
| `ASTRBOT_IMAGE` | 联部署使用的固定 AstrBot 镜像，可显式覆盖 |
| `WEBUI_TOKEN` | Classic 管理 token；空值时首次随机生成，已有配置继续沿用 |
| `WEBUI_BIND` / `WEBUI_PORT` | Classic 宿主绑定 / 端口；绑定默认空，沿用原始 `6099:6099` 发布；非空才显式覆盖；容器内固定为 `0.0.0.0:6099` |
| `QQ_ACCOUNT` | 可选已有 QQ 登录记录；首次仍需扫码 |
| `ASTRBOT_DASHBOARD_BIND` / `ASTRBOT_DASHBOARD_PORT` | AstrBot 宿主绑定 / 端口；绑定默认空，沿用原始 `6185:6185` 发布；非空才显式覆盖 |
| `ASTRBOT_DASHBOARD_INITIAL_PASSWORD` | 可选 AstrBot 首次管理密码；空值在启动包装器中省略，由应用随机生成 |
| `MODE` | `astrbot` 启用联部署预设，空值不管理 OneBot 预设 |
| `ONEBOT_WS_URL` | 反向 WebSocket 地址，默认 `ws://astrbot:6199/ws` |
| `ONEBOT_ACCESS_TOKEN` | 非空值覆盖预设条目的协议凭据；空值保留已有条目的 token，新条目才默认空；与 AstrBot 平台一致，与 WebUI token 分离 |

配置预设采用幂等初始化，只管理一个名为 `astrbot` 的反向连接，保留现有 HTTP、其他目标 WebSocket、插件及自定义字段。旧模板中唯一的同目标 `rws` 连接会被原地接管而不是重复添加；非空环境 token 覆盖该条目，空值保留已有 token。若需要清除既有 token，在 WebUI 或对应账号配置中明确清空，并保持环境 token 为空。

已有账号配置优先于全局配置，因此初始化会同时检查全局与已有账号配置。JSON5 可被读取；已有配置首次改写前保留 `<原配置文件>.astrbot.bak`，不覆盖已存在的首次备份。多个同目标连接或命名冲突会使初始化报错，不静默删掉自定义连接。预检通过后才写入，`MODE` 为空时不触及 OneBot 配置，具体备份位置见 [初始化实现](<./docker/init-config.mjs>)。

变更 Compose 环境后执行 `up -d` 重建服务；`restart` 不更新环境。`.env` 仅用于部署，不加入源码或 Docker 构建上下文。

```bash
docker compose -f astrbot.yml up -d
```

### 3.1 管理凭据查看与重置

#### Classic WebUI token

查询 Classic 实际 token：

```bash
docker compose -f astrbot.yml exec napcat node -p "require('/app/napcat/config/webui.json').token"
```

#### AstrBot 初始密码与完整启动日志

默认用户名为 `astrbot`。只有本次启动生成或主动重置管理密码时，AstrBot 才会在 `INFO` 级别的启动日志中输出 `Initial password`；已有密码的普通重启、复用数据卷不会再次打印旧密码。容器重建后，旧容器的启动日志不在新容器日志中，但数据卷中的密码继续保留。

查看完整 AstrBot 日志，不要只截取最后 100 / 200 行：

```bash
docker compose -f astrbot.yml logs --no-color astrbot
```

使用固定容器名也可直接查看：

```bash
docker logs astrbot
```

`ASTRBOT_DASHBOARD_INITIAL_PASSWORD` 留空时，模板包装器会省略该环境变量，由应用生成随机 24 字符密码。非空时应至少 8 字符，包含大写、小写字母和数字；它仅在生成或重置密码时作为初始值使用，单独修改该变量不会覆盖已有密码。

#### AstrBot 一次性重置密码

以下操作会重置管理密码，不是查询旧密码；平台、插件及其他持久化数据保留。操作期间 AstrBot 暂停服务。

1. 停止正式 AstrBot 容器：

```bash
docker compose -f astrbot.yml stop astrbot
```

2. 沿用模板原启动命令，启动一次性容器并临时传入原版重置标记：

```bash
docker compose -f astrbot.yml run --rm --no-deps -e ASTRBOT_RESET_DASHBOARD_PASSWORD=1 astrbot
```

未设置非空 `ASTRBOT_DASHBOARD_INITIAL_PASSWORD` 时会生成新的随机密码；已设置时使用该值。等待控制台输出 `Initial password`，记下新密码，然后按 **Ctrl+C** 结束临时运行。

3. 恢复正式 AstrBot 服务，使用新密码登录：

```bash
docker compose -f astrbot.yml up -d astrbot
```

重置标记只传给一次性容器，不加入常规模板或 `.env`，避免每次启动重复重置。全程保留数据卷，无需重新安装。命令依据：[AstrBot v4.29.4 原版启动参数](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/main.py)、[密码初始化逻辑](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/core/config/astrbot_config.py)。

### 3.2 宿主机访问

管理端口沿用原始 `6099:6099` / `6185:6185` 发布行为，默认不指定宿主 IP。Docker 默认配置可提供 IPv4 / IPv6 入口，实际 IPv6 访问取决于宿主 IPv6 与 Docker 转发配置；这不等同于启用容器原生 IPv6 网络。通过 `http://<SERVER_IP>:6099/webui/` 和 `http://<SERVER_IP>:6185` 访问，IPv6 地址用方括号包裹；服务器防火墙 / 云安全组需允许对应端口。

已有 `.env` 或终端环境中的非空 `WEBUI_BIND` / `ASTRBOT_DASHBOARD_BIND` 仍会显式覆盖默认绑定。恢复原始默认时将这两项清空或删除，再执行 `docker compose -f astrbot.yml up -d` 更新端口映射，单独 `restart` 不会应用变更。

若希望仅本机监听，可将 `WEBUI_BIND` 和 `ASTRBOT_DASHBOARD_BIND` 显式设为 `127.0.0.1`，重新执行 `up -d` 后使用单个 SSH 隧道转发两个管理端口：

```bash
ssh -N -L 6099:127.0.0.1:6099 -L 6185:127.0.0.1:6185 USER@HOST
```

OneBot 或其他协议端口仅按实际需要添加。容器内的 `127.0.0.1` 不是宿主机。Linux 下需访问宿主服务时，在相应服务配置中显式添加以下映射；两个默认模板不预置该项。

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

随后使用 `host.docker.internal` 访问宿主上实际开放的服务端口。

## 4. 持久化与媒体路径

| 数据 | 容器路径 | 说明 |
| --- | --- | --- |
| Classic 配置 | `/app/napcat/config` | WebUI、OneBot 全局 / 账号配置及预设备份 |
| 日志 | `/app/napcat/logs` | 独立持久化，Docker 日志另外限制滚动大小 |
| 插件 | `/app/napcat/plugins` | 用户插件与内置插件 |
| 缓存 | `/app/napcat/cache` | 协议端缓存 |
| QQ 数据 | `/home/napcat/.config/QQ` | 登录记录、客户端及设备状态 |
| AstrBot 数据 | `/AstrBot/data` | 平台配置、插件、缓存及其数据 |

Classic 根文件系统只读，写入仅落在明确的数据卷与 tmpfs。部署时保持项目名和卷名稳定；切换不同 Compose 项目名会创建另一组卷。不要同时运行两个竞争同一 QQ 登录状态的旧 / 新实例。

### 4.1 本地文件与回调 URL

联部署将 AstrBot 数据挂载到双方相同绝对路径 `/AstrBot/data`。这对 OneBot 本地路径有效，但**共享卷不替代文件权限**：

- AstrBot 该版本常规图片 / 语音发送会转换为 base64，通常不依赖对方读取原文件。
- 文件及部分视频可传递 `file:///...`；Classic 零拷贝使用该本地路径，要求路径一致且 UID 1000 可读。
- 常规发布媒体可使用文件 `0644`、目录 `0755`，或匹配组的 `0660` / `0750`。不要对整个 AstrBot 数据目录递归公开配置和凭据。
- AstrBot 的部分 `mkstemp` 文件为创建者私有 `0600`，调整 umask 不改变其私有属性；插件写入 `/tmp` 的文件也不在共享数据卷内。
- 需要跨 UID 传递私有临时文件时，可按 AstrBot 的 `callback_api_base` 使用对 Classic 可达的 `http://astrbot:6185` 文件回调。该版本文件 token 默认短时、单次使用，不应当作永久下载地址；所有下载方都需能访问所配置的回调地址。

以上接口行为以 [AstrBot v4.29.4 源码](https://github.com/AstrBotDevs/AstrBot/tree/v4.29.4) 为基线；镜像摘要、初始化与媒体权限证据详见 [兼容性记录](<./docs/ASTRBOT_COMPATIBILITY.md>)，实际媒体发送需要账号验收。

### 4.2 旧栈迁移

旧模板通常使用 `./data`、`./napcat/config`、`./ntqq`。迁移前停止旧实例并备份；保留 QQ 数据和设备信息，不只复制二维码或单个配置文件。

| 旧数据 | 导入目标 |
| --- | --- |
| `./data` | AstrBot 数据卷中的 `/AstrBot/data` |
| `./napcat/config` | Classic 配置卷中的 `/app/napcat/config` |
| `./ntqq` | Classic QQ 卷中的 `/home/napcat/.config/QQ` |

导入 Classic 数据时将目标所有者统一为 `1000:1000`，保留 token / 配置的私有权限。迁移涉及写入命名卷，应使用一次性导入容器或受控归档恢复，不把旧路径挂到错误的新目录。保留新旧数据的独立备份，完成实际登录与媒体测试后再清理旧实例。

## 5. 运行检查与备份

```bash
docker compose -f astrbot.yml ps
```

```bash
docker compose -f astrbot.yml logs --tail=200 napcat astrbot
```

检查顺序：容器健康 → 两个管理界面 → QQ 登录 → AstrBot 平台监听 → OneBot 握手 → 实际消息与媒体。WebUI 与协议 token、宿主绑定与容器监听、容器健康与账号在线是不同状态。

备份在停机后执行，避免复制正在写入的 QQ / 插件数据库。Classic 与 AstrBot 分别归档；两者都停机后再读取数据。部署环境文件单独保存。

```bash
mkdir -p backups && chmod 700 backups && docker compose -f astrbot.yml stop
```

```bash
docker compose -f astrbot.yml run --rm -T --no-deps --entrypoint tar napcat -czf - -C / app/napcat/config app/napcat/logs app/napcat/plugins app/napcat/cache home/napcat/.config/QQ > backups/classic.tar.gz
```

```bash
docker compose -f astrbot.yml run --rm -T --no-deps --entrypoint tar astrbot -czf - -C / AstrBot/data > backups/astrbot.tar.gz
```

```bash
chmod 600 backups/classic.tar.gz backups/astrbot.tar.gz
```

只有使用 `.env` 时才额外备份部署环境；未创建该文件不影响数据归档和权限设置。

```bash
if [ -f .env ]; then cp .env backups/deployment.env && chmod 600 backups/deployment.env; fi
```

```bash
docker compose -f astrbot.yml up -d
```

普通 `down` 保留命名卷，`down -v` 删除数据。恢复使用匹配镜像版本和卷布局，在停止服务后分别解包：

```bash
docker compose -f astrbot.yml run --rm -T --no-deps --entrypoint tar napcat -xzf - -C / < backups/classic.tar.gz
```

```bash
docker compose -f astrbot.yml run --rm -T --no-deps --entrypoint tar astrbot -xzf - -C / < backups/astrbot.tar.gz
```

恢复部署环境后重新创建服务；版本回退同时考虑数据库和插件兼容性，不混用不匹配的数据备份。

## 6. 构建与发布

### 6.1 本地构建

从项目根目录运行：

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm run check:project && pnpm run typecheck && pnpm test && pnpm run test:deployment
```

```bash
pnpm run build:artifacts --version 4.18.42 --repository kadidalax/NapCatQQ-Clasic
```

```bash
pnpm run package:release --version 4.18.42 --repository kadidalax/NapCatQQ-Clasic
```

构建目录为 `dist/`，发行资产为 `release-assets/`。版本与仓库身份离线解析，命令不创建远程 Release 或推送镜像。仓库内 PTY 使用随附原生资源；[包配置](<./package.json>) 跳过冗余 `@homebridge/node-pty-prebuilt-multiarch` 安装编译，保留其 JS / 类型，并正常执行必要构建脚本。

Shell / Framework 运行包保留 CommonJS 加载器作用域；服务端入口、worker 与共享分块统一使用 `.mjs`，不依赖源码根清单中的 ESM 设置。构建组装、Release 打包与 Docker 运行布局检查均调用同一 [模块校验器](<./docker/verify-server-modules.mjs>)，检查入口、模块语法和静态导入目标。浏览器资源、插件和运行依赖保留各自模块语义；此检查只解析产物，不初始化 QQ 或执行账号登录。

```bash
docker build --build-arg NAPCAT_VERSION=4.18.42 --build-arg NAPCAT_REPOSITORY=kadidalax/NapCatQQ-Clasic -t napcatqq-clasic:4.18.42 .
```

```bash
NAPCAT_IMAGE=napcatqq-clasic:4.18.42 docker compose -f astrbot.yml up -d
```

联部署本地运行同样应显式规划 `ONEBOT_ACCESS_TOKEN`；协议 token 不自动生成，空值对已有条目表示保留现值，对新条目表示不启用 token 验证。开发 WebUI 的代理和构建说明见 [前端文档](<./packages/napcat-webui-frontend/README.md>)。

### 6.2 GitHub Actions

| 工作流 | 触发与产物 |
| --- | --- |
| [CI](<./.github/workflows/ci.yml>) | `main` / `master` 推送、PR 或手动；类型、测试、源码构建、Windows 加载器与 Docker 验收 |
| [Release](<./.github/workflows/release.yml>) | `vX.Y.Z` 标签或手动版本输入；解析精确提交，测试、构建、推送已验收架构，合并镜像 manifest，再创建本仓库 Release |

发行不依赖原作者私有 token，不触发原作者文档、Docker、AppImage 或 release-hash 仓库。手动发行在版本标签不存在时使用选定提交；已有标签则使用标签指向的提交。不要复用指向旧上游源码的标签。

首次 GHCR 发布后，可见性独立于源码仓库；公开部署前在 Package settings 将包设为 Public。仅明确发行操作才推送镜像 / 创建标签和 Release，普通 CI 不发布。

| 发行资产 | 用途 |
| --- | --- |
| `NapCatQQ-clasic.Shell.zip` | Shell、WebUI、插件、原生资源和锁定运行依赖；裸机需已有兼容 QQ |
| `NapCatQQ-clasic.Framework.zip` | Framework 分发包及对应运行资源 |
| `openapi.json` | 本次源码生成的接口描述 |
| `SHA256SUMS` | 实际发行资产校验和 |
| `build-info.json` / `image-manifest.json` | 构建身份、版本和镜像摘要 |

[compose.yaml](<./compose.yaml>)、[astrbot.yml](<./astrbot.yml>) 和可选 [`.env.example`](<./.env.example>) 只在项目根目录维护，不作为 Release 附件发布；Release 保留运行包、接口描述、许可与校验和。

## 7. 验收边界

本地检查覆盖许可证完整性、冻结行为、配置预设、模板 / 打包、类型检查、单测与实际源码构建。容器发布门槛包括原生依赖、真实 Compose、管理界面、持久化重启及联部署文件路径；完整实现与资源摘要见 [Docker 说明](<./docker/README.md>)。

没有 Docker daemon 的环境只记为配置 / 构建检查通过，不记作实际容器启动通过。没有真实 QQ 账号的 CI 不记作登录、消息或媒体发送通过。以本次实际运行记录与工作流结果为准。

## 8. 许可与停更策略

[原许可证](<./LICENSE>) 原文、原版权和 [第三方声明](<./THIRD_PARTY_NOTICES.md>) 随源码及发行包保留。本分支没有全仓库 MIT 重许可；AstrBot、Tencent QQ、npm 依赖及原生组件分别遵循各自许可。

停更范围为核心更新和上游同步；QQ 通信、用户显式配置的插件源及固定运行资源下载不等于自动升级。固定版本不会自行替换；后续是否改变部署版本由维护者或部署者明确决定。
