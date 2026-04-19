ALTER TABLE audit_logs ADD COLUMN request_body TEXT;
ALTER TABLE audit_logs ADD COLUMN response_body TEXT;
ALTER TABLE audit_logs ADD COLUMN request_body_truncated INTEGER DEFAULT 0;
ALTER TABLE audit_logs ADD COLUMN response_body_truncated INTEGER DEFAULT 0;
