// ============================================================
// DB 조회 헬퍼 함수 모음
// src/db.ts
//   구조: games → editions → prices / price_history
//   + 품절 필터: 각 에디션의 최신 갱신 시각 기준 STALE_HOURS 이상
//     오래된 source(=이번 수집에 안 잡힌 품절 샵)는 현재가에서 제외
// ============================================================

import type { Game, Edition, Price, PriceHistory } from './types'

// 품절 판정 기준(시간): 에디션의 최신 recorded_at보다 이 시간 이상
// 오래된 source는 "이번 수집에 안 나온 = 품절"로 보고 현재가에서 제외한다.
// cron이 하루 1회 배치로 도므로, 24시간 window면 같은 회차는 포함하고
// 지난 회차 이후 사라진 샵은 정확히 걸러진다.
const STALE_HOURS = 24

// ---------- 게임(작품) ----------
export async function getGameById(db: D1Database, id: number): Promise<Game | null> {
  return await db.prepare('SELECT * FROM games WHERE id = ?').bind(id).first<Game>()
}

export async function listGames(db: D1Database): Promise<Game[]> {
  const { results } = await db
    .prepare('SELECT * FROM games ORDER BY created_at DESC')
    .all<Game>()
  return results ?? []
}

// 특정 플랫폼의 게임 목록 (메인 콘솔 탭용)
export async function listGamesByPlatform(
  db: D1Database,
  platform: string
): Promise<Array<Game & { edition_id: number; lowest_price: number | null; original_price: number | null }>> {
  const { results } = await db
    .prepare(
      `SELECT g.*, e.id AS edition_id,
              (SELECT MIN(p.price) FROM prices p WHERE p.edition_id = e.id) AS lowest_price
       FROM games g
       INNER JOIN editions e ON e.game_id = g.id
       WHERE e.platform = ?
       ORDER BY g.created_at DESC`
    )
    .bind(platform)
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

// 제목으로 게임 찾기 (자동 임포트 멱등성용) — 정확 일치 우선
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

// (게임, 플랫폼) 조합으로 에디션 찾기 (자동 임포트 멱등성용)
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

export async function listEditionsByGame(db: D1Database, gameId: number): Promise<Edition[]> {
  const { results } = await db
    .prepare('SELECT * FROM editions WHERE game_id = ? ORDER BY platform')
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
    steam_appid?: number | null
  }
) {
  return await db
    .prepare(
      `INSERT INTO editions (game_id, platform, edition_name, search_query, keywords, steam_appid)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.game_id,
      data.platform,
      data.edition_name ?? null,
      data.search_query ?? null,
      data.keywords ?? null,
      data.steam_appid ?? null
    )
    .run()
}

// ---------- 가격 ----------
// 특정 에디션의 소스별 현재가
//   ★ 품절 필터: 이 에디션의 최신 recorded_at 기준 STALE_HOURS 이내에
//     기록된 source만 인정. 지난 수집 이후 사라진(품절) 샵은 제외된다.
export async function getCurrentPrices(db: D1Database, editionId: number): Promise<Price[]> {
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
         SELECT source, MAX(recorded_at) AS max_at
         FROM prices
         WHERE edition_id = ?
         GROUP BY source
       ) latest
         ON p.source = latest.source AND p.recorded_at = latest.max_at
       CROSS JOIN ed_latest
       WHERE p.edition_id = ?
         AND p.recorded_at >= datetime(ed_latest.ed_max, '-' || ? || ' hours')
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

// 가격 추이 (그래프용) — 최근 N일
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

// ============================================================
// 게임 단위 일괄 조회 (N+1 방지) — /api/games/:id 성능 최적화용
// 에디션마다 따로 부르지 않고 게임 ID 하나로 한 번에 가져온다
// ============================================================

// 게임에 속한 모든 에디션의 "현재가"를 한 번에
//   ★ 품절 필터: 에디션별 최신 recorded_at 기준 STALE_HOURS 이내만 인정
export async function getCurrentPricesByGame(db: D1Database, gameId: number): Promise<Price[]> {
  const { results } = await db
    .prepare(
      `WITH ed_latest AS (
         SELECT edition_id, MAX(recorded_at) AS ed_max
         FROM prices
         WHERE edition_id IN (SELECT id FROM editions WHERE game_id = ?)
         GROUP BY edition_id
       )
       SELECT p.*
       FROM prices p
       INNER JOIN editions e ON e.id = p.edition_id
       INNER JOIN (
         SELECT edition_id, source, MAX(recorded_at) AS max_at
         FROM prices
         WHERE edition_id IN (SELECT id FROM editions WHERE game_id = ?)
         GROUP BY edition_id, source
       ) latest
         ON p.edition_id = latest.edition_id
        AND p.source = latest.source
        AND p.recorded_at = latest.max_at
       INNER JOIN ed_latest
         ON ed_latest.edition_id = p.edition_id
       WHERE e.game_id = ?
         AND p.recorded_at >= datetime(ed_latest.ed_max, '-' || ? || ' hours')
       ORDER BY p.edition_id, p.is_digital DESC, p.price ASC`
    )
    .bind(gameId, gameId, gameId, STALE_HOURS)
    .all<Price>()
  return results ?? []
}

// 게임에 속한 모든 에디션의 역대최저가 이력을 한 번에
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

// 게임에 속한 모든 에디션의 가격추이(최근 N일)를 한 번에
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

// 가격 기록 추가 + 역대 최저가 자동 갱신
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
  }
) {
  const currency = data.currency ?? 'KRW'
  const isDigital = data.is_digital ?? 1

  const result = await db
    .prepare(
      `INSERT INTO prices (edition_id, source, price, currency, is_digital, product_url, mall_label)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(data.edition_id, data.source, data.price, currency, isDigital, data.product_url ?? null, data.mall_label ?? null)
    .run()

  // 역대 최저가 갱신
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

// ---------- 사이드바: 특가 순위 (역대 최저가 근접 순, 게임당 1개) ----------
// 정가 대신 price_history의 역대 최저가(lowest_ever)를 기준으로 삼는다.
//   근접도 = 현재최저가 / 역대최저가  (1.0에 가까울수록 "지금이 바닥값 = 특가")
// 안전장치:
//   - 현재가가 역대최저가의 55% 미만이면 이상치(중고 오염) 의심 → 제외
//   - 한 게임은 가장 특가인 플랫폼 1개만 노출 (같은 게임 도배 방지)
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
         WHERE p.is_digital = 0          -- 패키지만 (디지털 코드 오염 제외)
           AND p.recorded_at >= datetime(el.ed_max, '-' || ? || ' hours')
         GROUP BY p.edition_id, p.is_digital
       ),
       ranked AS (
         SELECT g.id AS game_id, g.title, g.image_url, g.original_price,
                e.id AS edition_id, e.platform,
                l.is_digital,
                l.cur_price AS lowest_price,
                ph.lowest_ever,
                (CAST(l.cur_price AS REAL) / ph.lowest_ever) AS ratio,
                ROW_NUMBER() OVER (
                  PARTITION BY g.id
                  ORDER BY (CAST(l.cur_price AS REAL) / ph.lowest_ever) ASC, l.cur_price ASC
                ) AS rn
         FROM latest l
         JOIN editions e ON e.id = l.edition_id
         JOIN games g ON g.id = e.game_id
         JOIN price_history ph
           ON ph.edition_id = l.edition_id AND ph.is_digital = l.is_digital
         WHERE ph.lowest_ever IS NOT NULL AND ph.lowest_ever > 0
           AND l.cur_price >= ph.lowest_ever * 0.55
       )
       SELECT game_id, title, image_url, original_price,
              edition_id, platform, is_digital, lowest_price, lowest_ever
       FROM ranked
       WHERE rn = 1
       ORDER BY ratio ASC, lowest_price ASC
       LIMIT ?`
    )
    .bind(STALE_HOURS, limit)
    .all()
  return (results ?? []) as any[]
}

// ============================================================
// 설정(settings) - 쇼핑몰별 레퍼럴 ID 등
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
