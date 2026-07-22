-- ============================================================
-- 0011_preorder_variants.sql
--
-- 사전예약 V2: 플랫폼 아래 상품 에디션 구조
--
-- 기존 구조:
--   games
--     └── editions
--           └── edition_preorders
--
-- V2 구조:
--   games
--     └── editions                 플랫폼판
--           └── product_variants  통상판/한정판/디럭스
--                 └── variant_preorders
--                       └── variant_preorder_images
--
-- 안전 원칙:
--   - 기존 edition_preorders를 변경하지 않음
--   - 기존 games, editions, prices를 변경하지 않음
--   - 신규 데이터는 항상 DRAFT로 시작
--   - 신규 테이블 생성만 수행
-- ============================================================

PRAGMA foreign_keys = ON;


-- ------------------------------------------------------------
-- 1. 플랫폼 아래 상품 에디션
--
-- 예:
--   Nintendo Switch
--     ├── 통상판
--     └── 한국 한정판
--
--   PlayStation 5
--     ├── 통상판
--     ├── 디럭스 에디션
--     └── 얼티밋 에디션
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  edition_id INTEGER NOT NULL,

  variant_code TEXT NOT NULL,
  variant_name TEXT NOT NULL,

  variant_kind TEXT NOT NULL
    DEFAULT 'STANDARD'
    CHECK (
      variant_kind IN (
        'STANDARD',
        'DELUXE',
        'ULTIMATE',
        'LIMITED',
        'COLLECTORS',
        'OTHER'
      )
    ),

  package_type TEXT NOT NULL
    DEFAULT 'PACKAGE'
    CHECK (
      package_type IN (
        'PACKAGE',
        'DIGITAL',
        'BOTH'
      )
    ),

  is_default INTEGER NOT NULL
    DEFAULT 0
    CHECK (
      is_default IN (0, 1)
    ),

  display_order INTEGER NOT NULL
    DEFAULT 0,

  publish_status TEXT NOT NULL
    DEFAULT 'DRAFT'
    CHECK (
      publish_status IN (
        'DRAFT',
        'ACTIVE',
        'ARCHIVED'
      )
    ),

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (edition_id)
    REFERENCES editions(id)
    ON DELETE CASCADE,

  UNIQUE (
    edition_id,
    variant_code
  )
);


CREATE INDEX IF NOT EXISTS
  idx_product_variants_edition
ON product_variants(
  edition_id,
  display_order,
  id
);


CREATE INDEX IF NOT EXISTS
  idx_product_variants_status
ON product_variants(
  publish_status,
  edition_id
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_product_variants_one_default
ON product_variants(
  edition_id
)
WHERE is_default = 1;


-- ------------------------------------------------------------
-- 2. 상품 에디션별 예약판매 정보
--
-- 공식 가격과 예약 특전은 게임 전체나 플랫폼 전체가 아니라
-- 정확한 상품 에디션에 연결함
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS variant_preorders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  variant_id INTEGER NOT NULL,
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
  contents_text TEXT,

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

  FOREIGN KEY (variant_id)
    REFERENCES product_variants(id)
    ON DELETE CASCADE,

  FOREIGN KEY (official_source_id)
    REFERENCES game_official_sources(id)
    ON DELETE CASCADE,

  UNIQUE (
    variant_id,
    official_source_id
  ),

  CHECK (
    preorder_start_date IS NULL OR
    preorder_end_date IS NULL OR
    preorder_start_date <= preorder_end_date
  )
);


CREATE INDEX IF NOT EXISTS
  idx_variant_preorders_variant
ON variant_preorders(
  variant_id,
  display_order,
  id
);


CREATE INDEX IF NOT EXISTS
  idx_variant_preorders_source
ON variant_preorders(
  official_source_id
);


CREATE INDEX IF NOT EXISTS
  idx_variant_preorders_status
ON variant_preorders(
  publish_status,
  preorder_status
);


CREATE INDEX IF NOT EXISTS
  idx_variant_preorders_release
ON variant_preorders(
  release_date
);


CREATE INDEX IF NOT EXISTS
  idx_variant_preorders_dates
ON variant_preorders(
  preorder_start_date,
  preorder_end_date
);


-- ------------------------------------------------------------
-- 3. 예약판매 이미지 다중 연결
--
-- 하나의 에디션에 다음 이미지를 각각 연결할 수 있음:
--   REPRESENTATIVE  대표 이미지
--   PACKAGE         패키지 이미지
--   BONUS           예약 특전 이미지
--   CONTENTS        구성품 이미지
--   GALLERY         추가 이미지
--
-- watch_item_images의 비공개 R2 저장 구조를 그대로 재사용함
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS variant_preorder_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  preorder_id INTEGER NOT NULL,
  image_id INTEGER NOT NULL,

  display_role TEXT NOT NULL
    CHECK (
      display_role IN (
        'REPRESENTATIVE',
        'PACKAGE',
        'BONUS',
        'CONTENTS',
        'GALLERY'
      )
    ),

  display_order INTEGER NOT NULL
    DEFAULT 0,

  alt_text TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (preorder_id)
    REFERENCES variant_preorders(id)
    ON DELETE CASCADE,

  FOREIGN KEY (image_id)
    REFERENCES watch_item_images(id)
    ON DELETE RESTRICT,

  UNIQUE (
    preorder_id,
    image_id,
    display_role
  )
);


CREATE INDEX IF NOT EXISTS
  idx_variant_preorder_images_preorder
ON variant_preorder_images(
  preorder_id,
  display_role,
  display_order,
  id
);


CREATE INDEX IF NOT EXISTS
  idx_variant_preorder_images_image
ON variant_preorder_images(
  image_id
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_variant_preorder_one_representative
ON variant_preorder_images(
  preorder_id
)
WHERE display_role = 'REPRESENTATIVE';


-- ------------------------------------------------------------
-- 4. 마이그레이션 안전 확인
--
-- 기존 데이터를 자동 변환하거나 공개하지 않음
-- product_variants 및 variant_preorders는 관리자 저장 API를
-- 통해서만 생성함
-- ------------------------------------------------------------
