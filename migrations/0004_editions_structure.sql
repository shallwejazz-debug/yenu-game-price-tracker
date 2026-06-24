-- ============================================================
-- 플랫폼(에디션) 2단 구조로 개편
-- migrations/0004_editions_structure.sql
--
-- 구조: games(작품) → editions(플랫폼판) → prices(가격)
--   예) 엘든 링(game)
--        ├── 엘든링 PC판   (edition, platform=pc)
--        ├── 엘든링 PS5판  (edition, platform=ps5)
--        └── 엘든링 Xbox판 (edition, platform=xbox)
--
-- 주의: prices.game_id 를 edition_id 로 옮긴다.
--       기존 MVP 데이터는 구조가 달라 정리(재시드) 전제.
-- ============================================================

-- 1) editions 테이블: 게임의 플랫폼별 버전
CREATE TABLE IF NOT EXISTS editions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id       INTEGER NOT NULL,
  platform      TEXT NOT NULL,          -- 'pc' | 'ps5' | 'ps4' | 'xbox' | 'switch' | 'etc'
  edition_name  TEXT,                   -- 표시명 (예: "PS5 한글판", "스팀 스탠다드")
  search_query  TEXT,                   -- 이 플랫폼 패키지 검색어 (예: "PS5 엘든링 한글판")
  keywords      TEXT,                   -- 본품 판별 키워드 (쉼표 구분)
  steam_appid   INTEGER,                -- PC(스팀) 디지털 가격용
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  UNIQUE (game_id, platform)
);

-- 2) prices 테이블 재생성: game_id → edition_id 기준으로 변경
--    (SQLite는 컬럼 변경이 제한적이라 테이블 재생성)
DROP TABLE IF EXISTS prices;
CREATE TABLE prices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  edition_id  INTEGER NOT NULL,
  source      TEXT NOT NULL,            -- 'steam'|'epic'|'gog'|'psn'|'coupang'|'gmarket'|'11st'|'naver'|'etc'
  price       INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'KRW',
  is_digital  INTEGER NOT NULL DEFAULT 1,
  product_url TEXT,
  mall_label  TEXT,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE
);

-- 3) price_history 재생성: edition 단위
DROP TABLE IF EXISTS price_history;
CREATE TABLE price_history (
  edition_id  INTEGER NOT NULL,
  is_digital  INTEGER NOT NULL DEFAULT 1,
  lowest_ever INTEGER,
  lowest_date DATETIME,
  PRIMARY KEY (edition_id, is_digital),
  FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE
);

-- 4) wishlist 도 edition 단위 (플랫폼별로 위시 가능해야 함)
DROP TABLE IF EXISTS wishlist;
CREATE TABLE wishlist (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  edition_id   INTEGER NOT NULL,
  target_price INTEGER,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE,
  UNIQUE (user_id, edition_id)
);

-- 5) games 테이블에서 플랫폼 종속 컬럼 제거 → editions로 이동
--    (search_query, keywords, steam_appid 는 이제 edition 소속)
--    SQLite ALTER DROP COLUMN 지원 버전 가정. 안 되면 무시해도 동작엔 지장 없음.
--    games 에는 작품 공통 정보만: title, image_url, release_date, original_price

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_editions_game     ON editions(game_id);
CREATE INDEX IF NOT EXISTS idx_editions_platform ON editions(platform);
CREATE INDEX IF NOT EXISTS idx_prices_edition    ON prices(edition_id);
CREATE INDEX IF NOT EXISTS idx_prices_edition_dig ON prices(edition_id, is_digital);
