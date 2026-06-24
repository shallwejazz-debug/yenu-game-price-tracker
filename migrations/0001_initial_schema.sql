-- ============================================================
-- 한국 게임 가격 추적 도구 - 초기 스키마
-- migrations/0001_initial_schema.sql
-- ============================================================

-- 1) 사용자 (회원가입/위시리스트 주체)
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2) 게임 (추적 대상)
--    steam_appid: 스팀 앱 ID (Steam Web API / IsThereAnyDeal 연동용)
--    original_price: 정가(원). 할인율 계산 기준값
CREATE TABLE IF NOT EXISTS games (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  steam_appid    INTEGER,
  image_url      TEXT,
  release_date   TEXT,                  -- 'YYYY-MM-DD' 문자열로 보관 (간단/안전)
  original_price INTEGER,               -- 정가 (원 단위 정수)
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3) 가격 기록 (한 게임에 여러 소스 × 디지털/패키지 × 시간대)
--    source: 'steam' | 'psn' | 'nintendo' | 'coupang' | 'gmarket' | '11st' ...
--    is_digital: 1 = 디지털(스팀/PSN 등), 0 = 패키지(쿠팡/G마켓 등)
CREATE TABLE IF NOT EXISTS prices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL,
  source      TEXT NOT NULL,
  price       INTEGER NOT NULL,         -- 가격 (원 단위 정수)
  currency    TEXT NOT NULL DEFAULT 'KRW',
  is_digital  INTEGER NOT NULL DEFAULT 1,   -- 1=디지털, 0=패키지
  product_url TEXT,                      -- 리다이렉터에서 사용할 원본 상품 URL
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- 4) 위시리스트 (사용자가 목표가 도달 시 알림 받을 게임)
CREATE TABLE IF NOT EXISTS wishlist (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  game_id      INTEGER NOT NULL,
  target_price INTEGER,                 -- 이 가격 이하가 되면 알림
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  UNIQUE (user_id, game_id)             -- 한 게임은 위시리스트에 한 번만
);

-- 5) 역대 최저가 캐시 (매번 prices 전체를 훑지 않도록 별도 보관)
--    디지털/패키지를 구분해 각각의 역대 최저가를 저장
CREATE TABLE IF NOT EXISTS price_history (
  game_id     INTEGER NOT NULL,
  is_digital  INTEGER NOT NULL DEFAULT 1,
  lowest_ever INTEGER,                  -- 역대 최저가
  lowest_date DATETIME,                 -- 그 가격이 기록된 시점
  PRIMARY KEY (game_id, is_digital),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- ---------- 인덱스 (조회 성능) ----------
CREATE INDEX IF NOT EXISTS idx_prices_game        ON prices(game_id);
CREATE INDEX IF NOT EXISTS idx_prices_game_digital ON prices(game_id, is_digital);
CREATE INDEX IF NOT EXISTS idx_prices_recorded    ON prices(recorded_at);
CREATE INDEX IF NOT EXISTS idx_wishlist_user      ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_games_steam        ON games(steam_appid);
