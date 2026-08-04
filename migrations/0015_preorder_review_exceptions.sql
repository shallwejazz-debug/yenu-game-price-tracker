-- ============================================================
-- 0015_preorder_review_exceptions.sql
--
-- 공식 일정 미발표, 종료일 없음 등 의도적인 미입력 사유를
-- 예약판매 DRAFT별로 저장한다.
--
-- 기존 데이터와 공개 상태는 변경하지 않는다.
-- ============================================================

ALTER TABLE variant_preorders
ADD COLUMN review_exceptions TEXT;