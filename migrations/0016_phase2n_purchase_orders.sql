-- Phase 2N / F2A: authorised supplier purchase orders only.
-- Deliveries, invoices, actual-cost reconciliation, and legacy material_purchases bridging are deferred.

CREATE TABLE purchase_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  accepted_supplier_quote_id UUID REFERENCES supplier_quote(id) ON DELETE RESTRICT,
  supersedes_purchase_order_id UUID REFERENCES purchase_order(id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL,
  supplier_identity TEXT,
  po_number TEXT NOT NULL,
  supplier_reference TEXT,
  order_date DATE NOT NULL,
  expected_delivery_date DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  currency_code VARCHAR(3) NOT NULL DEFAULT 'GBP',
  notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_number_unique UNIQUE (job_id, po_number),
  CONSTRAINT purchase_order_supplier_required CHECK (NULLIF(BTRIM(supplier_name), '') IS NOT NULL),
  CONSTRAINT purchase_order_number_required CHECK (NULLIF(BTRIM(po_number), '') IS NOT NULL),
  CONSTRAINT purchase_order_delivery_date_guard CHECK (expected_delivery_date IS NULL OR expected_delivery_date >= order_date),
  CONSTRAINT purchase_order_status_check
    CHECK (status IN ('DRAFT', 'APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'CANCELLED', 'COMPLETED')),
  CONSTRAINT purchase_order_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT purchase_order_supersedes_other CHECK (supersedes_purchase_order_id IS NULL OR supersedes_purchase_order_id <> id),
  CONSTRAINT purchase_order_manual_source_guard CHECK (
    accepted_supplier_quote_id IS NOT NULL OR (
      NULLIF(BTRIM(source_metadata ->> 'source'), '') IS NOT NULL
      AND NULLIF(BTRIM(source_metadata ->> 'reason'), '') IS NOT NULL
    )
  )
);
--> statement-breakpoint
CREATE INDEX purchase_order_job_status_date_idx
  ON purchase_order (job_id, status, order_date);
--> statement-breakpoint
CREATE INDEX purchase_order_supplier_idx
  ON purchase_order (job_id, supplier_name, order_date);
--> statement-breakpoint
CREATE INDEX purchase_order_quote_idx
  ON purchase_order (accepted_supplier_quote_id);
--> statement-breakpoint
CREATE UNIQUE INDEX purchase_order_supersedes_unique
  ON purchase_order (supersedes_purchase_order_id)
  WHERE supersedes_purchase_order_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE purchase_order_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_order(id) ON DELETE RESTRICT,
  procurement_requirement_id UUID REFERENCES procurement_requirement(id) ON DELETE RESTRICT,
  supplier_quote_line_id UUID REFERENCES supplier_quote_line(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL,
  supplier_product_code TEXT,
  description TEXT NOT NULL,
  ordered_quantity NUMERIC(18,6) NOT NULL,
  unit_code TEXT NOT NULL,
  agreed_unit_price NUMERIC(18,6) NOT NULL,
  ordered_line_value NUMERIC(18,2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  required_date DATE,
  notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_line_number_unique UNIQUE (purchase_order_id, line_number),
  CONSTRAINT purchase_order_line_number_positive CHECK (line_number > 0),
  CONSTRAINT purchase_order_line_quantity_positive CHECK (ordered_quantity > 0),
  CONSTRAINT purchase_order_line_unit_price_nonnegative CHECK (agreed_unit_price >= 0),
  CONSTRAINT purchase_order_line_value_reconciles
    CHECK (ordered_line_value = round(ordered_quantity * agreed_unit_price, 2)),
  CONSTRAINT purchase_order_line_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE INDEX purchase_order_line_requirement_idx
  ON purchase_order_line (procurement_requirement_id);
--> statement-breakpoint
CREATE INDEX purchase_order_line_quote_line_idx
  ON purchase_order_line (supplier_quote_line_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_supplier_quote_line()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  quote supplier_quote%ROWTYPE;
  requirement_job_id VARCHAR;
BEGIN
  SELECT * INTO quote FROM supplier_quote WHERE id = NEW.supplier_quote_id FOR UPDATE;
  IF NOT FOUND OR quote.currency_code <> NEW.currency_code THEN
    RAISE EXCEPTION 'supplier quote line must match its quote currency';
  END IF;
  IF quote.status = 'ACCEPTED' THEN
    RAISE EXCEPTION 'lines cannot be added to an accepted supplier quote';
  END IF;
  IF NEW.procurement_requirement_id IS NOT NULL THEN
    SELECT job_id INTO requirement_job_id
      FROM procurement_requirement
      WHERE id = NEW.procurement_requirement_id;
    IF NOT FOUND OR requirement_job_id <> quote.job_id THEN
      RAISE EXCEPTION 'supplier quote line requirement must belong to the quote job';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION validate_purchase_order_line()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent purchase_order%ROWTYPE;
  requirement procurement_requirement%ROWTYPE;
  quote supplier_quote%ROWTYPE;
  quote_line supplier_quote_line%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO parent FROM purchase_order WHERE id = OLD.purchase_order_id FOR UPDATE;
    IF NOT FOUND OR parent.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'effective purchase order lines are immutable';
    END IF;
    RETURN OLD;
  END IF;

  SELECT * INTO parent FROM purchase_order WHERE id = NEW.purchase_order_id FOR UPDATE;
  IF NOT FOUND OR parent.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'purchase order lines can only change while the order is DRAFT';
  END IF;
  IF NEW.currency_code <> parent.currency_code THEN
    RAISE EXCEPTION 'purchase order line must match order currency';
  END IF;

  IF NEW.procurement_requirement_id IS NOT NULL THEN
    SELECT * INTO requirement FROM procurement_requirement WHERE id = NEW.procurement_requirement_id;
    IF NOT FOUND
      OR requirement.job_id <> parent.job_id
      OR requirement.unit_code <> NEW.unit_code
      OR requirement.status IN ('DRAFT', 'REVIEW_REQUIRED', 'CANCELLED')
    THEN
      RAISE EXCEPTION 'purchase order line must match an approved requirement job and unit';
    END IF;
  END IF;

  IF parent.accepted_supplier_quote_id IS NOT NULL THEN
    IF NEW.supplier_quote_line_id IS NULL THEN
      RAISE EXCEPTION 'quote-backed purchase order lines require supplier quote evidence';
    END IF;
    SELECT * INTO quote FROM supplier_quote WHERE id = parent.accepted_supplier_quote_id FOR UPDATE;
    SELECT * INTO quote_line FROM supplier_quote_line WHERE id = NEW.supplier_quote_line_id;
    IF NOT FOUND
      OR quote.status <> 'ACCEPTED'
      OR quote.job_id <> parent.job_id
      OR quote.supplier_name <> parent.supplier_name
      OR quote.supplier_identity IS DISTINCT FROM parent.supplier_identity
      OR quote.currency_code <> parent.currency_code
      OR quote_line.supplier_quote_id <> quote.id
      OR quote_line.procurement_requirement_id IS DISTINCT FROM NEW.procurement_requirement_id
      OR quote_line.unit_code <> NEW.unit_code
      OR quote_line.currency_code <> NEW.currency_code
    THEN
      RAISE EXCEPTION 'purchase order line does not match accepted quote, supplier, requirement, unit, or currency';
    END IF;
  ELSIF NEW.supplier_quote_line_id IS NOT NULL THEN
    RAISE EXCEPTION 'manual purchase order lines cannot claim supplier quote evidence';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER purchase_order_line_validate
BEFORE INSERT OR UPDATE OR DELETE ON purchase_order_line
FOR EACH ROW
EXECUTE FUNCTION validate_purchase_order_line();
--> statement-breakpoint
CREATE FUNCTION enforce_purchase_order_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  requirement_record RECORD;
  effective_before BOOLEAN;
  effective_after BOOLEAN;
  existing_ordered NUMERIC(18,6);
  this_ordered NUMERIC(18,6);
  allows_over_order BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'purchase order history cannot be deleted; cancel and replace the order';
  END IF;

  effective_before := OLD.status IN ('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED');
  effective_after := NEW.status IN ('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED');

  IF OLD.status <> 'DRAFT' AND (
    NEW.job_id IS DISTINCT FROM OLD.job_id
    OR NEW.accepted_supplier_quote_id IS DISTINCT FROM OLD.accepted_supplier_quote_id
    OR NEW.supersedes_purchase_order_id IS DISTINCT FROM OLD.supersedes_purchase_order_id
    OR NEW.supplier_name IS DISTINCT FROM OLD.supplier_name
    OR NEW.supplier_identity IS DISTINCT FROM OLD.supplier_identity
    OR NEW.po_number IS DISTINCT FROM OLD.po_number
    OR NEW.supplier_reference IS DISTINCT FROM OLD.supplier_reference
    OR NEW.order_date IS DISTINCT FROM OLD.order_date
    OR NEW.expected_delivery_date IS DISTINCT FROM OLD.expected_delivery_date
    OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.source_metadata IS DISTINCT FROM OLD.source_metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'approved or sent purchase order commercial evidence is immutable';
  END IF;
  IF OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED'
    OR OLD.status = 'COMPLETED' AND NEW.status <> 'COMPLETED'
  THEN
    RAISE EXCEPTION 'cancelled or completed purchase orders cannot be reopened';
  END IF;
  IF OLD.status = 'APPROVED' AND NEW.status NOT IN ('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'CANCELLED')
    OR OLD.status = 'SENT' AND NEW.status NOT IN ('SENT', 'PART_ORDERED', 'ORDERED', 'CANCELLED')
    OR OLD.status = 'PART_ORDERED' AND NEW.status NOT IN ('PART_ORDERED', 'ORDERED', 'CANCELLED')
    OR OLD.status = 'ORDERED' AND NEW.status NOT IN ('ORDERED', 'COMPLETED', 'CANCELLED')
  THEN
    RAISE EXCEPTION 'effective purchase order status cannot move backwards';
  END IF;

  IF effective_before IS DISTINCT FROM effective_after THEN
    IF current_setting('transaction_isolation') <> 'serializable' THEN
      RAISE EXCEPTION 'purchase order activation and cancellation require a SERIALIZABLE transaction with retry on serialization failure';
    END IF;
    IF effective_after AND NOT EXISTS (SELECT 1 FROM purchase_order_line WHERE purchase_order_id = NEW.id) THEN
      RAISE EXCEPTION 'effective purchase order requires at least one line';
    END IF;
    IF effective_after AND EXISTS (
      SELECT 1
      FROM purchase_order_line line
      LEFT JOIN procurement_requirement requirement ON requirement.id = line.procurement_requirement_id
      WHERE line.purchase_order_id = NEW.id
        AND line.procurement_requirement_id IS NOT NULL
        AND (
          requirement.id IS NULL
          OR requirement.job_id <> NEW.job_id
          OR requirement.unit_code <> line.unit_code
          OR requirement.status IN ('DRAFT', 'REVIEW_REQUIRED', 'CANCELLED')
        )
    ) THEN
      RAISE EXCEPTION 'effective purchase order lines must still match approved requirement job and unit';
    END IF;

    allows_over_order := NULLIF(BTRIM(NEW.source_metadata ->> 'over_order_reason'), '') IS NOT NULL
      AND NULLIF(BTRIM(NEW.source_metadata ->> 'over_order_approved_by'), '') IS NOT NULL;

    FOR requirement_record IN
      SELECT requirement.id, requirement.required_quantity
      FROM procurement_requirement requirement
      WHERE requirement.id IN (
        SELECT line.procurement_requirement_id
        FROM purchase_order_line line
        WHERE line.purchase_order_id = NEW.id
          AND line.procurement_requirement_id IS NOT NULL
      )
      ORDER BY requirement.id
      FOR UPDATE
    LOOP
      SELECT COALESCE(SUM(line.ordered_quantity), 0)
        INTO existing_ordered
        FROM purchase_order_line line
        JOIN purchase_order header ON header.id = line.purchase_order_id
        WHERE line.procurement_requirement_id = requirement_record.id
          AND header.id <> NEW.id
          AND header.status IN ('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED');
      SELECT COALESCE(SUM(line.ordered_quantity), 0)
        INTO this_ordered
        FROM purchase_order_line line
        WHERE line.purchase_order_id = NEW.id
          AND line.procurement_requirement_id = requirement_record.id;
      IF effective_after
        AND existing_ordered + this_ordered > requirement_record.required_quantity
        AND NOT allows_over_order
      THEN
        RAISE EXCEPTION 'cumulative effective ordered quantity exceeds procurement requirement';
      END IF;
    END LOOP;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER purchase_order_history_guard
BEFORE UPDATE OR DELETE ON purchase_order
FOR EACH ROW
EXECUTE FUNCTION enforce_purchase_order_history();
--> statement-breakpoint
CREATE FUNCTION synchronize_procurement_requirement_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  requirement_id UUID;
  required NUMERIC(18,6);
  effective_ordered NUMERIC(18,6);
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF (OLD.status IN ('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED'))
    = (NEW.status IN ('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED'))
  THEN
    RETURN NEW;
  END IF;
  FOR requirement_id IN
    SELECT DISTINCT line.procurement_requirement_id
    FROM purchase_order_line line
    WHERE line.purchase_order_id = NEW.id
      AND line.procurement_requirement_id IS NOT NULL
    ORDER BY line.procurement_requirement_id
  LOOP
    SELECT required_quantity INTO required
      FROM procurement_requirement
      WHERE id = requirement_id
      FOR UPDATE;
    SELECT COALESCE(SUM(line.ordered_quantity), 0)
      INTO effective_ordered
      FROM purchase_order_line line
      JOIN purchase_order header ON header.id = line.purchase_order_id
      WHERE line.procurement_requirement_id = requirement_id
        AND header.status IN ('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED');
    UPDATE procurement_requirement
      SET status = CASE
        WHEN effective_ordered = 0 THEN 'APPROVED_TO_BUY'
        WHEN effective_ordered < required THEN 'PART_ORDERED'
        ELSE 'FULLY_ORDERED'
      END
      WHERE id = requirement_id;
  END LOOP;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER purchase_order_requirement_status_sync
AFTER UPDATE OF status ON purchase_order
FOR EACH ROW
EXECUTE FUNCTION synchronize_procurement_requirement_order_status();
--> statement-breakpoint
CREATE FUNCTION protect_procurement_requirement_order_reconciliation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  effective_ordered NUMERIC(18,6);
  expected_status TEXT;
  allows_over_order BOOLEAN;
BEGIN
  SELECT COALESCE(SUM(line.ordered_quantity), 0)
    INTO effective_ordered
    FROM purchase_order_line line
    JOIN purchase_order header ON header.id = line.purchase_order_id
    WHERE line.procurement_requirement_id = OLD.id
      AND header.status IN ('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED');

  allows_over_order := NULLIF(BTRIM(NEW.review_metadata ->> 'over_order_reason'), '') IS NOT NULL
    AND NULLIF(BTRIM(NEW.review_metadata ->> 'over_order_approved_by'), '') IS NOT NULL;
  IF NEW.required_quantity < effective_ordered AND NOT allows_over_order THEN
    RAISE EXCEPTION 'procurement requirement quantity cannot be reduced below effective ordered quantity';
  END IF;
  IF effective_ordered > 0 AND NEW.status IN ('DRAFT', 'REVIEW_REQUIRED', 'CANCELLED') THEN
    RAISE EXCEPTION 'procurement requirement with effective orders cannot be reopened or cancelled';
  END IF;

  expected_status := CASE
    WHEN effective_ordered = 0 THEN 'APPROVED_TO_BUY'
    WHEN effective_ordered < NEW.required_quantity THEN 'PART_ORDERED'
    ELSE 'FULLY_ORDERED'
  END;
  IF NEW.status IN ('PART_ORDERED', 'FULLY_ORDERED') AND NEW.status <> expected_status THEN
    RAISE EXCEPTION 'procurement requirement ordered status must reconcile to effective purchase orders';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER procurement_requirement_order_reconciliation_guard
BEFORE UPDATE OF required_quantity, status ON procurement_requirement
FOR EACH ROW
EXECUTE FUNCTION protect_procurement_requirement_order_reconciliation();
