/**
 * 扩展 import.meta.env 类型
 * VITE_EOM_DEV_TOKEN：开发环境下由 dev-token.txt 注入的本地免登录 token
 */
interface ImportMetaEnv {
  readonly VITE_EOM_DEV_TOKEN?: string;
}
