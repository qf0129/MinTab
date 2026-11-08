# 贡献指南

感谢你愿意改进 MinTab。这个项目优先保证两件事：**用户的书签不能丢**，以及**数据默认
只在本地**。改动如果触碰这两点，请在 PR 里明确说明。

## 环境

- Bun 1.3+（仓库用 `bun@1.3.8`，见 `packageManager`）；Node 20+ 也可以运行大部分脚本
- Chrome / Edge（验证 MV3）；Firefox 用 `bun run dev:firefox`
- 不需要后端：纯本地功能可以直接开发

```bash
bun install          # postinstall 会执行 wxt prepare
cp .env.example .env # 默认指向 http://127.0.0.1:8787
bun dev
```

首次安装会生成 `bun.lock`。如果这个目录已经是独立仓库，请把 `bun.lock` 一并提交，
这样 CI 和其他贡献者拿到的是同一套依赖版本。

打开 `chrome://extensions` → 开发者模式 → 加载 `.output/chrome-mv3-dev`。
改了后台脚本（`entrypoints/background.ts`）后，要在扩展页点一次"重新加载"。

## 开发约定

- **类型**：`strict` + `noUncheckedIndexedAccess`，不要用 `any` 绕过；公共函数写返回类型。
- **格式/lint**：Biome（`bun run lint`、`bun run format`），提交前跑 `bun run lint && bun run check && bun run test`。
- **注释**：代码注释用英文，解释"为什么"而不是"做了什么"；用户可见文案用中文，
  保持与现有 UI 一致。
- **依赖**：新增运行时依赖前先讨论。依赖会在 `bun.lock` 里留下痕迹，也会影响商店审核体积。
- **权限**：不要新增 `permissions` / `host_permissions`。新增权限意味着商店重新审核，
  也会破坏"最小权限"的定位；确有需要请先开 issue 说明理由。

## 测试

测试用 Vitest，全部是纯逻辑单测（不启动浏览器）：

```bash
bun run test
bun run test:watch
```

- 书签树操作（分组、计数、移动）→ `test/browser-bookmarks.test.ts`
- 备份 HTML 与快照类型 → `test/bookmark-transfer.test.ts`
- 恢复算法（合并 / 覆盖 / 撤销 / 根文件夹映射）→ `test/restore-core.test.ts`
- 后端适配层 → `test/backend-local.test.ts`（新增方法时同步补上降级行为）

恢复相关改动**必须**补测试：这个模块直接写用户的真实书签，回归的代价很高。
测试通过 `globalThis.browser` 的假实现模拟浏览器 API，不需要 mock 整个 WXT。

## 修改后端契约

`lib/backend/` 是 UI 与后端之间唯一的缝。加一个方法时按顺序改：

1. `lib/backend/contract.ts` — 接口与类型
2. `lib/backend/http.ts` — 真实实现
3. `lib/backend/local.ts` — 纯本地实现的降级行为（抛错或返回空）
4. `docs/api-contract.md` — 请求/响应形状
5. 相关组件与测试

不要在组件里直接 `fetch` 或直接调用 `transport.request`。

## 提交与 PR

- 一个 PR 做一件事；重构和功能分开，方便 review。
- 提交信息用祈使句，说明改动本身，例如 `fix: keep collapsed state when a folder is renamed`。
- PR 描述里写清：改了什么、为什么、怎么验证（命令 + 手动步骤）、是否影响数据/权限。
- 涉及 UI 的改动请附截图或录屏。
- 不要提交 `.env`、`.env.production`、`.output/`、`.wxt/`、`node_modules/`。

## 文档

- 用户可见行为变化 → 更新 `README.md`
- 架构/存储/权限变化 → 更新 `docs/architecture.md`
- 接口变化 → 更新 `docs/api-contract.md`
- 发布流程变化 → 更新 `docs/release.md`

## 许可证

提交贡献即表示你同意以本仓库的 [MIT 许可](LICENSE) 发布你的改动，并且你有权这样做。
请勿提交来源不明的代码或图标资源。
