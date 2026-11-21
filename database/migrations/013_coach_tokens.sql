CREATE TABLE IF NOT EXISTS coach_daily_tokens (
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  day date NOT NULL,
  spent integer NOT NULL CHECK (spent >= 0),
  PRIMARY KEY (user_id, day)
);

-- Called inside the statement that saves a reply. A failed debit rolls back the reply too.
CREATE OR REPLACE FUNCTION debit_coach_tokens(owner_uid text, cost integer, allowance integer)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE balance integer;
BEGIN
  INSERT INTO coach_daily_tokens AS wallet(user_id, day, spent)
  VALUES(owner_uid, (now() AT TIME ZONE 'Asia/Kolkata')::date, least(cost,allowance))
  ON CONFLICT(user_id,day) DO UPDATE
    SET spent=least(allowance,wallet.spent+cost) WHERE wallet.spent<allowance
  RETURNING allowance-spent INTO balance;
  IF balance IS NULL THEN RAISE EXCEPTION 'Coach tokens exhausted' USING ERRCODE='P4201'; END IF;
  RETURN balance;
END $$;
