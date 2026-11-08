# 发布与分发

## 版本号

`package.json` 的 `version` 是唯一来源：WXT 会把它写进 manifest，不要在两处各改一次。
发版流程：

```bash
# 1. 改版本（bun 会自动写 package.json）
bun version patch   # 或 minor / major
# 2. 打 tag（release workflow 以此为触发条件）
git push --follow-tags
```

## 构建配置

发布构建必须带真实后端地址。推荐用环境变量注入，而不是提交 `.env.production`：

```bash
# 本地手动发布
WXT_SITE_BASE=https://sync.example.com \
WXT_STRICT_SITE=1 \
bun run build
```

- 未设置 `WXT_SITE_BASE` 时构建会回退到 `http://127.0.0.1:8787` 并**打印警告**。
- 设置 `WXT_STRICT_SITE=1` 后，生产构建指向 localhost 会直接失败（release workflow 默认开启）。
- `WXT_SITE_BASE` 会同时成为 `host_permissions`，改了域名必须重新构建，不能只改配置。

纯本地构建（无账号功能）：

```bash
WXT_BACKEND=local bun run build
```

## 产物

```bash
bun run build          # Chrome MV3 -> .output/chrome-mv3/
bun run build:firefox  # Firefox    -> .output/firefox-mv2/
bun run zip            # 商店用 zip -> .output/*.zip
bun run zip:firefox
```

Chrome / Edge 本地验证：打开 `chrome://extensions` → 开发者模式 → 「加载已解压的扩展程序」
→ 选择 `.output/chrome-mv3`。

## 发布流水线

`.github/workflows/release.yml` 在推送 `v*` tag 时：

1. 用仓库变量 `WXT_SITE_BASE` 构建两个浏览器版本（未配置则直接失败）；
2. 生成 zip 与 SHA256；
3. 创建 GitHub Release 并附上产物。

仓库设置里需要添加：

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| Variable | `WXT_SITE_BASE` | 后端地址，例如 `https://sync.example.com` |

> 用 Variable 而不是 Secret：它会被写进 manifest 的 `host_permissions`，本身不是秘密。

## 商店上架清单

- [ ] 应用图标（`public/icon*.png`）是最终版本，未被 `WXT_PRODUCT_NAME` 之外的品牌残留影响
- [ ] `PRIVACY.md` 发布成可公开访问的 URL，填入商店"隐私政策"字段
- [ ] 权限说明：`bookmarks`（产品核心）、`storage`（本地设置）、`favicon`（站点图标）
- [ ] 单一用途说明与实际功能一致
- [ ] 数据使用声明：会上传书签快照与设备信息（browser/version/platform），需如实勾选
- [ ] 截图与描述；中文与英文各一份（如有）
- [ ] 扩展 ID 固定后，如果后端有 `ALLOWED_EXTENSION_IDS` 之类的白名单，记得更新

## Firefox

- 开发：`bun run dev:firefox`，在 `about:debugging` 里临时加载 `.output/firefox-mv2`。
- 正式分发需要 AMO 签名；自托管签名版需要配置 `browser_specific_settings.gecko.update_url`。
- Firefox 的扩展 ID 与 Chrome 不同，`host_permissions` 的源不受影响，但后端如果按来源
  校验，要把两者都加上。

## Fork 发布

- 用 `WXT_PRODUCT_NAME` 改名，替换 `public/icon*.png`，遵守 [TRADEMARK.md](../TRADEMARK.md)。
- 自己的后端请按 [api-contract.md](api-contract.md) 实现；没有后端就用 `WXT_BACKEND=local`。
- 不要把官方域名写进 fork 的发布构建，否则用户的数据会发到官方实例。
