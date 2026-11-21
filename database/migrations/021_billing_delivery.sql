ALTER TABLE report_checkouts ADD COLUMN hosted_url text;
CREATE TABLE billing_reminder_queue(
 checkout_id uuid PRIMARY KEY REFERENCES report_checkouts ON DELETE CASCADE, retry_at timestamptz NOT NULL DEFAULT now()
);