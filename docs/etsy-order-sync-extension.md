# Etsy 订单同步扩展接入说明

## 构建模式

| 模式 | 行为 |
| --- | --- |
| `observe` | 只监听、解析、校验并记录事件，不发送 BFF 请求 |
| `submit` | 将确认成功的事件直接提交到 PodBack BFF |

测试构建 `pnpm build:test` 会强制使用 `observe`，即使配置成 `submit` 也不会提交。

正式启用需要：

```dotenv
VITE_ETSY_ORDER_SYNC_MODE=submit
VITE_ETSY_ORDER_SYNC_BFF_KEY=<PodBack 插件入口 Key>
```

接口基地址复用 `VITE_POD_API_BASE_URL`。默认三个环境均为 `observe`，未提供 BFF Key 前不会提交。

## 监听的 Etsy 接口

取消订单：

```text
POST /api/v3/ajax/shop/{shopId}/order/refund-and-cancel/{receiptId}
```

成功条件：

```text
HTTP 2xx
refund.success === true
cancel.success === true
```

批量完成：

```text
POST /api/v3/ajax/bespoke/shop/{shopId}/mission-control/order-state/batch-complete
```

成功条件按订单逐个判断：

```text
HTTP 2xx
订单号在 response.success 中
订单号不在 response.errors 中
```

## PodBack BFF

通过网关调用：

```text
POST https://kstgl.kesiteng.cn/pod-api/bff/v1/kst/etsy-order-cancellations
POST https://kstgl.kesiteng.cn/pod-api/bff/v1/kst/etsy-order-completions
```

请求头：

```http
Authorization: Bearer {当前 KST Token}
x-bff-key: {插件 BFF 入口 Key}
Content-Type: application/json
```

取消订单请求：

```json
{
  "requestId": "etsy-cancel-order-...",
  "etsyOrderId": "4237878202",
  "cancellationReason": "Buyerandshopowneragreedtocanceltransaction",
  "etsyResult": {
    "httpStatus": 200,
    "refundSuccess": true,
    "cancelSuccess": true
  }
}
```

批量完成请求：

```json
{
  "requestId": "etsy-batch-complete-...",
  "orders": [
    {
      "etsyOrderId": "4237878202",
      "trackingNumber": "YT2640321437765373",
      "carrier": "YunExpress"
    }
  ]
}
```

批量完成只包含 Etsy 响应确认成功的订单。`orders` 与 `etsyOrderIds` 二选一，扩展当前固定使用带运单信息的 `orders`。

## 响应与失败

成功响应必须同时满足：

```text
HTTP 202
success === true
code === 202
data.accepted === true
```

扩展会读取 `data.jobId` 和 `data.acceptedCount` 用于日志，但不轮询任务，也不等待 KST 最终处理结果。

非 2xx、非 202、`accepted !== true`、队列已满或网络失败都只记录为本地失败，不回滚 Etsy 已完成的操作，也不自动重试。
