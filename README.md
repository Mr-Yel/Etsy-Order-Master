# WXT + Vue 3

This template should help get you started developing with Vue 3 in WXT.

## 开发与构建命令

| 场景       | 命令           | 说明 |
|------------|----------------|------|
| **本地开发** | `pnpm dev`     | 开发模式，带 HMR。 |
| **正式打包** | `pnpm run build` | 生产构建，输出到 `.output/chrome-mv3`（或对应浏览器目录）。 |

其他：`pnpm run build:firefox` 为 Firefox 构建；`pnpm run zip` 可打 zip 包。

## 本地免登录

通过项目根目录的 **`dev-token.txt`** 可在本地免登录（**不区分 dev 还是 build**，有文件就在构建时注入）：

1. 在项目根目录新建 `dev-token.txt`（该文件已加入 `.gitignore`，不要提交）。
2. 文件内容填写一行有效的 KST token。
3. 执行 `pnpm dev` 或 `pnpm run build` 时，若该文件存在且内容非空，扩展会优先使用该 token，无需在登录页输入账号密码。

你本地保留该文件即可；不提交则他人/CI 拉代码后没有该文件，会走正常登录流程。

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar).
