# 第三方组件与许可

本项目的 **源代码** 使用 MIT（见 [LICENSE](LICENSE)）。构建产物还包含下列第三方
代码，它们各自保留原有许可。分发构建产物时请一并保留本文件。

| 组件 | 用途 | 许可 |
| --- | --- | --- |
| [React](https://github.com/facebook/react) / [React DOM](https://github.com/facebook/react) | UI 运行时 | MIT |
| [lucide-react](https://github.com/lucide-icons/lucide) / [Lucide](https://lucide.dev) | 图标 | ISC |
| [SortableJS](https://github.com/SortableJS/Sortable) | 拖拽排序 | MIT |
| [react-sortablejs](https://github.com/SortableJS/react-sortablejs) | SortableJS 的 React 绑定 | MIT |
| [WXT](https://github.com/wxt-dev/wxt) | 扩展构建框架 | MIT |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | 样式（编译期） | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | 类型检查（编译期） | Apache-2.0 |
| [Biome](https://github.com/biomejs/biome) | 格式化与 lint（开发期） | MIT OR Apache-2.0 |
| [Vitest](https://github.com/vitest-dev/vitest) | 单元测试（开发期） | MIT |

说明：

- Lucide 源自 [Feather](https://github.com/feathericons/feather)（MIT），图标以 ISC 许可发布。
- "编译期/开发期"的组件不会进入扩展运行时代码，但为了完整起见一并列出。
- 每个包的完整许可文本随依赖一起安装，位于 `node_modules/<包名>/LICENSE*`；
  版本与完整依赖树见 `bun.lock`。

如果你重新分发构建产物（zip / 商店包），请保留本文件或等价的第三方声明。
