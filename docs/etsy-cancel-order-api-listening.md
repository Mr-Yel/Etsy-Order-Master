# Etsy 取消订单接口监听说明

## 1. 文档范围

本文只说明 Etsy 取消订单相关接口、可获取数据以及浏览器扩展如何监听，不包含 KST 订单查询、KST 订单取消或 KST 订单日志处理。

这里描述的接口是 Etsy 商家后台页面使用的内部 AJAX 接口，不是 Etsy 对外公开的 Open API。接口路径和字段可能随 Etsy 页面版本调整，因此监听逻辑需要按固定路径匹配，并保留无法解析时的日志。

## 2. 核心结论

1. Etsy 实际提交取消订单的接口是 `refund-and-cancel`。
2. 接口路径中的最后一个参数是 Etsy 订单号 `receiptId`，例如 `4237878202`。
3. 这份流程中未发现“先使用订单号换取独立取消任务 ID”的请求。
4. HTTP 状态码为 200 不能直接代表退款和取消都成功。
5. 必须同时满足 `refund.success === true` 和 `cancel.success === true`，才能认定取消成功。
6. 浏览器扩展需要在页面主世界监听 `fetch` 和 `XMLHttpRequest`，不能只依赖页面 DOM 或 URL 变化。
7. 接口成功后 Etsy 很快会跳转到成功页，监听方应立即把结果交给后台任务处理。

## 3. Etsy 页面请求流程

```text
打开 Etsy 取消订单页面
  GET /api/v3/ajax/bespoke/shop/{shopId}/cancel-order-data?receipt_id={receiptId}
        |
        v
用户选择取消原因并确认取消
  POST /api/v3/ajax/shop/{shopId}/order/refund-and-cancel/{receiptId}
        |
        v
Etsy 返回退款和取消结果
        |
        v
页面跳转
  /your/orders/{receiptId}/cancel_order/success
```

### 3.1 取消页数据接口

用于加载取消原因、订单金额、商品和退款摘要等信息。

```http
GET https://www.etsy.com/api/v3/ajax/bespoke/shop/{shopId}/cancel-order-data?receipt_id={receiptId}
```

示例响应：

```json
{
  "order": {
    "receiptId": 4237878202,
    "buyerName": "<buyer name>",
    "buyerUserName": "<buyer username>",
    "convoId": 1719825866,
    "itemCount": 1
  },
  "transactions": [
    {
      "item": {
        "name": "<item name>",
        "image": "<image url>",
        "sku": "<sku>"
      },
      "quantity": 1,
      "price": "$21.99"
    }
  ],
  "summary": {
    "hasRefund": false,
    "isFullyRefunded": false,
    "orderTotalString": "$26.98",
    "refundBuyerDueString": "$26.98"
  },
  "cancelReasons": [
    "Shopownerdeclinessale",
    "Buyerandshopowneragreedtocanceltransaction",
    "Shopownercannotcompletetransaction",
    "Itemwaslostinthemail",
    "Itemreturnedtosellerrefundgiventobuyer"
  ]
}
```

该接口不是执行取消的接口，但可以用于确认页面上下文：

- `order.receiptId`：Etsy 订单号。
- `order.convoId`：Etsy 会话 ID，不是取消任务 ID。
- `summary.hasRefund`：是否已有退款。
- `summary.isFullyRefunded`：是否已全额退款。
- `cancelReasons`：当前订单可选的取消原因。

### 3.2 实际取消订单接口

接口名称：`refund-and-cancel`

```http
POST https://www.etsy.com/api/v3/ajax/shop/{shopId}/order/refund-and-cancel/{receiptId}
Content-Type: application/json
```

路径参数：

| 参数 | 含义 | 示例 |
|---|---|---|
| `shopId` | Etsy 店铺 ID | `26724826` |
| `receiptId` | Etsy 订单号 | `4237878202` |

请求体：

```json
{
  "cancellation_reason": "Buyerandshopowneragreedtocanceltransaction",
  "message_to_buyer": "订单取消通知",
  "was_item_returned": false
}
```

请求字段：

| 字段 | 含义 |
|---|---|
| `cancellation_reason` | 取消原因代码 |
| `message_to_buyer` | 发送给买家的消息 |
| `was_item_returned` | 买家是否已退回商品 |

成功响应示例：

```json
{
  "refund": {
    "success": true,
    "reason": ""
  },
  "cancel": {
    "success": true,
    "reason": ""
  },
  "errorMsg": null,
  "errorAlert": null,
  "receiptTotalDetails": {
    "grandTotal": {
      "amount": 2698,
      "divisor": 100,
      "currencyCode": "USD"
    },
    "adjustedTotal": {
      "amount": 0,
      "divisor": 100,
      "currencyCode": "USD"
    },
    "refund": {
      "amount": 2698,
      "divisor": 100,
      "currencyCode": "USD"
    }
  }
}
```

响应字段：

| 字段 | 含义 |
|---|---|
| `refund.success` | 退款是否成功 |
| `refund.reason` | 退款失败原因 |
| `cancel.success` | 订单取消是否成功 |
| `cancel.reason` | 取消失败原因 |
| `errorMsg` | 接口错误信息 |
| `errorAlert` | 需要展示的异常提示 |
| `receiptTotalDetails` | 订单总额、调整后总额和退款金额 |

取消成功的准确判定条件：

```text
HTTP 状态码在 200 到 299 之间
且 response.refund.success === true
且 response.cancel.success === true
```

以下情况不能视为完整成功：

```text
HTTP 200，但 refund.success === false
HTTP 200，但 cancel.success === false
HTTP 200，但响应不是合法 JSON
HTTP 非 2xx
请求被取消或没有拿到响应体
```

## 4. 可以获取的数据

监听取消请求和响应后，可以获取：

| 数据 | 来源 |
|---|---|
| Etsy 店铺 ID | 请求 URL 路径 |
| Etsy 订单号 `receiptId` | 请求 URL 路径 |
| 取消原因代码 | 请求体 `cancellation_reason` |
| 给买家的消息 | 请求体 `message_to_buyer` |
| 是否退回商品 | 请求体 `was_item_returned` |
| HTTP 状态码 | 响应状态 |
| 退款结果 | 响应中的 `refund` |
| 取消结果 | 响应中的 `cancel` |
| 接口错误信息 | 响应中的 `errorMsg`、`errorAlert` |
| 退款金额 | 响应中的 `receiptTotalDetails` |
| 请求发生时间 | 监听方本地时间 |

建议为每次请求生成一个监听侧唯一标识：

```text
requestId
```

`requestId` 由监听程序自己生成，用于把请求上下文和响应结果关联起来，不是 Etsy 返回的取消任务 ID。

## 5. 浏览器扩展监听方式

### 5.1 必须运行在页面主世界

内容脚本通常运行在隔离环境，无法直接替换 Etsy 页面自己的 `window.fetch` 和 `window.XMLHttpRequest`。

因此需要向 `https://www.etsy.com/*` 页面主世界注入监听脚本，并做到：

1. 在 Etsy 页面发起取消请求前完成 `fetch` 和 `XMLHttpRequest` 包装。
2. 只监听目标接口，不修改请求参数和响应结果。
3. 不主动重放或重新发送 Etsy 取消接口。
4. 捕获结果后通过 `window.postMessage` 发送给内容脚本。
5. 内容脚本再把结果发送给扩展后台。

### 5.2 接口匹配规则

只匹配以下路径：

```text
^/api/v3/ajax/shop/(?<shopId>\d+)/order/refund-and-cancel/(?<receiptId>\d+)$
```

匹配要求：

- 域名必须是 `www.etsy.com`。
- HTTP 方法必须是 `POST`。
- `shopId` 和 `receiptId` 必须都是数字。
- 不符合该路径的请求不处理。

### 5.3 监听 fetch

监听流程：

1. 保存原始 `window.fetch`。
2. 替换 `window.fetch`。
3. 从 `Request` 或 `init` 中读取 URL 和方法。
4. 判断是否命中 `refund-and-cancel` 路径。
5. 命中后克隆请求并读取请求体，不能消费页面原始请求体。
6. 生成本地 `requestId`。
7. 保存 `requestId`、`shopId`、`receiptId`、请求体等上下文。
8. 调用原始 `fetch`。
9. 克隆响应并读取响应文本，不能消费页面原始响应流。
10. 使用同一个 `requestId` 发送请求和响应事件。

示意代码：

```js
const originalFetch = window.fetch;

window.fetch = async function (input, init) {
  const url = typeof input === "string" ? input : input?.url;
  const method = (init?.method || input?.method || "GET").toUpperCase();
  const match = getRefundAndCancelMatch(url, method);

  if (!match) {
    return originalFetch(input, init);
  }

  const requestId = createRequestId();
  const requestBody = await readRequestBodyWithoutConsuming(input, init);

  postToContentScript({
    type: "etsy-cancel-request",
    requestId,
    url,
    method,
    shopId: match.shopId,
    receiptId: match.receiptId,
    requestBody
  });

  const response = await originalFetch(input, init);
  const responseBody = await response.clone().text();

  postToContentScript({
    type: "etsy-cancel-response",
    requestId,
    url,
    method,
    status: response.status,
    ok: response.ok,
    shopId: match.shopId,
    receiptId: match.receiptId,
    responseBody
  });

  return response;
};
```

### 5.4 监听 XMLHttpRequest

部分页面可能使用 `XMLHttpRequest`。需要包装：

1. `XMLHttpRequest.prototype.open`：记录方法和 URL。
2. `XMLHttpRequest.prototype.send`：判断是否命中目标接口并记录请求体。
3. `loadend`：读取状态码和响应内容。
4. 使用同一个 `requestId` 发送请求和响应事件。

读取响应时需要兼容：

```text
xhr.responseType === "" 或 "text" 时读取 xhr.responseText
xhr.responseType === "json" 时读取 xhr.response
```

### 5.5 请求和响应关联

页面主世界维护一个临时映射：

```text
requestId -> {
  shopId,
  receiptId,
  requestBody,
  startedAt
}
```

响应到达后：

1. 通过 `requestId` 找到请求上下文。
2. 合并请求体和响应体。
3. 判断退款和取消是否都成功。
4. 判断完成后删除临时映射。
5. 无法关联到请求上下文的响应应丢弃并记录调试信息。

## 6. 发送给内容脚本的消息结构

请求事件示例：

```json
{
  "source": "page",
  "type": "etsy-cancel-request",
  "requestId": "etsy-cancel-1795228154574-abc123",
  "url": "https://www.etsy.com/api/v3/ajax/shop/26724826/order/refund-and-cancel/4237878202",
  "method": "POST",
  "shopId": "26724826",
  "receiptId": "4237878202",
  "requestBody": "{\"cancellation_reason\":\"Buyerandshopowneragreedtocanceltransaction\",\"message_to_buyer\":\"订单取消通知\",\"was_item_returned\":false}"
}
```

响应事件示例：

```json
{
  "source": "page",
  "type": "etsy-cancel-response",
  "requestId": "etsy-cancel-1795228154574-abc123",
  "url": "https://www.etsy.com/api/v3/ajax/shop/26724826/order/refund-and-cancel/4237878202",
  "method": "POST",
  "status": 200,
  "ok": true,
  "shopId": "26724826",
  "receiptId": "4237878202",
  "responseBody": "{\"refund\":{\"success\":true},\"cancel\":{\"success\":true}}"
}
```

## 7. 内容脚本转发给后台

内容脚本收到请求和响应事件后进行关联和校验，只有在完整成功时发送后台任务：

```json
{
  "type": "ETSY_CANCEL_ORDER_SUCCEEDED",
  "payload": {
    "requestId": "etsy-cancel-1795228154574-abc123",
    "shopId": "26724826",
    "receiptId": "4237878202",
    "cancellationReason": "Buyerandshopowneragreedtocanceltransaction",
    "messageToBuyer": "订单取消通知",
    "wasItemReturned": false,
    "refundSuccess": true,
    "cancelSuccess": true,
    "httpStatus": 200,
    "response": {
      "refund": {
        "success": true,
        "reason": ""
      },
      "cancel": {
        "success": true,
        "reason": ""
      },
      "errorMsg": null,
      "errorAlert": null,
      "receiptTotalDetails": {
        "grandTotal": {
          "amount": 2698,
          "divisor": 100,
          "currencyCode": "USD"
        },
        "adjustedTotal": {
          "amount": 0,
          "divisor": 100,
          "currencyCode": "USD"
        },
        "refund": {
          "amount": 2698,
          "divisor": 100,
          "currencyCode": "USD"
        }
      }
    }
  }
}
```

不能在页面主世界或内容脚本中等待后续业务处理完成。Etsy 跳转后内容脚本可能被销毁，因此消息发送给后台后，应由后台独立完成任务。

## 8. 成功判定逻辑

```js
function isCancellationSuccessful(status, payload) {
  return (
    status >= 200 &&
    status < 300 &&
    payload?.refund?.success === true &&
    payload?.cancel?.success === true
  );
}
```

如果只满足 HTTP 200，但退款或取消任一失败，不能向下游发送“取消成功”。

## 9. 边界处理

| 场景 | 处理 |
|---|---|
| 请求 URL 不匹配 | 不影响页面请求，直接放行 |
| HTTP 非 2xx | 不发送取消成功事件，记录失败原因 |
| 响应不是 JSON | 不发送取消成功事件，记录原始响应摘要 |
| `refund.success=false` | 视为退款失败，不能视为完整取消成功 |
| `cancel.success=false` | 视为取消失败，不能视为完整取消成功 |
| 请求体为空或不是字符串 | 仍可监听 URL，但取消原因等字段为空 |
| `Request` 请求体 | 使用 `clone().text()` 读取，不能消费原始请求 |
| 响应流 | 使用 `response.clone().text()` 读取，不能消费页面响应 |
| 同时存在 fetch 和 XHR 包装 | 每个请求只处理一次 |
| 同一次响应被多个通道上报 | 内容脚本或后台按 `requestId` 去重 |
| 页面立即跳转 | 主世界发出响应事件后，内容脚本立即转交后台 |
| 多标签页同时取消 | `requestId` 必须全局唯一，并携带页面 URL 或标签页标识 |
| 找不到请求上下文 | 丢弃响应并记录调试信息 |
| Etsy 修改接口路径 | 记录未识别请求，不要错误匹配其他取消或退款接口 |

## 10. 不应执行的操作

1. 不应从扩展中主动构造并重放 `refund-and-cancel` 请求。
2. 不应读取或长期保存 Etsy 的 CSRF Token。
3. 不应依赖 `convoId` 作为订单号或取消任务 ID。
4. 不应通过按钮坐标或模拟鼠标点击判断取消是否成功。
5. 不应将 Etsy 成功页 URL 作为唯一成功依据。

## 11. 最终可交付给下游的数据

```json
{
  "requestId": "etsy-cancel-1795228154574-abc123",
  "shopId": "26724826",
  "receiptId": "4237878202",
  "cancellationReason": "Buyerandshopowneragreedtocanceltransaction",
  "messageToBuyer": "订单取消通知",
  "wasItemReturned": false,
  "httpStatus": 200,
  "refundSuccess": true,
  "cancelSuccess": true,
  "refundReason": "",
  "cancelReason": "",
  "errorMsg": null,
  "errorAlert": null,
  "refundAmount": {
    "amount": 2698,
    "divisor": 100,
    "currencyCode": "USD"
  },
  "occurredAt": "2026-11-21T02:29:14.574Z",
  "pageUrl": "https://www.etsy.com/your/orders/4237878202/cancel_order?use_history=true"
}
```

## 12. 分析依据

本文基于以下 HAR 文件中的实际请求和响应整理：

```text
D:\download\下载\取消流程 www.etsy.com.har
```

关键请求时间：

```text
2026-11-21T02:27:27.890Z
GET cancel-order-data?receipt_id=4237878202

2026-11-21T02:29:14.574Z
POST refund-and-cancel/4237878202

2026-11-21T02:29:17Z
页面跳转至 cancel_order/success
```
