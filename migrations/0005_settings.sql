-- ============================================================
-- 0005: 설정(settings) 테이블 - 쇼핑몰별 레퍼럴 ID 저장
--   관리자 모드에서 입력한 어필리에이트 ID를 D1에 보관
--   (env 변수보다 우선순위 낮음: env에 값이 있으면 env 사용)
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 레퍼럴 ID 슬롯 미리 생성 (빈 값)
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('coupang_partners_id', ''),
  ('gmarket_esm_id', ''),
  ('elevenst_affiliate_id', '');
