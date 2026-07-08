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
         WHERE w.week_high IS NOT NULL AND w.week_high > 0
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
