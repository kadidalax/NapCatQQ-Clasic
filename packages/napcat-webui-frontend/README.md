<!-- License: see this component's original LICENSE and the repository license. -->
# NapCatQQ-clasic WebUI

本目录保留包名 `napcat-webui-frontend` 与既有 API 契约。维护者为 **kadidalax**，界面项目身份来自仓库根 [project.json](<../../project.json>)。

## 范围

- QQ / WebUI 登录、OneBot 网络配置、运行日志、文件与插件管理。
- 核心版本检查、在线更新、启动时覆盖更新及上游统计请求固定关闭。
- 插件商店默认无索引源；只请求用户显式配置的 HTTP(S) 索引。
- 关于页使用构建注入的仓库地址、维护者和版本，不从第三方项目获取展示数据。

部署、联部署及发行约束见 [根 README](<../../README.md>)。

## 构建与开发

Node.js 22.22.0、pnpm 9.15.9；从仓库根目录安装已锁定依赖：

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm --filter napcat-webui-frontend run typecheck
```

```bash
pnpm --filter napcat-webui-frontend run build
```

开发代理配置使用 [环境样例](<./.env.example>) 生成本地环境文件：

```bash
cp packages/napcat-webui-frontend/.env.example packages/napcat-webui-frontend/.env.local
```

```bash
pnpm --filter napcat-webui-frontend run dev
```

`VITE_DEBUG_BACKEND_URL` 必须指向已运行的协议端后端。Vite 开发服务只提供界面与代理，不承担 QQ 登录和协议会话。

[身份插件](<../napcat-vite/vite-plugin-version.js>) 离线读取根配置，版本优先 `NAPCAT_VERSION`；仓库地址依次优先 `NAPCAT_REPOSITORY`、`VITE_PROJECT_REPOSITORY`、`GITHUB_REPOSITORY` 和根配置。核心更新状态不开放运行时切换。

## 许可

保留 [本目录原 MIT 许可证](<./LICENSE>)、原版权和组件来源；仓库其他目录的原许可与第三方条款见 [根许可证](<../../LICENSE>) 和 [第三方声明](<../../THIRD_PARTY_NOTICES.md>)。本分支没有新增全仓库 MIT 授权。
