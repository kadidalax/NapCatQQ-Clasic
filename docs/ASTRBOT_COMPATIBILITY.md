<!-- License: see repository LICENSE; external components retain their original licenses. -->
# AstrBot 联部署兼容性基线

本文件记录联部署模板选型的实取元数据和固定版本源码契约。模板：[astrbot.yml](<../astrbot.yml>)；运行配置：[环境样例](<../.env.example>)。

## 1. 镜像与来源

| 项目 | 已核验值 |
| --- | --- |
| AstrBot Release | `v4.29.4`，稳定发行 |
| 对应源码提交 | `61335414433db721b3f7ecc93f90deafe0a59d78` |
| 镜像 | `soulter/astrbot:v4.29.4` |
| OCI index digest | `sha256:72f341f0ffcf6621ef820277642c5d63955f7beeac3683433ce09cac96379c78` |
| 运行平台 | `linux/amd64`、`linux/arm64` |
| 进程 | 默认 root；`WorkingDir=/AstrBot`；`CMD=["python","main.py"]`；无 image entrypoint |
| Python | `3.12.16`，系统 Python |
| 暴露端口元数据 | `6185/tcp` |

固定引用：

```text
soulter/astrbot:v4.29.4@sha256:72f341f0ffcf6621ef820277642c5d63955f7beeac3683433ce09cac96379c78
```

index 内的 `unknown/unknown` attestation 条目不是可运行平台。发布者的 amd64 provenance 记录上述源码提交；该信息已读取，但不等同于验证发布者签名。

来源：[Release](https://github.com/AstrBotDevs/AstrBot/releases/tag/v4.29.4)、[Docker Hub tag](https://hub.docker.com/v2/repositories/soulter/astrbot/tags/v4.29.4)、[Registry manifest](https://registry-1.docker.io/v2/soulter/astrbot/manifests/v4.29.4)、[Dockerfile](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/Dockerfile)。

## 2. 管理界面与首次密码

该版本默认启用管理界面，监听 `0.0.0.0:6185`，初始用户名为 `astrbot`。首次由应用生成随机 24 字符管理密码，并在启动日志输出 `Initial password`，首次登录后更改。

`ASTRBOT_DASHBOARD_INITIAL_PASSWORD` 如果存在，需是非空、至少 8 字符并满足大小写与数字规则。向容器注入空字符串与完全省略该环境变量不同，前者会触发应用校验。联部署包装器应仅移除空值，再执行原 `python main.py`；显式非空值仍由 AstrBot 校验。不要在常规启动中持续启用密码重置选项。

来源：[默认配置](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/core/config/default.py#L264-L293)、[配置初始化](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/core/config/astrbot_config.py#L133-L163)、[管理服务启动](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/dashboard/server.py#L552-L564)。

## 3. OneBot 11 接收端

默认 `platform=[]`。首次必须在 AstrBot WebUI 创建并启用 OneBot v11 / aiocqhttp 平台；镜像本身不自动监听 6199。

相关配置字段：

```json
{
  "id": "qq-classic",
  "type": "aiocqhttp",
  "enable": true,
  "ws_reverse_host": "0.0.0.0",
  "ws_reverse_port": 6199,
  "ws_reverse_token": "与 ONEBOT_ACCESS_TOKEN 相同的值"
}
```

Classic 的目标为 `ws://astrbot:6199/ws`。双方处于同一 Compose 网络，6199 不要求向宿主发布。管理界面 token / 密码与 OneBot 协议凭据分离。

来源：[平台模板](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/core/config/default.py#L372-L379)、[aiocqhttp 平台实现](https://github.com/AstrBotDevs/AstrBot/tree/v4.29.4/astrbot/core/platform/sources/aiocqhttp)。

## 4. 媒体与跨容器路径

- 默认数据目录为 `/AstrBot/data`，临时媒体通常位于 `/AstrBot/data/temp`；插件自行写入 `/tmp` 的文件不在共享数据卷内。
- 常规 Image / Record 转换为 base64，不要求另一容器读取原文件。
- File 的绝对路径可转为 `file:///...`，部分 Video 仍携带本地 URI 或下载地址。
- Classic 本地 `file:` 路径为零拷贝读取。因此本地路径必须在双方容器相同，并对 Classic 的 UID 1000 可读。
- 普通 root-owned `0644` 文件置于 `0755` 目录仍可被 UID 1000 读取；不能仅凭 owner=root 判为不可读。
- `tempfile.mkstemp` 的 POSIX 文件默认是创建者私有 `0600`，调整 umask 不提升权限。应用配置的原子写入也可能生成该权限；不要对整个数据卷递归公开权限。

对于私有临时 File / Video，可配置对下载方可达的 `callback_api_base`（同网示例 `http://astrbot:6185`），让组件转换为 `/api/file/...` 地址。该版本 file token 默认有效期 300 秒、单次使用，下载后或过期即失效；该地址不是永久或可无限重用的媒体链接。

来源：[路径定义](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/core/utils/astrbot_path.py)、[OneBot 媒体转换](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/core/platform/sources/aiocqhttp/aiocqhttp_message_event.py#L38-L68)、[File / Video 组件](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/core/message/components.py)、[file token 服务](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/core/file_token_service.py)、[私有临时图片](https://github.com/AstrBotDevs/AstrBot/blob/v4.29.4/astrbot/core/utils/media_utils.py#L1309-L1321)、[Python tempfile 契约](https://docs.python.org/3.12/library/tempfile.html#tempfile.mkstemp)。

## 5. 验证分类

镜像 tag / digest / 平台 / image config 与源码提交 provenance 属于实际 HTTP 元数据核验；上述密码、配置和媒体规则基于固定版本源码及 Python 接口契约。

这些证据不替代 Linux 容器运行、QQ 登录、OneBot 握手或真实媒体发送验收。实际运行结果由本项目的工作流、部署日志与账号测试单独记录。
