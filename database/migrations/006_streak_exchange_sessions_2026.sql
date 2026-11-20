-- Published NSE and BSE equity/derivatives trading notices. A false row marks a special open session.
INSERT INTO exchange_holidays (exchange, day, closed, source)
SELECT exchange, day::date, true,
  CASE exchange WHEN 'NSE' THEN 'https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf'
    ELSE 'https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=20251212-8' END
FROM unnest(ARRAY['NSE', 'BSE']) AS ex(exchange)
CROSS JOIN unnest(ARRAY['2026-01-26','2026-03-03','2026-03-26','2026-03-31','2026-04-03','2026-04-14',
  '2026-05-01','2026-05-28','2026-06-26','2026-09-14','2026-10-02','2026-10-20','2026-11-10','2026-11-24','2026-12-25']) AS holidays(day)
ON CONFLICT DO NOTHING;

INSERT INTO exchange_holidays (exchange, day, closed, source) VALUES
  ('NSE','2026-01-15',true,'https://nsearchives.nseindia.com/content/circulars/CMTR72260.pdf'),
  ('BSE','2026-01-15',true,'https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=20260112-8'),
  ('NSE','2026-02-01',false,'https://www.nseindia.com/resources/exchange-communication-holidays'),
  ('BSE','2026-02-01',false,'https://www.bseindia.com/static/markets/MarketInfo/listholi.aspx'),
  ('NSE','2026-11-08',false,'https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf'),
  ('BSE','2026-11-08',false,'https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=20251212-8')
ON CONFLICT DO NOTHING;
