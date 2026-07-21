-- ============================================================
-- 0007_preorder_watcher.sql
--
-- 예약판매·발매정보 WATCHER 기반 구조
--
-- 흐름:
--   출처 등록
--   → 원문 발견
--   → 이미지 후보 수집
--   → 공통 템플릿 변환
--   → 관리자 검수
--   → 게임 연결·업로드
-- ============================================================

PRAGMA foreign_keys = ON;


-- ------------------------------------------------------------
-- 1. 수집 출처
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS watch_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  source_key TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,

  base_url TEXT,
  list_url TEXT,

  collection_mode TEXT NOT NULL DEFAULT 'html'
    CHECK (
      collection_mode IN (
        'rss',
        'html',
        'api',
        'manual'
      )
    ),

  collector_name TEXT,
  collector_version TEXT,

  enabled INTEGER NOT NULL DEFAULT 1
    CHECK (enabled IN (0, 1)),

  poll_interval_minutes INTEGER,

  priority INTEGER NOT NULL DEFAULT 100,

  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS idx_watch_sources_enabled
  ON watch_sources(enabled, priority);


-- ------------------------------------------------------------
-- 2. 회사·출처별 이미지 사용 정책
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS source_image_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  source_id INTEGER NOT NULL UNIQUE,

  permission_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (
      permission_status IN (
        'PENDING',
        'APPROVED',
        'CONDITIONAL',
        'DENIED',
        'EXPIRED'
      )
    ),

  package_image_allowed INTEGER NOT NULL DEFAULT 0
    CHECK (package_image_allowed IN (0, 1)),

  limited_edition_image_allowed INTEGER NOT NULL DEFAULT 0
    CHECK (limited_edition_image_allowed IN (0, 1)),

  preorder_bonus_image_allowed INTEGER NOT NULL DEFAULT 0
    CHECK (preorder_bonus_image_allowed IN (0, 1)),

  key_visual_allowed INTEGER NOT NULL DEFAULT 0
    CHECK (key_visual_allowed IN (0, 1)),

  screenshot_allowed INTEGER NOT NULL DEFAULT 0
    CHECK (screenshot_allowed IN (0, 1)),

  local_storage_allowed INTEGER NOT NULL DEFAULT 0
    CHECK (local_storage_allowed IN (0, 1)),

  resize_allowed INTEGER NOT NULL DEFAULT 0
    CHECK (resize_allowed IN (0, 1)),

  post_release_retention_allowed INTEGER NOT NULL DEFAULT 0
    CHECK (post_release_retention_allowed IN (0, 1)),

  hotlink_allowed INTEGER NOT NULL DEFAULT 0
    CHECK (hotlink_allowed IN (0, 1)),

  required_credit TEXT,
  required_copyright TEXT,

  permission_note TEXT,
  permission_received_at TEXT,
  permission_expires_at TEXT,

  evidence_url TEXT,
  evidence_note TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (source_id)
    REFERENCES watch_sources(id)
    ON DELETE CASCADE
);


-- ------------------------------------------------------------
-- 3. 발견한 보도자료·원문
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS watch_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  source_id INTEGER NOT NULL,

  external_id TEXT NOT NULL,
  source_url TEXT NOT NULL,

  title TEXT NOT NULL,
  raw_title TEXT,

  published_at TEXT,

  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  content_hash TEXT,
  raw_text TEXT,
  raw_html TEXT,
  raw_json TEXT,

  parser_name TEXT,
  parser_version TEXT,

  event_type TEXT NOT NULL DEFAULT 'SOURCE_NEW'
    CHECK (
      event_type IN (
        'SOURCE_NEW',
        'SOURCE_CHANGED',
        'PREORDER_OPEN',
        'PREORDER_CHANGED',
        'BONUS_CHANGED',
        'RELEASE_CHANGED',
        'OTHER'
      )
    ),

  review_status TEXT NOT NULL DEFAULT 'DISCOVERED'
    CHECK (
      review_status IN (
        'DISCOVERED',
        'TRANSFORMED',
        'REVIEWING',
        'APPROVED',
        'UPLOADED',
        'HOLD',
        'IGNORED',
        'ERROR'
      )
    ),

  transformed_json TEXT,
  transform_confidence REAL,

  linked_game_id INTEGER,

  reviewed_at TEXT,
  uploaded_at TEXT,

  error_message TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (source_id, external_id),

  FOREIGN KEY (source_id)
    REFERENCES watch_sources(id)
    ON DELETE CASCADE,

  FOREIGN KEY (linked_game_id)
    REFERENCES games(id)
    ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_watch_items_review_status
  ON watch_items(review_status, first_seen_at DESC);


CREATE INDEX IF NOT EXISTS idx_watch_items_source
  ON watch_items(source_id, published_at DESC);


CREATE INDEX IF NOT EXISTS idx_watch_items_game
  ON watch_items(linked_game_id);


CREATE INDEX IF NOT EXISTS idx_watch_items_hash
  ON watch_items(content_hash);


-- ------------------------------------------------------------
-- 4. 원문에서 발견한 이미지 후보
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS watch_item_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  watch_item_id INTEGER NOT NULL,

  source_image_url TEXT NOT NULL,
  stored_image_url TEXT,

  image_type TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (
      image_type IN (
        'PACKAGE',
        'LIMITED_EDITION',
        'PREORDER_BONUS',
        'FIRST_PRINT_BONUS',
        'STORE_BONUS',
        'KEY_VISUAL',
        'SCREENSHOT',
        'BANNER',
        'UNKNOWN'
      )
    ),

  title TEXT,
  alt_text TEXT,
  description TEXT,

  width INTEGER,
  height INTEGER,

  image_hash TEXT,

  permission_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (
      permission_status IN (
        'PENDING',
        'APPROVED',
        'EXTERNAL_ONLY',
        'REJECTED'
      )
    ),

  selected_for_publish INTEGER NOT NULL DEFAULT 0
    CHECK (selected_for_publish IN (0, 1)),

  display_order INTEGER NOT NULL DEFAULT 0,

  source_credit TEXT,
  source_article_url TEXT,

  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (watch_item_id, source_image_url),

  FOREIGN KEY (watch_item_id)
    REFERENCES watch_items(id)
    ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_watch_item_images_item
  ON watch_item_images(watch_item_id, display_order);


CREATE INDEX IF NOT EXISTS idx_watch_item_images_permission
  ON watch_item_images(permission_status, selected_for_publish);


-- ------------------------------------------------------------
-- 5. WATCHER 이벤트
-- 신규·변경·업로드·발매 알림에 사용
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS watch_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  watch_item_id INTEGER,
  source_id INTEGER,

  event_type TEXT NOT NULL
    CHECK (
      event_type IN (
        'SOURCE_NEW',
        'SOURCE_CHANGED',
        'IMAGE_NEW',
        'PREORDER_OPEN',
        'PREORDER_ENDING',
        'PREORDER_ENDED',
        'UPLOADED',
        'RELEASED',
        'PERMISSION_CHANGED',
        'ERROR'
      )
    ),

  title TEXT,
  message TEXT,
  event_json TEXT,

  is_read INTEGER NOT NULL DEFAULT 0
    CHECK (is_read IN (0, 1)),

  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (watch_item_id)
    REFERENCES watch_items(id)
    ON DELETE CASCADE,

  FOREIGN KEY (source_id)
    REFERENCES watch_sources(id)
    ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_watch_events_unread
  ON watch_events(is_read, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_watch_events_type
  ON watch_events(event_type, created_at DESC);


-- ------------------------------------------------------------
-- 6. 초기 수집 출처
-- ------------------------------------------------------------

INSERT OR IGNORE INTO watch_sources (
  source_key,
  source_name,
  base_url,
  list_url,
  collection_mode,
  collector_name,
  collector_version,
  enabled,
  poll_interval_minutes,
  priority
)
VALUES
  (
    'PLAYSTATION_BLOG_KR',
    'PlayStation Blog 한국어',
    'https://blog.ko.playstation.com',
    'https://blog.ko.playstation.com/feed/',
    'rss',
    'PlayStationBlogKrCollector',
    '1.0.0',
    1,
    60,
    10
  ),
  (
    'ARC_SYSTEM_WORKS_ASIA',
    '아크시스템웍스아시아',
    'https://www.arcsystemworks.asia',
    'https://www.arcsystemworks.asia/bbs/board.php?bo_table=notice',
    'html',
    'ArcSystemWorksAsiaCollector',
    '1.0.0',
    1,
    180,
    20
  ),
  (
    'CLOUDED_LEOPARD',
    'Clouded Leopard Entertainment',
    'https://www.cloudedleopardent.com/kr',
    'https://www.cloudedleopardent.com/kr/news/product/',
    'html',
    'CloudedLeopardCollector',
    '1.0.0',
    1,
    120,
    20
  ),
  (
    'GAMEPIA',
    '게임피아',
    'http://www.egamepia.co.kr',
    'http://www.egamepia.co.kr/board/free/list.html?board_no=8',
    'html',
    'GamepiaCollector',
    '1.0.0',
    0,
    1440,
    50
  ),
  (
    'NAVER_SHOPPING',
    '네이버 쇼핑',
    'https://openapi.naver.com',
    'https://openapi.naver.com/v1/search/shop.json',
    'api',
    'NaverShoppingCollector',
    '1.0.0',
    1,
    360,
    30
  ),
  (
    'NINTENDO_KOREA',
    '한국닌텐도',
    'https://www.nintendo.com/kr',
    'https://www.nintendo.com/kr/schedule',
    'manual',
    'NintendoKoreaManualCollector',
    '1.0.0',
    0,
    NULL,
    60
  ),
  (
    'YEPAN',
    '예판넷',
    'https://yepan.net',
    NULL,
    'manual',
    'YepanManualCollector',
    '1.0.0',
    0,
    NULL,
    70
  );


-- ------------------------------------------------------------
-- 7. 모든 출처의 이미지 권한 기본값
-- 회신 또는 별도 확인 전에는 전부 비공개
-- ------------------------------------------------------------

INSERT OR IGNORE INTO source_image_policies (
  source_id,
  permission_status,
  required_credit,
  permission_note
)
SELECT
  id,
  'PENDING',
  '이미지 및 정보 출처: ' || source_name,
  '사용 허가 확인 전에는 관리자 미리보기에서만 사용'
FROM watch_sources;


-- 아크시스템웍스와 CLE는 현재 문의 회신 대기 상태
UPDATE source_image_policies
SET
  permission_status = 'PENDING',
  permission_note = '2026-07 이미지 사용 문의 발송, 회신 대기',
  updated_at = CURRENT_TIMESTAMP
WHERE source_id IN (
  SELECT id
  FROM watch_sources
  WHERE source_key IN (
    'ARC_SYSTEM_WORKS_ASIA',
    'CLOUDED_LEOPARD'
  )
);
