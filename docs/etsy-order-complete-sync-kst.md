# Etsy 订单完成同步 KST 接口流程

## 一、文档说明

本文只描述完成同步服务与 KST 之间的接口调用，不描述触发该流程的外部平台接口。

以下接口路径均相对于 KST API 根地址：

```text
https://kstgl.kesiteng.cn/prod-api
```

除特别说明外，请求头统一为：

```http
Accept: application/json
Authorization: Bearer {KST访问令牌}
```

发送 JSON 请求体时增加：

```http
Content-Type: application/json
```

## 二、完成同步服务接收的参数

完成同步服务接收以下参数：

```json
{
  "requestId": "7d8f6e43-8f50-4f76-a4d1-202611240001",
  "etsyOrderId": "4237878202",
  "trackingNumber": "YT2640321437765373",
  "carrier": "YunExpress"
}
```

### 参数说明

| 参数 | 类型 | 必填 | 作用 |
|---|---|---:|---|
| `requestId` | string | 是 | 标识本次完成同步请求，用于幂等、重复响应过滤和日志去重 |
| `etsyOrderId` | string | 是 | Etsy 订单号，用于归一化后查询对应的 KST 订单 |
| `trackingNumber` | string | 是 | 运单号，用于写入完成日志，便于业务追踪 |
| `carrier` | string | 是 | 承运商名称，用于写入完成日志 |

### `requestId` 的作用

`requestId` 由调用方生成，建议使用 UUID。

作用：

1. 标识一次独立的完成同步请求。
2. 防止同一次完成事件被重复处理。
3. 生成 KST 日志的 `dedupeKey`。
4. 日志写入失败后，使用同一个 `requestId` 重试，避免重复追加日志。

`requestId` 不直接传给 KST 接口，只由本地同步服务用于幂等和日志管理。

示例 `dedupeKey`：

```text
etsy-order-complete|7d8f6e43-8f50-4f76-a4d1-202611240001|4237878202|KST内部订单id|success
```

### `etsyOrderId` 的作用

`etsyOrderId` 是 Etsy 原始订单号。

作用：

1. 按订单号规则归一化为 KST 的 `platformOrderId`。
2. 作为 `GET /system/platform-orders/list` 的查询条件。
3. 写入 KST 完成日志。

归一化规则：

1. 去除首尾空格，并统一转换为字符串。
2. 如果当前店铺存在历史订单号转换规则，则按店铺规则处理。
3. 如果没有特殊规则，直接使用 `etsyOrderId`。

当前 Etsy 订单导入没有特殊前缀规则，因此通常为：

```text
platformOrderId = etsyOrderId
```

示例：

```text
etsyOrderId: 4237878202
platformOrderId: 4237878202
```

### `trackingNumber` 的作用

`trackingNumber` 是本次提交的运单号。

作用：

1. 写入 KST 订单的完成日志。
2. 供后续客服、仓库或异常排查使用。
3. 不参与 KST 订单查询。
4. 不参与 KST 订单状态判断。

示例：

```text
trackingNumber: YT2640321437765373
```

### `carrier` 的作用

`carrier` 是运单对应的承运商名称。

作用：

1. 写入 KST 订单的完成日志。
2. 与 `trackingNumber` 一起形成完整的完成记录。
3. 不参与 KST 订单查询。
4. 不参与 KST 订单状态判断。

示例：

```text
carrier: YunExpress
```

## 三、ID 关系

流程中涉及以下 ID：

| 字段 | 来源 | 作用 |
|---|---|---|
| `requestId` | 调用方传入 | 幂等处理和日志去重 |
| `etsyOrderId` | 调用方传入 | 获取并归一化 Etsy 订单号 |
| `platformOrderId` | 本地归一化生成 | 查询 KST 订单 |
| `id` | KST 订单列表返回 | 更新 KST 状态、读取和写入日志 |
| `childId` | KST 订单列表返回 | 辅助识别拆单或子订单，不作为主要请求 ID |

关联关系：

```text
etsyOrderId
  -> 本地订单号归一化
  -> platformOrderId
  -> KST 订单列表查询
  -> KST 内部订单 id
  -> 更新订单状态
  -> 写入订单日志
```

同一个 `platformOrderId` 可能对应多笔 KST 订单，因此可能得到多个 KST 内部 `id`。

## 四、整体调用流程

```text
1. 接收 requestId、etsyOrderId、trackingNumber、carrier。
2. 将 etsyOrderId 归一化为 platformOrderId。
3. 查询 KST 订单列表，分页获取全部匹配订单。
4. 读取匹配订单现有的 errorInfo 日志。
5. 逐笔判断 KST 订单状态。
6. 对允许完成的订单更新 orderStatus 为 "5"。
7. 更新成功后，重新读取最新 errorInfo。
8. 合并本次完成日志，按 dedupeKey 去重。
9. 逐笔写回 errorInfo。
10. 失败结果进入本地待重试队列。
```

## 五、接口一：查询 KST 订单

### 接口用途

根据归一化后的 `platformOrderId` 查询 KST 订单，获取：

1. KST 内部订单 `id`。
2. 当前订单状态 `orderStatus`。
3. 当前订单日志 `errorInfo`。
4. 同一次 Etsy 完成事件对应的全部 KST 订单。

### 请求

```http
GET /system/platform-orders/list
  ?pageNum=1
  &pageSize=100
  &platformOrderIds={platformOrderId}
```

完整示例：

```http
GET /system/platform-orders/list?pageNum=1&pageSize=100&platformOrderIds=4237878202
```

### Query 参数

| 参数 | 类型 | 必填 | 作用 |
|---|---|---:|---|
| `pageNum` | number | 是 | 当前页码，从 1 开始 |
| `pageSize` | number | 是 | 每页记录数，建议使用 100 |
| `platformOrderIds` | string | 是 | 归一化后的 KST 平台订单号 |

### 响应示例

```json
{
  "code": 200,
  "msg": "查询成功",
  "total": 2,
  "rows": [
    {
      "id": "KST内部订单id1",
      "childId": "KST子订单id1",
      "platformOrderId": "4237878202",
      "orderStatus": "3",
      "errorInfo": "{\"data\":[]}"
    },
    {
      "id": "KST内部订单id2",
      "childId": "KST子订单id2",
      "platformOrderId": "4237878202",
      "orderStatus": "5",
      "errorInfo": "{\"data\":[]}"
    }
  ]
}
```

### 响应字段

| 字段 | 类型 | 作用 |
|---|---|---|
| `code` | number | 接口业务状态码，`200` 表示查询成功 |
| `msg` | string | 接口返回信息 |
| `total` | number | 符合条件的订单总数 |
| `rows` | array | 当前页订单数据 |
| `rows[].id` | string | KST 内部订单 ID，后续状态和日志操作必须使用该字段 |
| `rows[].childId` | string | KST 子订单 ID，仅用于辅助识别 |
| `rows[].platformOrderId` | string | KST 保存的平台订单号 |
| `rows[].orderStatus` | string | KST 当前订单状态 |
| `rows[].errorInfo` | string | KST 当前订单日志 JSON |

### 成功条件

```text
HTTP 状态码为 2xx
且响应 code === 200
```

### 分页处理

必须根据 `total` 查询全部页：

```text
第 1 次请求：pageNum=1, pageSize=100
第 2 次请求：pageNum=2, pageSize=100
依次递增，直到已获取记录数达到 total
```

不能只处理第一页或第一条订单。

### 无匹配订单

如果没有查到订单：

1. 不调用后续状态更新接口。
2. 不调用后续日志写入接口。
3. 在本地记录 `etsyOrderId`、`platformOrderId`、`requestId`。
4. 进入待重试或人工处理队列。

## 六、接口二：批量读取 KST 订单日志

### 接口用途

读取匹配订单现有的 `errorInfo`，避免更新完成日志时覆盖历史日志。

### 请求

```http
POST /system/platform-orders/errors/batch
Content-Type: application/json
```

```json
{
  "ids": ["KST内部订单id1", "KST内部订单id2"]
}
```

### Body 参数

| 参数 | 类型 | 必填 | 作用 |
|---|---|---:|---|
| `ids` | string[] | 是 | 需要读取日志的 KST 内部订单 ID 列表 |

### 响应示例

```json
[
  {
    "id": "KST内部订单id1",
    "errorInfo": "{\"data\":[]}"
  },
  {
    "id": "KST内部订单id2",
    "errorInfo": "{\"data\":[{\"id\":\"old\",\"type\":\"info\",\"info\":\"已有日志\"}]}"
  }
]
```

接口可能返回直接数组，也可能使用以下包装结构：

```text
data
rows
list
items
```

需要兼容并定位到每笔订单的 `id` 和 `errorInfo`。

### `errorInfo` 格式

标准结构：

```json
{
  "data": [
    {
      "id": "时间戳-随机数",
      "timestamp": 1795228154000,
      "type": "info",
      "info": "已有日志内容",
      "source": "order-complete",
      "stage": "complete-platform-order"
    }
  ]
}
```

### 成功条件

```text
HTTP 状态码为 2xx
且能够解析响应
且能够取得每笔订单现有日志
```

### 处理要求

1. 保留原有 `errorInfo.data`。
2. 没有日志时使用空数组。
3. 原日志无法解析时不能直接覆盖。
4. 某笔订单没有返回日志时，该订单按无历史日志处理，但必须记录警告。
5. 日志读取失败时，不继续更新该批订单状态。
6. 日志读取失败可以重试。

## 七、KST 状态判断

KST 已完成状态码为 `"5"`。

| `orderStatus` | 含义 | 是否更新 | 后续处理 |
|---|---:|---:|---|
| `"5"` | 已完成 | 否 | 写入“已经是已完成状态”日志 |
| `"6"` | 已取消 | 否 | 写入“订单已取消，不能完成”日志 |
| `"1"` | 待处理 | 是 | 更新为 `"5"` |
| `"2"` | 物流信息确认 | 是 | 更新为 `"5"` |
| `"3"` | 生产中 | 是 | 更新为 `"5"` |
| `"4"` | 已发货 | 是 | 更新为 `"5"` |
| `"7"` | 已推送 | 是 | 更新为 `"5"` |
| `"41"` | 部分发货 | 是 | 更新为 `"5"` |
| `"51"` | 部分签收 | 是 | 更新为 `"5"` |
| 其他值 | 未识别状态 | 否 | 写入异常日志 |

每笔 KST 订单独立判断，不能因为一笔订单失败而跳过其他订单。

## 八、接口三：更新 KST 订单为已完成

### 接口用途

将单笔 KST 订单的 `orderStatus` 更新为 `"5"`。

KST 批量完成没有单独的批量状态接口，因此需要按 KST 内部订单 `id` 逐笔调用。

### 请求

```http
PUT /system/platform-orders/{KST内部订单id}
Content-Type: application/json
```

```json
{
  "orderStatus": "5"
}
```

### Path 参数

| 参数 | 类型 | 必填 | 作用 |
|---|---|---:|---|
| `id` | string | 是 | KST 内部订单 ID，来自订单列表的 `rows[].id` |

### Body 参数

| 参数 | 类型 | 必填 | 作用 |
|---|---|---:|---|
| `orderStatus` | string | 是 | 目标订单状态，固定传 `"5"`，表示已完成 |

### 响应示例

```json
{
  "code": 200,
  "msg": "修改成功"
}
```

### 成功条件

```text
HTTP 状态码为 2xx
且响应 code === 200
```

### 处理要求

1. 状态为 `"1"`、`"2"`、`"3"`、`"4"`、`"7"`、`"41"`、`"51"` 时调用。
2. 状态为 `"5"` 时跳过更新。
3. 状态为 `"6"` 时禁止更新。
4. 未知状态不更新。
5. 更新请求只传 `orderStatus`。
6. 每笔 KST 订单单独发送一次请求。

### 失败处理

| 结果 | 处理 |
|---|---|
| 返回 `code !== 200` | 保存 `msg`，进入本地重试队列 |
| 网络异常 | 保存异常信息，进入本地重试队列 |
| 请求超时 | 不直接重复更新，先查询订单最新状态 |

## 九、接口四：更新超时后查询单笔 KST 订单

### 接口用途

状态更新请求超时或网络中断时，查询 KST 当前订单状态，确认更新是否已经成功。

### 请求

```http
GET /system/platform-orders/{KST内部订单id}
```

### Path 参数

| 参数 | 类型 | 必填 | 作用 |
|---|---|---:|---|
| `id` | string | 是 | KST 内部订单 ID |

### 响应示例

```json
{
  "code": 200,
  "msg": "查询成功",
  "data": {
    "id": "KST内部订单id1",
    "platformOrderId": "4237878202",
    "orderStatus": "5",
    "errorInfo": "{\"data\":[]}"
  }
}
```

### 超时后的判断

```text
重新查询 orderStatus === "5"
  -> 视为状态更新成功
  -> 不重复调用状态更新接口
  -> 继续执行日志写入

重新查询 orderStatus !== "5"
  -> 允许重新尝试更新状态
```

## 十、接口五：写入 KST 订单日志

### 接口用途

将本次完成结果追加到 KST 订单的 `errorInfo` 日志中。

### 请求

```http
PUT /system/platform-orders/{KST内部订单id}
Content-Type: application/json
```

```json
{
  "errorInfo": "{\"data\":[{\"id\":\"1795228154000-123456\",\"timestamp\":1795228154000,\"type\":\"success\",\"info\":\"[Etsy完成同步] Etsy订单4237878202已同步完成，运单号YT2640321437765373，承运商YunExpress\",\"source\":\"order-complete\",\"stage\":\"complete-platform-order\",\"dedupeKey\":\"etsy-order-complete|7d8f6e43-8f50-4f76-a4d1-202611240001|4237878202|KST内部订单id1|success\"}]}"
}
```

### Path 参数

| 参数 | 类型 | 必填 | 作用 |
|---|---|---:|---|
| `id` | string | 是 | KST 内部订单 ID |

### Body 参数

| 参数 | 类型 | 必填 | 作用 |
|---|---|---:|---|
| `errorInfo` | string | 是 | 序列化后的完整日志 JSON 字符串 |

`errorInfo` 必须包含原日志和本次新增日志，不是只传新增的一条日志。

### 日志字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 日志唯一 ID，建议使用“时间戳-随机数” |
| `timestamp` | number | 毫秒时间戳 |
| `type` | string | 日志类型：`success`、`info`、`warning`、`error` |
| `info` | string | 日志正文 |
| `source` | string | 固定为 `order-complete` |
| `stage` | string | 固定为 `complete-platform-order` |
| `dedupeKey` | string | 日志幂等键 |

### 日志类型

| 处理结果 | 日志类型 |
|---|---|
| KST 状态更新为已完成成功 | `success` |
| KST 订单已经是已完成状态 | `info` |
| KST 订单已取消 | `warning` |
| 当前状态不允许完成 | `warning` |
| 状态更新接口返回失败 | `error` |
| 网络或接口异常 | `error` |

### 推荐日志正文

```text
成功：
[Etsy完成同步] Etsy订单4237878202已同步完成，运单号YT2640321437765373，承运商YunExpress

已经完成：
[Etsy完成同步] Etsy订单4237878202对应的KST订单已经是已完成状态

已取消：
[Etsy完成同步] Etsy订单4237878202对应的KST订单已取消，不能更新为已完成

状态未知：
[Etsy完成同步] Etsy订单4237878202对应的KST订单当前状态为{orderStatus}，不能更新为已完成

状态更新失败：
[Etsy完成同步] Etsy订单4237878202更新KST订单状态失败：{失败原因}

接口异常：
[Etsy完成同步] Etsy订单4237878202更新KST订单状态异常：{异常信息}
```

### 成功条件

```text
HTTP 状态码为 2xx
且响应 code === 200
```

### 处理要求

1. 状态处理完成后重新读取最新 `errorInfo`。
2. 合并时保留原有日志。
3. 使用 `dedupeKey` 去重。
4. 每笔 KST 订单分别写日志。
5. 日志写入失败只重试日志，不重复更新订单状态。
6. 重试时必须重新读取最新日志，避免覆盖其他流程写入的内容。

### `dedupeKey` 规则

```text
etsy-order-complete|requestId|etsyOrderId|KST内部订单id|结果
```

示例：

```text
etsy-order-complete|7d8f6e43-8f50-4f76-a4d1-202611240001|4237878202|KST内部订单id1|success
```

## 十一、完整执行顺序

```text
1. 接收调用方参数：
   requestId、etsyOrderId、trackingNumber、carrier

2. 归一化订单号：
   etsyOrderId -> platformOrderId

3. 分页查询全部 KST 订单：
   GET /system/platform-orders/list
   参数：pageNum、pageSize、platformOrderIds

4. 汇总全部 KST 内部订单 id：
   rows[].id

5. 批量读取现有日志：
   POST /system/platform-orders/errors/batch
   参数：ids

6. 逐笔判断 rows[].orderStatus。

7. 对允许完成的订单逐笔更新状态：
   PUT /system/platform-orders/{id}
   {"orderStatus":"5"}

8. 超时或网络异常时查询最新状态：
   GET /system/platform-orders/{id}

9. 状态完成后重新读取最新日志。

10. 合并本次日志并按 dedupeKey 去重。

11. 逐笔写回日志：
    PUT /system/platform-orders/{id}
    {"errorInfo":"完整日志JSON字符串"}

12. 失败任务写入本地待重试队列。
```

## 十二、接口汇总

| 序号 | 方法 | 接口 | 主要参数 | 作用 |
|---:|---|---|---|---|
| 1 | GET | `/system/platform-orders/list` | `pageNum`、`pageSize`、`platformOrderIds` | 查询 KST 订单、内部 ID、状态和日志 |
| 2 | POST | `/system/platform-orders/errors/batch` | `ids` | 批量读取订单现有日志 |
| 3 | PUT | `/system/platform-orders/{id}` | `orderStatus` | 将单笔订单更新为已完成 |
| 4 | GET | `/system/platform-orders/{id}` | 路径参数 `id` | 超时后确认订单最新状态 |
| 5 | PUT | `/system/platform-orders/{id}` | `errorInfo` | 追加并写回订单完成日志 |

其中：

- 查询 KST 订单使用 `platformOrderId`。
- 读取日志、更新状态、查询单笔订单和写入日志使用 KST 内部订单 `id`。
- `requestId`、`trackingNumber`、`carrier` 不直接作为状态更新接口参数，主要用于本地幂等和 KST 日志记录。
