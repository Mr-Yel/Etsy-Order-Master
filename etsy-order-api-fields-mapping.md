# Etsy 订单导出表 — 接口字段映射

对照导出目标系统的表格字段，记录各接口返回值与导出表字段的对应关系。仅用于接口数据 → 表格字段的映射，不涉及 DOM。

**导出目标字段**（以实际导入系统为准）：Sale Date, Order ID, Transaction ID, Buyer User ID, Full Name, First Name, Last Name, Number of Items, Payment Method, Street 1, Ship City, Ship State, Ship Zipcode, Ship Country, Currency, Order Value, Coupon Code, Coupon Details, Discount Amount, Shipping Discount, Shipping, Sales Tax, Order Total, Card Processing Fees, Order Net, Adjusted Order Total, Adjusted Card Processing Fees, Adjusted Net Order Amount, Buyer, Order Type, Payment Type, SKU, Item Name。

**SKU**：以列表接口 `transactions[].product.product_identifier` 的值为准（业务侧若存在另一套 SKU 由下游处理，导出取 Etsy 列表值）。

**Item Name**：以列表接口 `transactions[].product.title` 的值为准，对应 Etsy 页面商品标题。

---

## 接口一览

| 接口 | 说明 | 主要用途 |
|------|------|----------|
| **Orders_OrdersCollection** | 订单列表（orders_search） | 绝大部分导出字段，含 SKU、Item Name、姓名、地址、金额等 |
| **Etsy_Order_Fulfillment_EarningsDetails** | 订单收益/费用明细 | 订单净额、卡处理费、Adjusted 相关 |
| **Common_Convo** | 会话详情 | 买家邮箱、订单号/日期（从 subject 解析）、买家名（备用） |

---

## 一、订单列表接口（Orders_OrdersCollection）

数据源：`orders_search.orders[]`、`orders_search.buyers[]`、`orders_search.order_states[]`。买家信息需用 `order.buyer_id` 在 `buyers[]` 中匹配。

**姓名与买家**：Full Name、First Name、Last Name、Buyer 均取**收货人**，即 `orders[].fulfillment.to_address.name`（如 "Jay Hall"），不取 `buyers[].name`（如 "Sign in with Apple user"）。First/Last 从 `to_address.name` 按空格拆分。

| 表格字段 | 结论 | 接口路径 / 取值说明 |
|----------|------|----------------------|
| Sale Date | 能 | `orders[].order_date`（Unix 时间戳，按 **UTC** 计算日期并格式化为 MM/DD/YY，避免本地时区导致日期偏移） |
| Order ID | 能 | `orders[].order_id`；导出时加前缀，前缀代表对应的店铺，SLA、SLB、SLC，如 "SLC" 就是 3店 → "SLC3984074404" （已取消，不要前缀，对应代码已处理） |
| Transaction ID | 能 | 优先取 `orders[].transactions[].transaction_id`；当前展示/导出按 **一行一个 transaction**，同一订单多商品会拆成多行；若明细数组缺失可回退 `orders[].transaction_ids` |
| Buyer User ID | 能 | 用 `orders[].buyer_id` 匹配 `buyers[]`，取 `buyers[].username`（如 "fr1giobobuffwzh9"） |
| Full Name | 能 | `orders[].fulfillment.to_address.name`（收货人全名） |
| First Name | 能 | 从 `to_address.name` 按空格拆分取首段 |
| Last Name | 能 | 从 `to_address.name` 按空格拆分取其余部分（多词 last name 需约定规则） |
| Number of Items | 能 | `orders[].transactions[].quantity`；当前展示/导出按 **一行一个 transaction**，每行填当前 transaction 的数量 |
| Payment Method | 能 | 暂时固定为 'Credit Card' |
| Date Shipped | 能 | 暂时固定为 空 |
| Street 1 | 能 | `orders[].fulfillment.to_address.first_line` |
| Street 2 | 能 | `orders[].fulfillment.to_address.second_line` |
| Ship City | 能 | `orders[].fulfillment.to_address.city` |
| Ship State | 能 | `orders[].fulfillment.to_address.state` |
| Ship Zipcode | 能 | `orders[].fulfillment.to_address.zip` |
| Ship Country | 能 | `orders[].fulfillment.to_address.country` |
| Currency | 能 | `orders[].payment.cost_breakdown.total_cost.currency_code`（如 "USD"） |
| Order Value | 能 | `orders[].payment.cost_breakdown.items_cost.value` ÷ 100（或 transactions 金额汇总） |
| Coupon Code | 能 | `orders[].payment.sellermarketing_coupons[0].code`，订单维度字段；当前展示/导出按 **一行一个 transaction**，同一订单拆出的每一行重复该值 |
| Coupon Details | 能 | `sellermarketing_coupons[0].percentage` 拼成如 "15% off"；订单维度字段；当前展示/导出按 **一行一个 transaction**，同一订单拆出的每一行重复该值 |
| Discount Amount | 能 | `orders[].payment.cost_breakdown.discount.value` ÷ 100 |
| Shipping Discount | 能 | `orders[].payment.cost_breakdown.shipping_discount.value` ÷ 100 |
| Shipping | 能 | `orders[].payment.cost_breakdown.shipping_cost.value` ÷ 100 |
| Sales Tax | 能 | `orders[].payment.cost_breakdown.tax_cost.value` ÷ 100 |
| Order Total | 能 | `orders[].payment.cost_breakdown.total_cost.value` ÷ 100 |
| Status | 能 |暂时固定为 空 |
| Card Processing Fees | 不能 | 列表接口无，需 **EarningsDetails** |
| Order Net | 不能 | 列表接口无，需 **EarningsDetails** 的 `total`（卖家实收）。**当前导出/展示**：固定填「暂时无法获取」。 |
| Adjusted Order Total | 能（部分） | 通常为 0；或 `cost_breakdown.adjusted_total_cost`、`refund` 等按业务约定。**当前导出/展示**：固定填 `0`。 |
| Adjusted Card Processing Fees | 不能 | 需 **EarningsDetails** 的 refunds_details。**当前导出/展示**：固定填 `0`。 |
| Adjusted Net Order Amount | 不能 | 需 **EarningsDetails** 或按退款与净收入推算。**当前导出/展示**：固定填 `0`。 |
| Buyer | 能 | 同 Full Name：`orders[].fulfillment.to_address.name` |
| Order Type | 能 | 由 `orders[].payment.is_in_person_payment` 等推断，如 false → "online" |
| Payment Type | 能 | **版本一**：由 `payment_method`、`is_in_person_payment` 等拼成如 "online_cc"、"online_paypal"。**版本二**：统一写为 `"online_cc"`，不区分实际支付方式（当前导出实现）。 |
| InPerson Discount | 能 |暂时固定为 空 |
| InPerson Location | 能 |暂时固定为 空 |
| SKU | 能 | `orders[].transactions[].product.product_identifier`（**取值以列表接口为准**，如 "QUECABSW023P02"；多商品可逗号拼接或按行展开） |
| Item Name | 能 | `orders[].transactions[].product.title`（如 "Custom Beach Towels with Picture..."；多商品可逗号拼接） |

**当前展示/导出策略**：按「一行一个 transaction」展开。同一订单如果有多个商品，会按 `transaction_id` 拆成多行；订单级字段（如 Coupon Code、Coupon Details、地址、Order Total）会在这些行中重复，商品级字段（如 Transaction ID、SKU、Item Name、Number of Items）则逐行对应当前 transaction。

---

## 二、收益明细接口（Etsy_Order_Fulfillment_EarningsDetails）

**请求**：按订单请求，GET  
`https://www.etsy.com/api/v3/ajax/shop/{shopId}/mission-control/orders/earnings/{orderId}/details/all?include_refunded_labels=true&include_vat_in_sum=true`

返回该订单的买家实付、优惠、费用、净收入等。金额为 `amount`/`divisor`（如 amount=1623, divisor=100 → 16.23）。

| 表格字段 | 结论 | 接口路径 / 取值说明 |
|----------|------|----------------------|
| Currency | 能 | `shop_currency` 或 `buyer_paid_details.total_paid.currency_code` |
| Order Value | 能 | `buyer_paid_details.items_price`（amount/divisor） |
| Coupon Code | 能 | 订单维：`buyer_paid_details.shop_promotions[0].name`（与列表版本一一致，仅一条）。 |
| Coupon Details | 能 | 订单维：`shop_promotions[]` 等拼成 "% off" 或 "15% off"（与列表版本一一致）。 |
| Discount Amount | 能 | `buyer_paid_details.shop_coupon_discount_amount`（amount/divisor） |
| Shipping Discount | 能 | `buyer_paid_details.discounted_shipping_cost`（多为 0） |
| Shipping | 能 | `buyer_paid_details.shipping_price` |
| Sales Tax | 能 | `buyer_paid_details.tax_price` |
| Order Total | 能 | `buyer_paid_details.total_paid` |
| Card Processing Fees | 能 | `fees_and_credits_details.processing_fee`：结构为 `{ amount, divisor, currency_code, currency_formatted_short }`（如 amount=-135, divisor=100 → 取绝对值后 1.35，即 \|amount\|/divisor） |
| Order Net | 能 | `total`（卖家实收，amount/divisor）。当前导出未使用该值，Order Net 列统一填「暂时无法获取」。 |
| Adjusted Order Total | 不确定 | `refunds_details` 有退款结构，是否对应 “Adjusted Order Total” 需按业务定义 |
| Adjusted Card Processing Fees | 不确定 | `refunds_details.seller_refunds` 等 |
| Adjusted Net Order Amount | 不确定 | 可从退款与 total 推算，语义需与业务确认 |

EarningsDetails **不包含**：Order ID（需请求参数）、Transaction ID、Buyer User ID、Full Name、First/Last Name、地址、**SKU**、**Item Name**、Number of Items、Payment Method、Order Type、Payment Type、Sale Date 等；**Transaction ID / SKU / Item Name 仅从列表接口取**。

---

## 四、组合建议

| 目标 | 建议接口组合 |
|------|----------------|
| 仅列表接口 | 可覆盖除 Card Processing Fees、Order Net、Adjusted Card Processing Fees、Adjusted Net Order Amount 外的所有目标字段；SKU、Item Name、姓名、地址、金额等均以列表为准。 |
| 完整导出（含净额与费用） | **订单列表接口** + 按 order_id 请求 **EarningsDetails**，用列表填大部分字段，用详情填 Card Processing Fees、Order Net 及 Adjusted 相关。Order Net 当前固定为「暂时无法获取」，未从详情取。 |

---

## 五、按表格字段汇总（接口来源）

字段顺序与第一节一致；列表接口能取的用 ✓ + 路径，固定值标「固定」；详情接口能取的用 ✓ + 路径。

| 表格字段 | 列表接口 | EarningsDetails | 说明 |
|----------|----------|-----------------|------|
| Sale Date | ✓ order_date | — | 转成 MM/DD/YY 等 |
| Order ID | ✓ order_id | — | 导出加前缀 SLA/SLB/SLC |
| Transaction ID | ✓ transactions[].transaction_id / transaction_ids[] | — | 当前按一行一个 transaction 展示/导出 |
| Buyer User ID | ✓ buyers[].username | — | 按 buyer_id 匹配 |
| Full Name | ✓ to_address.name | — | 收货人全名 |
| First Name | ✓ to_address.name 拆分 | — | 首段 |
| Last Name | ✓ to_address.name 拆分 | — | 其余 |
| Number of Items | ✓ transactions[].quantity | — | 当前按一行一个 transaction 展示/导出 |
| Payment Method | 固定 'Credit Card' | — | |
| Date Shipped | 固定 空 | — | |
| Street 1 | ✓ to_address.first_line | — | |
| Street 2 | ✓ to_address.second_line | — | |
| Ship City | ✓ to_address.city | — | |
| Ship State | ✓ to_address.state | — | |
| Ship Zipcode | ✓ to_address.zip | — | |
| Ship Country | ✓ to_address.country | — | |
| Currency | ✓ cost_breakdown.total_cost.currency_code | ✓ shop_currency / total_paid | |
| Order Value | ✓ cost_breakdown.items_cost.value ÷100 | ✓ items_price | |
| Coupon Code | ✓ sellermarketing_coupons[0].code | ✓ shop_promotions[0].name | 当前按一行一个 transaction 展示/导出，同订单多行重复 |
| Coupon Details | ✓ sellermarketing_coupons[0].percentage → "15% off" | ✓ shop_promotions 拼 "% off" | 当前按一行一个 transaction 展示/导出，同订单多行重复 |
| Discount Amount | ✓ cost_breakdown.discount.value ÷100 | ✓ shop_coupon_discount_amount | |
| Shipping Discount | ✓ cost_breakdown.shipping_discount.value ÷100 | ✓ discounted_shipping_cost | |
| Shipping | ✓ cost_breakdown.shipping_cost.value ÷100 | ✓ shipping_price | |
| Sales Tax | ✓ cost_breakdown.tax_cost.value ÷100 | ✓ tax_price | |
| Order Total | ✓ cost_breakdown.total_cost.value ÷100 | ✓ total_paid | |
| Status | 固定 空 | — | |
| Card Processing Fees | — | ✓ fees_and_credits_details.processing_fee（\|amount\|/divisor） | 仅详情有 |
| Order Net | — | ✓ total（卖家实收） | 仅详情有；当前导出固定为「暂时无法获取」 |
| Adjusted Order Total | ✓ 部分 cost_breakdown.adjusted_total_cost 等 | ✓ refunds_details | 通常为 0；当前导出固定为 `0` |
| Adjusted Card Processing Fees | — | ✓ refunds_details.seller_refunds | 仅详情有；当前导出固定为 `0` |
| Adjusted Net Order Amount | — | ✓ 从 refunds 与 total 推算 | 仅详情有；当前导出固定为 `0` |
| Buyer | ✓ to_address.name | — | 与 Full Name 同源 |
| Order Type | ✓ is_in_person_payment 等推断 | — | 如 "online" |
| Payment Type | ✓ payment_method 等拼 | — | 如 "online_cc" |
| InPerson Discount | 固定 空 | — | |
| InPerson Location | 固定 空 | — | |
| SKU | ✓ transactions[].product.product_identifier | — | 取值以列表为准 |
| Item Name | ✓ transactions[].product.title | — | 取值以列表为准 |
