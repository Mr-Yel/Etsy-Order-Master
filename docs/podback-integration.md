# PodBack 接入流程

本文档说明 Etsy Order Master 如何调用 PodBack。业务页面统一从 `@/api` 引入封装，
不要在组件内直接 `fetch`、拼接 PodBack 地址或读取 API Key。

## 1. 请求链路

```text
Vue / Content Script
        |
        v
api/podback.ts
        |
        v
lib/kst-proxy-client.ts
        |
        +-- 普通 JSON -> runtime.sendMessage
        |
        +-- Blob 文件 -> KST_PROXY_PORT 分片
        |
        v
background
        |
        v
PodBack /pod-api
```

所有 PodBack 请求最终都在 background 中发出，避免 content script 的跨域限制。
KST 和 PodBack 共用代理通道，但通过不同的 `baseUrl` 区分目标服务。

关键文件：

- `api/podback.ts`：PodBack 接口、鉴权模式和请求封装
- `api/podback-constants.ts`：PodBack 地址与配置检查
- `lib/podback-utils.mjs`：请求头、响应解包和错误转换
- `lib/kst-proxy-client.ts`：调用端代理入口
- `lib/kst-proxy-port.ts`：大文件分片传输
- `entrypoints/background.ts`：实际执行网络请求

## 2. 环境配置

构建环境需要提供：

```dotenv
VITE_POD_API_BASE_URL=https://kstgl.kesiteng.cn/pod-api
VITE_POD_API_KEY=<build-time-api-key>
```

PodBack 当前没有独立测试环境，`pnpm dev:test` 和 `pnpm build:test` 仍连接正式 PodBack。
KST 正式环境和测试环境继续由各自的 `VITE_KST_BASE_URL` 控制。

API Key 是构建期配置，会进入扩展安装包。它适用于当前客户端的 API Key 接入方式，
但不能当作真正不可见的服务端秘密。密钥轮换时只修改构建环境，不要写进业务代码或文档。

## 3. 鉴权规则

`requestPodBack()` 根据接口要求选择以下模式：

| 模式 | 请求头 | 适用场景 |
| --- | --- | --- |
| `api-key` | `x-api-key` | 健康检查、SKU 解析、普通上传、订单商品预览图 |
| `optional-kst-token` | `x-api-key` + 可用时的 Bearer token | 渲染素材、渲染任务查询/取消等兼容接口 |
| `required-kst-token` | `x-api-key` + 必须存在的 Bearer token | 生产图模板元素清单、创建生产图渲染任务、`kst` 素材通道 |

规则：

- 调用方不需要手动传 PodBack API Key。
- `required-kst-token` 会先调用现有 `requireLogin()`，未登录时提示并打开登录页。
- 携带 token 的请求遇到 401 时，沿用 KST 登录失效处理。
- 纯 API Key 请求遇到 401 时只抛错误，不会误触发 KST 自动登录。
- 自定义请求头不能覆盖 `x-api-key` 或 `Authorization`，大小写也不允许。

## 4. 订单商品预览图

### 4.1 数据要求

订单商品业务标识必须使用：

```text
${订单ID}-${orderItemProductId}
```

例如：

```text
10023891-7654321
```

一个商品有多张生产图时，固定使用第一张生产图。批量入口只接受 URL，不接受文件。

### 4.2 批量创建

```ts
import {
  createPodBackPreviewRenderBatch,
  type PodBackPreviewRenderBatchItem,
} from "@/api";

const items: PodBackPreviewRenderBatchItem[] = selectedRows.map((row) => ({
  orderId: `${row.orderId}-${row.orderItemProductId}`,
  templateId: row.customizerTemplateId,
  url: row.firstProductionImageUrl,
}));

const result = await createPodBackPreviewRenderBatch(items);

for (const item of result.items) {
  if (!item.ok) {
    // item.error.code / item.error.message 可直接用于单行提示
    console.warn(item.orderId, item.error);
  }
}
```

批量接口允许部分成功。某个商品失败时不要回滚同批其他商品。只对 `ok=true`
且任务状态为 `queued` / `processing` 的商品继续轮询。

### 4.3 单个文件创建

如果业务侧只有本地文件，可以使用单文件模式：

```ts
import { createPodBackPreviewRenderJobFromFile } from "@/api";

const job = await createPodBackPreviewRenderJobFromFile(
  templateId,
  `${orderId}-${orderItemProductId}`,
  imageFile
);
```

文件请求会自动走 Port 分片传输，不需要手动转 base64。

### 4.4 轮询状态

```ts
import { getPodBackPreviewRenderOrderStatuses } from "@/api";

const statuses = await getPodBackPreviewRenderOrderStatuses(activeOrderIds);

for (const status of statuses) {
  const job = status.job;
  if (!job) continue;

  if (job.status === "succeeded") {
    // job.results 是当前任务的全部预览图
    // results 为空表示旧渲染器结果已过期，应允许重新生成
  } else if (job.status === "failed") {
    // 只展示 job.error，不要回退到历史成功结果
  } else if (job.status === "queued") {
    // 可展示 job.queue.ahead
  }
}
```

推荐使用创建或状态接口返回的 `poll.afterMs` 作为轮询间隔。下一次只提交仍处于
`queued` 或 `processing` 的 `orderId`，已完成项不要再查询。

单商品场景可使用：

- `getPodBackPreviewRenderOrderStatus(orderId)`
- `getPodBackPreviewRenderJob(jobId)`
- `getPodBackPreviewRenderOrderCurrent(orderId)`

`current` 是兼容接口，只返回当前有效的成功结果，新页面优先使用状态接口。

## 5. 生产图渲染

生产图链路使用模板 ID、排布方案、元素图片和异步任务。正式出图必须提交任务并轮询，
不能使用预览任务结果代替最终生产图。

### 5.1 查询模板和元素

```ts
import {
  getPodBackRenderTemplateLayouts,
  listPodBackRenderTemplates,
} from "@/api";

const templates = await listPodBackRenderTemplates({
  shopId: String(shopId),
  sku,
  page: 1,
  pageSize: 50,
});

const layoutInfo = await getPodBackRenderTemplateLayouts(templateId);
```

`getPodBackRenderTemplateLayouts()` 会要求有效 KST 登录态。返回值中的 `elementId`、
`elementIndex`、`maxImages`、`hasOriginalImage` 用于构建渲染任务。
`kind=fixed` 的元素使用模板原图，不能传替换图。

### 5.2 准备图片

优先使用公网图片地址：

```ts
const images = [
  {
    elementId: "element_2/0",
    urls: ["https://example.com/production-1.png"],
  },
];
```

本地文件先上传为 `assetId`：

```ts
import { uploadPodBackRenderAssets } from "@/api";

const uploads = await uploadPodBackRenderAssets(files, {
  storageProvider: "local",
  concurrency: 3,
});

const failed = uploads.filter((item) => !item.ok);
const assetIds = uploads
  .filter((item) => item.ok)
  .map((item) => item.asset.assetId);
```

存储通道说明：

- `local`：默认通道，素材保留约 30 分钟，上传后应尽快创建渲染任务。
- `cos`：素材进入对象存储，适合需要较长时间复用的文件。
- `kst`：上传到 KST，必须携带有效 KST token。

`local` / `cos` 只在已有登录态时附带 token，不强制登录。`assetId` 按文件内容生成，
同一文件重复上传是幂等的。

### 5.3 创建渲染任务

```ts
import { createPodBackRenderJob } from "@/api";

const job = await createPodBackRenderJob(templateId, {
  layoutId: layoutInfo.defaultLayoutId,
  images: [
    {
      elementId: "element_2/0",
      assetIds,
    },
  ],
  fitModes: {
    "element_2/0": "contain",
  },
  originalImageVisible: {
    "element_2/0": true,
  },
});
```

封装层会自动生成 `idempotencyKey`，并固定 `showCutline=false`。业务需要跨多次提交
复用一个任务时，可以自行传入稳定的 `idempotencyKey`。

### 5.4 轮询和取消

```ts
import { cancelPodBackRenderJob, getPodBackRenderJob } from "@/api";

const detail = await getPodBackRenderJob(job.jobId);

if (detail.status === "succeeded") {
  // detail.result.url / downloadUrl
} else if (detail.status === "failed") {
  // detail.error.message
} else if (detail.status === "queued") {
  await cancelPodBackRenderJob(detail.jobId);
}
```

任务状态为：

- `queued`
- `processing`
- `succeeded`
- `failed`
- `cancelled`

只有 `queued` 任务可以取消。轮询间隔优先使用接口返回的 `poll.afterMs`。

## 6. 通用接口

```ts
import {
  checkPodBackHealth,
  parsePodBackSkuNames,
  uploadPodBackFile,
} from "@/api";

await checkPodBackHealth();

const parsed = await parsePodBackSkuNames({
  skuNames: ["超细旦/黑/2XL", "法兰绒/全涤/50L*60W INCH"],
});

const uploaded = await uploadPodBackFile(file);
```

## 7. 错误处理

所有 PodBack 请求错误统一为 `PodBackApiError`：

```ts
import { PodBackApiError } from "@/api";

try {
  await createPodBackRenderJob(templateId, payload);
} catch (error) {
  if (error instanceof PodBackApiError) {
    // error.status：HTTP 状态
    // error.code / error.type：业务错误码
    // error.message：可展示的错误信息
  }
}
```

常见错误：

| 错误码 | 场景 |
| --- | --- |
| `MISSING_API_KEY` | 构建配置缺少 API Key |
| `INVALID_API_KEY` | API Key 不正确 |
| `KST_TOKEN_REQUIRED` | 接口需要 KST token |
| `KST_TOKEN_INVALID` | KST token 已失效 |
| `RATE_LIMITED` | 请求频率过高 |
| `TEMPLATE_NOT_FOUND` | 模板不存在 |
| `LAYOUT_NOT_FOUND` | 排布方案不存在 |
| `RENDER_ASSET_EXPIRED` | 本地素材超过保留期，需要重新上传 |
| `RENDER_JOB_NOT_CANCELLABLE` | 任务已开始或已结束，不能取消 |

纯 API Key 请求即使返回 401，也只作为 PodBack 错误处理，不打开 KST 登录页。
携带 KST token 的 401 继续使用现有登录失效处理。

## 8. 新增接口约定

新增 PodBack 接口时：

1. 在 `api/podback.ts` 中通过 `requestPodBack()` 实现。
2. 根据接口要求选择 `api-key`、`optional-kst-token` 或 `required-kst-token`。
3. 文件使用 `formFile`，不要把大文件转换为 base64 后走普通消息。
4. 在 `api/index.ts` 导出函数和相关类型。
5. 为纯函数逻辑补充 `tests/*.test.mjs`。
6. 组件只调用 `@/api` 导出，不直接访问 PodBack 地址或 API Key。

## 9. 当前业务接入边界

本次提交完成的是 PodBack API 层和 background 代理接入，尚未在订单图片导出页面增加
具体 PodBack 按钮。接入页面前还需要确定：

- 订单商品的 `orderItemProductId`
- 商品对应的 `customizerTemplateId`
- 首张生产图的获取方式
- 预览图生成入口放在单商品、批量导出还是两个入口都提供
