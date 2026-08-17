# WXT + Vue 3

This template should help get you started developing with Vue 3 in WXT.

## 开发与构建命令

| 场景       | 命令           | 说明 |
|------------|----------------|------|
| **本地开发** | `pnpm dev`     | 开发模式，带 HMR。 |
| **正式打包** | `pnpm run build` | 生产构建，输出到 `.output/chrome-mv3`（或对应浏览器目录）。 |
| **测试版开发** | `pnpm run dev:test` | 使用测试接口和独立的页面通信命名空间。 |
| **测试版打包** | `pnpm run build:test` | 输出到 `.output/chrome-mv3-test`，可与正式版同时加载。 |
| **测试版压缩包** | `pnpm run zip:test` | 生成带 `test` 模式标识的测试包。 |

其他：`pnpm run build:firefox` 为 Firefox 构建；`pnpm run zip` 可打 zip 包。

## 测试版本工作流

正式与测试构建由同一份代码生成。需要验证当前代码时：

1. 执行 `pnpm run build:test` 或 `pnpm run zip:test`。
2. Chrome 加载 `.output/chrome-mv3-test`，不要把普通 `build` 输出当作测试包。
3. 仅当需要测试尚未进入正式版本的业务改动时，才从最新 `main` 创建临时测试分支。

测试模式会使用 `.env.test` 中的接口地址，并为页面注入脚本、桥接消息和 DOM
容器添加独立标识。插件名称和页面按钮也会显示“测试版/测试”，用于和正式版区分。

## 本地免登录

通过项目根目录的 **`dev-token.txt`** 可在本地免登录（**不区分 dev 还是 build**，有文件就在构建时注入）：

1. 在项目根目录新建 `dev-token.txt`（该文件已加入 `.gitignore`，不要提交）。
2. 文件内容填写一行有效的 KST token。
3. 执行 `pnpm dev` 或 `pnpm run build` 时，若该文件存在且内容非空，扩展会优先使用该 token，无需在登录页输入账号密码。

你本地保留该文件即可；不提交则他人/CI 拉代码后没有该文件，会走正常登录流程。

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar).
