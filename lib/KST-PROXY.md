# KST 接口代理说明

在 content script（如 Etsy 页面内）中直接请求 KST 会触发 CORS，因此通过 **background 代理** 发起请求，由扩展环境代为访问 KST，无跨域限制。

## 结构

| 文件 | 作用 |
|------|------|
| `lib/kst-proxy-types.ts` | 消息类型常量与请求/响应类型，供 background 与调用端共用 |
| `lib/kst-proxy.ts` | **仅 background 使用**：根据 path/query/body/token 请求 KST，返回 JSON |
| `lib/kst-proxy-client.ts` | 调用端使用：`sendKstProxyRequest(req)` 通过 `runtime.sendMessage` 交给 background 执行 |
| `entrypoints/background.ts` | 监听 `KST_PROXY` 消息，调用 `runKstProxyInBackground` 并 `sendResponse` |

## 扩展新接口

### 1. 在 background 侧（无需改 background 本身）

代理是**通用**的：任意 path + method + query/body + token 都会在 `lib/kst-proxy.ts` 里拼 URL 并发起 fetch，无需为每个接口改 background。

### 2. 在 API 层增加“走代理”的封装（推荐）

在 `api/kst-xxx.ts` 中：

- 定义请求/响应类型、常量 path（如 `export const XXX_PATH = "/system/xxx"`）。
- 直接请求：`fetch(BASE_URL + path, ...)`，供 popup/options 等扩展页使用。
- 走代理：`fetchXxxViaProxy(params, token)` 内部调用 `sendKstProxyRequest({ path: XXX_PATH, method, query, token })`，再按业务校验 `code` 并返回类型化结果，供 content script 使用。

示例（平台订单列表已有）：

```ts
// api/kst-platform-orders.ts
export const PLATFORM_ORDERS_LIST_PATH = "/system/platform-orders/list";

export async function fetchPlatformOrdersListViaProxy(params, token) {
  const data = await sendKstProxyRequest<PlatformOrdersListResponse>({
    path: PLATFORM_ORDERS_LIST_PATH,
    method: "GET",
    query: { pageNum: String(params.pageNum), ... },
    token,
  });
  if (data?.code !== 200) throw new Error(data?.msg ?? "请求失败");
  return data;
}
```

### 3. 请求格式（KstProxyRequest）

- `path`: 相对路径，如 `"/system/platform-orders/list"`
- `method`: 可选，默认 `"GET"`
- `query`: 可选，GET 时拼到 URL
- `body`: 可选，POST/PUT 时 JSON 序列化
- `token`: 必填，Bearer token

调用方（content / popup / options）使用 `fetchXxxViaProxy` 或直接 `sendKstProxyRequest(req)` 即可，新接口只需在 `api/` 下按上面模式加一层封装。
