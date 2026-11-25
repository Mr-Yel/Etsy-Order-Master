# Etsy 订单完成接口监听说明

## 一、接口概述

### 接口名称

Etsy 卖家后台的订单完成提交接口，对应页面上的“标记订单完成并提交运单”操作。

### 请求方法与路径

```http
POST /api/v3/ajax/bespoke/shop/{shopId}/mission-control/order-state/batch-complete
```

完整 URL 示例：

```text
https://www.etsy.com/api/v3/ajax/bespoke/shop/63724694/mission-control/order-state/batch-complete
```

### URL 匹配规则

建议使用以下规则判断是否为目标接口：

```text
hostname = www.etsy.com
method = POST
pathname 匹配：
^/api/v3/ajax/bespoke/shop/(\d+)/mission-control/order-state/batch-complete$
```

正则捕获结果中的第一个数字为 `shopId`：

```text
/api/v3/ajax/bespoke/shop/63724694/mission-control/order-state/batch-complete
                                  ^^^^^^^^
                                  shopId = 63724694
```

### 接口特点

- 这是一个批量完成接口，请求体支持多笔订单。
- 请求体格式为 `application/x-www-form-urlencoded`。
- 订单 ID 位于请求体，不在 URL 中。
- 接口成功时返回一个 JSON 对象。
- 批量请求可能部分成功、部分失败，因此需要按订单 ID 分别判断。
- 页面刷新、订单列表查询、shipment 查询和导航角标请求都不是订单完成提交接口。

## 二、请求数据结构

### 请求头

目标请求通常包含：

```http
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Origin: https://www.etsy.com
Referer: https://www.etsy.com/your/orders/sold/all
```

请求还可能包含页面自身的 Cookie、CSRF Token 和页面标识。监听时只需要读取请求，不需要修改这些请求头。

### 请求体示例

```text
orders[0][order_id]=4237878202
orders[0][note]=
orders[0][carrier]=-1
orders[0][other_carrier]=YunExpress
orders[0][tracking_number]=YT2640321437765373
orders[0][has_selected_tracking_exclusion]=false
orders[0][selected_tracking_exclusion_reason]=
orders[0][other_tracking_exclusion_reason_desc]=
orders[0][ship_date]=0
```

### 多订单请求示例

```text
orders[0][order_id]=4237878202
orders[0][tracking_number]=YT2640321437765373

orders[1][order_id]=4237878203
orders[1][tracking_number]=YT2640321437765374
```

订单字段通过数组下标区分，例如：

```text
orders[0][...]
orders[1][...]
orders[2][...]
```

## 三、监听后可以获取什么

### 从 URL 获取

| 字段 | 示例 | 说明 |
|---|---|---|
| `shopId` | `63724694` | Etsy 店铺 ID |
| `requestUrl` | 完整接口 URL | 用于日志和排查 |
| `requestMethod` | `POST` | 固定为 POST |

### 从请求体获取

| 字段 | 示例 | 说明 |
|---|---|---|
| `orderId` | `4237878202` | Etsy 订单号 |
| `trackingNumber` | `YT2640321437765373` | 运单号 |
| `carrier` | `-1` | 页面选择的承运商值 |
| `otherCarrier` | `YunExpress` | 承运商名称，通常在选择 Other 时使用 |
| `note` | 空字符串 | 完成订单时填写的备注 |
| `shipDate` | `0` | 页面提交的发货日期值 |
| `hasSelectedTrackingExclusion` | `false` | 是否选择物流追踪例外 |
| `selectedTrackingExclusionReason` | 空字符串 | 已选择的追踪例外原因 |
| `otherTrackingExclusionReasonDesc` | 空字符串 | 其他追踪例外原因说明 |

### 承运商字段说明

本次实际请求中：

```text
carrier = -1
other_carrier = YunExpress
```

监听时应同时保留 `carrier` 和 `other_carrier`：

- `carrier` 是下拉框的值。
- `carrier = -1` 通常表示页面选择了其他承运商。
- 实际承运商名称优先从 `other_carrier` 获取。
- 如果 `other_carrier` 为空，则使用 `carrier` 对应的承运商信息。

### 发货日期字段说明

本次请求中：

```text
ship_date = 0
```

监听时应原样保留该值。`0` 是页面提交值，不建议在监听层直接转换为具体日期，除非业务已经确认其时间含义。

### 从响应获取

成功响应示例：

```json
{
  "success": [4233962133],
  "errors": []
}
```

响应字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `success` | number[] | 已完成成功的 Etsy 订单号列表 |
| `errors` | array | 提交失败的订单和错误信息 |

多笔订单提交时，响应可能类似：

```json
{
  "success": [4237878202],
  "errors": [
    {
      "order_id": 4237878203,
      "message": "失败原因"
    }
  ]
}
```

需要按每个 Etsy 订单号分别判断：

```text
订单号出现在 success
  -> 该订单提交成功

订单号出现在 errors
  -> 该订单提交失败

订单号既不在 success 也不在 errors
  -> 接口没有返回该订单结果，需要按异常处理
```

## 四、监听位置

### 为什么要在页面主世界监听

Etsy 页面通过页面自身的 JavaScript 发起请求。扩展的 content script 如果只运行在隔离环境，不能直接替换页面主世界的 `window.XMLHttpRequest` 和 `window.fetch`。

因此需要：

1. 在 `document_start` 阶段把监听脚本注入页面主世界。
2. 在主世界包装 `XMLHttpRequest`，必要时同时包装 `fetch`。
3. 在请求发出时保存请求信息。
4. 在响应结束时读取响应状态和响应文本。
5. 使用一个统一的 `requestId` 将请求和响应关联起来。
6. 通过 `window.postMessage` 把数据发送给 content script。

当前项目已有这种模式：

```text
public/page-inject.js
```

它目前监听了以下接口，但还没有监听 `batch-complete`：

```text
POST /mission-control/order-state/move-orders
POST /mission-control/orders/fulfillment/update-ship-by-date/{orderId}
```

本次需要新增：

```text
POST /mission-control/order-state/batch-complete
```

## 五、XHR 监听方法

### 1. 包装 XMLHttpRequest

在主世界中保存原生实现：

```js
var OriginalXHR = window.XMLHttpRequest;
```

创建 `PatchedXHR`，在 `open` 时记录 URL 和请求方法：

```js
xhr.open = function (method, url) {
  _method = method;
  _url = url;
  return originalOpen.apply(xhr, arguments);
};
```

在 `send` 时判断 URL 是否为目标接口：

```js
xhr.send = function (body) {
  var match = matchBatchComplete(_url, _method);
  if (match) {
    captureRequest({
      shopId: match.shopId,
      method: _method,
      url: _url,
      body: typeof body === "string" ? body : null
    });
  }

  return originalSend.apply(xhr, arguments);
};
```

### 2. 在 loadend 中读取响应

```js
xhr.addEventListener("loadend", function () {
  if (!match) return;

  captureResponse({
    requestId: requestId,
    status: xhr.status,
    ok: xhr.status >= 200 && xhr.status < 300,
    responseText: xhr.responseText
  });
});
```

### 3. 生成 requestId

每次请求生成唯一 ID：

```js
var requestId =
  "etsy-order-complete-xhr-" +
  Date.now() +
  "-" +
  Math.random().toString(36).slice(2);
```

请求和响应必须使用同一个 `requestId`。

## 六、fetch 监听方法

部分页面可能使用 `fetch` 发起请求，因此建议同时包装 `window.fetch`。

### 1. 判断请求

```js
var url = typeof input === "string" ? input : input.url;
var method = (init && init.method) || (input && input.method) || "GET";
var match = matchBatchComplete(url, method);
```

### 2. 读取请求体

如果输入是 `Request`，使用 `clone()`，避免消费原始请求：

```js
var clonedRequest = input.clone();
var requestBodyText = await clonedRequest.text();
```

如果请求体在 `init.body` 中且是字符串：

```js
var requestBodyText = init.body;
```

### 3. 读取响应

不能直接消费原始响应，需要先克隆：

```js
var response = await originalFetch(input, init);
var clonedResponse = response.clone();
var responseText = await clonedResponse.text();
```

最后仍然返回原始响应：

```js
return response;
```

## 七、目标接口判断示例

```js
function matchBatchComplete(url, method) {
  if (!url) return null;
  if (String(method || "GET").toUpperCase() !== "POST") return null;

  try {
    var parsed = new URL(url, window.location.origin);

    if (parsed.hostname !== "www.etsy.com") return null;

    var match = parsed.pathname.match(
      /^\/api\/v3\/ajax\/shop\/(\d+)\/mission-control\/order-state\/batch-complete$/
    );

    if (!match) return null;

    return {
      shopId: match[1]
    };
  } catch (error) {
    return null;
  }
}
```

## 八、请求体解析方法

请求体使用 URL 编码格式，可以直接使用 `URLSearchParams`：

```js
var params = new URLSearchParams(requestBody);
```

订单字段的键名格式为：

```text
orders[0][order_id]
orders[0][tracking_number]
orders[0][carrier]
orders[0][other_carrier]
orders[0][note]
orders[0][ship_date]
```

解析步骤：

1. 遍历所有参数键。
2. 使用正则提取订单下标和字段名。
3. 按下标聚合订单字段。
4. 将每个订单转换成独立对象。

示例：

```js
var orderRegex = /^orders\[(\d+)\]\[([^\]]+)\]$/;
var ordersByIndex = new Map();

for (var [key, value] of params.entries()) {
  var match = key.match(orderRegex);
  if (!match) continue;

  var index = match[1];
  var field = match[2];

  if (!ordersByIndex.has(index)) {
    ordersByIndex.set(index, {});
  }

  ordersByIndex.get(index)[field] = value;
}
```

转换后的订单对象示例：

```json
{
  "orderId": "4237878202",
  "note": "",
  "carrier": "-1",
  "otherCarrier": "YunExpress",
  "trackingNumber": "YT2640321437765373",
  "hasSelectedTrackingExclusion": false,
  "selectedTrackingExclusionReason": "",
  "otherTrackingExclusionReasonDesc": "",
  "shipDate": "0"
}
```

字段映射建议：

| 请求体字段 | 转换后字段 |
|---|---|
| `order_id` | `orderId` |
| `tracking_number` | `trackingNumber` |
| `carrier` | `carrier` |
| `other_carrier` | `otherCarrier` |
| `note` | `note` |
| `ship_date` | `shipDate` |
| `has_selected_tracking_exclusion` | `hasSelectedTrackingExclusion` |
| `selected_tracking_exclusion_reason` | `selectedTrackingExclusionReason` |
| `other_tracking_exclusion_reason_desc` | `otherTrackingExclusionReasonDesc` |

## 九、请求与响应关联

主世界脚本需要维护一个临时 Map：

```js
var pendingBatchCompleteByRequestId = new Map();
```

请求发出时保存：

```json
{
  "requestId": "etsy-order-complete-xhr-1795228154000-abc123",
  "shopId": "63724694",
  "requestUrl": "https://www.etsy.com/api/v3/ajax/bespoke/shop/63724694/mission-control/order-state/batch-complete",
  "requestMethod": "POST",
  "requestBody": "orders[0][order_id]=4237878202...",
  "orders": [
    {
      "orderId": "4237878202",
      "trackingNumber": "YT2640321437765373",
      "carrier": "-1",
      "otherCarrier": "YunExpress",
      "note": "",
      "shipDate": "0"
    }
  ]
}
```

响应结束时通过 `requestId` 找到请求数据，再将请求和响应一起发送给 content script。

## 十、建议发送给 content script 的请求消息

```json
{
  "type": "etsy-order-complete-request",
  "source": "page-inject",
  "requestId": "etsy-order-complete-xhr-1795228154000-abc123",
  "url": "https://www.etsy.com/api/v3/ajax/bespoke/shop/63724694/mission-control/order-state/batch-complete",
  "method": "POST",
  "shopId": "63724694",
  "body": "orders[0][order_id]=4237878202...",
  "orders": [
    {
      "orderId": "4237878202",
      "trackingNumber": "YT2640321437765373",
      "carrier": "-1",
      "otherCarrier": "YunExpress",
      "note": "",
      "shipDate": "0"
    }
  ]
}
```

请求消息应在原始请求发出前或发出时立即发送。

## 十一、建议发送给 content script 的响应消息

```json
{
  "type": "etsy-order-complete-response",
  "source": "page-inject",
  "requestId": "etsy-order-complete-xhr-1795228154000-abc123",
  "url": "https://www.etsy.com/api/v3/ajax/bespoke/shop/63724694/mission-control/order-state/batch-complete",
  "method": "POST",
  "status": 200,
  "ok": true,
  "body": "{\"success\":[4237878202],\"errors\":[]}",
  "success": [4237878202],
  "errors": []
}
```

响应消息必须携带与请求相同的 `requestId`。

## 十二、content script 接收方式

content script 通过 `window.addEventListener("message", handler)` 接收：

```js
window.addEventListener("message", function (event) {
  if (event.source !== window) return;

  var data = event.data;
  if (!data || data.source !== "page-inject") return;

  if (data.type === "etsy-order-complete-request") {
    handleOrderCompleteRequest(data);
    return;
  }

  if (data.type === "etsy-order-complete-response") {
    handleOrderCompleteResponse(data);
  }
});
```

建议使用以下条件过滤消息：

```text
event.source === window
data.source === "page-inject"
data.type === "etsy-order-complete-request"
或 data.type === "etsy-order-complete-response"
```

## 十三、成功判断

接口成功不能只看 HTTP 200，需要同时满足：

```text
HTTP 状态码为 2xx
响应文本是合法 JSON
response.success 包含当前 orderId
response.errors 中没有当前 orderId
```

示例：

```json
{
  "success": [4237878202],
  "errors": []
}
```

判断 `4237878202` 成功：

```text
status >= 200 && status < 300
JSON.parse(responseBody) 成功
success.includes(4237878202)
errors 中不存在 4237878202
```

批量请求中，每笔订单需要独立判断，不能因为部分成功就认为全部成功。

## 十四、去重方式

### 请求去重

主世界每次请求生成新的 `requestId`。同一个请求可能同时被 XHR 监听逻辑和其他监听逻辑捕获，因此 content script 需要按以下字段去重：

```text
requestId
```

### 响应去重

同一个 XHR 的 `loadend` 或 fetch 响应可能被重复处理，因此 content script 需要记录已经处理过的响应 `requestId`。

建议保存：

```text
processedResponseRequestIds
```

已经处理的 `requestId` 不再重复处理。

## 十五、完整监听流程

```text
1. 页面主世界脚本在 document_start 阶段注入。
2. 包装 window.XMLHttpRequest。
3. 在 xhr.open 中记录 method 和 url。
4. 在 xhr.send 中匹配 batch-complete 接口。
5. 匹配成功后生成 requestId。
6. 读取并解析 x-www-form-urlencoded 请求体。
7. 提取 shopId 和全部 orders。
8. 将请求消息通过 window.postMessage 发给 content script。
9. 在 xhr loadend 中读取响应 status 和 responseText。
10. 通过 requestId 关联原始请求。
11. 将响应消息通过 window.postMessage 发给 content script。
12. content script 解析 success 和 errors。
13. 按每个 orderId 独立判断是否成功。
14. 使用 requestId 对请求和响应去重。
```

## 十六、核心结论

```text
接口名称：
Etsy 订单完成提交接口

请求方式：
POST

接口路径：
/api/v3/ajax/bespoke/shop/{shopId}/mission-control/order-state/batch-complete

请求体：
application/x-www-form-urlencoded

可以获取：
shopId、orderId、trackingNumber、carrier、otherCarrier、note、shipDate

响应：
{"success":[订单号],"errors":[]}

监听方式：
在主世界包装 XMLHttpRequest，匹配 URL 和 POST 方法，
在 send 中读取请求，在 loadend 中读取响应；
使用 requestId 关联请求和响应，通过 window.postMessage 发给 content script。
```
