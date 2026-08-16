-- Phase 2O / F2B: goods receipt and supplier invoice actual-cost evidence only.
-- Supplier payment, VAT/CIS, credit notes, accounting integration, and legacy bridges are deferred.

CREATE TABLE goods_receipt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  purchase_order_id UUID NOT NULL REFERENCES purchase_order(id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL,
  delivery_reference TEXT,
  received_date DATE NOT NULL,
  received_by TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT goods_receipt_supplier_required CHECK (NULLIF(BTRIM(supplier_name), '') IS NOT NULL),
  CONSTRAINT goods_receipt_status_check
    CHECK (status IN ('DRAFT', 'RECEIVED', 'PART_RECEIVED', 'REJECTED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX goods_receipt_delivery_reference_unique
  ON goods_receipt (purchase_order_id, delivery_reference)
  WHERE delivery_reference IS NOT NULL;
--> statement-breakpoint
CREATE INDEX goods_receipt_job_status_date_idx
  ON goods_receipt (job_id, status, received_date);
--> statement-breakpoint
CREATE INDEX goods_receipt_order_status_date_idx
  ON goods_receipt (purchase_order_id, status, received_date);
--> statement-breakpoint
CREATE TABLE goods_receipt_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id UUID NOT NULL REFERENCES goods_receipt(id) ON DELETE RESTRICT,
  purchase_order_line_id UUID NOT NULL REFERENCES purchase_order_line(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL,
  received_quantity NUMERIC(18,6) NOT NULL,
  accepted_quantity NUMERIC(18,6) NOT NULL,
  rejected_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  unit_code TEXT NOT NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
  condition_notes TEXT,
  defect_notes TEXT,
  review_reason TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT goods_receipt_line_number_unique UNIQUE (goods_receipt_id, line_number),
  CONSTRAINT goods_receipt_line_number_positive CHECK (line_number > 0),
  CONSTRAINT goods_receipt_line_received_positive CHECK (received_quantity > 0),
  CONSTRAINT goods_receipt_line_accepted_nonnegative CHECK (accepted_quantity >= 0),
  CONSTRAINT goods_receipt_line_rejected_nonnegative CHECK (rejected_quantity >= 0),
  CONSTRAINT goods_receipt_line_allocation_guard CHECK (accepted_quantity + rejected_quantity <= received_quantity),
  CONSTRAINT goods_receipt_line_status_check
    CHECK (reconciliation_status IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED')),
  CONSTRAINT goods_receipt_line_matched_guard
    CHECK (reconciliation_status <> 'MATCHED' OR (rejected_quantity = 0 AND accepted_quantity = received_quantity)),
  CONSTRAINT goods_receipt_line_review_guard
    CHECK (reconciliation_status NOT IN ('REVIEW_REQUIRED', 'UNRESOLVED') OR NULLIF(BTRIM(review_reason), '') IS NOT NULL),
  CONSTRAINT goods_receipt_line_confirmation_guard
    CHECK (reconciliation_status <> 'USER_CONFIRMED' OR (NULLIF(BTRIM(review_reason), '') IS NOT NULL AND NULLIF(BTRIM(confirmed_by), '') IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX goods_receipt_line_order_line_idx
  ON goods_receipt_line (purchase_order_line_id);
--> statement-breakpoint
CREATE INDEX goods_receipt_line_review_idx
  ON goods_receipt_line (reconciliation_status)
  WHERE reconciliation_status IN ('REVIEW_REQUIRED', 'UNRESOLVED');
--> statement-breakpoint
CREATE TABLE supplier_invoice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  purchase_order_id UUID REFERENCES purchase_order(id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  supplier_reference TEXT,
  notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplier_invoice_supplier_required CHECK (NULLIF(BTRIM(supplier_name), '') IS NOT NULL),
  CONSTRAINT supplier_invoice_number_required CHECK (NULLIF(BTRIM(invoice_number), '') IS NOT NULL),
  CONSTRAINT supplier_invoice_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT supplier_invoice_status_check
    CHECK (status IN ('RECEIVED', 'UNDER_REVIEW', 'APPROVED', 'DISPUTED', 'CANCELLED')),
  CONSTRAINT supplier_invoice_unlinked_source_guard CHECK (
    purchase_order_id IS NOT NULL OR (
      NULLIF(BTRIM(source_metadata ->> 'source'), '') IS NOT NULL
      AND NULLIF(BTRIM(source_metadata ->> 'reason'), '') IS NOT NULL
    )
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX supplier_invoice_identity_unique
  ON supplier_invoice (job_id, lower(BTRIM(supplier_name)), lower(BTRIM(invoice_number)));
--> statement-breakpoint
CREATE INDEX supplier_invoice_job_status_date_idx
  ON supplier_invoice (job_id, status, invoice_date);
--> statement-breakpoint
CREATE INDEX supplier_invoice_order_status_date_idx
  ON supplier_invoice (purchase_order_id, status, invoice_date);
--> statement-breakpoint
CREATE TABLE supplier_invoice_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id UUID NOT NULL REFERENCES supplier_invoice(id) ON DELETE RESTRICT,
  purchase_order_line_id UUID REFERENCES purchase_order_line(id) ON DELETE RESTRICT,
  procurement_requirement_id UUID REFERENCES procurement_requirement(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL,
  supplier_product_code TEXT,
  description TEXT NOT NULL,
  invoiced_quantity NUMERIC(18,6) NOT NULL,
  unit_code TEXT NOT NULL,
  actual_unit_price NUMERIC(18,6) NOT NULL,
  actual_line_value NUMERIC(18,2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
  review_reason TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplier_invoice_line_number_unique UNIQUE (supplier_invoice_id, line_number),
  CONSTRAINT supplier_invoice_line_number_positive CHECK (line_number > 0),
  CONSTRAINT supplier_invoice_line_quantity_positive CHECK (invoiced_quantity > 0),
  CONSTRAINT supplier_invoice_line_unit_price_nonnegative CHECK (actual_unit_price >= 0),
  CONSTRAINT supplier_invoice_line_value_reconciles
    CHECK (actual_line_value = round(invoiced_quantity * actual_unit_price, 2)),
  CONSTRAINT supplier_invoice_line_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT supplier_invoice_line_status_check
    CHECK (reconciliation_status IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED')),
  CONSTRAINT supplier_invoice_line_review_guard
    CHECK (reconciliation_status NOT IN ('REVIEW_REQUIRED', 'UNRESOLVED') OR NULLIF(BTRIM(review_reason), '') IS NOT NULL),
  CONSTRAINT supplier_invoice_line_confirmation_guard
    CHECK (reconciliation_status <> 'USER_CONFIRMED' OR (NULLIF(BTRIM(review_reason), '') IS NOT NULL AND NULLIF(BTRIM(confirmed_by), '') IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX supplier_invoice_line_order_line_idx
  ON supplier_invoice_line (purchase_order_line_id);
--> statement-breakpoint
CREATE INDEX supplier_invoice_line_requirement_idx
  ON supplier_invoice_line (procurement_requirement_id);
--> statement-breakpoint
CREATE INDEX supplier_invoice_line_review_idx
  ON supplier_invoice_line (reconciliation_status)
  WHERE reconciliation_status IN ('REVIEW_REQUIRED', 'UNRESOLVED');
--> statement-breakpoint
CREATE FUNCTION validate_goods_receipt_line()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  receipt goods_receipt%ROWTYPE;
  order_line purchase_order_line%ROWTYPE;
  order_header purchase_order%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO receipt FROM goods_receipt WHERE id = OLD.goods_receipt_id FOR UPDATE;
    IF NOT FOUND OR receipt.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'effective goods receipt lines are immutable';
    END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO receipt FROM goods_receipt WHERE id = NEW.goods_receipt_id FOR UPDATE;
  IF NOT FOUND OR receipt.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'goods receipt lines can only change while receipt is DRAFT';
  END IF;
  SELECT * INTO order_line FROM purchase_order_line WHERE id = NEW.purchase_order_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'goods receipt purchase order line does not exist'; END IF;
  SELECT * INTO order_header FROM purchase_order WHERE id = order_line.purchase_order_id;
  IF NOT FOUND
    OR order_header.id <> receipt.purchase_order_id
    OR order_header.job_id <> receipt.job_id
    OR order_header.supplier_name <> receipt.supplier_name
    OR order_header.status NOT IN ('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED')
    OR order_line.unit_code <> NEW.unit_code
  THEN
    RAISE EXCEPTION 'goods receipt line does not match effective purchase order, supplier, job, or unit';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER goods_receipt_line_validate
BEFORE INSERT OR UPDATE OR DELETE ON goods_receipt_line
FOR EACH ROW
EXECUTE FUNCTION validate_goods_receipt_line();
--> statement-breakpoint
CREATE FUNCTION enforce_goods_receipt_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  line_record RECORD;
  effective_before BOOLEAN;
  effective_after BOOLEAN;
  other_accepted NUMERIC(18,6);
  this_accepted NUMERIC(18,6);
  remaining_accepted NUMERIC(18,6);
  approved_invoiced NUMERIC(18,6);
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'goods receipt history cannot be deleted'; END IF;
  effective_before := OLD.status IN ('RECEIVED', 'PART_RECEIVED');
  effective_after := NEW.status IN ('RECEIVED', 'PART_RECEIVED');
  IF OLD.status <> 'DRAFT' AND (
    NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
    OR NEW.supplier_name IS DISTINCT FROM OLD.supplier_name OR NEW.delivery_reference IS DISTINCT FROM OLD.delivery_reference
    OR NEW.received_date IS DISTINCT FROM OLD.received_date OR NEW.received_by IS DISTINCT FROM OLD.received_by
    OR NEW.notes IS DISTINCT FROM OLD.notes OR NEW.source_metadata IS DISTINCT FROM OLD.source_metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN RAISE EXCEPTION 'effective goods receipt evidence is immutable'; END IF;
  IF OLD.status IN ('REJECTED', 'CANCELLED') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'rejected or cancelled goods receipts cannot be reopened';
  END IF;
  IF effective_before IS DISTINCT FROM effective_after THEN
    IF current_setting('transaction_isolation') <> 'serializable' THEN
      RAISE EXCEPTION 'goods receipt posting and cancellation require a SERIALIZABLE transaction with retry on serialization failure';
    END IF;
    IF effective_after AND NOT EXISTS (SELECT 1 FROM goods_receipt_line WHERE goods_receipt_id = NEW.id) THEN
      RAISE EXCEPTION 'effective goods receipt requires at least one line';
    END IF;
    IF effective_after AND EXISTS (
      SELECT 1 FROM goods_receipt_line
      WHERE goods_receipt_id = NEW.id AND reconciliation_status NOT IN ('MATCHED', 'USER_CONFIRMED')
    ) THEN RAISE EXCEPTION 'goods receipt discrepancies require review confirmation before posting'; END IF;
    IF effective_after AND EXISTS (
      SELECT 1
      FROM goods_receipt_line line
      JOIN purchase_order_line order_line ON order_line.id = line.purchase_order_line_id
      JOIN purchase_order order_header ON order_header.id = order_line.purchase_order_id
      WHERE line.goods_receipt_id = NEW.id
        AND (order_header.id <> NEW.purchase_order_id OR order_header.job_id <> NEW.job_id
          OR order_header.supplier_name <> NEW.supplier_name
          OR order_header.status NOT IN ('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED')
          OR order_line.unit_code <> line.unit_code)
    ) THEN RAISE EXCEPTION 'effective goods receipt lines must still match purchase order, supplier, job, and unit'; END IF;
    FOR line_record IN
      SELECT order_line.id, order_line.ordered_quantity
      FROM purchase_order_line order_line
      WHERE order_line.id IN (SELECT purchase_order_line_id FROM goods_receipt_line WHERE goods_receipt_id = NEW.id)
      ORDER BY order_line.id FOR UPDATE
    LOOP
      SELECT COALESCE(SUM(line.accepted_quantity), 0) INTO other_accepted
      FROM goods_receipt_line line JOIN goods_receipt header ON header.id = line.goods_receipt_id
      WHERE line.purchase_order_line_id = line_record.id AND header.id <> NEW.id
        AND header.status IN ('RECEIVED', 'PART_RECEIVED');
      SELECT COALESCE(SUM(accepted_quantity), 0) INTO this_accepted
      FROM goods_receipt_line WHERE goods_receipt_id = NEW.id AND purchase_order_line_id = line_record.id;
      IF effective_after AND other_accepted + this_accepted > line_record.ordered_quantity THEN
        RAISE EXCEPTION 'cumulative accepted quantity exceeds purchase order quantity';
      END IF;
      IF effective_before AND NOT effective_after THEN
        remaining_accepted := other_accepted;
        SELECT COALESCE(SUM(line.invoiced_quantity), 0) INTO approved_invoiced
        FROM supplier_invoice_line line JOIN supplier_invoice invoice ON invoice.id = line.supplier_invoice_id
        WHERE line.purchase_order_line_id = line_record.id AND invoice.status = 'APPROVED';
        IF approved_invoiced > remaining_accepted THEN
          RAISE EXCEPTION 'goods receipt cannot be cancelled while approved invoices depend on accepted quantity';
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER goods_receipt_history_guard
BEFORE UPDATE OR DELETE ON goods_receipt
FOR EACH ROW
EXECUTE FUNCTION enforce_goods_receipt_history();
--> statement-breakpoint
CREATE FUNCTION validate_supplier_invoice_line()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  invoice supplier_invoice%ROWTYPE;
  order_line purchase_order_line%ROWTYPE;
  order_header purchase_order%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO invoice FROM supplier_invoice WHERE id = OLD.supplier_invoice_id FOR UPDATE;
    IF NOT FOUND OR invoice.status = 'APPROVED' OR invoice.status = 'CANCELLED' THEN
      RAISE EXCEPTION 'approved supplier invoice lines are immutable';
    END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO invoice FROM supplier_invoice WHERE id = NEW.supplier_invoice_id FOR UPDATE;
  IF NOT FOUND OR invoice.status IN ('APPROVED', 'CANCELLED') THEN
    RAISE EXCEPTION 'supplier invoice lines cannot change after approval or cancellation';
  END IF;
  IF NEW.currency_code <> invoice.currency_code THEN RAISE EXCEPTION 'supplier invoice line must match invoice currency'; END IF;
  IF NEW.purchase_order_line_id IS NOT NULL THEN
    SELECT * INTO order_line FROM purchase_order_line WHERE id = NEW.purchase_order_line_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'supplier invoice purchase order line does not exist'; END IF;
    SELECT * INTO order_header FROM purchase_order WHERE id = order_line.purchase_order_id;
    IF NOT FOUND OR invoice.purchase_order_id IS DISTINCT FROM order_header.id OR invoice.job_id <> order_header.job_id
      OR invoice.supplier_name <> order_header.supplier_name OR invoice.currency_code <> order_header.currency_code
      OR NEW.unit_code <> order_line.unit_code
      OR NEW.procurement_requirement_id IS DISTINCT FROM order_line.procurement_requirement_id
    THEN RAISE EXCEPTION 'supplier invoice line does not match purchase order, requirement, supplier, job, currency, or unit'; END IF;
    IF NEW.reconciliation_status = 'MATCHED' AND NEW.actual_unit_price <> order_line.agreed_unit_price THEN
      RAISE EXCEPTION 'supplier invoice price variance requires review confirmation';
    END IF;
  ELSIF NEW.reconciliation_status <> 'USER_CONFIRMED' THEN
    RAISE EXCEPTION 'unlinked supplier invoice lines require explicit user confirmation';
  END IF;
  IF NEW.purchase_order_line_id IS NULL AND NEW.procurement_requirement_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM procurement_requirement WHERE id = NEW.procurement_requirement_id AND job_id = invoice.job_id)
  THEN RAISE EXCEPTION 'unlinked supplier invoice requirement must belong to invoice job'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER supplier_invoice_line_validate
BEFORE INSERT OR UPDATE OR DELETE ON supplier_invoice_line
FOR EACH ROW
EXECUTE FUNCTION validate_supplier_invoice_line();
--> statement-breakpoint
CREATE FUNCTION enforce_supplier_invoice_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  line_record RECORD;
  effective_before BOOLEAN;
  effective_after BOOLEAN;
  accepted NUMERIC(18,6);
  other_invoiced NUMERIC(18,6);
  this_invoiced NUMERIC(18,6);
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'supplier invoice history cannot be deleted'; END IF;
  effective_before := OLD.status = 'APPROVED';
  effective_after := NEW.status = 'APPROVED';
  IF OLD.status = 'APPROVED' AND (
    NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
    OR NEW.supplier_name IS DISTINCT FROM OLD.supplier_name OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
    OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
    OR NEW.supplier_reference IS DISTINCT FROM OLD.supplier_reference OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.source_metadata IS DISTINCT FROM OLD.source_metadata OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN RAISE EXCEPTION 'approved supplier invoice evidence is immutable'; END IF;
  IF OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' THEN RAISE EXCEPTION 'cancelled supplier invoices cannot be reopened'; END IF;
  IF OLD.status = 'APPROVED' AND NEW.status NOT IN ('APPROVED', 'CANCELLED') THEN
    RAISE EXCEPTION 'approved supplier invoice can only remain approved or be cancelled';
  END IF;
  IF effective_before IS DISTINCT FROM effective_after THEN
    IF current_setting('transaction_isolation') <> 'serializable' THEN
      RAISE EXCEPTION 'supplier invoice approval and cancellation require a SERIALIZABLE transaction with retry on serialization failure';
    END IF;
    IF effective_after AND NOT EXISTS (SELECT 1 FROM supplier_invoice_line WHERE supplier_invoice_id = NEW.id) THEN
      RAISE EXCEPTION 'approved supplier invoice requires at least one line';
    END IF;
    IF effective_after AND EXISTS (
      SELECT 1 FROM supplier_invoice_line WHERE supplier_invoice_id = NEW.id
        AND reconciliation_status NOT IN ('MATCHED', 'USER_CONFIRMED')
    ) THEN RAISE EXCEPTION 'supplier invoice discrepancies require review confirmation before approval'; END IF;
    IF effective_after AND EXISTS (
      SELECT 1
      FROM supplier_invoice_line line
      JOIN purchase_order_line order_line ON order_line.id = line.purchase_order_line_id
      JOIN purchase_order order_header ON order_header.id = order_line.purchase_order_id
      WHERE line.supplier_invoice_id = NEW.id
        AND (NEW.purchase_order_id IS DISTINCT FROM order_header.id OR NEW.job_id <> order_header.job_id
          OR NEW.supplier_name <> order_header.supplier_name OR NEW.currency_code <> order_header.currency_code
          OR line.unit_code <> order_line.unit_code
          OR line.procurement_requirement_id IS DISTINCT FROM order_line.procurement_requirement_id
          OR (line.actual_unit_price <> order_line.agreed_unit_price AND line.reconciliation_status <> 'USER_CONFIRMED'))
    ) THEN RAISE EXCEPTION 'approved supplier invoice lines must still reconcile to purchase order facts or confirmed variance'; END IF;
    FOR line_record IN
      SELECT order_line.id, order_line.ordered_quantity
      FROM purchase_order_line order_line
      WHERE order_line.id IN (SELECT purchase_order_line_id FROM supplier_invoice_line WHERE supplier_invoice_id = NEW.id AND purchase_order_line_id IS NOT NULL)
      ORDER BY order_line.id FOR UPDATE
    LOOP
      SELECT COALESCE(SUM(line.accepted_quantity), 0) INTO accepted
      FROM goods_receipt_line line JOIN goods_receipt receipt ON receipt.id = line.goods_receipt_id
      WHERE line.purchase_order_line_id = line_record.id AND receipt.status IN ('RECEIVED', 'PART_RECEIVED');
      SELECT COALESCE(SUM(line.invoiced_quantity), 0) INTO other_invoiced
      FROM supplier_invoice_line line JOIN supplier_invoice invoice ON invoice.id = line.supplier_invoice_id
      WHERE line.purchase_order_line_id = line_record.id AND invoice.id <> NEW.id AND invoice.status = 'APPROVED';
      SELECT COALESCE(SUM(invoiced_quantity), 0) INTO this_invoiced
      FROM supplier_invoice_line WHERE supplier_invoice_id = NEW.id AND purchase_order_line_id = line_record.id;
      IF effective_after AND other_invoiced + this_invoiced > accepted AND EXISTS (
        SELECT 1 FROM supplier_invoice_line WHERE supplier_invoice_id = NEW.id
          AND purchase_order_line_id = line_record.id AND reconciliation_status <> 'USER_CONFIRMED'
      ) THEN
        RAISE EXCEPTION 'invoiced quantity exceeds accepted quantity and requires review confirmation';
      END IF;
      IF effective_after AND other_invoiced + this_invoiced > line_record.ordered_quantity THEN
        RAISE EXCEPTION 'cumulative approved invoiced quantity exceeds purchase order quantity';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER supplier_invoice_history_guard
BEFORE UPDATE OR DELETE ON supplier_invoice
FOR EACH ROW
EXECUTE FUNCTION enforce_supplier_invoice_history();
--> statement-breakpoint
CREATE FUNCTION protect_purchase_order_downstream_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED') AND NEW.status = 'CANCELLED'
    AND (EXISTS (SELECT 1 FROM goods_receipt WHERE purchase_order_id = OLD.id AND status IN ('RECEIVED', 'PART_RECEIVED'))
      OR EXISTS (SELECT 1 FROM supplier_invoice WHERE purchase_order_id = OLD.id AND status = 'APPROVED'))
  THEN RAISE EXCEPTION 'purchase order cannot be cancelled while effective receipts or invoices exist'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER purchase_order_downstream_evidence_guard
BEFORE UPDATE OF status ON purchase_order
FOR EACH ROW
EXECUTE FUNCTION protect_purchase_order_downstream_evidence();
