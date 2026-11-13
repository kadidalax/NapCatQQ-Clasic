# NapCatQQ-clasic WebUI 后端

此内部包继续使用 `napcat-webui-backend` 模块名以保持兼容，由 kadidalax 整理为停止维护的冻结版。

- `/api/base/GetNapCatVersion`、`/api/base/GetProjectInfo` 返回本地版本与冻结身份。
- `/api/base/getLatestTag` 返回当前本地版本，`getAllReleases` 返回空列表和明确的冻结状态；均不访问远端。
- `/api/UpdateNapCat/update` 保留旧响应结构，返回错误码和冻结信息，不下载或覆盖文件。
- 启动时忽略旧 `napcat-update.json` 计划，不读取其中的路径，不修改计划或目标文件。
- 默认插件商店离线；在 WebUI 插件商店中显式添加自定义索引，或设置 `config/webui.json` 的 `pluginStoreSources` URL 数组后才访问这些源。空数组 `[]` 立即恢复离线模式；本地插件导入不受影响。
- 项目状态文案在本地生成；插件缺图标时显示本地首字母，没有自动头像/网站图标请求或安装后推测作者头像下载。插件 README 仅在用户点击“联网加载 README”后读取。
- 图片 Rkey 保留 QQ 原生 `FetchRkey` 优先，默认外部 fallback 关闭；可在启动环境中设置 `NAPCAT_RKEY_FALLBACK_URLS` 为显式 HTTP(S) URL 的 JSON 数组。音乐卡片签名仅使用用户配置的 `musicSignUrl`，没有默认外部服务或隐式备选。
- 仓库与版本由根 `project.json` 和构建环境注入；维护者为 kadidalax，实际仓库为 `kadidalax/NapCatQQ-Clasic`，项目界面品牌保持 `NapCatQQ-clasic`。

完整安装、Docker、构建和许可说明见根文档。本项目保留原根 LICENSE；第三方代码、资产的许可证及来源版权分别按原文保留。
