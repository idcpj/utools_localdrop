# uTools 插件发布与审核自检清单 (Publish Checklist)

在每次提交 uTools 开发者中心发布审核前，请按照此清单逐项自检，以确保 100% 一次性通过审核。

---

## 🔍 发布前核心自检项 (Pre-flight Checklist)

### 1. 静态资源与离线要求（特别重要 ⚠️）
- [x] **无外部网络 JS/CSS 引用**：uTools 官方审核严格禁止 `dist/` 内部直接通过 `<link>` 或 `<script>` 引用未经离线打包的外部 CDN 或网络资源（如 Google Fonts、公共 CDN 等）。所有样式和脚本必须被 Vite 完全打包到本地 `assets/` 目录。
- [x] **页面编码与路径**：所有 HTML、JS 文件均采用 UTF-8 编码，静态资源路径统一使用相对路径 `./`（已在 `vite.config.js` 配置 `base: './'`）。

### 2. 插件元数据与配置 (`plugin.json`)
- [x] **logo.png 图标**：根目录与 `dist/` 下存在规范的 `logo.png`（建议 64×64 或更高分辨率高清图标，无黑边或拉伸失真）。
- [x] **preload 脚本指向**：`plugin.json` 中配置 `"preload": "plugin.js"`，入口配置 `"main": "index.html"`。
- [x] **功能指令规范**：
  - `localdrop`（局域网分享、localdrop）
  - `share-files`（文件右键关联：分享文件或文件夹）
  - `share-text`（文本划词关联：分享选中文本）
- [x] **版本号一致性**：确认 `package.json` 中的 `version` 与发布版本保持一致（如 `1.0.0`）。

### 3. 构建与自动化测试验证
在项目根目录下运行以下命令，确保构建与测试全部通过：

```bash
# 1. 运行构建（包含 Vite 编译及 scripts/package-plugin.cjs 打包）
pnpm build

# 2. 运行自动化测试（覆盖站点验证、密码哈希、分享列表、下载与上传）
pnpm test
```

构建完成后验证 `dist/` 目录，应包含以下完整产物：
- `dist/plugin.json`
- `dist/index.html`
- `dist/site.html`
- `dist/logo.png`
- `dist/plugin.js`
- `dist/preload.js`
- `dist/package.json` (指定 `{"type": "commonjs"}`)
- `dist/server/core.cjs`
- `dist/assets/` (构建后的本地 js 和 css 资源)

---

## 📋 uTools 审核后台表单填报对照

根据发布审核表单，各输入区域对应内容如下：

| 表单输入区域 | 填写指南与对应文档 | 核心注意事项 |
| :--- | :--- | :--- |
| **V1.0.0 版本说明** | 参考 [release-notes.md](./release-notes.md) 中的【直接复制版】 | 列出清晰的功能清单与核心特性，切忌写“日常修复”、“体验优化”等模糊字眼 |
| **插件应用介绍** | 参考 [app-description.md](./app-description.md) 中的【推荐文案】 | 包含痛点、功能特色、使用步骤、FAQ。重点说明免装客户端、局域网安全与隐私 |
| **插件应用截图** | 参考 [screenshots-guide.md](./screenshots-guide.md) 准备 8 张图 | 统一使用 Raycast 暗黑风格，分辨率统一，建议覆盖主界面、多类型、直链、自适应 Web 端等 |

---

## 🛡️ uTools 审核避坑与安全规范

1. **隐私安全声明**：
   - 本插件所有局域网文件传输均基于本地原生 Node.js HTTP 引擎；
   - 随 uTools 启动与关闭，退出即销毁端口，不留常驻后台木马或隐患；
   - 绝不收集、上传任何用户的浏览文件记录或隐私数据。

2. **截图内容合规**：
   - 截图中展示的示例文件、文本或 IP 地址切勿包含真实涉密信息或个人隐私（如真实身份证、企业机密文件路径等）；
   - 截图禁止出现包含其他第三方竞品恶意对比或攻击性文字。

3. **打包文件大小控制**：
   - 打包后插件压缩包大小尽量轻量；内置依赖 `cloudflared` 二进制已优化为按需下载至用户插件数据目录，不占用插件主安装包体积。
