const configuredPodBackBaseUrl =
  import.meta.env.VITE_POD_API_BASE_URL?.trim();
const configuredPodBackApiKey = import.meta.env.VITE_POD_API_KEY?.trim();

export const POD_BACK_BASE_URL = (configuredPodBackBaseUrl ?? "").replace(
  /\/+$/,
  ""
);
export const POD_BACK_API_KEY = configuredPodBackApiKey ?? "";

export function requirePodBackConfig(): void {
  if (!POD_BACK_BASE_URL) {
    throw new Error("缺少 PodBack 接口地址配置：VITE_POD_API_BASE_URL");
  }
  if (!POD_BACK_API_KEY) {
    throw new Error("缺少 PodBack API Key 配置：VITE_POD_API_KEY");
  }
}
