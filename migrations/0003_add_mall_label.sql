-- ============================================================
-- prices 테이블에 쇼핑몰 표시명 추가
-- migrations/0003_add_mall_label.sql
--   mall_label: 네이버가 준 실제 쇼핑몰명 (예: "게임할고양", "쿠팡")
--               source 는 어필리에이트 매핑용 코드, mall_label 은 화면 표시용
-- ============================================================

ALTER TABLE prices ADD COLUMN mall_label TEXT;
