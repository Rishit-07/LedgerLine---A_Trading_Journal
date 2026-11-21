ALTER TABLE report_checkouts ADD COLUMN price_paise bigint CHECK(price_paise>0);
ALTER TABLE report_checkouts ADD COLUMN payment_state text NOT NULL DEFAULT 'waiting';
