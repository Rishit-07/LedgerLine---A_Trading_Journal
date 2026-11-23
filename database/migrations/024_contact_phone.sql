ALTER TABLE user_profile ADD COLUMN contact_phone text
  CHECK (contact_phone ~ '^[+][1-9][0-9]{6,14}$');
