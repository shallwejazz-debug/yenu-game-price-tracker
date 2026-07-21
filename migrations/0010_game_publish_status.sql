-- ============================================================
-- 0010_game_publish_status.sql
--
-- 게임 공개 상태 관리
--
-- 기존 게임:
--   PUBLISHED 상태로 유지
--
-- WATCHER에서 새로 등록되는 게임:
--   DRAFT 상태로 생성
--
-- 공개 목록:
--   PUBLISHED 상태만 표시
-- ============================================================

PRAGMA foreign_keys = ON;


-- ------------------------------------------------------------
-- 1. 게임 공개 상태
-- ------------------------------------------------------------

ALTER TABLE games
ADD COLUMN publish_status TEXT NOT NULL
DEFAULT 'PUBLISHED'
CHECK (
  publish_status IN (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
  )
);


-- ------------------------------------------------------------
-- 2. 실제 공개 시각
-- ------------------------------------------------------------

ALTER TABLE games
ADD COLUMN published_at TEXT;


-- ------------------------------------------------------------
-- 3. 기존 게임은 모두 현재 공개 중인 데이터로 처리
-- ------------------------------------------------------------

UPDATE games
SET
  publish_status = 'PUBLISHED',

  published_at = COALESCE(
    published_at,
    created_at,
    CURRENT_TIMESTAMP
  );


-- ------------------------------------------------------------
-- 4. 공개 게임 조회용 인덱스
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS
  idx_games_publish_status
ON games(
  publish_status,
  created_at
);
