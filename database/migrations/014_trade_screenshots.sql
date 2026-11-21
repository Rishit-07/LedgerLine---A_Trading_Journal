CREATE TABLE IF NOT EXISTS trade_screenshots (
  user_id text NOT NULL,
  trade_id bigint NOT NULL,
  stage text NOT NULL CHECK (stage IN ('before', 'after')),
  image bytea NOT NULL CHECK (octet_length(image) BETWEEN 1 AND 1048576),
  PRIMARY KEY (user_id, trade_id, stage),
  FOREIGN KEY (user_id, trade_id) REFERENCES trades(user_id, id) ON DELETE CASCADE
);
