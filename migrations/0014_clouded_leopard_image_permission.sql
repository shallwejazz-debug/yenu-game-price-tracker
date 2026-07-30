-- 0014_clouded_leopard_image_permission.sql
--
-- Clouded Leopard Entertainment 고객지원팀 회신 반영
--
-- 허용:
--   - CLE 공식 보도자료에 첨부된 공개 이미지
--   - 패키지, 한정판 구성, 예약/초회 특전, 키 비주얼
--   - 여누딜 이미지 저장소 보관
--   - 웹 표시용 크기 조정 및 파일 용량 최적화
--   - 발매 및 예약판매 종료 후 정보 보존
--
-- 조건:
--   - 출처와 공식 보도자료 링크 표시
--   - 자르기, 합성, 색상/비율/문구 변경 금지
--   - CLE가 문제를 통보한 이미지는 즉시 비공개 또는 삭제
--   - 제3자 이미지가 아닌 CLE 공식 보도자료 첨부 이미지만 사용
--
-- 안전:
--   - 기존 이미지 후보의 permission_status는 자동 변경하지 않음
--   - 자동 선택 및 자동 공개하지 않음
--   - 이미지별 관리자 검수는 계속 필요

UPDATE source_image_policies
SET
  permission_status = 'CONDITIONAL',
  package_image_allowed = 1,
  limited_edition_image_allowed = 1,
  preorder_bonus_image_allowed = 1,
  local_storage_allowed = 1,
  key_visual_allowed = 1,
  resize_allowed = 1,
  required_credit = '이미지 및 정보 출처: Clouded Leopard Entertainment',
  permission_note = '2026-07 CLE 고객지원팀 회신: 공개된 공식 보도자료 첨부 이미지는 출처를 밝히고 가공 없이 사용 가능. 웹 표시용 크기 조정·용량 최적화 및 자체 저장은 문의 내용 범위에서 허용. 문제 이미지에 대해 별도 연락을 받으면 즉시 비공개 또는 삭제.',
  updated_at = CURRENT_TIMESTAMP
WHERE source_id = (
  SELECT id
  FROM watch_sources
  WHERE source_key = 'CLOUDED_LEOPARD'
);

-- 정책 대상 출처가 정확히 하나인지 확인한다.
-- 대상 출처 확인
-- 결과는 반드시 1이어야 한다.
SELECT
  COUNT(*) AS clouded_leopard_source_count
FROM watch_sources
WHERE source_key = 'CLOUDED_LEOPARD';
