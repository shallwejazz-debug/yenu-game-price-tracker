// =============================================================
// DB 조회 헬퍼 함수 모음
// src/db.ts
//   구조: games → editions → prices / price_history / price_log
//   + 품절 필터: 각 에디션의 최신 갱신 시각 기준 STALE_HOURS 이상
//     오래된 source(=이번 수집에 안 잡힌 품절 샵)는 현재가에서 제외
//   [2026-07-08] 역대최저 → 이번 주 최저(price_log 7일) 전환
//     + getLastUpdated / getWeekLow 추가, getTopDiscounts 재작성
// =============================================================

import type { Game, Edition, Price, PriceHistory } from './types'

const STALE_HOURS = 24

// ---------- 게임(작품) ----------
export async function getGameById(
  db: D1Database,
  id: number
): Promise<Game | null> {
  return await db
    .prepare(`
      SELECT *
      FROM games
      WHERE
        id = ?
        AND publish_status = 'PUBLISHED'
      LIMIT 1
    `)
    .bind(id)
    .first<Game>()
}


export async function listGames(db: D1Database): Promise<Game[]> {
  const { results } = await db
.prepare(`
  SELECT *
  FROM games
  WHERE publish_status = 'PUBLISHED'
  ORDER BY created_at DESC
`)
    .all<Game>()
  return results ?? []
}

// ---------- 홈: 최근 등록 게임 ----------
export async function getRecentGames(
  db: D1Database,
  limit = 8
): Promise<
  Array<
    Game & {
      platforms: string
      first_platform: string
    }
  >
> {
  const { results } = await db
    .prepare(
      `WITH ranked_games AS (
         SELECT
           g.*,
           ROW_NUMBER() OVER (
             PARTITION BY LOWER(TRIM(g.title))
             ORDER BY g.created_at DESC, g.id DESC
           ) AS title_rank
         FROM games g
         WHERE
          g.publish_status = 'PUBLISHED'
          AND EXISTS (
           SELECT 1
           FROM editions e
           WHERE e.game_id = g.id
         )
       )
       SELECT
         rg.id,
         rg.title,
         rg.image_url,
         rg.release_date,
         rg.original_price,
         rg.genre,
         rg.created_at,
         (
           SELECT GROUP_CONCAT(e.platform)
           FROM editions e
           WHERE e.game_id = rg.id
         ) AS platforms,
         (
           SELECT e.platform
           FROM editions e
           WHERE e.game_id = rg.id
           ORDER BY
             CASE e.platform
               WHEN 'ps5' THEN 1
               WHEN 'switch' THEN 2
               WHEN 'switch2' THEN 3
               WHEN 'xbox' THEN 4
               WHEN 'ps4' THEN 5
               WHEN 'pc' THEN 6
               ELSE 7
             END,
             e.id ASC
           LIMIT 1
         ) AS first_platform
       FROM ranked_games rg
       WHERE rg.title_rank = 1
       ORDER BY rg.created_at DESC, rg.id DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<
      Game & {
        platforms: string
        first_platform: string
      }
    >()

  return results ?? []
}


export async function listGamesByPlatform(
  db: D1Database,
  platform: string
): Promise<
  Array<
    Game & {
      edition_id: number
      lowest_price: number | null
      lowest_price_type: 'package' | 'digital' | null
      original_price: number | null
    }
  >
> {
  const { results } = await db
    .prepare(
      `WITH ed_latest AS (
         SELECT p.edition_id, MAX(p.recorded_at) AS ed_max
         FROM prices p
         INNER JOIN editions e ON e.id = p.edition_id
         WHERE e.platform = ?
         GROUP BY p.edition_id
       ),
       valid_prices AS (
         SELECT
           p.*,
           ROW_NUMBER() OVER (
             PARTITION BY p.edition_id, p.source, p.is_digital
             ORDER BY p.recorded_at DESC, p.price ASC, p.id DESC
           ) AS rn
         FROM prices p
         INNER JOIN ed_latest el ON el.edition_id = p.edition_id
         WHERE p.recorded_at >= datetime(
           el.ed_max,
           '-${STALE_HOURS} hours'
         )
       ),
       price_summary AS (
         SELECT
           edition_id,
           MIN(
             CASE
               WHEN is_digital = 0 AND rn = 1 THEN price
             END
           ) AS package_lowest,
           MIN(
             CASE
               WHEN is_digital = 1 AND rn = 1 THEN price
             END
           ) AS digital_lowest
         FROM valid_prices
         GROUP BY edition_id
       )
       SELECT
         g.*,
         e.id AS edition_id,
          CASE
            WHEN ps.package_lowest IS NULL THEN ps.digital_lowest
            WHEN ps.digital_lowest IS NULL THEN ps.package_lowest
            WHEN ps.package_lowest <= ps.digital_lowest
              THEN ps.package_lowest
            ELSE ps.digital_lowest
          END AS lowest_price,
          CASE
            WHEN ps.package_lowest IS NULL
              AND ps.digital_lowest IS NULL
              THEN NULL
            WHEN ps.package_lowest IS NULL
              THEN 'digital'
            WHEN ps.digital_lowest IS NULL
              THEN 'package'
            WHEN ps.package_lowest <= ps.digital_lowest
              THEN 'package'
            ELSE 'digital'
          END AS lowest_price_type
       FROM games g
       INNER JOIN editions e ON e.game_id = g.id
       LEFT JOIN price_summary ps ON ps.edition_id = e.id
       WHERE
        e.platform = ?
        AND g.publish_status = 'PUBLISHED'
        ORDER BY g.created_at DESC`
    )
    .bind(platform, platform)
    .all()

  return (results ?? []) as any
}



// [2026-07-14] 검색 전용: 플랫폼 무시하고 전체 게임에서 제목 검색.
//   각 게임이 어떤 플랫폼(에디션)들을 갖는지 platforms 문자열도 함께 반환
//   → 카드에 플랫폼 뱃지 여러 개 표시용
export async function searchGamesAllPlatforms(
  db: D1Database,
  query: string
): Promise<
  Array<
    Game & {
      lowest_price: number | null
      lowest_price_type: 'package' | 'digital' | null
      original_price: number | null
      platforms: string
      first_platform: string
    }
  >
> {
  const q = `%${query.trim()}%`

  const { results } = await db
    .prepare(
      `WITH matched_games AS (
        SELECT *
        FROM games
        WHERE
      publish_status = 'PUBLISHED'
      AND title LIKE ? COLLATE NOCASE
),

       ed_latest AS (
         SELECT p.edition_id, MAX(p.recorded_at) AS ed_max
         FROM prices p
         INNER JOIN editions e ON e.id = p.edition_id
         INNER JOIN matched_games mg ON mg.id = e.game_id
         GROUP BY p.edition_id
       ),
       valid_prices AS (
         SELECT
           p.*,
           ROW_NUMBER() OVER (
             PARTITION BY p.edition_id, p.source, p.is_digital
             ORDER BY p.recorded_at DESC, p.price ASC, p.id DESC
           ) AS rn
         FROM prices p
         INNER JOIN ed_latest el ON el.edition_id = p.edition_id
         WHERE p.recorded_at >= datetime(
           el.ed_max,
           '-${STALE_HOURS} hours'
         )
       ),
       game_price_summary AS (
         SELECT
           e.game_id,
           MIN(
             CASE
               WHEN vp.is_digital = 0 AND vp.rn = 1
               THEN vp.price
             END
           ) AS package_lowest,
           MIN(
             CASE
               WHEN vp.is_digital = 1 AND vp.rn = 1
               THEN vp.price
             END
           ) AS digital_lowest
         FROM editions e
         LEFT JOIN valid_prices vp ON vp.edition_id = e.id
         GROUP BY e.game_id
       )
       SELECT
         mg.*,
               CASE
        WHEN gps.package_lowest IS NULL THEN gps.digital_lowest
        WHEN gps.digital_lowest IS NULL THEN gps.package_lowest
        WHEN gps.package_lowest <= gps.digital_lowest
          THEN gps.package_lowest
        ELSE gps.digital_lowest
      END AS lowest_price,
      CASE
        WHEN gps.package_lowest IS NULL
          AND gps.digital_lowest IS NULL
          THEN NULL
        WHEN gps.package_lowest IS NULL
          THEN 'digital'
        WHEN gps.digital_lowest IS NULL
          THEN 'package'
        WHEN gps.package_lowest <= gps.digital_lowest
          THEN 'package'
        ELSE 'digital'
      END AS lowest_price_type,

         (
           SELECT GROUP_CONCAT(e3.platform)
           FROM editions e3
           WHERE e3.game_id = mg.id
         ) AS platforms,
         (
           SELECT e4.platform
           FROM editions e4
           WHERE e4.game_id = mg.id
           ORDER BY e4.platform
           LIMIT 1
         ) AS first_platform
       FROM matched_games mg
       LEFT JOIN game_price_summary gps ON gps.game_id = mg.id
       WHERE EXISTS (
         SELECT 1
         FROM editions e
         WHERE e.game_id = mg.id
       )
       ORDER BY mg.created_at DESC`
    )
    .bind(q)
    .all()

  return (results ?? []) as any
}



export async function insertGame(
  db: D1Database,
  data: {
    title: string
    image_url?: string | null
    release_date?: string | null
    original_price?: number | null
  }
) {
  return await db
    .prepare(
      `INSERT INTO games (title, image_url, release_date, original_price)
       VALUES (?, ?, ?, ?)`
    )
    .bind(data.title, data.image_url ?? null, data.release_date ?? null, data.original_price ?? null)
    .run()
}

export async function findGameByTitle(db: D1Database, title: string): Promise<Game | null> {
  return await db
    .prepare('SELECT * FROM games WHERE title = ? COLLATE NOCASE LIMIT 1')
    .bind(title.trim())
    .first<Game>()
}

// ---------- 에디션(플랫폼판) ----------
export async function getEditionById(db: D1Database, id: number): Promise<Edition | null> {
  return await db.prepare('SELECT * FROM editions WHERE id = ?').bind(id).first<Edition>()
}

export async function findEdition(
  db: D1Database,
  gameId: number,
  platform: string
): Promise<Edition | null> {
  return await db
    .prepare('SELECT * FROM editions WHERE game_id = ? AND platform = ? LIMIT 1')
    .bind(gameId, platform)
    .first<Edition>()
}

export async function listEditionsByGame(
  db: D1Database,
  gameId: number
): Promise<Edition[]> {
  const { results } = await db
    .prepare(`
      SELECT e.*
      FROM editions e

      INNER JOIN games g
        ON g.id = e.game_id

      WHERE
        e.game_id = ?
        AND g.publish_status = 'PUBLISHED'

      ORDER BY e.platform
    `)
    .bind(gameId)
    .all<Edition>()

  return results ?? []
}


export async function insertEdition(
  db: D1Database,
  data: {
    game_id: number
    platform: string
    edition_name?: string | null
    search_query?: string | null
    keywords?: string | null
    exclude_keywords?: string | null
    steam_appid?: number | null
  }
) {
  return await db
    .prepare(
      `INSERT INTO editions (game_id, platform, edition_name, search_query, keywords, exclude_keywords, steam_appid)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.game_id,
      data.platform,
      data.edition_name ?? null,
      data.search_query ?? null,
      data.keywords ?? null,
      data.exclude_keywords ?? null,
      data.steam_appid ?? null
    )
    .run()
}

// ---------- 가격 ----------
export async function getCurrentPrices(
  db: D1Database,
  editionId: number
): Promise<Price[]> {
  const { results } = await db
    .prepare(
      `WITH ed_latest AS (
         SELECT MAX(recorded_at) AS ed_max
         FROM prices
         WHERE edition_id = ?
       )
       SELECT p.*
       FROM prices p
       INNER JOIN (
         SELECT source, is_digital, MAX(recorded_at) AS max_at
         FROM prices
         WHERE edition_id = ?
         GROUP BY source, is_digital
       ) latest
         ON p.source = latest.source
        AND p.is_digital = latest.is_digital
        AND p.recorded_at = latest.max_at
       CROSS JOIN ed_latest
       WHERE p.edition_id = ?
         AND p.recorded_at >= datetime(
           ed_latest.ed_max,
           '-' || ? || ' hours'
         )
       ORDER BY p.is_digital DESC, p.price ASC`
    )
    .bind(editionId, editionId, editionId, STALE_HOURS)
    .all<Price>()

  return results ?? []
}


export async function getPriceHistory(db: D1Database, editionId: number): Promise<PriceHistory[]> {
  const { results } = await db
    .prepare('SELECT * FROM price_history WHERE edition_id = ?')
    .bind(editionId)
    .all<PriceHistory>()
  return results ?? []
}

export async function getPriceTrend(
  db: D1Database,
  editionId: number,
  isDigital: number,
  days: number
): Promise<Array<{ date: string; price: number }>> {
  const { results } = await db
    .prepare(
      `SELECT DATE(recorded_at) AS date, MIN(price) AS price
       FROM prices
       WHERE edition_id = ? AND is_digital = ?
         AND recorded_at >= datetime('now', '-' || ? || ' days')
       GROUP BY DATE(recorded_at)
       ORDER BY date ASC`
    )
    .bind(editionId, isDigital, days)
    .all<{ date: string; price: number }>()
  return results ?? []
}

// ★ [2026-07-08 추가] 최근 7일 최저가 (price_log 기반, UTC 날짜 기준)
export async function getWeekLow(
  db: D1Database,
  editionId: number,
  isDigital: number
): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT MIN(price) AS week_low
       FROM price_log
       WHERE edition_id = ? AND is_digital = ?
         AND log_date >= date('now', '-6 days')`
    )
    .bind(editionId, isDigital)
    .first<{ week_low: number | null }>()
  return row?.week_low ?? null
}

// ★ [2026-07-08 추가] 전체 가격 마지막 업데이트 시각 (UTC 문자열)
export async function getLastUpdated(db: D1Database): Promise<string | null> {
  const row = await db.prepare(`
  SELECT MAX(p.recorded_at) AS last

  FROM prices p

  INNER JOIN editions e
    ON e.id = p.edition_id

  INNER JOIN games g
    ON g.id = e.game_id

  WHERE g.publish_status = 'PUBLISHED'
`)

    .first<{ last: string | null }>()
  return row?.last ?? null
}

// ★ [2026-07-09 추가] 플랫폼(에디션)별 추적 게임 수
export async function getPlatformCounts(
  db: D1Database
): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(`
      SELECT
        e.platform AS platform,
        COUNT(*) AS cnt
    
      FROM editions e
    
      INNER JOIN games g
        ON g.id = e.game_id
    
      WHERE g.publish_status = 'PUBLISHED'
    
      GROUP BY e.platform
    `)
    .all<{ platform: string; cnt: number }>()
  const map: Record<string, number> = {}
  for (const row of results ?? []) map[row.platform] = row.cnt ?? 0
  return map
}

// 등록된 고유 게임 수 + 플랫폼판(에디션) 총수
export async function getTrackingCounts(
  db: D1Database
): Promise<{ uniqueGames: number; platformEditions: number }> {
  const row = await db.prepare(`
    SELECT
      (
        SELECT COUNT(
          DISTINCT LOWER(TRIM(title))
        )
        FROM games
        WHERE publish_status = 'PUBLISHED'
      ) AS unique_games,

      (
        SELECT COUNT(*)
        FROM editions e

        INNER JOIN games g
          ON g.id = e.game_id

        WHERE g.publish_status = 'PUBLISHED'
      ) AS platform_editions
  `).first<{
    unique_games: number
    platform_editions: number
  }>()


  return {
    uniqueGames: row?.unique_games ?? 0,
    platformEditions: row?.platform_editions ?? 0,
  }
}


// ============================================================
// 게임 단위 일괄 조회 (N+1 방지)
// ============================================================

export async function getCurrentPricesByGame(
  db: D1Database,
  gameId: number
): Promise<Price[]> {
  const { results } = await db
    .prepare(
      `WITH ed_latest AS (
         SELECT edition_id, MAX(recorded_at) AS ed_max
         FROM prices
         WHERE edition_id IN (
           SELECT id
           FROM editions
           WHERE game_id = ?
         )
         GROUP BY edition_id
       )
       SELECT p.*
       FROM prices p
       INNER JOIN editions e
         ON e.id = p.edition_id
       INNER JOIN (
         SELECT edition_id, source, is_digital,
                MAX(recorded_at) AS max_at
         FROM prices
         WHERE edition_id IN (
           SELECT id
           FROM editions
           WHERE game_id = ?
         )
         GROUP BY edition_id, source, is_digital
       ) latest
         ON p.edition_id = latest.edition_id
        AND p.source = latest.source
        AND p.is_digital = latest.is_digital
        AND p.recorded_at = latest.max_at
       INNER JOIN ed_latest
         ON ed_latest.edition_id = p.edition_id
       WHERE e.game_id = ?
         AND p.recorded_at >= datetime(
           ed_latest.ed_max,
           '-' || ? || ' hours'
         )
       ORDER BY p.edition_id, p.is_digital DESC, p.price ASC`
    )
    .bind(gameId, gameId, gameId, STALE_HOURS)
    .all<Price>()

  return results ?? []
}


export async function getPriceHistoryByGame(db: D1Database, gameId: number): Promise<PriceHistory[]> {
  const { results } = await db
    .prepare(
      `SELECT ph.*
       FROM price_history ph
       INNER JOIN editions e ON e.id = ph.edition_id
       WHERE e.game_id = ?`
    )
    .bind(gameId)
    .all<PriceHistory>()
  return results ?? []
}

export async function getPriceTrendByGame(
  db: D1Database,
  gameId: number,
  days: number
): Promise<Array<{ edition_id: number; is_digital: number; date: string; price: number }>> {
  const { results } = await db
    .prepare(
      `SELECT p.edition_id, p.is_digital, DATE(p.recorded_at) AS date, MIN(p.price) AS price
       FROM prices p
       INNER JOIN editions e ON e.id = p.edition_id
       WHERE e.game_id = ?
         AND p.recorded_at >= datetime('now', '-' || ? || ' days')
       GROUP BY p.edition_id, p.is_digital, DATE(p.recorded_at)
       ORDER BY p.edition_id, p.is_digital, date ASC`
    )
    .bind(gameId, days)
    .all<{ edition_id: number; is_digital: number; date: string; price: number }>()
  return results ?? []
}

// 가격 기록 추가 + 역대 최저가 자동 갱신 (기존 유지)
export async function insertPrice(
  db: D1Database,
  data: {
    edition_id: number
    source: string
    price: number
    currency?: string
    is_digital?: number
    product_url?: string | null
    mall_label?: string | null
    title?: string | null        // ← 추가
  }
) {
  const currency = data.currency ?? 'KRW'
  const isDigital = data.is_digital ?? 1

  const result = await db
    .prepare(
      `INSERT INTO prices (edition_id, source, price, currency, is_digital, product_url, mall_label, title)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(data.edition_id, data.source, data.price, currency, isDigital, data.product_url ?? null, data.mall_label ?? null, data.title ?? null)
    .run()

  const existing = await db
    .prepare('SELECT lowest_ever FROM price_history WHERE edition_id = ? AND is_digital = ?')
    .bind(data.edition_id, isDigital)
    .first<{ lowest_ever: number | null }>()

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO price_history (edition_id, is_digital, lowest_ever, lowest_date)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(data.edition_id, isDigital, data.price)
      .run()
  } else if (existing.lowest_ever === null || data.price < existing.lowest_ever) {
    await db
      .prepare(
        `UPDATE price_history SET lowest_ever = ?, lowest_date = CURRENT_TIMESTAMP
         WHERE edition_id = ? AND is_digital = ?`
      )
      .bind(data.price, data.edition_id, isDigital)
      .run()
  }

  return result
}

// ---------- 사이드바: 특가 순위 (이번 주 최저가 근접 순, 게임당 1개) ----------
// [2026-07-08 변경] 기준을 역대최저(price_history) → 이번 주 최저(price_log 7일)로 전환.
//   week_low = 최근 7일 price_log의 MIN(패키지 기준)
//   근접도 ratio = 현재최저가 / week_low  (1.0이면 이번 주 바닥값 = 특가)
//   at_week_low = 현재가 <= week_low (이번 주 최저 도달 → 🔥 배지)
// 안전장치:
//   - 현재가가 week_low의 55% 미만이면 이상치(중고 오염) 의심 → 제외
//   - 한 게임은 가장 특가인 플랫폼 1개만 노출
//   ★ 품절 필터: 에디션별 최신 recorded_at 기준 STALE_HOURS 이내 가격만 사용
// ---------- 사이드바: 특가 순위 (이번 주 하락폭 큰 순) ----------
// [2026-07-08 재변경] 정가 없이 "이번 주 최고가 대비 하락률"로 특가 판정.
//   week_high = 최근 7일 price_log의 MAX(패키지 기준)
//   drop_rate = (week_high - cur_price) / week_high  (0.10 = 10% 하락)
//   → 하락률 큰 순으로 정렬, 화면에는 하락이 있을 때만 "▼X%" 표시.
// 안전장치:
//   - 현재가가 week_high의 55% 미만이면 이상치(중고 오염) 의심 → 제외
//   - 한 게임은 가장 특가인(가장 많이 떨어진) 플랫폼 1개만 노출
//   ★ 품절 필터: 에디션별 최신 recorded_at 기준 STALE_HOURS 이내 가격만 사용
export async function getTopDiscounts(db: D1Database, limit = 10) {
  const { results } = await db
    .prepare(
      `WITH ed_latest AS (
         SELECT edition_id, MAX(recorded_at) AS ed_max
         FROM prices
         GROUP BY edition_id
       ),
       latest AS (
         SELECT p.edition_id, p.is_digital, MIN(p.price) AS cur_price
         FROM prices p
         INNER JOIN ed_latest el ON el.edition_id = p.edition_id
         WHERE p.is_digital = 0
           AND p.recorded_at >= datetime(el.ed_max, '-' || ? || ' hours')
         GROUP BY p.edition_id, p.is_digital
       ),
       weekstats AS (
         SELECT edition_id, is_digital,
                MAX(price) AS week_high,
                MIN(price) AS week_low
         FROM price_log
         WHERE log_date >= date('now', '-6 days')
         GROUP BY edition_id, is_digital
       ),
       ranked AS (
         SELECT g.id AS game_id, g.title, g.image_url, g.original_price,
                e.id AS edition_id, e.platform,
                l.is_digital,
                l.cur_price AS lowest_price,
                w.week_high, w.week_low,
                CASE
                  WHEN w.week_high IS NOT NULL AND w.week_high > 0 AND l.cur_price < w.week_high
                  THEN (CAST(w.week_high - l.cur_price AS REAL) / w.week_high)
                  ELSE 0
                END AS drop_rate,
                ROW_NUMBER() OVER (
                  PARTITION BY g.id
                  ORDER BY
                    CASE
                      WHEN w.week_high IS NOT NULL AND w.week_high > 0 AND l.cur_price < w.week_high
                      THEN (CAST(w.week_high - l.cur_price AS REAL) / w.week_high)
                      ELSE 0
                    END DESC,
                    l.cur_price ASC
                ) AS rn
         FROM latest l
         JOIN editions e ON e.id = l.edition_id
         JOIN games g ON g.id = e.game_id
         JOIN weekstats w
           ON w.edition_id = l.edition_id AND w.is_digital = l.is_digital
         WHERE 
         g.publish_status = 'PUBLISHED'
         AND w.week_high IS NOT NULL 
         AND w.week_high > 0
         AND l.cur_price >= w.week_high * 0.55
       )
       SELECT game_id, title, image_url, original_price,
              edition_id, platform, is_digital, lowest_price,
              week_high, week_low, drop_rate
       FROM ranked
       WHERE rn = 1
       ORDER BY drop_rate DESC, lowest_price ASC
       LIMIT ?`
    )
    .bind(STALE_HOURS, limit)
    .all()
  return (results ?? []) as any[]
}


// ============================================================
// 설정(settings)
// ============================================================

export async function getAllSettings(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
  const map: Record<string, string> = {}
  for (const row of results ?? []) map[row.key] = row.value ?? ''
  return map
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>()
  return row?.value ?? null
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    )
    .bind(key, value)
    .run()
}
