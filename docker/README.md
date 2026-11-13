<!-- License: see repository LICENSE (NapCat Limited Redistribution License). -->
<!-- Maintainer: kadidalax. -->
# NapCatQQ-clasic 容器实现与验收合同

项目品牌为 **NapCatQQ-clasic**，源码仓库为 [kadidalax/NapCatQQ-Clasic](https://github.com/kadidalax/NapCatQQ-Clasic)。本说明记录构建、联部署、配置迁移及验收行为；面向操作者的完整逐条命令见[根 README](../README.md)。

## 两种部署文件

| 入口 | 服务 | 用途 |
| --- | --- | --- |
| [compose.yaml](../compose.yaml) | `napcat` | 独立 Classic；不注入 MODE，不改 OneBot 连接预设 |
| [astrbot.yml](../astrbot.yml) | `napcat` + `astrbot` | 独立单文件联部署，无 extends/include，也不需要同时指定基础文件 |

两份文件都使用 `name: napcatqq-clasic`。config、logs、plugins、cache、QQ 数据五个 named volumes 的逻辑名与挂载路径完全一致，联部署追加 `astrbot_data`。切换前应停止旧服务并省略 `-v`，避免两个 Classic 实例同时读写账号数据；不要同时启动两份文件。

联部署可直接解析与启动：

```sh
docker compose -f astrbot.yml config -q
```

```sh
docker compose -f astrbot.yml up -d
```

两份部署配置只在项目根目录维护，不放入 Release。默认镜像和端口已经写入 YAML，`.env` 文件可选；需要覆盖时使用终端环境变量或根环境样例。

## Classic 源码构建链

1. [Dockerfile](../Dockerfile) 的 `builder` 使用固定 pnpm 9.15.9 从本仓库源码执行 `build:artifacts --target shell`，构建 WebUI、内置插件、Shell。没有上游 Shell Release 下载或旧项目镜像依赖。
2. [构建脚本](../scripts/build-artifacts.mjs) 从已安装的锁文件图复制 `express`、`ws` 及其运行依赖，以及 Core 已锁定的 `json5@2.2.3`。不通过另一轮 npm install 重新解析发行包依赖。普通目录取代 pnpm symlink，以兼容 Windows ZIP 解包；各包原许可保留。
3. `qq-assets` 从 Tencent 固定 URL 下载 QQ 3.2.34-53644 AppImage，要求 SHA256 与字节数都匹配；验证 SquashFS superblock 后由 `unsquashfs` 解包。不执行 AppImage，无需 FUSE 或跨 CPU 模拟。
4. `runtime` 保留完整 QQ 文件及随附 Electron / Chromium 许可，安装 ELF 依赖、FFmpeg、Xvfb 与 tini。Node 22.22.0 Debian bookworm 基础镜像固定为已核验的多架构 digest。
5. 仓库原 [loadNapCat.js](../packages/napcat-shell-loader/loadNapCat.js) 放入 QQ 的 resources/app；真实 QQ package 的 main 指向它。QQ 版本、appid、架构和 Tencent 作者信息保留，原 package 另存为 `package.qq-original.json`。
6. `NAPCAT_MAIN_PATH=/app/shell/napcat.mjs` 指向本仓库构建产物。内核实际运行在 QQ 自身 Electron / native ABI 中；独立 Node 只负责初始化、校验、健康检查，不把非 N-API QQ wrapper 装入不匹配的 Node ABI。
7. `NAPCAT_QQ_VERSION_CONFIG_PATH` 指向镜像内不可变版本文件，防止共享 QQ 数据中的旧桌面 versions 配置覆盖实际已锁定的运行版本。

### 已实取的 QQ 资源证据

2026-11-13 完整下载两架构 AppImage，读取 SquashFS、package 与 ELF 动态依赖表，并以[生产下载验证函数](./fetch-qq.mjs)再次核验：

| 架构 | 字节数 | SHA256 | SquashFS offset |
| --- | ---: | --- | ---: |
| amd64 | 271368614 | `a33675d355e8b559453c40b9c59823393c6e585c97a3ae9f5c151203afa125a4` | 188392 |
| arm64 | 276660745 | `dcd40e5bd44023ea43e343445ee6277637dc2ac285f96a1c3c4ebab9de5a6b5b` | 197808 |

两者含 qq、resources/app/package.json（version 3.2.34-53644）、wrapper.node、major.node、Electron / Chromium 许可。此版本核心直接位于 wrapper.node，没有 QQNT.so。其 DT_NEEDED 包含 libvips-cpp.so.42、libX11-xcb.so.1、libbugly.so 等；镜像保留 QQ sharp-lib 并配置库搜索路径，构建时运行 ldd 缺依赖检查。完整固定值见[QQ manifest](./qq-manifest.json)。

## AstrBot 固定镜像与第一次初始化

[manifest](./astrbot-manifest.json) 固定：

```text
soulter/astrbot:v4.29.4@sha256:72f341f0ffcf6621ef820277642c5d63955f7beeac3683433ce09cac96379c78
```

该 index 包含 linux/amd64、linux/arm64 两个运行平台；unknown/unknown 条目是 attestations，不是第三个运行架构。镜像默认 root、Python 3.12.16、WorkingDir=/AstrBot、Cmd=python main.py。联部署保留 root 和可写应用文件系统，避免系统 Python 插件安装被错误的 UID 1000 或只读根阻断。

- 宿主面板默认 `127.0.0.1:6185`。容器内 `DASHBOARD_HOST=0.0.0.0` / `DASHBOARD_PORT=6185` 是该版本真实支持的变量，优先于配置文件。
- [环境样例](../.env.example) 的初始密码可以留空。单文件 Compose 内联 Python wrapper 在 exec 原 main.py 前，仅移除空字符串 `ASTRBOT_DASHBOARD_INITIAL_PASSWORD`，因为应用对显式空值会校验失败。非空值交给原生校验（至少八位、含大写/小写/数字）。不永久设置 reset-password。
- 第一次 username 为 astrbot；未设非空初始密码时程序生成随机 24 字符密码，启动日志含 Initial password，并要求改密。不是 astrbot/astrbot。
- 新数据的 platform=[]。操作者仍须在 WebUI 新建启用的 aiocqhttp / OneBot v11 平台：ws_reverse_host=0.0.0.0、ws_reverse_port=6199、ws_reverse_token=双方相同的协议 token；服务器路径为 /ws。6199 只在同网可见，不映射宿主。
- 健康检查接受 6185 或 6199 任一 TCP 端口，兼容已关闭面板但保留 OneBot 的旧配置。首次没有 OneBot 平台时依靠面板；若两个服务入口都被关闭，应调整配置或健康检查。CI 新数据会另外检查面板 HTTP 200，健康不等于 QQ 已登录。

依据：[AstrBot v4.29.4 Release](https://github.com/AstrBotDevs/AstrBot/releases/tag/v4.29.4)、[固定 tag Dockerfile](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/Dockerfile)、[DockerHub tag](https://hub.docker.com/v2/repositories/soulter/astrbot/tags/v4.29.4)。版本标签对应源码 commit 已记录在 manifest；不拿领先 tag 的 master 或移动 latest 当固定快照。

## MODE 的非破坏性 OneBot 预设

[onebot-preset.mjs](./onebot-preset.mjs) 在 QQ 启动前由[初始化脚本](./init-config.mjs)调用，仅管理名为 astrbot 的反向 WebSocket 客户端。

| 设置 | 行为 |
| --- | --- |
| MODE 未设置 | 联部署文件默认 astrbot；独立文件不注入 MODE |
| MODE 显式空 | 不创建、解析、重写或备份任何 OneBot 配置 |
| MODE=astrbot | 启用单条反向客户端，默认 ws://astrbot:6199/ws、消息 array、心跳 30000ms、重连 5000ms |
| ONEBOT_ACCESS_TOKEN 非空 | 覆盖 managed 条目的 token，不影响其他连接 |
| token 空/未设置 | 保留已有 token；新条目才为空，不自动生成协议 token |

清除旧协议 token 应在 Classic WebUI 或对应账号文件清空该条目的 token，并保持环境变量为空。它与 WEBUI_TOKEN、AstrBot 面板密码是三个独立凭据。

配置迁移合同：

1. Core [ConfigBase](../packages/napcat-core/helper/config-base.ts) 优先读 onebot11_<uin>.json，只有账号文件缺失才复制 global。因此初始化同时处理 global 与现有数字账号文件，而非只生成 global。
2. 采用锁定 JSON5 解析器，支持合法注释、单引号、尾逗号；其他 HTTP/HTTP-SSE/客户端/WS server/plugins/自定义字段保留。普通文档写为 JSON，JSON5 非有限自定义值仍以合法 JSON5 保持语义。原始字节/注释保存在首次备份。
3. 唯一已有 rws（或其他名）且规范化 URL 与目标相同，会在原位置接管/改名，保留扩展字段与空环境下的旧 token，不新增第二个相同连接。
4. 同名/同目标重复、跨类型启用 adapter 占用 astrbot 名时，先报冲突；Core 所有网络类型共用 name Map，预检避免新 WS 覆盖旧 HTTP 等服务。检查覆盖实际 TypeBox 可转换为 true 的常见值。
5. 全体目标预检通过后才备份/写。损坏 JSON5、非对象 clients、非法 network 类型、非 regular 的现有备份会报错，不静默恢复默认或删除旧内容。
6. 首次改变既有文件保存同目录 `<文件名>.astrbot.bak`（新备份权限 0600）；已有 regular 备份不覆盖。每个配置以临时文件加 rename 原子替换，重复启动没有差异时不重写，其他配置权限不递归修改。
7. 配置 URL 不接受 userinfo、fragment 或控制字符；认证使用独立 token，最终 token 也拒绝控制字符。日志不输出协议 token。

## 共享媒体与权限的实际边界

Classic 继续 UID/GID=1000:1000、只读根、cap_drop=ALL、no-new-privileges、内部 Xvfb/tini。config/logs/plugins/cache/QQ 数据分别持久化；QQ 路径固定 `/home/napcat/.config/QQ`。AstrBot 与 Classic 同网且都看到 `/AstrBot/data`，Classic 挂载为只读。

这提供相同绝对路径和零拷贝 File/Video 读取条件，但不是所有文件自动可读：

- root 正常创建且明确发布的媒体可使用可遍历目录（如 0755）及文件 0644；Classic UID 1000 可读。
- mkstemp 创建的 model_image_* / 临时媒体常为 0600，修改 umask 不会将其放宽；它与配置文件的私有权限应区别对待。
- 没有对整棵 AstrBot data 树执行 chmod/chown。需要共享时只定向发布所需媒体，保留凭据和私有配置；插件的 /tmp 路径也不被 data 卷覆盖。
- 可在 AstrBot 配置 callback_api_base=http://astrbot:6185，让支持该路径的 File/Video 走 /api/file/<token>。下载者必须能访问该 URL，默认 token 短期且单次访问；外部模型、插件、自定义重试或多次消费仍需各自检查，不承诺全插件自动成功。

依据：[stable OneBot 发送实现](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/core/platform/sources/aiocqhttp/aiocqhttp_message_event.py)、[file-token 服务](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/core/file_token_service.py)、[media_utils 的 mkstemp](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/core/utils/media_utils.py#L1309-L1321)。

## 工作流与本地验收边界

[CI](../.github/workflows/ci.yml) / [Release](../.github/workflows/release.yml) 使用 GitHub 官方 ubuntu-24.04 与 ubuntu-24.04-arm 原生 runner，两架构均依次执行：

1. 固定源码构建和原生依赖/layout 检查。
2. [独立部署 smoke](../.github/scripts/smoke-docker.sh)：实际 Compose、WebUI HTTP 200、非 root/只读根、持久化重启。
3. [联合 smoke](../.github/scripts/smoke-astrbot.sh)：固定 Astro 镜像新面板 HTTP 200；legacy global/账号 JSON5 迁移、首次备份及重启幂等；同绝对路径公开测试媒体可读、root mkstemp 0600 测试文件不可读、Classic 不可写共享媒体。
4. Release 在以上门槛通过后才推送该测试过的本地镜像并记录 digest；同 workflow 组合精确版本 manifest、打包 Shell/Framework/OpenAPI 及许可与构建元数据，并生成实际发行附件的 SHA256SUMS；部署文件留在项目根目录。

本次 Windows 实现环境没有 Docker daemon。已运行的本地配置解析、JSON5/迁移/ZIP/密码 wrapper 单测和资源下载校验，不当成容器实际启动证据。上述云端 smoke 未使用真实 QQ 登录，不证明账号可用、聊天或媒体消息成功；这些另行人工验收。当前按用户要求只改本地源码，不执行 commit/push/创建线上 Release。

GitHub Packages [公开可见性](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility)独立于仓库权限，首次发布需另设 Public 才可匿名拉取；工作流检测写 warning/summary。根 [`.env.example`](<../.env.example>) 只是可选覆盖模板，部署时可复制为 `.env`；配置文件不作为线上 Release 附件。

## 许可范围

完整保留原 [NapCat Limited Redistribution License](../LICENSE)，此次没有新增项目级 MIT 授权。第三方原有 MIT/Apache-2.0、Tencent QQ、AstrBot及系统组件许可独立保留；OCI license 明确混合范围而非全镜像 MIT。[第三方声明](../THIRD_PARTY_NOTICES.md)、源嵌套许可、JSON5 及其他 npm 原许可随 Classic 发行包和容器保留。
