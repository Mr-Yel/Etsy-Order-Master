# Etsy 订单导出 — 字段必选与获取方式

基于导入目标系统（KST 等）实际使用的字段，区分**必须**与**可能需要的**，并列出每字段的**获取方式**（接口优先，DOM 作为备选）。表格字段以 `etsy-order-fields.js` 为准。

---

## 一、必选 / 可选说明

- **必须**：导入目标系统订单主表、收货信息、订单明细会用到，缺失会导致导入失败或信息不完整。
- **可能需要的**：目标系统当前未用，但可用于报表、对账、客服或后续扩展，建议在数据源允许时一并采集。

---

## 二、字段清单（字段名 | 中文 | 是否必须 | 获取方式）

| 字段名 | 中文 | 是否必须 | 获取方式 |
|--------|------|----------|----------|
| **Order ID** | 订单ID | 必须 | **接口**：订单列表 `orders[].order_id`。**DOM**：列表页 `input[type="checkbox"][name]` 的 name/value，或 `a[href*="order_id="]`；详情页 `#order-details-order-info a[href*="order_id"]`。 |
| **Sale Date** | 销售日期 | 必须 | **接口**：订单列表 `orders[].order_date`（Unix 时间戳转日期）。**DOM**：含 "Ordered" 的 `.text-body-smaller` 解析日期；列表页 "Ordered MM/DD/YYYY" 文本。 |
| **Full Name** | 全名 | 必须 | **接口**：订单列表 用 `orders[].buyer_id` 匹配 `buyers[]`，取 `buyers[].name`。**DOM**：详情 `div.address .name` 或 dropdown 内 `span[data-test-id="unsanitize"]`；列表同类型 dropdown。 |
| **Buyer** | 买家 | 必须 | 与 Full Name 同源，取同一值即可。 |
| **Street 1** | 街道1 | 必须 | **接口**：订单列表 `orders[].fulfillment.to_address.first_line`。**DOM**：详情 `div.address .first-line`。 |
| **Street 2** | 街道2 | 必须 | **接口**：订单列表 `orders[].fulfillment.to_address.second_line`。**DOM**：详情 `div.address .second-line`（可能为空）。 |
| **Ship City** | 收货城市 | 必须 | **接口**：订单列表 `orders[].fulfillment.to_address.city`。**DOM**：详情 `div.address .city`。 |
| **Ship State** | 收货州/省 | 必须 | **接口**：订单列表 `orders[].fulfillment.to_address.state`。**DOM**：详情 `div.address .state`。 |
| **Ship Zipcode** | 收货邮编 | 必须 | **接口**：订单列表 `orders[].fulfillment.to_address.zip`。**DOM**：详情 `div.address .zip`。 |
| **Ship Country** | 收货国家 | 必须 | **接口**：订单列表 `orders[].fulfillment.to_address.country`。**DOM**：详情 `div.address .country-name`。 |
| **SKU** | 库存单位/商品SKU | 必须 | **接口**：订单列表 `orders[].transactions[].product.product_identifier`，多商品逗号拼接。**DOM**：详情/列表 "SKU: " 后文本或 Receipt 表格内 SKU 单元格。 |
| **Item Name** | 商品名称 | 必须 | **接口**：订单列表 `orders[].transactions[].product.title`，多商品逗号拼接。**DOM**：商品标题区域文本；若页面节点稳定，可取对应标题元素。 |
| **Number of Items** | 商品数量 | 必须 | **接口**：订单列表 `orders[].transactions[].quantity` 求和。**DOM**：详情 "1 Item(s)" / "1 item" 或 `table.b-xs-0 tbody tr` 数量；列表 "1 item" 文本。 |
| **Currency** | 货币 | 必须 | **接口**：订单列表 `orders[].payment.cost_breakdown.total_cost.currency_code`；或收益接口 `shop_currency`。**DOM**：从金额前的 "$" 或 Order total 推断；美国站可默认 USD。 |
| **Order Value** | 订单价值 | 必须 | **接口**：订单列表 `orders[].payment.cost_breakdown.items_cost`（value 为分需 ÷100）；或收益接口 `buyer_paid_details.items_price`。**DOM**：详情 Receipt "Item total" 行右侧金额。 |
| **Buyer User ID** | 买家用户ID | 可能需要的 | **接口**：订单列表 用 `order.buyer_id` 匹配 `buyers[]`，取 `buyers[].buyer_id` 或 `buyers[].username`（Guest 无 username）。**DOM**：详情 `a[href*="buyer_id="]` 的 href 解析 buyer_id。 |
| **First Name** | 名字 | 可能需要的 | **接口**：从 `buyers[].name` 按空格拆分。**DOM**：从 `div.address .name` 或买家名节点按空格拆分（格式不保证）。 |
| **Last Name** | 姓氏 | 可能需要的 | 同上，拆分的后半段。 |
| **Payment Method** | 支付方式 | 可能需要的 | **接口**：订单列表 `orders[].payment.payment_method`（cc/dc_paypal/apple_pay/k_pay_later 等，可映射为 "Credit Card" 等）。**DOM**：详情 `#payment-msg` 解析 "Paid via ..." 文案。 |
| **Date Shipped** | 发货日期 | 可能需要的 | **接口**：订单列表 `orders[].fulfillment.actual_ship_date`（未发货为 null）。**DOM**：已发货订单在时间线/Shipped 区块查找；未发货无此值。 |
| **Coupon Code** | 优惠券代码 | 可能需要的 | **接口**：订单列表 `orders[].payment.sellermarketing_coupons[0].code`；或收益接口 `buyer_paid_details.shop_promotions[0].name`。**DOM**：含优惠券代码的 badge 或折扣行文本。 |
| **Coupon Details** | 优惠券详情 | 可能需要的 | **接口**：从 `sellermarketing_coupons[0].percentage` 或 `shop_promotions` 拼成如 "15% off"。**DOM**：`span[data-tooltip="15% off"]` 或折扣行文案。 |
| **Discount Amount** | 折扣金额 | 可能需要的 | **接口**：订单列表 `orders[].payment.cost_breakdown.discount`；或收益接口 `shop_coupon_discount_amount`。**DOM**：Receipt 中 Shop coupon 行右侧金额。 |
| **Shipping Discount** | 运费折扣 | 可能需要的 | **接口**：订单列表 `orders[].payment.cost_breakdown.shipping_discount`；或收益接口 `discounted_shipping_cost`。**DOM**：Receipt "Shipping discount" 相关行（若为 0 可能不展示）。 |
| **Shipping** | 运费 | 可能需要的 | **接口**：订单列表 `orders[].payment.cost_breakdown.shipping_cost` 或 `adjusted_shipping_cost`；或收益接口 `shipping_price`。**DOM**：详情 Receipt "Shipping price" 行或 Ship to 区域运费金额。 |
| **Sales Tax** | 销售税 | 可能需要的 | **接口**：订单列表 `orders[].payment.cost_breakdown.tax_cost`；或收益接口 `buyer_paid_details.tax_price`。**DOM**：详情 Receipt "Sales tax" 行右侧。 |
| **Order Total** | 订单总额 | 可能需要的 | **接口**：订单列表 `orders[].payment.cost_breakdown.total_cost`；或收益接口 `buyer_paid_details.total_paid`。**DOM**：详情 Receipt "Order total" 行；列表金额节点。 |
| **Status** | 状态 | 可能需要的 | **接口**：订单列表 用 `orders[].order_state_id` 匹配 `order_states[].order_state_id`，取 `order_states[].name`（如 "New"）。**DOM**：详情 `button[role="menuitemradio"][aria-checked="true"]` 文本或 "Update progress" 下拉当前项。 |
| **Card Processing Fees** | 银行卡处理费 | 可能需要的 | **接口**：仅收益接口 `fees_and_credits_details.processing_fee`。**DOM**：详情切到 Earnings Tab，在 "Payment processing fee" 行取金额（`#dg-tabs-preact__tab-2--default_wt_tab_panel` 内）。 |
| **Order Net** | 订单净额 | 可能需要的 | **接口**：仅收益接口 `total`（卖家实收）。**DOM**：Earnings 区块 "You earned $x.xx" 或 `.wt-text-slime`。 |
| **Adjusted Order Total** | 调整后的订单总额 | 可能需要的 | **接口**：订单列表 `orders[].payment.cost_breakdown.adjusted_total_cost`、`refund`；或收益接口 `refunds_details`。**DOM**：当前详情页片段无调整项展示，退款后可能出现在其它区块。 |
| **Adjusted Card Processing Fees** | 调整后的银行卡处理费 | 可能需要的 | **接口**：仅收益接口 `refunds_details.seller_refunds` 等。**DOM**：无直接对应。 |
| **Adjusted Net Order Amount** | 调整后的订单净额 | 可能需要的 | **接口**：收益接口退款与 total 推算。**DOM**：无直接对应。 |
| **Order Type** | 订单类型 | 可能需要的 | **接口**：订单列表 `orders[].payment.is_in_person_payment` → false 为 "online"，true 为线下。**DOM**：无线下标记时可默认 "online"。 |
| **Payment Type** | 支付类型 | 可能需要的 | **接口**：订单列表 `payment_method` + `is_in_person_payment` 拼成如 "online_cc"、"online_paypal"。**DOM**：同 `#payment-msg` 解析后映射。 |
| **InPerson Discount** | 线下折扣 | 可能需要的 | **接口**：当前接口未见。**DOM**：无线下订单相关文案。 |
| **InPerson Location** | 线下地点 | 可能需要的 | **接口**：`orders[].fulfillment.status.in_person_status`（线下单才有）。**DOM**：无。 |

---

## 三、获取方式优先级建议

1. **以接口为主**：能走 **Orders_OrdersCollection（订单列表）** 的字段一律用接口，避免依赖页面结构和多页点击。
2. **必须字段**：订单列表接口可提供全部必须字段（Order ID、Sale Date、Full Name/Buyer、地址、SKU、Item Name、Number of Items、Currency、Order Value）；无需 DOM 即可完成导入所需数据。
3. **净额与费用**：Card Processing Fees、Order Net 仅收益接口 **Etsy_Order_Fulfillment_EarningsDetails** 有，若需“可能需要的”金额类字段，再按 order_id 请求该接口。
4. **DOM 作为兜底**：接口不可用或需在详情页内一键导出时，按上表 DOM 列选择器取数；地址、金额、Status 等需在详情页取。

---

## 四、必须字段汇总（15 项）

Order ID、Sale Date、Full Name、Buyer、Street 1、Street 2、Ship City、Ship State、Ship Zipcode、Ship Country、SKU、Item Name、Number of Items、Currency、Order Value。

以上 14 项在目标系统中用于订单主表、收货信息与订单明细，**订单列表接口单接口即可满足**，无需详情页 DOM 或收益接口。
