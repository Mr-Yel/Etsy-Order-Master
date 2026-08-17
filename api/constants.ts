/** KST 上游接口地址，由当前 Vite 构建环境的配置文件提供。 */
const configuredKstBaseUrl = import.meta.env.VITE_KST_BASE_URL?.trim();

if (!configuredKstBaseUrl) {
  throw new Error("缺少 KST 接口地址配置：VITE_KST_BASE_URL");
}

export const KST_BASE_URL = configuredKstBaseUrl.replace(/\/+$/, "");
