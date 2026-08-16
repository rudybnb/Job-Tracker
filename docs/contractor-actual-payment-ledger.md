# Contractor Actual Payment Ledger

## Canonical Role

`contractor_payments` records actual cash paid to contractors. It does not recalculate or modify approved quantity, valuation value, tender quantity, tender rate, claims, or inspection history.

The preferred measurable-work path is:

```text
APPROVED contractor_valuation -> one or more contractor_payments
```

One valuation may have zero, one, or multiple payment rows. This supports partial payment without duplicating valuation facts.

## Effective Balance

Only `PAID` increases effective paid value. `REVERSED` offsets one identified `PAID` row by the same amount, job, contractor, valuation, and currency. `PENDING`, `SCHEDULED`, `FAILED`, and `CANCELLED` do not consume approved balance.

Paid and reversed rows are immutable and cannot be deleted. Corrections append an explicit `REVERSED` row through `reverses_payment_id`, retaining both the original cash event and its correction.

## Concurrency Rule

Every valuation-linked `PAID` or `REVERSED` insert or transition must run in a `SERIALIZABLE` transaction and retry PostgreSQL serialization failures (`SQLSTATE 40001`). The database trigger locks the valuation header, verifies that it remains `APPROVED`, derives approved value from `SUM(contractor_valuation_line.current_value)`, and rejects a net paid total below zero or above that approved value.

This lock and isolation rule is mandatory. An application-side balance check alone is not sufficient because concurrent payments could both observe the same remaining balance.

## Eligibility

A linked payment must match the valuation's job, contractor, and currency. Held, rejected, merely completed, claimed, or inspected work is not payment authority; only value already captured by an `APPROVED` valuation is eligible.

## Exceptional Unlinked Payments

`contractor_valuation_id` is nullable for explicit manual or legacy exceptions. New measurable-work payments should not use this path. Every unlinked payment must include non-empty `source_metadata.source` and `source_metadata.reason`; callers must not guess a valuation link.

## Deferred Scope

VAT, CIS, retention, credit notes, deductions, procurement, and negative payment rows are not implemented in Phase 2L.
