# Goods Receipt And Supplier Invoice Ledger

## Legacy Boundary

The legacy stores remain unchanged and must not be summed or bridged automatically:

- `material_purchases` is asserted invoice/purchase-line evidence with text quantities, money, dates, and no canonical project or order relationship.
- `expenses` is a mutable general expense ledger whose initializer and active route vocabularies currently disagree.
- `project_cashflow_weekly` is an editable forecast/reporting snapshot. Its `actual_material_cost` is not derived from `material_purchases`, invoices, payments, or bank evidence.
- `project_master` is a legacy reporting project root, not canonical `jobs` identity.

A supplier charge may therefore appear in more than one legacy store. No description, project name, supplier, date, invoice number, or amount match is sufficient for an automatic backfill. A later bridge requires live duplicate inventory and reviewed canonical job mapping.

## Permanent Chain

```text
HBXL baseline
-> procurement requirement
-> supplier quote
-> purchase order
-> goods receipt
-> supplier invoice actual cost
-> future supplier payment
```

Each stage remains independent. Receipt posting does not change ordered quantity. Invoice approval does not change receipt, PO, quote, requirement, or HBXL values.

## Receipt Quantity

`received_quantity` records what arrived. `accepted_quantity` and `rejected_quantity` remain separate and must not exceed what arrived. One PO line may have multiple receipt lines.

Only `RECEIVED` and `PART_RECEIVED` headers consume accepted quantity. Posting and cancellation require a `SERIALIZABLE` transaction with retry on SQLSTATE `40001`; PO lines are locked deterministically before cumulative accepted quantity is compared with ordered quantity.

Rejected or unexplained quantity is review evidence. It cannot be silently represented as `MATCHED`.

## Invoice Actual Cost

`actual_unit_price` and `actual_line_value` are what the supplier billed. They are not evidence that the supplier was paid. `actual_line_value` is rounded to two decimals from invoiced quantity multiplied by the six-decimal actual unit price.

One PO line may appear on multiple invoice lines and invoices. Only `APPROVED` invoices consume invoiced quantity. Approval and cancellation require `SERIALIZABLE` locking and cumulative checks against ordered and accepted quantities. A quantity beyond accepted goods or a price/quantity discrepancy must remain review evidence and requires explicit confirmation before approval.

## History

Effective receipt and approved invoice evidence cannot be silently edited or deleted. Corrections use cancellation and replacement evidence. Credit notes, VAT, CIS, supplier payments, and accounting integration are deferred.
