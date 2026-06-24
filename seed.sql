-- ============================================================
-- 새 구조 시드 데이터 (games → editions → prices)
-- seed.sql
--   디지털 가격은 예시(수동), 패키지 가격은 네이버 수집으로 채울 예정
-- ============================================================

DELETE FROM price_history;
DELETE FROM prices;
DELETE FROM editions;
DELETE FROM games;

-- ---------- 게임(작품) ----------
INSERT INTO games (id, title, image_url, release_date, original_price) VALUES
  (1, '엘든 링 (ELDEN RING)',
   'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg',
   '2022-02-25', 64800),
  (2, '발더스 게이트 3',
   'https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/header.jpg',
   '2023-08-03', 66000),
  (3, '사이버펑크 2077',
   'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg',
   '2020-12-10', 66000),
  (4, '스타듀 밸리',
   'https://cdn.cloudflare.steamstatic.com/steam/apps/413150/header.jpg',
   '2016-02-26', 16500);

-- ---------- 에디션(플랫폼판) ----------
-- 엘든 링: PC / PS5 / PS4 / XBOX
INSERT INTO editions (id, game_id, platform, edition_name, search_query, keywords, steam_appid) VALUES
  (1, 1, 'pc',   '스팀 스탠다드', 'PC 엘든링 스팀',        '엘든,elden', 1245620),
  (2, 1, 'ps5',  'PS5 한글판',    'PS5 엘든링 한글판',     '엘든,elden', NULL),
  (3, 1, 'ps4',  'PS4 한글판',    'PS4 엘든링 한글판',     '엘든,elden', NULL),
  (4, 1, 'xbox', 'Xbox 한글판',   'Xbox 엘든링 한글판',    '엘든,elden', NULL);

-- 발더스 게이트 3: PC / PS5
INSERT INTO editions (id, game_id, platform, edition_name, search_query, keywords, steam_appid) VALUES
  (5, 2, 'pc',  '스팀',       'PC 발더스게이트3 스팀',  '발더스,baldur', 1086940),
  (6, 2, 'ps5', 'PS5 한글판', 'PS5 발더스게이트3 한글판', '발더스,baldur', NULL);

-- 사이버펑크 2077: PC / PS5 / XBOX
INSERT INTO editions (id, game_id, platform, edition_name, search_query, keywords, steam_appid) VALUES
  (7, 3, 'pc',   '스팀',       'PC 사이버펑크2077 스팀',  '사이버펑크,cyberpunk', 1091500),
  (8, 3, 'ps5',  'PS5 한글판', 'PS5 사이버펑크2077 한글판', '사이버펑크,cyberpunk', NULL),
  (9, 3, 'xbox', 'Xbox 한글판','Xbox 사이버펑크2077 한글판','사이버펑크,cyberpunk', NULL);

-- 스타듀 밸리: PC / SWITCH
INSERT INTO editions (id, game_id, platform, edition_name, search_query, keywords, steam_appid) VALUES
  (10, 4, 'pc',     '스팀',       'PC 스타듀밸리 스팀',    '스타듀,stardew', 413150),
  (11, 4, 'switch', '스위치 한글판','스위치 스타듀밸리 한글판','스타듀,stardew', NULL);

-- ---------- 디지털 가격 (예시 수동값) ----------
-- 엘든 링
INSERT INTO prices (edition_id, source, price, is_digital, product_url) VALUES
  (1, 'steam', 45360, 1, 'https://store.steampowered.com/app/1245620'),
  (2, 'psn',   51840, 1, 'https://store.playstation.com/'),
  (3, 'psn',   49800, 1, 'https://store.playstation.com/'),
  (4, 'xbox_store', 52000, 1, 'https://www.xbox.com/');
-- 발더스 게이트 3
INSERT INTO prices (edition_id, source, price, is_digital, product_url) VALUES
  (5, 'steam', 66000, 1, 'https://store.steampowered.com/app/1086940'),
  (6, 'psn',   69800, 1, 'https://store.playstation.com/');
-- 사이버펑크
INSERT INTO prices (edition_id, source, price, is_digital, product_url) VALUES
  (7, 'steam', 19800, 1, 'https://store.steampowered.com/app/1091500'),
  (8, 'psn',   29700, 1, 'https://store.playstation.com/'),
  (9, 'xbox_store', 33000, 1, 'https://www.xbox.com/');
-- 스타듀 밸리
INSERT INTO prices (edition_id, source, price, is_digital, product_url) VALUES
  (10, 'steam',    11550, 1, 'https://store.steampowered.com/app/413150'),
  (11, 'nintendo', 16500, 1, 'https://www.nintendo.com/');

-- ---------- 디지털 역대 최저가 (예시) ----------
INSERT INTO price_history (edition_id, is_digital, lowest_ever, lowest_date) VALUES
  (1, 1, 38880, '2024-11-28 00:00:00'),
  (2, 1, 41472, '2024-11-28 00:00:00'),
  (7, 1, 13200, '2024-06-15 00:00:00'),
  (10, 1, 8250, '2023-12-21 00:00:00');
