ALTER TABLE expenses ADD COLUMN IF NOT EXISTS week_start DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_status VARCHAR(16) NOT NULL DEFAULT 'PENDING';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_source VARCHAR(16) NOT NULL DEFAULT 'DIRECT';

UPDATE expenses
SET week_start = (expense_date - ((EXTRACT(ISODOW FROM expense_date)::int - 1) * INTERVAL '1 day'))::date
WHERE week_start IS NULL;

ALTER TABLE expenses ALTER COLUMN week_start SET NOT NULL;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_invoice_status_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_invoice_status_check CHECK (invoice_status IN ('PENDING', 'HECHO'));
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_payment_source_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_payment_source_check CHECK (payment_source IN ('DIRECT', 'PETTY_CASH'));
CREATE INDEX IF NOT EXISTS expenses_project_week_idx ON expenses(project_id, week_start DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS petty_cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  week_start DATE NOT NULL,
  movement_date DATE NOT NULL,
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('FUND', 'REPLENISHMENT', 'RETURN')),
  description VARCHAR(240) NOT NULL,
  receipt_number VARCHAR(100),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  delete_reason VARCHAR(300)
);
CREATE INDEX IF NOT EXISTS petty_cash_project_week_idx ON petty_cash_movements(project_id, week_start DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_code VARCHAR(24) NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  document_type VARCHAR(24) NOT NULL CHECK (document_type IN ('DNI', 'CE', 'PASSPORT', 'RUC', 'OTHER')),
  document_number VARCHAR(32) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  address VARCHAR(240) NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  claim_type VARCHAR(16) NOT NULL CHECK (claim_type IN ('COMPLAINT', 'CLAIM')),
  detail VARCHAR(4000) NOT NULL,
  request_text VARCHAR(2000) NOT NULL,
  policy_version VARCHAR(24) NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requester_ip VARCHAR(64) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'REVIEW', 'RESPONDED', 'CLOSED')),
  response TEXT,
  responded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS claims_created_idx ON claims(created_at DESC);
CREATE INDEX IF NOT EXISTS claims_requester_idx ON claims(requester_ip, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS authorized_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ;
