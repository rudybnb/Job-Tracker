import assert from "node:assert/strict";
import test from "node:test";

type PaymentStatus = "PENDING" | "SCHEDULED" | "PAID" | "FAILED" | "CANCELLED" | "REVERSED";
type Payment = { amountPennies: number; status: PaymentStatus };

function effectivePaid(payments: Payment[]): number {
  return payments.reduce((total, payment) => {
    if (payment.status === "PAID") return total + payment.amountPennies;
    if (payment.status === "REVERSED") return total - payment.amountPennies;
    return total;
  }, 0);
}

function addPayment(approvedPennies: number, payments: Payment[], payment: Payment): Payment[] {
  const next = [...payments, payment];
  const paid = effectivePaid(next);
  if (paid < 0 || paid > approvedPennies) throw new Error("cumulative PAID contractor payments exceed approved valuation value");
  return next;
}

test("Patrick Brook Kitchen GBP45 payment settles only its approved socket valuation", () => {
  const projectTenderPennies = 11 * 4_500;
  const kitchenValuationPennies = 4_500;
  const payments = addPayment(kitchenValuationPennies, [], { amountPennies: 4_500, status: "PAID" });
  assert.equal(effectivePaid(payments), kitchenValuationPennies);
  assert.equal(kitchenValuationPennies - effectivePaid(payments), 0);
  assert.equal(projectTenderPennies, 49_500);
  assert.equal(projectTenderPennies - kitchenValuationPennies, 45_000);
  assert.equal((projectTenderPennies - kitchenValuationPennies) / 4_500, 10);
});

test("GBP90 valuation supports GBP50 plus GBP40 and blocks another GBP1", () => {
  const approved = 9_000;
  let payments = addPayment(approved, [], { amountPennies: 5_000, status: "PAID" });
  assert.equal(approved - effectivePaid(payments), 4_000);
  payments = addPayment(approved, payments, { amountPennies: 4_000, status: "PAID" });
  assert.equal(approved - effectivePaid(payments), 0);
  assert.throws(() => addPayment(approved, payments, { amountPennies: 100, status: "PAID" }), /exceed approved valuation/);
});

test("non-effective statuses do not consume approved balance", () => {
  const payments: Payment[] = [
    { amountPennies: 9_000, status: "PENDING" },
    { amountPennies: 9_000, status: "SCHEDULED" },
    { amountPennies: 9_000, status: "FAILED" },
    { amountPennies: 9_000, status: "CANCELLED" },
  ];
  assert.equal(effectivePaid(payments), 0);
});

test("explicit reversal offsets paid cash without deleting history", () => {
  const payments: Payment[] = [
    { amountPennies: 4_500, status: "PAID" },
    { amountPennies: 4_500, status: "REVERSED" },
  ];
  assert.equal(payments.length, 2);
  assert.equal(effectivePaid(payments), 0);
});

test("held and rejected work has no payable valuation balance", () => {
  const inspection = { approved: 0, held: 1, rejected: 1 };
  const approvedValuationPennies = inspection.approved * 4_500;
  assert.equal(approvedValuationPennies, 0);
  assert.throws(() => addPayment(approvedValuationPennies, [], { amountPennies: 4_500, status: "PAID" }), /exceed approved valuation/);
});
