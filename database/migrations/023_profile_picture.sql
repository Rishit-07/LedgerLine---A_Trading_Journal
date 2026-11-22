ALTER TABLE user_profile ADD COLUMN profile_picture bytea CHECK (octet_length(profile_picture) <= 24576);
