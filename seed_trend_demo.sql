-- ============================================================
-- 그래프 시연용 가격 추이 샘플 (엘든링 PS5 = edition 2)
-- 최근 6개월간 디지털/패키지 가격 변동을 월별로 삽입
-- is_digital: 1=디지털, 0=패키지
-- recorded_at 을 과거 날짜로 지정해 추이 그래프가 그려지도록 함
-- ============================================================

-- 디지털 (PSN) — 65000에서 점차 하락
INSERT INTO prices (edition_id, source, price, currency, is_digital, product_url, mall_label, recorded_at) VALUES
  (2, 'psn', 65000, 'KRW', 1, NULL, 'PSN', datetime('now','-175 days')),
  (2, 'psn', 65000, 'KRW', 1, NULL, 'PSN', datetime('now','-150 days')),
  (2, 'psn', 58500, 'KRW', 1, NULL, 'PSN', datetime('now','-120 days')),
  (2, 'psn', 58500, 'KRW', 1, NULL, 'PSN', datetime('now','-90 days')),
  (2, 'psn', 45500, 'KRW', 1, NULL, 'PSN', datetime('now','-60 days')),
  (2, 'psn', 52000, 'KRW', 1, NULL, 'PSN', datetime('now','-30 days')),
  (2, 'psn', 48000, 'KRW', 1, NULL, 'PSN', datetime('now','-5 days'));

-- 패키지 (쿠팡) — 더 큰 폭으로 변동
INSERT INTO prices (edition_id, source, price, currency, is_digital, product_url, mall_label, recorded_at) VALUES
  (2, 'coupang', 42000, 'KRW', 0, NULL, '쿠팡', datetime('now','-170 days')),
  (2, 'coupang', 39000, 'KRW', 0, NULL, '쿠팡', datetime('now','-140 days')),
  (2, 'coupang', 35000, 'KRW', 0, NULL, '쿠팡', datetime('now','-110 days')),
  (2, 'coupang', 32000, 'KRW', 0, NULL, '쿠팡', datetime('now','-80 days')),
  (2, 'coupang', 28000, 'KRW', 0, NULL, '쿠팡', datetime('now','-45 days')),
  (2, 'coupang', 26800, 'KRW', 0, NULL, '쿠팡', datetime('now','-15 days'));
