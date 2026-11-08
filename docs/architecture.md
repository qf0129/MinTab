# 架构说明

## 技术栈

| 层 | 选型 |
| --- | --- |
| 扩展框架 | [WXT](https://wxt.dev)（Manifest V3，Chrome / Edge / Firefox） |
| UI | React 19 + Tailwind CSS 4 |
| 图标 | lucide-react |
| 拖拽 | SortableJS（经 react-sortablejs） |
| 测试 | Vitest（纯逻辑单测，不启动浏览器） |
| 语言/工具链 | TypeScript（strict）+ Biome + Bun |

## 目录

```text
entrypoints/
  background.ts          后台 Service Worker：唯一的网络出口 + 工具栏按钮
  newtab/                新标签页（chrome_url_overrides）
    NewTabApp.tsx        页面状态机：书签树、搜索、设置、上传/连接
    settings/            设置弹窗（账号与同步 / 外观 / 搜索）
components/              书签卡片、文件夹面板、编辑弹窗
hooks/                   书签树的订阅与读取、折叠状态、设置
lib/
  transport.ts           fetch 的唯一入口（经 background 代理）
  backend/               同步后端适配层（见下）
  browser-bookmarks.ts   书签树的纯函数：分组、计数、移动
  restore-core.ts        恢复算法（合并 / 覆盖 / 撤销），含全部单测
  bookmark-transfer.ts   快照类型、HTML 备份生成
  storage.ts             storage.local 读写
  constants.ts           SITE_BASE、PRODUCT_NAME、主题与默认设置
test/                    40 个单元测试
```

## 运行时数据流

```text
browser.bookmarks.getTree()
        │  hooks/use-browser-bookmarks（订阅 onCreated/onRemoved/onChanged）
        ▼
NewTabApp ──► BookmarkBoard / 文件夹面板      （纯本地渲染、编辑、拖拽）
        │
        ├─ 设置 ──► storage.local（mintab_settings / collapsed groups）
        │
        └─ 账号 ──► lib/backend ──► transport.request
                                       │ chrome.runtime.sendMessage
                                       ▼
                              background.ts（读令牌，加 Bearer）
                                       │ fetch
                                       ▼
                              ${WXT_SITE_BASE}/api/*
```

网络调用**只**发生在后台 Service Worker 里。新标签页不持有后端地址（除了用于打开
`/account`、`/extension-auth` 的链接），也不知道令牌长什么样。

## 后端适配层

`lib/backend/` 把"同步"抽象成一个接口（`SyncBackend`），由构建变量选择实现：

| 实现 | 触发条件 | 行为 |
| --- | --- | --- |
| `http` | 默认 | 调用 `${WXT_SITE_BASE}` 上的接口，契约见 [api-contract.md](api-contract.md) |
| `local` | `WXT_BACKEND=local` | 不发任何请求；账号区域显示"纯本地模式" |

接口方法：`me` / `upload` / `listUploads` / `getSnapshot` / `claim`。UI 只依赖这些方法，
因此新增一种后端（例如局域网同步、WebDAV）只需要加一个工厂并在 `index.ts` 里选择。

`local` 构建会把 `http` 实现整段 tree-shake 掉——按当前构建产物验证过，本地版里
不存在 `/api/upload`、`/api/auth/extension/claim` 这些字符串。

## 本地存储

全部在 `browser.storage.local`：

| key | 内容 |
| --- | --- |
| `mintab_settings` | 背景、卡片大小/透明度、搜索引擎、自定义引擎 |
| `mintab_device_id` | 首次使用时生成的随机 UUID |
| `mintab_last_upload` | 上次上传时间（毫秒） |
| `mintab_collapsed_groups` | 折叠的文件夹 id 列表 |
| `mintab_extension_token` | 握手换来的设备令牌 |
| `mintab_pending_link` | 一次性握手 state + 创建时间（15 分钟本地过期） |

不使用 `storage.sync`：设置属于"这台机器"的偏好，不该跨设备覆盖。

## 恢复算法（`restore-core.ts`）

两种模式都遵守"先建后换"：

1. **合并**：按根文件夹语义映射（书签栏 / 其他书签 / 移动设备），同名文件夹复用，
   只添加本地没有的链接（规范化 URL 去重），不删除任何现有节点。本次新建的 id 记入
   journal，撤销时从深到浅删除。
2. **覆盖**：先在各目标根里建临时文件夹并写满快照内容，全部成功后才删除旧内容，
   把临时文件夹的子项上移一级、删掉临时文件夹。任何一步失败只回滚临时文件夹。
   撤销使用操作前抓取的整棵树重建。

两个模式都会在写入前导出 Netscape HTML 备份（覆盖模式强制）。恢复期间暂停书签订阅，
避免几千次 `onCreated` 触发全树重读。

## 权限与安全

- 权限只有 `storage`、`favicon`、`bookmarks`，**没有** `cookies`、`tabs`、`history`。
- 登录走一次性握手：网页端确认 → `state` 换设备令牌；扩展从不读取网页会话 Cookie。
- `state` 是 32 字节随机数；本地 15 分钟后丢弃，服务端建议 10 分钟、单次使用、只存哈希。
- 书签链接只允许 `http:` / `https:` / `ftp:` 协议，其他协议静默忽略，避免
  `javascript:` 之类的注入。
- 站点图标使用浏览器内置的 `_favicon` 接口，不向第三方发送 URL。
- 没有 `eval`、没有远程脚本、没有分析 SDK；MV3 的 CSP 保持默认。

## 构建期配置

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `WXT_SITE_BASE` | 后端 + 网页端地址；同时决定 `host_permissions` | `http://127.0.0.1:8787` |
| `WXT_BACKEND` | `http` 或 `local` | `http` |
| `WXT_PRODUCT_NAME` | manifest 名称、设置面板标题、页面标题 | `MinTab` |
| `WXT_PRODUCT_DESCRIPTION` | manifest 描述 | 内置中文描述 |
| `WXT_STRICT_SITE` | `1` 时，生产构建指向 localhost 直接失败 | 未设置 |

这些变量只影响构建结果，运行时不读取环境（扩展没有运行时环境）。

## 为什么没有状态管理库

页面状态只有三块：书签树（外部数据，靠事件订阅）、设置（少量键值）、弹窗开关。
React 的 `useState` + 两个自定义 hook 足够；引入 Redux/Zustand 只会增加体积和一个
需要同步的副本。添加新功能时优先沿用现有 hook，而不是引入全局 store。
