# Etsy 订单页 — DOM 抓取分析

基于订单列表 + 订单详情页 HTML，对照 `etsy-order-fields.js` 中表格字段，分析通过 **DOM 元素** 能否抓取、使用哪个元素、以及是否只能从详情页获取。接口与表格字段的对应关系见 `etsy-order-api-fields-mapping.md`。

---

## 一、能抓取到的字段（元素明确）

| 表格字段 | 中文 | 数据来源 | 推荐选择器 / 元素 |
|----------|------|----------|-------------------|
| **Order ID** | 订单ID | 列表 / 详情 | 列表：`input[type="checkbox"][name]` 的 `name` 或 `value`；或 `a[href*="order_id="]` 的 query 参数。详情：`#order-details-order-info a[href*="order_id"]` 的 href 或节点内 `#3976911945` 文本。 |
| **Sale Date** | 销售日期 | 详情更完整 | 详情：包含 "Ordered" 的那条 `.text-body-smaller`（如 "Ordered 10:28pm, Fri, Feb 13, 2026"），解析日期。列表：含 "Ordered MM/DD/YYYY" 的 `.text-body-smaller`。 |
| **Full Name** / **Buyer** | 全名/买家 | 列表+详情 | 详情：`div.address .name` 或 dropdown `button[data-dropdown-button]` 内 `span[data-test-id="unsanitize"]`（如 "Tracie jackson"）。列表：同一类 dropdown 或 “运送到” 下的买家名。 |
| **Number of Items** | 商品数量 | 列表+详情 | 详情：Receipt 表头 "1 Item(s)" 或 "1 item" 文本；或 `table.b-xs-0 tbody tr` 数量。列表：含 "1 item" 的 `.text-body-smaller`。 |
| **Street 1** | 街道1 | 仅详情 | `div.address .first-line`（如 "2912 Avenue V"）。 |
| **Street 2** | 街道2 | 仅详情 | `div.address .second-line`（如 "# 2912"），可能为空。 |
| **Ship City** | 收货城市 | 仅详情 | `div.address .city`（如 "Birmingham"）。 |
| **Ship State** | 收货州/省 | 仅详情 | `div.address .state`（如 "AL"）。 |
| **Ship Zipcode** | 收货邮编 | 仅详情 | `div.address .zip`（如 "35208-3522"）。 |
| **Ship Country** | 收货国家 | 仅详情 | `div.address .country-name`（如 "United States"）。 |
| **Order Value** | 订单价值 | 详情 | Receipt 中 "Item total" 行：对应 `ul.list-unstyled` 里含 "Item total" 的 `li` 右侧金额（如 $15.28）。 |
| **Coupon Code** | 优惠券代码 | 列表+详情 | 详情：含 "15DISCOUNT0309" 的 badge 或 discount 行文本。列表：`span[data-tooltip]` 旁或同区域包含 "15DISCOUNT0309" 的节点。 |
| **Coupon Details** | 优惠券详情 | 列表+详情 | `span[data-tooltip="15% off"]` 或折扣行中 “15% off” 文本。 |
| **Discount Amount** | 折扣金额 | 详情 | Receipt 中 Shop coupon 行右侧金额（如 -$2.29）：含 "15DISCOUNT0309" 的 `li` 的 `.text-right`。 |
| **Shipping** | 运费 | 详情 | Receipt "Shipping price" 行右侧（如 $5.99）；或 Ship to 区域 "Standard Shipping" 旁的 $5.99。 |
| **Sales Tax** | 销售税 | 详情 | Receipt "Sales tax" 行右侧（如 $1.04）。 |
| **Order Total** | 订单总额 | 列表+详情 | 详情：Receipt 最后 "Order total" 行（如 $20.02）。列表：含 "$20.02" 的 `.mr-xs-1` 等。 |
| **SKU** | 商品SKU | 列表+详情 | 详情：Receipt 表格或商品区块中 "SKU: " 后的文本（如 20250716）。列表：商品详情区 "SKU" 后的 `span.strong`。 |
| **Status** | 状态 | 详情 | 进度下拉中当前选中项：`button[aria-label="Update progress"]` 的 `.wt-menu__trigger__label`，或 `button[role="menuitemradio"][aria-checked="true"]` 的文本（如 "New"）。 |

说明：列表页可拿 Order ID、买家名、订单总额、数量、优惠券、SKU、订单日期等；地址、明细金额、Status 等需进详情页。

---

## 二、可能可以抓取（需解析或间接推断）

| 表格字段 | 中文 | 说明 | 可能用到的元素 |
|----------|------|------|----------------|
| **Buyer User ID** | 买家用户ID | 页上无直接 “Buyer User ID” 文案，但详情有带 buyer_id 的链接。 | 详情：`a[href*="buyer_id="]` 的 href 中解析 `buyer_id=1212094079`。需确认 Etsy 该参数是否即 Buyer User ID。 |
| **First Name** / **Last Name** | 名字/姓氏 | 页面只有全名 "Tracie jackson"。 | 用 `div.address .name` 或买家名节点文本，按首空格拆成 First/Last（不保证 Etsy 始终 “First Last” 格式）。 |
| **Payment Method** | 支付方式 | 列表未提供；详情为 “Paid via Other method”。 | 详情：`#payment-msg` 文本（如 "Paid via Other method on Feb 13, 2026"），取 “Other method” 或解析。非标准 “Credit Card” 等需映射。 |
| **Ship Date** | 发货日期 | 未发货时无实际发货日，应为空。 | 已发货时可能在订单时间线或 “Shipped” 相关区块；当前 HTML 未见实际发货日期，需在发货后的页面再确认元素。 |
| **Latest Ship Date** | 最晚发货日期 | 对应 “Ship by” 日期。 | 当前 HTML 可见 “Ship by Mar 2, 2026” 这类文本，可解析为最晚发货日期；字段顺序紧跟 Ship Date。 |
| **Currency** | 货币 | 无单独 “Currency” 标签，金额均为 $。 | 可从 “Order total” 或 “$” 推断 USD；或写死 USD（美国站）。 |
| **Shipping Discount** | 运费折扣 | 若为 0 可能不展示。 | 在 Receipt 的 “Shipping” 相关行或 “Shipping discount” 文案旁查找金额；当前片段未见。 |
| **Card Processing Fees** | 银行卡处理费 | 在 Earnings 的 “Fees & credits” 里。 | 详情切到 “Earnings” Tab，在 “Payment processing fee” 行取金额（如 -$1.60）；需在 `id="dg-tabs-preact__tab-2--default_wt_tab_panel"` 内查找。 |
| **Order Net** | 订单净额 | 等于卖家实收。 | Earnings 中 “You earned $13.87” 的金额；选择器可为包含 "You earned" 的节点或 `.wt-text-slime`。 |
| **Order Type** | 订单类型 | 无 “online” 字样。 | 无线下/InPerson 标记时可默认为 "online"；或从 URL/面包屑等间接推断。 |
| **Payment Type** | 支付类型 | 与 Payment Method 类似。 | 同 `#payment-msg` 解析；可能得到 "Other method" 再映射为 payment_type。 |

---

## 三、当前 HTML 中不能直接抓取的字段

| 表格字段 | 中文 | 原因 |
|----------|------|------|
| **Buyer User ID** | 买家用户ID | 仅可能从链接参数 `buyer_id=` 解析，且需确认与导出表 “Buyer User ID” 是否同一含义。 |
| **Ship Date** | 发货日期 | 未发货订单无实际发货日期，应为空；已发货需在其它区块或页面确认。 |
| **Latest Ship Date** | 最晚发货日期 | 未发货订单通常有 “Ship by” 日期，可解析；若页面不展示则需依赖接口 `fulfillment.expected_ship_date`。 |
| **Adjusted Order Total** | 调整后的订单总额 | 当前片段无调整项展示。 |
| **Adjusted Card Processing Fees** | 调整后的银行卡处理费 | 同上。 |
| **Adjusted Net Order Amount** | 调整后的订单净额 | 同上。 |
| **InPerson Discount** | 线下折扣 | 页面无线下订单相关文案。 |
| **InPerson Location** | 线下地点 | 同上。 |

说明：带 “Adjusted” 的字段可能在退款/调整后才出现；InPerson 仅线下订单会有。

---

## 四、选择器汇总（详情页为主）

```text
# 订单 ID（详情）
#order-details-order-info a[href*="order_id="]

# 下单时间 Sale Date（详情）
.text-body-smaller (包含 "Ordered" 的那条)

# 买家全名
div.address .name
或 dropdown: [data-dropdown-button] span[data-test-id="unsanitize"]

# 地址
div.address .first-line
div.address .second-line
div.address .city
div.address .state
div.address .zip
div.address .country-name

# 金额（在 Receipt 的 ul.list-unstyled 中按文案匹配）
Item total → Order Value
含 15DISCOUNT 的 li 右侧 → Discount Amount
Shipping price → Shipping
Sales tax → Sales Tax
Order total → Order Total

# 优惠券
span[data-tooltip] 或含 "15DISCOUNT0309" 的节点
data-tooltip 或文案 → Coupon Details

# SKU
Receipt 表格或商品区 "SKU: " 后的文本

# 状态
button[role="menuitemradio"][aria-checked="true"] 的文本

# 支付与净收入（Earnings Tab）
#payment-msg
dg-tabs-preact__tab-2--default_wt_tab_panel 内 "You earned" / "Payment processing fee"
```

---

## 五、结论简表

| 类别 | 数量 | 说明 |
|------|------|------|
| **能抓取** | 约 20 项 | 列表+详情或仅详情，元素稳定、可直接用。 |
| **可能可以** | 约 10 项 | 需解析、分拆、或进 Earnings/发货后页面再确认。 |
| **不能直接抓** | 约 7 项 | 无对应 DOM、或仅链接参数/线下/调整后才出现。 |

建议：列表页抓 Order ID、买家、金额、数量、日期、优惠券、SKU；进入详情页再抓地址、完整金额、Status、支付信息；Earnings 抓 Order Net 和 Card Processing Fees；First/Last Name 用全名拆分；Adjusted/InPerson 在无展示时留空或从其它 Etsy 导出/API 补全。
