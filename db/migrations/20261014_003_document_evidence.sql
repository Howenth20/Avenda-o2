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