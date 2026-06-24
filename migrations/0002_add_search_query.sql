-- ============================================================
-- games 테이블에 네이버 검색용 필드 추가
-- migrations/0002_add_search_query.sql
--   search_query: 네이버 쇼핑 검색에 사용할 문자열 (예: "PS5 엘든링 한글판")
--   keywords    : 본품 판별용 키워드 (쉼표 구분, 예: "엘든,elden")
-- ============================================================

ALTER TABLE games ADD COLUMN search_query TEXT;
ALTER TABLE games ADD COLUMN keywords TEXT;
