-- ============================================================
-- 0012_sales_lifecycle_and_stock.sql
--
-- ?쇰컲 媛寃??ш퀬 ?곹깭
-- UNKNOWN  : ?ш퀬 ?뺤씤 ???먮뒗 湲곗〈 ?곗씠??
-- IN_STOCK : ?먮ℓ 媛??
-- SOLD_OUT : ?덉젅
--
-- 湲곗〈 媛寃??곗씠?곕뒗 ??젣?섏? ?딅뒗??
-- ============================================================

ALTER TABLE prices
ADD COLUMN stock_status TEXT NOT NULL DEFAULT 'UNKNOWN'
CHECK (
  stock_status IN (
    'UNKNOWN',
    'IN_STOCK',
    'SOLD_OUT'
  )
);

CREATE INDEX IF NOT EXISTS idx_prices_edition_stock_recorded
ON prices (
  edition_id,
  stock_status,
  recorded_at DESC
);

-- 諛쒕ℓ ??寃뚯엫???쇰컲 媛寃???μ쓣 DB 怨꾩링?먯꽌 理쒖쥌 李⑤떒?쒕떎.
-- ?좏뵆由ъ??댁뀡??insertPrice 寃?ъ? ?④퍡 ?댁쨷 諛⑹뼱濡??숈옉?쒕떎.
CREATE TRIGGER IF NOT EXISTS trg_prices_block_prerelease_insert
BEFORE INSERT ON prices
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM editions e
  INNER JOIN games g
    ON g.id = e.game_id
  WHERE
    e.id = NEW.edition_id
    AND g.release_date IS NOT NULL
    AND DATE(g.release_date) >
      DATE('now', '+9 hours')
)
BEGIN
  SELECT RAISE(
    ABORT,
    'PRE_RELEASE_PRICE_BLOCKED'
  );
END;