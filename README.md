# MinTab

把浏览器原生书签搬进新标签页：打开新页面就能看到全部书签，文件夹分层展示、可直接编辑和
拖拽排序。可选连接一个**自建后端**，把书签快照上传到云端，在另一台设备上合并或覆盖恢复。

这是 **MinTab 的插件端**（浏览器扩展）。后端不在本仓库内，接口契约见
[docs/api-contract.md](docs/api-contract.md)；没有后端也可以用纯本地模式完整使用。

<!-- 有截图后取消注释，并放在 docs/screenshot.png
![新标签页](docs/screenshot.png)
-->

## 功能

- **原生书签，不做第二套数据**：读取 `browser.bookmarks`，新建 / 改名 / 删除 / 拖拽
  都直接写回浏览器，不会产生"插件里的书签"和"浏览器里的书签"两份。
- **文件夹即分组**：按层级展示子文件夹，可折叠，折叠状态本地记忆。
- **搜索**：地址栏风格搜索框，内置 Google / Bing / 百度 / DuckDuckGo，可添加自定义引擎。
- **外观**：10 套内置背景、自定义背景图、卡片大小与透明度。
- **可选同步**（需要兼容后端）：连接账号后上传快照；恢复支持"合并"和"覆盖"两种模式，
  写入前自动导出 Netscape HTML 备份，合并与覆盖都能撤销。
- **隐私优先**：没有 `cookies` 权限、没有分析 SDK、没有远程配置；可以构建成完全离线的版本。

## 快速开始

要求：**Bun 1.3+**（推荐）或 Node.js 20+。

```bash
bun install                 # 自动执行 wxt prepare 生成类型
cp .env.example .env        # 默认后端 http://127.0.0.1:8787
bun dev                     # 监听构建，产物在 .output/chrome-mv3-dev
```

然后在 Chrome 打开 `chrome://extensions` → 打开"开发者模式" → "加载已解压的扩展程序" →
选择 `.output/chrome-mv3-dev`。

`bun dev` 只做构建/监听，不会自动拉起浏览器（`wxt.config.ts` 里 `webExt.disabled = true`）。

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `bun run dev` / `bun run dev:firefox` | 开发构建（Chrome / Firefox） |
| `bun run build` / `bun run build:firefox` | 生产构建 |
| `bun run zip` / `bun run zip:firefox` | 商店用 zip |
| `bun run test` | 单元测试（Vitest） |
| `bun run test:watch` | 监听模式 |
| `bun run check` | TypeScript 类型检查 |
| `bun run lint` / `bun run format` | Biome 检查 / 格式化 |

## 配置

所有配置都是**构建期**变量（扩展没有运行时环境），放在 `.env` / `.env.production`，
或用环境变量注入。示例文件：[.env.example](.env.example)、
[.env.production.example](.env.production.example)。

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `WXT_SITE_BASE` | 后端地址；同时写进 `host_permissions` | `http://127.0.0.1:8787` |
| `WXT_BACKEND` | `http` 或 `local`（纯本地，不联网） | `http` |
| `WXT_PRODUCT_NAME` | 产品名，manifest 与界面同时生效 | `MinTab` |
| `WXT_PRODUCT_DESCRIPTION` | manifest 描述 | 内置中文描述 |
| `WXT_STRICT_SITE` | `1` 时生产构建指向 localhost 直接失败 | 未设置 |

改了 `WXT_SITE_BASE` 必须重新构建：它决定扩展被允许访问哪个源，不是运行时设置。

### 纯本地模式

没有后端、或不想让任何数据离开本机：

```bash
WXT_BACKEND=local bun run build
```

账号区域会显示"纯本地模式"，`http` 实现会被整体 tree-shake 掉，产物里不存在任何
`/api/*` 请求代码。

### 接入自己的后端

实现 [docs/api-contract.md](docs/api-contract.md) 里的接口，然后：

```bash
WXT_SITE_BASE=https://sync.example.com bun run build
```

至少需要 `GET /api/auth/me`、`POST /api/upload`、`GET /api/uploads`、
`GET /api/uploads/:id`、`POST /api/auth/extension/claim`，以及网页端的
`/extension-auth` 页面（登录握手）。纯本地模式不需要其中任何一个。

## 开发

```text
entrypoints/   background（唯一网络出口）+ newtab 页面
components/    书签卡片、文件夹面板、编辑弹窗
hooks/         书签树订阅、折叠状态、设置
lib/           纯逻辑：书签树操作、恢复算法、存储、后端适配层
test/          40 个单元测试（恢复算法、备份格式、书签分组、本地后端）
docs/          接口契约、架构、发布说明
```

更细的设计（数据流、存储 key、恢复算法、权限取舍）见
[docs/architecture.md](docs/architecture.md)。提交前请跑：

```bash
bun run lint && bun run check && bun run test
```

## 隐私与权限

| 权限 | 用途 |
| --- | --- |
| `bookmarks` | 读取、创建、移动、删除书签（产品核心 + 恢复写回） |
| `storage` | 保存设置、设备 id、令牌、折叠状态 |
| `favicon` | 用浏览器缓存的站点图标渲染卡片，不向第三方发请求 |

扩展**不申请** `cookies`：登录通过一次性握手换取设备令牌，从不读取网页会话 Cookie。
没有分析 SDK、广告 SDK 或远程配置。完整说明见 [PRIVACY.md](PRIVACY.md)。
不连接账号时，书签数据不会离开本机。

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请走私密渠道，见 [SECURITY.md](SECURITY.md)。
行为准则见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 许可证与商标

代码以 [MIT](LICENSE) 开源；第三方组件许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

**名称 "MinTab"、应用图标和官方域名不在 MIT 许可范围内**，分发衍生版本前请阅读
[TRADEMARK.md](TRADEMARK.md)：需要改名并更换图标。

---

## English

MinTab is a browser extension that turns your new tab page into a native bookmark board:
folder groups, inline editing, drag-and-drop ordering, and optional sync to a backend
you host yourself.

- **Local-first.** Reading, searching and editing bookmarks never leaves the browser.
  No analytics, no remote config, and the extension deliberately does not request the
  `cookies` permission.
- **Your backend, or none.** The sync API is documented in
  [docs/api-contract.md](docs/api-contract.md). Build with `WXT_BACKEND=local` for a
  fully offline extension with no account features.
- **MIT licensed** code; the name and logo are not (see [TRADEMARK.md](TRADEMARK.md)).

Quick start: `bun install && cp .env.example .env && bun dev`, then load
`.output/chrome-mv3-dev` as an unpacked extension. Requires Bun 1.3+ (or Node 20+).
