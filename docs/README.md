# LocalDrop · uTools 插件发布与文档中心

本项目 `docs/` 目录专为管理 **uTools 应用市场发布资料、版本更新、宣传文案及截图物料** 而建立，旨在方便开发者在发布和更新版本时直接对照、复制和维护。

---

## 快速导航

| 对应发布后台字段 | 对应管理文档 | 核心内容说明 |
| :--- | :--- | :--- |
| **V1.0.0 版本说明** | [📄 release-notes.md](./release-notes.md) | 包含各版本**一键复制**更新说明、版本迭代历史与规范 |
| **插件应用介绍** | [📄 app-description.md](./app-description.md) | 包含应用市场**推荐文案**、产品核心亮点、使用方法、FAQ |
| **应用截图 (最多 8 张)** | [🖼️ screenshots-guide.md](./screenshots-guide.md) | 8 张黄金宣传图规划、拍摄脚本、文案设计与截图管理规范 |
| **截图素材存储目录** | [📁 screenshots/](./screenshots/README.md) | 存放实际提交给 uTools 后台的 8 张高质量 PNG 截图文件 |
| **发布与审核自检清单** | [✅ publish-checklist.md](./publish-checklist.md) | 打包构建验证、uTools 审核规范避坑指南、发布步骤 |

---

## 插件基础信息速查

- **插件中文名称**：局域网分享（LocalDrop）
- **英文标识**：`localdrop` / `utools-localdrop`
- **当前发布版本**：`V1.0.0`
- **主功能指令**：`局域网分享`、`localdrop`
- **右键/划词匹配**：
  - 文件/文件夹：`分享文件或文件夹`（匹配文件右键发送至 uTools）
  - 选中文本：`分享选中文本`（匹配任意划词发送至 uTools）
- **核心技术栈**：React 19 + Tailwind CSS + Node.js HTTP Server + Cloudflare Quick Tunnel

---

## 维护建议

1. **版本升级时**：
   - 更新 `package.json` 中的 `version` 字段。
   - 在 [release-notes.md](./release-notes.md) 顶部新增最新版本更新记录。
   - 执行 `pnpm build && pnpm test` 进行打包测试。
2. **功能重大更新时**：
   - 同步更新 [app-description.md](./app-description.md) 中的功能亮点与 FAQ。
   - 检查 [screenshots-guide.md](./screenshots-guide.md) 是否需要替换相关界面截图。
