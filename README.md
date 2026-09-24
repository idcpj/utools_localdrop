# LocalDrop

基于 React、Tailwind CSS 和 Node.js 的 uTools 局域网分享插件。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建完成后，`dist/` 是完整的可安装 uTools 插件目录，直接在 uTools 开发者工具中选择该目录即可安装。目录内包含 `plugin.json`、`index.html`、`site.html`、`logo.png`、`plugin.js`、`preload.js`、`package.json`、`server/` 和构建后的静态资源。

## 验证

```bash
npm test
```

测试覆盖站点密码、分享列表、文件夹浏览、文件下载和上传保存。

## 使用约定

- 文件与目录分享引用原始路径，不复制源文件。
- 从文件或文件夹触发 uTools 分享时，插件会直接添加分享项；服务未运行时会自动启动。
- 分享列表中，文件复制的是带下载令牌的 API 直链，可直接交给 `wget` 下载；目录复制的是站点目录地址。每个项目都有二维码，文件二维码也直接指向下载直链。
- 右上角显示服务状态，手动启停、网络、上传和站点密码集中在“设置”中。
- 网页上传默认关闭，开启后保存到插件数据目录的 `uploads/`。
- 服务仅在 uTools 运行期间提供，停止服务或退出 uTools 后局域网访问会中断。
- 根目录密码是全站统一密码，密码以哈希形式保存。
- 公网临时分享使用 Cloudflare Quick Tunnel，必须先设置站点密码并手动开启；公网文件下载直链使用独立令牌。停止本地服务、清除站点密码或退出 uTools 时，隧道会关闭。
- 首次启动公网隧道需要联网下载平台对应的 cloudflared 二进制到插件数据目录 `localdrop/bin/`。
