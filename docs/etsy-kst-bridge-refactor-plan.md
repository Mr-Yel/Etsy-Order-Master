# Etsy / KST Bridge Refactor Plan

## 目标

- 把 Etsy 与 KST 的跨环境调用统一到 bridge 层。
- 业务层只调用 client，不直接使用 `postMessage` / `sendMessage` / `window.Etsy`。
- 先收敛协议与入口，再逐步迁移现有调用点。

## 已落地的第一阶段

### 1. 新增 Etsy bridge 协议类型

- `lib/etsy-bridge-types.ts`

统一定义：

- request / response / event 结构
- action 常量
- context / dom / images 的 payload 类型

### 2. 新增 Etsy 主世界通信 client

- `lib/etsy-mainworld-client.ts`

职责：

- 统一发送 `ETSY_BRIDGE_REQUEST`
- 统一等待 `ETSY_BRIDGE_RESPONSE`
- 统一处理 `requestId` 与超时

### 3. 新增 Etsy 统一对外 client

- `lib/etsy-bridge-client.ts`

当前已收敛的方法：

- `getEtsyBridgeContext`
- `setEtsySelectOption`
- `setEtsyInputValue`
- `fetchEtsyImagesAsBase64`

### 4. 收敛 Etsy 订单列表请求

- `api/etsy-orders.ts`

当前把订单列表 HTTP 请求从 composable 中抽出，作为 API/bridge 收敛的第一步：

- `buildEtsyOrderListBaseParams`
- `fetchEtsyOrdersPage`
- `fetchEtsyOrderList`

### 5. 保留 composable 兼容层

- `composables/useFetchOrderList.ts`
- `composables/useEtsyData.ts`

现有组件仍能从旧入口调用，但底层实现已开始切换到新的 bridge / api 层。

### 6. 新增 Etsy content gateway 与 active tab client

- `lib/etsy-content-bridge-types.ts`
- `lib/etsy-tab-client.ts`

当前已收敛的 popup -> active Etsy tab 能力：

- `context.get`
- `orders.list`
- `conversation.images.collect`
- `images.zip.download`

### 7. popup 与页面内主要功能已切到统一入口

已迁移：

- `entrypoints/popup/App.vue`
- `components/OrderExport.vue`
- `components/ImageDownload.vue`
- `utils/dom-utils.ts`

### 8. move-orders 标准事件已接入消费端

`entrypoints/content.ts` 现在同时支持：

- 旧事件：`etsy-move-orders-request` / `etsy-move-orders-response`
- 新事件：`ETSY_BRIDGE_EVENT` + `moveOrders.requested` / `moveOrders.responded`

## 接下来的迁移顺序

### 第二阶段

- 清理 `content.ts` 中遗留的旧兼容消息实现，只保留 bridge 内核与必要兼容壳
- 继续收敛 `move-orders` 监听逻辑，减少 content 文件内联复杂度

### 第三阶段

- 让 popup / modal / content 都不再直接拼 Etsy 请求
- 根据需要补更多 Etsy action 到 bridge 中

### 第四阶段

- 清理 `page-inject.js` 中零散事件名
- 收敛 `content.ts` 中的 Etsy 协议与 transport 逻辑

## 约束

1. 新增 Etsy 能力时，优先加到 `etsy-bridge-types.ts` 和 `etsy-bridge-client.ts`。
2. 非 bridge 文件中不要新增新的 `window.postMessage` 协议。
3. 非 bridge/server 文件中不要新增新的 `browser.runtime.sendMessage` 协议。
4. 业务组件不允许直接访问 `window.Etsy.Context.data`。

## 备注

当前阶段是“开始落地”，不是“一次性重构完成”。重点是先建立稳定的桥接骨架，再逐步迁移现有能力。
