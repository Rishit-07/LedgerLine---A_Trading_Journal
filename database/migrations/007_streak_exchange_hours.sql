ALTER TABLE exchange_holidays ADD COLUMN IF NOT EXISTS opens_at time;
ALTER TABLE exchange_holidays ADD COLUMN IF NOT EXISTS closes_at time;

-- Muhurat continuous session, NSE/CMTR/77355 and the corresponding BSE notice.
UPDATE exchange_holidays SET opens_at='14:20', closes_at='15:30'
WHERE day='2026-11-08' AND exchange IN ('NSE','BSE') AND NOT closed AND opens_at IS NULL;
