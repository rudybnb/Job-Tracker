# Purchase Order Ledger

## Legacy Purchasing Audit

`material_purchases` is retained unchanged. Its text-valued quantity, money, date, invoice, supplier, and reporting-week fields make it legacy asserted invoice/purchase-line evidence. It does not prove an order, delivery, payable event, payment, or cash settlement and has no canonical requirement, quote, or job foreign keys.

F2A therefore does not rename, delete, repurpose, or link it. F2B must inventory duplicates across `material_purchases`, `expenses`, and weekly cashflow before creating a nullable bridge to canonical invoice/actual-cost evidence.

`materials_catalog` remains an optional catalog reference. Its standard price is not HBXL baseline, accepted quote, agreed PO price, or actual price.

## Commercial Separation

The authoritative stages remain separate:

```text
HBXL baseline allowance
-> procurement requirement
-> supplier quote evidence
-> authorised purchase order
-> future delivery
-> future invoice/actual cost
```

Creating a purchase order does not modify its supplier quote, procurement quantity, or HBXL baseline. The PO line stores its own agreed quantity and price snapshot.

## Effective Quantity

`DRAFT` and `CANCELLED` orders do not consume requirement quantity. `APPROVED`, `SENT`, `PART_ORDERED`, `ORDERED`, and `COMPLETED` orders consume it.

Order activation and cancellation must run in a `SERIALIZABLE` transaction with retry on PostgreSQL SQLSTATE `40001`. The database locks each linked requirement in deterministic order before checking cumulative effective quantity. Excess is rejected unless `source_metadata` contains both `over_order_reason` and `over_order_approved_by`.

The requirement status is synchronized after order status changes:

- zero effective quantity: `APPROVED_TO_BUY`;
- below required quantity: `PART_ORDERED`;
- equal to or explicitly approved above required quantity: `FULLY_ORDERED`.

## History

Lines can change only while their order is `DRAFT`. Once an order becomes effective, commercial identity and lines are immutable. Historical headers cannot be deleted. Corrections use cancellation and an optional replacement order through `supersedes_purchase_order_id`.

## Deferred Scope

Deliveries, goods receipts, invoices, credits, actual costs, payment reconciliation, VAT, and the legacy `material_purchases` bridge remain F2B or later work.
