-- 예약판매 판매처 정보는 일반 가격 수집 데이터와 분리해 보존한다.
CREATE TABLE IF NOT EXISTS variant_preorder_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_preorder_id INTEGER NOT NULL,
  seller_name TEXT NOT NULL,
  product_url TEXT,
  price INTEGER NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'KRW',
  stock_status TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (
      stock_status IN (
        'UNKNOWN',
        'IN_STOCK',
        'SOLD_OUT'
      )
    ),
  publish_status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (
      publish_status IN (
        'DRAFT',
        'PUBLISHED'
      )
    ),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (variant_preorder_id)
    REFERENCES variant_preorders(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS
  idx_variant_preorder_offers_public
ON variant_preorder_offers (
  variant_preorder_id,
  publish_status,
  stock_status,
  display_order
);

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_variant_preorder_offers_seller_unique
ON variant_preorder_offers (
  variant_preorder_id,
  seller_name
);