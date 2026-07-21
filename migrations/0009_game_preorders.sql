-- ============================================================
-- 0009_game_preorders.sql
--
-- WATCHER 보도자료를 실제 게임·플랫폼 예약판매 정보로
-- 연결하기 위한 데이터 구조
--
-- 구조:
--   games
--   ├── game_official_sources
--   │     └── WATCHER 보도자료·출처·권리정보
--   │
--   └── editions
--         └── edition_preorders
--               └── 플랫폼별 발매일·예약기간·특전·가격
--
-- 주의:
--   - 초안 생성만으로 공개하지 않음
--   - publish_status = 'PUBLISHED'인 정보만 공개 가능
--   - selected_image_id가 있어도 이미지 권한을 별도 검증
-- ============================================================

PRAGMA foreign_keys = ON;


-- ------------------------------------------------------------
-- 1. 게임별 공식 보도자료 출처
--
-- 하나의 게임은 여러 공식 보도자료를 가질 수 있고,
-- 하나의 보도자료가 여러 게임을 다룰 수도 있음
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS game_official_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  game_id INTEGER NOT NULL,
  watch_item_id INTEGER NOT NULL,
  source_id INTEGER NOT NULL,

  source_title TEXT NOT NULL,
  official_source_url TEXT NOT NULL,

  trailer_url TEXT,

  source_credit TEXT NOT NULL,
  required_copyright TEXT,

  permission_status_snapshot TEXT NOT NULL
    DEFAULT 'PENDING'
    CHECK (
      permission_status_snapshot IN (
        'PENDING',
        'APPROVED',
        'CONDITIONAL',
        'DENIED',
        'EXPIRED'
      )
    ),

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (game_id)
    REFERENCES games(id)
    ON DELETE CASCADE,

  FOREIGN KEY (watch_item_id)
    REFERENCES watch_items(id)
    ON DELETE CASCADE,

  FOREIGN KEY (source_id)
    REFERENCES watch_sources(id)
    ON DELETE RESTRICT,

  UNIQUE (
    game_id,
    watch_item_id
  )
);


CREATE INDEX IF NOT EXISTS
  idx_game_official_sources_game
ON game_official_sources(game_id);


CREATE INDEX IF NOT EXISTS
  idx_game_official_sources_watch_item
ON game_official_sources(watch_item_id);


CREATE INDEX IF NOT EXISTS
  idx_game_official_sources_source
ON game_official_sources(source_id);


-- ------------------------------------------------------------
-- 2. 플랫폼별 예약판매 정보
--
-- 같은 게임이라도 플랫폼별로 다음 정보가 다를 수 있음:
--   - 발매일
--   - 예약판매 기간
--   - 가격
--   - 특전
--   - 대표 이미지
--
-- 예:
--   games: Marvel's Wolverine
--   editions:
--     PS5
--     PC
--   edition_preorders:
--     PS5 예약판매 정보
--     PC 예약판매 정보
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS edition_preorders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  edition_id INTEGER NOT NULL,
  official_source_id INTEGER NOT NULL,

  release_date TEXT NOT NULL,

  preorder_start_date TEXT,
  preorder_end_date TEXT,

  preorder_status TEXT NOT NULL
    DEFAULT 'UNKNOWN'
    CHECK (
      preorder_status IN (
        'UNKNOWN',
        'UPCOMING',
        'OPEN',
        'CLOSED',
        'CANCELLED'
      )
    ),

  preorder_bonus TEXT,
  preorder_bonus_note TEXT,

  candidate_price INTEGER
    CHECK (
      candidate_price IS NULL OR
      candidate_price > 0
    ),

  confirmed_price INTEGER
    CHECK (
      confirmed_price IS NULL OR
      confirmed_price > 0
    ),

  price_status TEXT NOT NULL
    DEFAULT 'UNCONFIRMED'
    CHECK (
      price_status IN (
        'UNCONFIRMED',
        'CANDIDATE',
        'CONFIRMED'
      )
    ),

  selected_image_id INTEGER,

  publish_status TEXT NOT NULL
    DEFAULT 'DRAFT'
    CHECK (
      publish_status IN (
        'DRAFT',
        'APPROVED',
        'PUBLISHED',
        'ARCHIVED'
      )
    ),

  display_order INTEGER NOT NULL
    DEFAULT 0,

  approved_at TEXT,
  published_at TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (edition_id)
    REFERENCES editions(id)
    ON DELETE CASCADE,

  FOREIGN KEY (official_source_id)
    REFERENCES game_official_sources(id)
    ON DELETE CASCADE,

  FOREIGN KEY (selected_image_id)
    REFERENCES watch_item_images(id)
    ON DELETE SET NULL,

  UNIQUE (
    edition_id,
    official_source_id
  ),

  CHECK (
    preorder_start_date IS NULL OR
    preorder_end_date IS NULL OR
    preorder_start_date <= preorder_end_date
  )
);


CREATE INDEX IF NOT EXISTS
  idx_edition_preorders_edition
ON edition_preorders(edition_id);


CREATE INDEX IF NOT EXISTS
  idx_edition_preorders_source
ON edition_preorders(official_source_id);


CREATE INDEX IF NOT EXISTS
  idx_edition_preorders_status
ON edition_preorders(
  publish_status,
  preorder_status
);


CREATE INDEX IF NOT EXISTS
  idx_edition_preorders_release
ON edition_preorders(release_date);


CREATE INDEX IF NOT EXISTS
  idx_edition_preorders_preorder_dates
ON edition_preorders(
  preorder_start_date,
  preorder_end_date
);


-- ------------------------------------------------------------
-- 3. 안전 원칙
--
-- 기존 WATCHER 초안이나 게임을 자동 공개하지 않음
-- 신규 예약판매 데이터는 항상 DRAFT로 시작
-- ------------------------------------------------------------

UPDATE edition_preorders
SET
  publish_status = 'DRAFT',
  published_at = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE publish_status IS NULL;
