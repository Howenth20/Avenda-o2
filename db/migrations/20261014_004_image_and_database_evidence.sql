ALTER TABLE document_evidences
  ADD COLUMN IF NOT EXISTS file_data BYTEA;

ALTER TABLE document_evidences
  DROP CONSTRAINT IF EXISTS document_evidences_mime_type_check;

ALTER TABLE document_evidences
  ADD CONSTRAINT document_evidences_mime_type_check
  CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp','image/gif','image/bmp'));

ALTER TABLE document_evidences
  ALTER COLUMN document_number DROP NOT NULL;

ALTER TABLE document_evidences
  DROP CONSTRAINT IF EXISTS document_evidences_document_amount_cents_check;

ALTER TABLE document_evidences
  ADD CONSTRAINT document_evidences_document_amount_cents_check
  CHECK (document_amount_cents >= 0);

ALTER TABLE document_evidences
  DROP CONSTRAINT IF EXISTS document_evidences_file_data_size_check;

ALTER TABLE document_evidences
  ADD CONSTRAINT document_evidences_file_data_size_check
  CHECK (file_data IS NULL OR octet_length(file_data) = byte_size);
