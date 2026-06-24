-- ============================================================
-- 0006: games 테이블에 genre(장르) 추가
--   게임 정보 헤더 강화용 (예: "액션 RPG", "시뮬레이션")
-- ============================================================

ALTER TABLE games ADD COLUMN genre TEXT;

-- 더미 데이터 장르 채우기
UPDATE games SET genre = '액션 RPG'   WHERE title LIKE '%엘든%';
UPDATE games SET genre = 'RPG'         WHERE title LIKE '%발더스%';
UPDATE games SET genre = '오픈월드 RPG' WHERE title LIKE '%사이버펑크%';
UPDATE games SET genre = '시뮬레이션'   WHERE title LIKE '%스타듀%';
UPDATE games SET genre = '액션 어드벤처' WHERE title LIKE '%호라이즌%';
