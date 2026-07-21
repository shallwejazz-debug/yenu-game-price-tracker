-- ============================================================
-- 0008_arc_image_permission.sql
--
-- 아크시스템웍스아시아 공식 보도자료 이미지 사용 정책
--
-- 2026-07-21 이메일 회신으로 조건부 사용 허가 확인
-- 이메일 원문은 공개 저장소에 올리지 않고 내부 보관
-- ============================================================

PRAGMA foreign_keys = ON;


-- ------------------------------------------------------------
-- 1. 아크시스템웍스아시아 출처 이미지 정책 변경
-- ------------------------------------------------------------

UPDATE source_image_policies
SET
  permission_status = 'CONDITIONAL',

  package_image_allowed = 1,
  limited_edition_image_allowed = 1,
  preorder_bonus_image_allowed = 1,
  key_visual_allowed = 1,
  screenshot_allowed = 1,

  local_storage_allowed = 1,
  resize_allowed = 1,
  post_release_retention_allowed = 1,

  hotlink_allowed = 0,

  required_credit =
    '이미지 및 정보 출처: 아크시스템웍스아시아 (공식 보도자료 링크)',

  required_copyright =
    '이미지 내 © 등 권리표기를 자르거나 삭제하거나 가리지 않고 그대로 보존',

  permission_note =
    '공식 보도자료에 공개된 이미지 사용 허가. 출처와 공식 보도자료 링크를 반드시 표기하고 이미지 내 권리표기를 보존한다. 향후 수정 또는 삭제 요청이 접수되면 신속하게 반영하며, 콘텐츠 공개 후 확인 가능한 페이지 링크를 아크시스템웍스아시아에 전달한다.',

  permission_received_at = '2026-07-21 00:00:00',
  permission_expires_at = NULL,

  evidence_url = NULL,

  evidence_note =
    '2026-07-21 support_asia@arcsy.co.jp 이메일 회신으로 허가 확인. 이메일 원문은 비공개 내부 기록으로 보관.',

  updated_at = CURRENT_TIMESTAMP

WHERE source_id = (
  SELECT id
  FROM watch_sources
  WHERE source_key = 'ARC_SYSTEM_WORKS_ASIA'
  LIMIT 1
);


-- ------------------------------------------------------------
-- 2. 기존 아크 이미지 후보의 필수 출처 문구 정정
--
-- 이미지별 검수 전이므로 permission_status는 PENDING 유지
-- 자동 공개 및 자동 선택도 하지 않음
-- ------------------------------------------------------------

UPDATE watch_item_images
SET
  source_credit =
    '이미지 및 정보 출처: 아크시스템웍스아시아 (공식 보도자료 링크)',

  updated_at = CURRENT_TIMESTAMP

WHERE watch_item_id IN (
  SELECT wi.id
  FROM watch_items wi

  INNER JOIN watch_sources ws
    ON ws.id = wi.source_id

  WHERE ws.source_key = 'ARC_SYSTEM_WORKS_ASIA'
);


-- ------------------------------------------------------------
-- 3. 정책 변경 감사 이벤트 기록
-- ------------------------------------------------------------

INSERT INTO watch_events (
  watch_item_id,
  source_id,
  event_type,
  title,
  message,
  is_read
)
SELECT
  NULL,
  ws.id,
  'PERMISSION_CHANGED',
  '아크시스템웍스아시아 이미지 사용 정책 변경',
  '공식 보도자료 이미지 정책이 PENDING에서 CONDITIONAL로 변경되었습니다.',
  0
FROM watch_sources ws
WHERE
  ws.source_key = 'ARC_SYSTEM_WORKS_ASIA'

  AND NOT EXISTS (
    SELECT 1
    FROM watch_events we
    WHERE
      we.source_id = ws.id
      AND we.event_type = 'PERMISSION_CHANGED'
      AND we.title =
        '아크시스템웍스아시아 이미지 사용 정책 변경'
  );
