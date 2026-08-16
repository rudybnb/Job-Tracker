-- Phase 2L: canonical contractor actual-cash payment ledger.
-- Phase 2K confirmed that public.contractor_payments is absent and has no historical rows.

CREATE TABLE contractor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  contractor_id VARCHAR NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
  contractor_valuation_id UUID REFERENCES contractor_valuation(id) ON DELETE RESTRICT,
  reverses_payment_id UUID REFERENCES contractor_payments(id) ON DELETE RESTRICT,
  payment_amount NUMERIC(18,2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'GBP',
  payment_date DATE NOT NULL,
  payment_status TEXT NOT NULL,
  payment_reference TEXT,
  payment_method TEXT,
  notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contractor_payments_amount_positive CHECK (payment_amount > 0),
  CONSTRAINT contractor_payments_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT contractor_payments_status_check
    CHECK (payment_status IN ('PENDING', 'SCHEDULED', 'PAID', 'FAILED', 'CANCELLED', 'REVERSED')),
  CONSTRAINT contractor_payments_unlinked_reason_guard CHECK (
    contractor_valuation_id IS NOT NULL OR (
      NULLIF(BTRIM(source_metadata ->> 'source'), '') IS NOT NULL
      AND NULLIF(BTRIM(source_metadata ->> 'reason'), '') IS NOT NULL
    )
  ),
  CONSTRAINT contractor_payments_reversal_guard CHECK (
    (payment_status = 'REVERSED') = (reverses_payment_id IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX contractor_payments_job_idx
  ON contractor_payments (job_id, payment_date);
--> statement-breakpoint
CREATE INDEX contractor_payments_contractor_idx
  ON contractor_payments (contractor_id, payment_date);
--> statement-breakpoint
CREATE INDEX contractor_payments_valuation_idx
  ON contractor_payments (contractor_valuation_id, payment_status);
--> statement-breakpoint
CREATE INDEX contractor_payments_reverses_idx
  ON contractor_payments (reverses_payment_id);
--> statement-breakpoint
CREATE FUNCTION enforce_contractor_payment_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  valuation contractor_valuation%ROWTYPE;
  reversed_payment contractor_payments%ROWTYPE;
  approved_value NUMERIC(18,2);
  effective_paid NUMERIC(18,2);
  existing_payment_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contractor payment history cannot be deleted; append an explicit reversal';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.payment_status IN ('PAID', 'REVERSED') THEN
    RAISE EXCEPTION 'effective contractor payment history is immutable; append an explicit reversal';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    existing_payment_id := OLD.id;
  END IF;

  IF NEW.payment_status = 'REVERSED' THEN
    SELECT * INTO reversed_payment
      FROM contractor_payments
      WHERE id = NEW.reverses_payment_id
      FOR UPDATE;
    IF NOT FOUND
      OR reversed_payment.payment_status <> 'PAID'
      OR reversed_payment.job_id <> NEW.job_id
      OR reversed_payment.contractor_id <> NEW.contractor_id
      OR reversed_payment.contractor_valuation_id IS DISTINCT FROM NEW.contractor_valuation_id
      OR reversed_payment.currency_code <> NEW.currency_code
      OR reversed_payment.payment_amount <> NEW.payment_amount
    THEN
      RAISE EXCEPTION 'reversal must exactly match an existing PAID payment';
    END IF;
    IF EXISTS (
      SELECT 1 FROM contractor_payments reversal
      WHERE reversal.reverses_payment_id = NEW.reverses_payment_id
        AND reversal.payment_status = 'REVERSED'
        AND (existing_payment_id IS NULL OR reversal.id <> existing_payment_id)
    ) THEN
      RAISE EXCEPTION 'paid contractor payment has already been reversed';
    END IF;
  END IF;

  IF NEW.contractor_valuation_id IS NOT NULL THEN
    IF NEW.payment_status IN ('PAID', 'REVERSED')
      AND current_setting('transaction_isolation') <> 'serializable'
    THEN
      RAISE EXCEPTION 'valuation-linked effective payments require a SERIALIZABLE transaction with retry on serialization failure';
    END IF;

    SELECT * INTO valuation
      FROM contractor_valuation
      WHERE id = NEW.contractor_valuation_id
      FOR UPDATE;
    IF NOT FOUND OR valuation.status <> 'APPROVED' THEN
      RAISE EXCEPTION 'contractor payments can only consume an APPROVED valuation';
    END IF;
    IF valuation.job_id <> NEW.job_id
      OR valuation.contractor_id <> NEW.contractor_id
      OR valuation.currency_code <> NEW.currency_code
    THEN
      RAISE EXCEPTION 'payment does not match valuation job, contractor, or currency';
    END IF;

    IF NEW.payment_status IN ('PAID', 'REVERSED') THEN
      SELECT COALESCE(SUM(line.current_value), 0)
        INTO approved_value
        FROM contractor_valuation_line line
        WHERE line.contractor_valuation_id = NEW.contractor_valuation_id;

      SELECT COALESCE(SUM(
        CASE
          WHEN payment.payment_status = 'PAID' THEN payment.payment_amount
          WHEN payment.payment_status = 'REVERSED' THEN -payment.payment_amount
          ELSE 0
        END
      ), 0)
        INTO effective_paid
        FROM contractor_payments payment
        WHERE payment.contractor_valuation_id = NEW.contractor_valuation_id
          AND payment.payment_status IN ('PAID', 'REVERSED')
          AND (existing_payment_id IS NULL OR payment.id <> existing_payment_id);

      effective_paid := effective_paid + CASE
        WHEN NEW.payment_status = 'PAID' THEN NEW.payment_amount
        ELSE -NEW.payment_amount
      END;
      IF effective_paid < 0 OR effective_paid > approved_value THEN
        RAISE EXCEPTION 'cumulative PAID contractor payments exceed approved valuation value';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contractor_payments_ledger_guard
BEFORE INSERT OR UPDATE OR DELETE ON contractor_payments
FOR EACH ROW
EXECUTE FUNCTION enforce_contractor_payment_ledger();
