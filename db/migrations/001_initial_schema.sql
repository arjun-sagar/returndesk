-- ReturnDesk initial schema: return requests, their append-only notes, and the guards that protect them.

CREATE TABLE return_requests (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Human-readable reference derived from the identity value: unique by construction, never client-supplied.
  reference       text GENERATED ALWAYS AS ('RD-' || lpad(id::text, GREATEST(6, length(id::text)), '0')) STORED,
  customer_name   text NOT NULL,
  customer_email  text,
  customer_phone  text,
  order_number    text NOT NULL,
  item_sku        text NOT NULL,
  item_name       text NOT NULL,
  quantity        integer NOT NULL,
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'Open',
  resolution      text,
  refund_amount   numeric(10,2),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  removed_at      timestamptz,

  CONSTRAINT return_requests_reference_key UNIQUE (reference),
  CONSTRAINT return_requests_customer_name_check CHECK (char_length(btrim(customer_name)) BETWEEN 1 AND 100),
  CONSTRAINT return_requests_contact_check CHECK (customer_email IS NOT NULL OR customer_phone IS NOT NULL),
  CONSTRAINT return_requests_order_number_check CHECK (order_number ~ '^[A-Z0-9#._/-]{1,40}$'),
  CONSTRAINT return_requests_item_sku_check CHECK (item_sku ~ '^[A-Z0-9#._/-]{1,40}$'),
  CONSTRAINT return_requests_item_name_check CHECK (char_length(btrim(item_name)) BETWEEN 1 AND 200),
  CONSTRAINT return_requests_quantity_check CHECK (quantity BETWEEN 1 AND 999),
  CONSTRAINT return_requests_reason_check
    CHECK (reason IN ('Damaged', 'Wrong Item', 'Size Issue', 'Not As Described', 'Changed Mind')),
  CONSTRAINT return_requests_status_check
    CHECK (status IN ('Open', 'In Review', 'Approved', 'Rejected', 'Completed')),
  CONSTRAINT return_requests_resolution_check
    CHECK (resolution IS NULL OR resolution IN ('Refund', 'Replacement', 'Store Credit')),
  -- Rule 2: a refund needs a positive amount; anything else must have no amount.
  CONSTRAINT return_requests_refund_amount_check CHECK (
       (resolution = 'Refund' AND refund_amount IS NOT NULL AND refund_amount > 0)
    OR (resolution IS DISTINCT FROM 'Refund' AND refund_amount IS NULL)
  ),
  -- A resolution exists exactly when the request has been approved (Approved or Completed).
  CONSTRAINT return_requests_resolution_status_check
    CHECK ((status IN ('Approved', 'Completed')) = (resolution IS NOT NULL)),
  -- Rule 5: only Open or Rejected requests can be taken off the desk.
  CONSTRAINT return_requests_removal_status_check
    CHECK (removed_at IS NULL OR status IN ('Open', 'Rejected'))
);

-- Rule 3: at most one live (Open / In Review / Approved), non-removed request per order + item.
CREATE UNIQUE INDEX return_requests_one_live_per_item
  ON return_requests (order_number, item_sku)
  WHERE status IN ('Open', 'In Review', 'Approved') AND removed_at IS NULL;

-- Default desk listing (newest first) only ever reads non-removed rows.
CREATE INDEX return_requests_active_created_idx
  ON return_requests (created_at DESC, id DESC) WHERE removed_at IS NULL;
CREATE INDEX return_requests_active_status_idx
  ON return_requests (status) WHERE removed_at IS NULL;
CREATE INDEX return_requests_active_reason_idx
  ON return_requests (reason) WHERE removed_at IS NULL;

CREATE TABLE request_notes (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id  integer NOT NULL REFERENCES return_requests (id) ON DELETE RESTRICT,
  author      text NOT NULL CHECK (char_length(btrim(author)) BETWEEN 1 AND 80),
  body        text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Notes are always read per request in chronological order (id breaks timestamp ties).
CREATE INDEX request_notes_request_created_idx ON request_notes (request_id, created_at, id);

-- Defence in depth: notes are append-only and requests are never hard-deleted, even via raw SQL.
CREATE FUNCTION forbid_row_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed', TG_OP, TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER request_notes_append_only
  BEFORE UPDATE OR DELETE ON request_notes
  FOR EACH ROW EXECUTE FUNCTION forbid_row_change();

CREATE TRIGGER return_requests_no_hard_delete
  BEFORE DELETE ON return_requests
  FOR EACH ROW EXECUTE FUNCTION forbid_row_change();
