<!-- License: see repository LICENSE and the original component licenses. -->
# 来源与第三方许可

项目：**NapCatQQ-clasic**。维护者：**kadidalax**。仓库：[kadidalax/NapCatQQ-Clasic](https://github.com/kadidalax/NapCatQQ-Clasic)。

## 许可策略

本分支完整保留 [原 NapCat Limited Redistribution License](<./LICENSE>)，未对继承代码作 MIT 重许可。下列组件继续遵循各自原许可证；构建、部署与文档也不新增覆盖原项目的 MIT 授权。

此文件中的链接用于来源追溯和许可证核验，不是推广入口。原项目社群、商业推荐、统计请求及自动更新渠道已移除或关闭。

## 组件来源

| 组件 | 来源与原版权 | 保留文件 / 约束 |
| --- | --- | --- |
| NapCatQQ 核心及加载组件 | [NapNeko/NapCatQQ](https://github.com/NapNeko/NapCatQQ)，Copyright © 2024 Mlikiowa 及源码内贡献者 | [原许可证](<./LICENSE>) 原文保留 |
| WebUI 前端 | Copyright (c) 2024 bietiaop | [原 MIT 许可证](<./packages/napcat-webui-frontend/LICENSE>) |
| napcat-dpapi | Copyright (c) 2023 Xavier Monin | [原 MIT 许可证](<./packages/napcat-dpapi/LICENSE>) |
| 内置插件 | 原作者 NapNeko；本分支维护者 kadidalax | 原作者字段保留，维护者与分发信息分离 |
| Lagrange 参考代码 | [LagrangeDev/Lagrange.Core](https://github.com/LagrangeDev/Lagrange.Core) | 原快照记录的授权不由本分支扩大或转授 |
| 二维码终端渲染 | [gtanner/qrcode-terminal](https://github.com/gtanner/qrcode-terminal)，Gord Tanner / Micheal Brooks；历史代码经过 TypeScript / 模块化适配 | [Apache-2.0 原文及来源声明](<./licenses/qrcode-terminal.LICENSE>) |
| 二维码生成算法 | Copyright (c) 2009 Kazuhiko Arase | [MIT 原文](<./licenses/qrcode-generator.LICENSE>)；其许可来源见二维码终端的原许可证 |
| node-pty 派生组件 | Christopher Jeffrey、Daniel Imms、Microsoft Corporation | [MIT 多作者原文](<./licenses/node-pty.LICENSE>) 与源码原版权头保留 |
| Linux QQ / NTQQ | Tencent QQ | 专有第三方软件；容器构建获取固定版本，保留随附 Electron / Chromium 及其他声明 |
| FFmpeg 与原生运行资源 | 源码中的固定资源及原生二进制 | 各资源原条款独立适用；固定运行资源下载不是核心更新渠道 |
| npm 运行与构建依赖 | [pnpm-lock.yaml](<./pnpm-lock.yaml>) 中的精确解析结果 | 依赖包内许可证与 NOTICE 随运行依赖复制保留 |
| AstrBot 联部署镜像 | [AstrBotDevs/AstrBot](https://github.com/AstrBotDevs/AstrBot) 的独立服务镜像 | 不并入 Classic 协议端许可；按镜像及其项目随附许可证单独分发 |

## 分发要求

- Shell / Framework 包和 Classic 容器保留根许可证、本声明、嵌套组件许可证以及运行依赖中的许可文件。
- 兼容模块名 `napcat-*`、加载器文件名、原版权头和技术历史引用有意保留；它们不是广告。
- 项目名、维护者字段及部署配置的变更不改变原许可证条款。
- AstrBot 与 Classic 是独立容器服务。联合 Compose 配置不把 AstrBot 或 QQ 的许可证替换为 Classic 的许可证。
