# 后端接口契约

扩展只依赖下面这组接口。任何实现（自建、官方、测试用的 mock）只要满足本文件，就能和
这个客户端配合工作。请求地址统一为 `${WXT_SITE_BASE}/api/...`。

## 通用约定

- 请求与响应均为 JSON，`Content-Type: application/json`。
- 已登录请求带 `Authorization: Bearer <token>`；令牌由连接握手签发，不是 Cookie。
- 失败响应统一为 `{ "error": "给用户看的中文文案" }`，并带对应状态码。
- 扩展把请求放在后台 Service Worker 里发出（`host_permissions` 覆盖后端源），
  因此服务端不需要为扩展做 CORS 预检；但如果你额外校验 `Origin`，它会是
  `chrome-extension://<扩展 ID>`（Firefox 为 `moz-extension://<UUID>`）。
- 时间戳统一为毫秒（`Date.now()`）。

扩展读取的字段很少，**多余字段可以忽略**：实现方返回的 JSON 可以更宽。

## 1. 探测登录态

```http
GET /api/auth/me
Authorization: Bearer <token>
```

| 状态 | 响应 | 扩展的行为 |
| --- | --- | --- |
| 200 | `{ "id": 1, "email": "a@b.c", "role": "user", "created_at": 1700000000000 }` | 视为已连接 |
| 401 | `{ "error": "..." }` | 视为未连接，显示「连接账号」 |
| 其他 | 任意 | 显示错误，但保留已知用户 |

`id` 必须是数字，扩展用它判断响应是否有效。

## 2. 上传书签快照

```http
POST /api/upload
Authorization: Bearer <token>
Content-Type: application/json

{
  "device": {
    "id": "b1e2...",          // 扩展生成的随机 UUID（紧凑格式）
    "browser": "chrome",
    "version": "141.0.7390.55",
    "platform": "Windows"
  },
  "bookmarks": [ /* browser.bookmarks.getTree() 的原始结构 */ ],
  "exportedAt": 1700000000000
}
```

`bookmarks` 是浏览器原生书签树数组（根节点的 `children` 递归）。节点形如：

```json
{
  "id": "1",
  "title": "书签栏",
  "children": [
    { "id": "42", "title": "MDN", "url": "https://developer.mozilla.org", "dateAdded": 1700000000000 }
  ]
}
```

成功响应：

```json
{
  "ok": true,
  "uploadId": 12,
  "deviceId": "b1e2...",
  "count": 48,
  "uploadedAt": 1700000001000,
  "exportedAt": 1700000000000,
  "removed": 0
}
```

`count` 是扁平化后的链接数，`removed` 是因配额被清理的旧快照数（没有配额逻辑时返回 0 即可）。

建议限制：请求体 ≤ 8 MB、扁平后 ≤ 10000 条，超出返回 `413`；频率限制返回 `429`
并带 `Retry-After`。

## 3. 列出快照

```http
GET /api/uploads?limit=20
Authorization: Bearer <token>
```

```json
{
  "uploads": [
    {
      "id": 12,
      "device_id": "b1e2...",
      "browser": "chrome",
      "browser_version": "141.0.7390.55",
      "entry_count": 48,
      "created_at": 1700000001000
    }
  ],
  "limit": 20,
  "offset": 0
}
```

按 `created_at` 倒序。扩展只使用 `uploads` 数组，字段名保持 snake_case。

## 4. 读取一份快照

```http
GET /api/uploads/:id
Authorization: Bearer <token>
```

```json
{
  "id": 12,
  "device_id": "b1e2...",
  "browser": "chrome",
  "browser_version": "141.0.7390.55",
  "entry_count": 48,
  "created_at": 1700000001000,
  "data": [ /* 上传时的原始书签树 */ ],
  "entries": [{ "title": "MDN", "url": "https://developer.mozilla.org", "folder": "技术" }]
}
```

扩展只读 `data`（必须是数组）。`entries` 供搜索功能使用，扩展的恢复流程不需要它。
不属于当前用户的记录返回 `404`（不要返回 403，避免泄露记录是否存在）。

## 5. 连接握手：领取令牌

两步：

1. 扩展本地生成 32 字节随机 `state`，打开 `${SITE_BASE}/extension-auth?state=...`。
2. 用户在网页端登录并确认后，网页调用 `POST /api/auth/extension/authorize`（需要网页会话），
   服务端保存 `state` 的**摘要**，例如 10 分钟内有效、单次使用。
3. 扩展回到前台后调用下面的接口换取自己的令牌。

```http
POST /api/auth/extension/claim
Content-Type: application/json

{ "state": "64 位十六进制字符串" }
```

成功：

```json
{
  "token": "<30 天有效的令牌>",
  "user": { "id": 1, "email": "a@b.c" }
}
```

失败：`400`（无效/过期/已领取）、`429`（限流，带 `Retry-After`）。

服务端实现要点（推荐，不是硬性要求）：

- 只存 `state` 的哈希，不存明文。
- 领取时原子占用（`UPDATE ... WHERE claimed_at IS NULL`），防重放。
- 令牌与网页会话分开吊销；改密码时让插件令牌一起失效。

## 6. 网页端页面（非 API）

扩展会打开两个网页地址，实现方需要准备：

| 路径 | 用途 |
| --- | --- |
| `/extension-auth?state=...` | 用户确认连接的页面 |
| `/account` | 已连接用户点「个人主页」时打开 |

纯本地构建不会打开这两个地址。

## 可选接口

网页端管理界面还会用 `/api/uploads/search`、`/api/devices` 等接口；扩展**不调用**它们，
但兼容实现通常会一并提供。搜索接口的响应形状是
`{ "results": [...], "total": 0, "limit": 20, "offset": 0 }`。

## 最小实现清单

只要实现下面四个接口，扩展的「连接 → 上传 → 恢复」就能跑通：

- `GET /api/auth/me`
- `POST /api/upload`
- `GET /api/uploads`
- `GET /api/uploads/:id`
- `POST /api/auth/extension/claim`（连接账号必需）
- 网页端 `/extension-auth`（连接账号必需）

写实现时可以参考 `test/` 里的假数据：`restore-core.test.ts` 的
`SnapshotNode` 就是 `data` 数组的最小形状。
