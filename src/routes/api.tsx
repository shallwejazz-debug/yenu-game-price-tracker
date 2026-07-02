// ============================================================
// JSON API 라우트 (아코디언/프론트엔드용)
// src/routes/api.tsx
//   GET /api/games/:gameId        - 게임의 전체 에디션 + 가격 (아코디언 펼침용)
//   * N+1 쿼리 제거: 게임 단위 일괄 조회로 성능 최적화
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { PLATFORM_LABELS, PLATFORM_ICONS, SOURCE_LABELS } from '../types'
import {
  getGameById,
  listEditionsByGame,
  getCurrentPricesByGame,
  getPriceHistoryByGame,
  getPriceTrendByGame,
} from '../db'

const api = new Hono<{ Bindings: Bindings }>()

// ---------- 인사이트/날짜 맥락 헬퍼 ----------

// 역대최저가 날짜로부터 경과 기간을 사람이 읽기 쉬운 문구로
function describeLowestDate(dateStr: string | null): { text: string; stale: boolean; fresh: boolean } | null {
  if (!dateStr) return null
  const d = new Date(dateStr.slice(0, 10))
  if (isNaN(d.getTime())) return null
  const now = new Date()
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000)

  if (days <= 0) return { text: '오늘 🔥', stale: false, fresh: true }
  if (days === 1) return { text: '어제', stale: false, fresh: true }
  if (days < 7) return { text: `${days}일 전`, stale: false, fresh: true }
  if (days < 30) return { text: `${Math.floor(days / 7)}주 전`, stale: false, fresh: false }
  if (days < 365) return { text: `${Math.floor(days / 30)}개월 전`, stale: false, fresh: false }

  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const ago = months > 0 ? `${years}년 ${months}개월 전` : `${years}년 전`
  return { text: `${ago} · 갱신될 수 있음`, stale: true, fresh: false }
}

const wonStr = (n: number) => '₩' + n.toLocaleString('ko-KR')

// 디지털/패키지 현재 최저가를 비교해 추천 인사이트 한 줄 생성
function buildInsight(
  digitalLowest: number | null,
  packageLowest: number | null,
  digitalLowestEver: number | null,
  packageLowestEver: number | null
): { text: string; tone: 'buy' | 'info' | 'wait' } | null {
  if (digitalLowest != null && packageLowest != null) {
    const diff = Math.abs(digitalLowest - packageLowest)
    if (diff < 1000) {
      return { text: `디지털과 패키지 가격이 비슷합니다 (차이 ${wonStr(diff)}). 편한 쪽으로 선택하세요.`, tone: 'info' }
    }
    if (packageLowest < digitalLowest) {
      const extra =
        digitalLowestEver != null && packageLowest < digitalLowestEver
          ? ` (디지털 역대최저가보다도 저렴!)`
          : ''
      return {
        text: `현재 패키지가 디지털보다 ${wonStr(diff)} 저렴합니다${extra} — 패키지 구매 추천 ⚡`,
        tone: 'buy',
      }
    }
    return {
      text: `현재 디지털이 패키지보다 ${wonStr(diff)} 저렴합니다 — 디지털 구매 추천 ⚡`,
      tone: 'buy',
    }
  }
  const only = digitalLowest != null ? { now: digitalLowest, ever: digitalLowestEver, kind: '디지털' } :
               packageLowest != null ? { now: packageLowest, ever: packageLowestEver, kind: '패키지' } : null
  if (only && only.ever != null) {
    if (only.now <= only.ever) return { text: `${only.kind} 역대 최저가입니다! 지금이 살 때 🔥`, tone: 'buy' }
    const over = only.now - only.ever
    if (over <= only.ever * 0.1)
      return { text: `${only.kind} 역대최저가에 근접 (${wonStr(over)} 차이). 살 만한 시점입니다.`, tone: 'info' }
    return { text: `${only.kind} 역대최저가보다 ${wonStr(over)} 높습니다. 할인 대기 고려 ⏳`, tone: 'wait' }
  }
  return null
}

// 게임 1개의 전체 상세(모든 플랫폼 에디션 + 가격)를 JSON으로
api.get('/games/:gameId', async (c) => {
  const gameId = Number(c.req.param('gameId'))
  if (Number.isNaN(gameId)) return c.json({ error: 'invalid game id' }, 400)

  const game = await getGameById(c.env.DB, gameId)
  if (!game) return c.json({ error: 'not found' }, 404)

  const editions = await listEditionsByGame(c.env.DB, gameId)
  const TREND_DAYS = 180

  // ── 게임 전체 데이터를 병렬 3쿼리로 한 번에 (N+1 제거) ──
  const [allPrices, allHistory, allTrend] = await Promise.all([
    getCurrentPricesByGame(c.env.DB, gameId),
    getPriceHistoryByGame(c.env.DB, gameId),
    getPriceTrendByGame(c.env.DB, gameId, TREND_DAYS),
  ])

  // 에디션별로 메모리에서 분류
  const editionData = editions.map((e) => {
    const prices = allPrices.filter((p) => p.edition_id === e.id)
    const history = allHistory.filter((h) => h.edition_id === e.id)
    const trendRows = allTrend.filter((t) => t.edition_id === e.id)

    const buildSection = (isDigital: number) => {
      const rows = prices
        .filter((p) => p.is_digital === isDigital)
        .map((p) => ({
          id: p.id,
          source: p.source,
          sourceLabel:
            p.source === 'etc' && p.mall_label
              ? p.mall_label
              : SOURCE_LABELS[p.source] ?? p.mall_label ?? p.source,
          price: p.price,
          product_url: p.product_url,
          go_url: p.product_url ? `/go/${p.id}` : null,
        }))
        .sort((a, b) => a.price - b.price)
      const hist = history.find((h) => h.is_digital === isDigital)
      const currentLowest = rows.length > 0 ? Math.min(...rows.map((r) => r.price)) : null
      return {
        rows,
        lowestEver: hist?.lowest_ever ?? null,
        lowestDate: hist?.lowest_date ?? null,
        lowestDateContext: describeLowestDate(hist?.lowest_date ?? null),
        currentLowest,
      }
    }

    const digital = buildSection(1)
    const pkg = buildSection(0)

    const digitalTrend = trendRows
      .filter((t) => t.is_digital === 1)
      .map((t) => ({ date: t.date, price: t.price }))
    const packageTrend = trendRows
      .filter((t) => t.is_digital === 0)
      .map((t) => ({ date: t.date, price: t.price }))

    const insight = buildInsight(
      digital.currentLowest,
      pkg.currentLowest,
      digital.lowestEver,
      pkg.lowestEver
    )

    return {
      edition_id: e.id,
      platform: e.platform,
      platformLabel: PLATFORM_LABELS[e.platform] ?? e.platform,
      platformIcon: PLATFORM_ICONS[e.platform] ?? '📀',
      edition_name: e.edition_name,
      steam_appid: e.steam_appid,
      insight,
      digital,
      package: pkg,
      trend: { digital: digitalTrend, package: packageTrend },
    }
  })

  return c.json({
    game: {
      id: game.id,
      title: game.title,
      image_url: game.image_url,
      release_date: game.release_date,
      original_price: game.original_price,
      genre: game.genre,
    },
    editions: editionData,
  })
})

export default api
