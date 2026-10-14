CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  responsible VARCHAR(160) NOT NULL,
  location VARCHAR(180) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'CLOSED')),
  daily_rate_cents INTEGER NOT NULL DEFAULT 0 CHECK (daily_rate_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  delete_reason VARCHAR(300)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(24) NOT NULL CHECK (role IN ('ADMIN', 'PROJECT_USER')),
  project_id UUID REFERENCES projects(id) ON DELETE RESTRICT,
  authorized_by UUID REFERENCES users(id) ON DELETE SET NULL,
  authorized_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((role = 'ADMIN' AND project_id IS NULL) OR (role = 'PROJECT_USER' AND project_id IS NOT NULL))
);

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_deleted_by_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_deleted_by_fk;

CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  dni CHAR(8) NOT NULL UNIQUE CHECK (dni ~ '^[0-9]{8}$'),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  job_title VARCHAR(120) NOT NULL,
  phone VARCHAR(24) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  address VARCHAR(240) NOT NULL,
  hired_on DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  delete_reason VARCHAR(300)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  ip_address VARCHAR(64) NOT NULL,
  succeeded BOOLEAN NOT NULL DEFAULT FALSE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_attempts_lookup ON auth_attempts(email, ip_address, attempted_at DESC);

CREATE TABLE IF NOT EXISTS attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  work_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'EXCUSED')),
  note VARCHAR(300),
  recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  delete_reason VARCHAR(300)
);
CREATE INDEX IF NOT EXISTS attendance_work_date_idx ON attendances(work_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_worker_date_active_idx ON attendances(worker_id, work_date) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS per_diems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  week_start DATE NOT NULL,
  days_attended SMALLINT NOT NULL CHECK (days_attended BETWEEN 0 AND 7),
  daily_rate_cents INTEGER NOT NULL CHECK (daily_rate_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  stage VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (stage IN ('PENDING', 'APPROVED', 'PAID')),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(worker_id, week_start)
);
CREATE INDEX IF NOT EXISTS per_diems_period_idx ON per_diems(week_start DESC, stage);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  expense_date DATE NOT NULL,
  week_start DATE NOT NULL,
  category VARCHAR(80) NOT NULL,
  description VARCHAR(240) NOT NULL,
  supplier VARCHAR(160),
  receipt_number VARCHAR(100),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  stage VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (stage IN ('PENDING', 'APPROVED', 'PAID')),
  invoice_status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (invoice_status IN ('PENDING', 'HECHO')),
  payment_source VARCHAR(16) NOT NULL DEFAULT 'DIRECT' CHECK (payment_source IN ('DIRECT', 'PETTY_CASH')),
  recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  delete_reason VARCHAR(300)
);
CREATE INDEX IF NOT EXISTS expenses_project_date_idx ON expenses(project_id, expense_date DESC) WHERE deleted_at IS NULL;
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
CREATE TABLE IF NOT EXISTS document_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(16) NOT NULL CHECK (entity_type IN ('EXPENSE', 'PETTY_CASH', 'PER_DIEM')),
  entity_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  original_name VARCHAR(160) NOT NULL,
  storage_key VARCHAR(180) NOT NULL UNIQUE,
  sha256 CHAR(64) NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  mime_type VARCHAR(64) NOT NULL CHECK (mime_type = 'application/pdf'),
  document_number VARCHAR(100) NOT NULL,
  document_amount_cents INTEGER NOT NULL CHECK (document_amount_cents > 0),
  document_date DATE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  delete_reason VARCHAR(300)
);
CREATE UNIQUE INDEX IF NOT EXISTS document_evidences_one_active_per_entity_idx ON document_evidences(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS document_evidences_project_created_idx ON document_evidences(project_id, created_at DESC) WHERE deleted_at IS NULL;

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

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code VARCHAR(24) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  subject VARCHAR(140) NOT NULL,
  message VARCHAR(4000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REVIEW', 'RESOLVED', 'CLOSED')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requester_ip VARCHAR(64) NOT NULL,
  mail_status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (mail_status IN ('PENDING', 'SENT', 'FAILED', 'NOT_CONFIGURED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS support_rate_limit_idx ON support_tickets(requester_ip, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  reason VARCHAR(300),
  ip_address VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_project_created_idx ON audit_logs(project_id, created_at DESC);

