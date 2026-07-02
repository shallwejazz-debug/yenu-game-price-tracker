// ============================================================
// 관리자 API 라우트
// src/routes/admin.tsx
//   POST   /admin/games                      - 게임(작품) 등록
//   POST   /admin/games/:id/editions         - 에디션(플랫폼판) 추가
//   PATCH  /admin/editions/:id               - 에디션 수정 (검색어 등)
//   POST   /admin/editions/:id/fetch-prices  - 네이버에서 패키지 가격 수집
//   POST   /admin/editions/:id/prices        - 가격 수동 추가 (디지털 등)
//   DELETE /admin/api/games/:id              - 게임 삭제(연결 데이터 포함)
//
// 인증: X-Admin-Token 헤더
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import {
  insertGame,
  insertEdition,
  insertPrice,
  getEditionById,
  getAllSettings,
  setSetting,
  findGameByTitle,
  findEdition,
} from '../db'
import { searchGamePrices, searchAndClassify } from '../naver'
import { PLATFORM_LABELS } from '../types'
import { AdminPage } from './admin-page'

const admin = new Hono<{ Bindings: Bindings }>()

// ---------- 관리자 콘솔 HTML (인증 없이 페이지는 보여주고, API 호출 시 토큰 검사) ----------
// 페이지 자체는 토큰 입력 폼이라 누구나 열 수 있음. 실제 데이터 변경은 토큰 필요.
admin.get('/', (c) => {
  return c.html(AdminPage())
})

// ---------- 이하 모든 API는 X-Admin-Token 필요 ----------
admin.use('/api/*', async (c, next) => {
  const expected = c.env.ADMIN_TOKEN ?? 'dev-token'
  const provided = c.req.header('X-Admin-Token')
  if (provided !== expected) {
    return c.json({ ok: false, error: '인증 실패: 올바른 관리자 토큰이 필요합니다.' }, 401)
  }
  await next()
})

// 기존 JSON 엔드포인트도 토큰 검사 (하위호환: 헤더 그대로)
admin.use('*', async (c, next) => {
  // /api/* 와 / (HTML) 는 위에서 이미 처리됨
  const path = c.req.path
  if (path === '/admin' || path === '/admin/' || path.startsWith('/admin/api/')) {
    return next()
  }
  const expected = c.env.ADMIN_TOKEN ?? 'dev-token'
  const provided = c.req.header('X-Admin-Token')
  if (provided !== expected) {
    return c.json({ ok: false, error: '인증 실패: 올바른 X-Admin-Token 헤더가 필요합니다.' }, 401)
  }
  await next()
})

// ---------- 게임(작품) 등록 ----------
admin.post('/games', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '올바른 JSON이 아닙니다.' }, 400)
  }
  if (!body.title) {
    return c.json({ ok: false, error: 'title(게임 제목)은 필수입니다.' }, 400)
  }
  try {
    const result = await insertGame(c.env.DB, {
      title: body.title,
      image_url: body.image_url ?? null,
      release_date: body.release_date ?? null,
      original_price: body.original_price ?? null,
    })
    return c.json({ ok: true, game_id: result.meta.last_row_id, message: `게임 '${body.title}' 등록 완료` })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})

// ---------- 에디션(플랫폼판) 추가 ----------
admin.post('/games/:id/editions', async (c) => {
  const gameId = Number(c.req.param('id'))
  if (Number.isNaN(gameId)) return c.json({ ok: false, error: '잘못된 게임 ID' }, 400)

  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '올바른 JSON이 아닙니다.' }, 400)
  }
  if (!body.platform) {
    return c.json({ ok: false, error: 'platform(pc/ps5/ps4/xbox/switch/etc)은 필수입니다.' }, 400)
  }
  try {
    const result = await insertEdition(c.env.DB, {
      game_id: gameId,
      platform: body.platform,
      edition_name: body.edition_name ?? null,
      search_query: body.search_query ?? null,
      keywords: body.keywords ?? null,
      steam_appid: body.steam_appid ?? null,
    })
    return c.json({
      ok: true,
      edition_id: result.meta.last_row_id,
      message: `에디션(${body.platform}) 추가 완료`,
    })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})

// ---------- 에디션 수정 ----------
admin.patch('/editions/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ ok: false, error: '잘못된 에디션 ID' }, 400)

  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '올바른 JSON이 아닙니다.' }, 400)
  }
  const fields: string[] = []
  const values: any[] = []
  for (const key of ['platform', 'edition_name', 'search_query', 'keywords', 'steam_appid']) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`)
      values.push(body[key])
    }
  }
  if (fields.length === 0) return c.json({ ok: false, error: '수정할 필드가 없습니다.' }, 400)
  values.push(id)
  try {
    await c.env.DB.prepare(`UPDATE editions SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
    return c.json({ ok: true, message: '에디션 수정 완료' })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})

// ---------- 가격 수동 추가 (디지털 등) ----------
admin.post('/editions/:id/prices', async (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ ok: false, error: '잘못된 에디션 ID' }, 400)

  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '올바른 JSON이 아닙니다.' }, 400)
  }
  if (!body.source || body.price === undefined) {
    return c.json({ ok: false, error: 'source, price 는 필수입니다.' }, 400)
  }
  try {
    const result = await insertPrice(c.env.DB, {
      edition_id: id,
      source: body.source,
      price: Number(body.price),
      currency: body.currency ?? 'KRW',
      is_digital: body.is_digital !== undefined ? Number(body.is_digital) : 1,
      product_url: body.product_url ?? null,
      mall_label: body.mall_label ?? null,
    })
    return c.json({ ok: true, price_id: result.meta.last_row_id, message: '가격 추가 완료' })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})

// ---------- 네이버에서 패키지 가격 수집 (에디션 단위) ----------
admin.post('/editions/:id/fetch-prices', async (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ ok: false, error: '잘못된 에디션 ID' }, 400)

  const clientId = c.env.NAVER_CLIENT_ID
  const clientSecret = c.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return c.json({ ok: false, error: '네이버 API 키가 설정되지 않았습니다.' }, 500)
  }

  const edition = await getEditionById(c.env.DB, id)
  if (!edition) return c.json({ ok: false, error: '에디션을 찾을 수 없습니다.' }, 404)
  if (!edition.search_query) {
    return c.json({ ok: false, error: '이 에디션에 search_query 가 설정되지 않았습니다.' }, 400)
  }

  const keywords = edition.keywords
    ? edition.keywords.split(',').map((k) => k.trim()).filter(Boolean)
    : []

  try {
    const prices = await searchGamePrices(clientId, clientSecret, edition.search_query, keywords)
    if (prices.length === 0) {
      return c.json({ ok: true, found: 0, message: '게임 본품을 찾지 못했습니다. 검색어를 조정하세요.' })
    }

    // 재수집 시 중복 방지: 이 에디션의 기존 가격을 먼저 삭제
    await c.env.DB.prepare('DELETE FROM prices WHERE edition_id = ?').bind(id).run()

    let saved = 0
    for (const p of prices) {
      await insertPrice(c.env.DB, {
        edition_id: id,
        source: p.mallName,
        price: p.price,
        currency: 'KRW',
        is_digital: 0,
        product_url: p.link,
        mall_label: p.mallLabel,
      })
      saved++
    }

    return c.json({
      ok: true,
      query: edition.search_query,
      found: prices.length,
      saved,
      prices: prices.map((p) => ({ mall: p.mallLabel, source: p.mallName, price: p.price })),
      message: `패키지 가격 ${saved}건 수집 완료`,
    })
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500)
  }
})

// ============================================================
// 관리자 콘솔용 간편 API (/admin/api/*)
// ============================================================

// ---------- 토큰 검증 (잠금 화면 통과용) ----------
// 미들웨어를 이미 통과했다는 것 = 토큰이 맞다는 것. 단순 ok 반환.
admin.post('/api/verify', (c) => {
  return c.json({ ok: true })
})

// ---------- 레퍼럴 ID 설정 조회 ----------
admin.get('/api/settings', async (c) => {
  const s = await getAllSettings(c.env.DB)
  return c.json({
    ok: true,
    settings: {
      coupang_partners_id: s.coupang_partners_id ?? '',
      linkprice_id: s.linkprice_id ?? '',
    },
  })
})

// ---------- 레퍼럴 ID 설정 저장 ----------
admin.post('/api/settings', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '올바른 JSON이 아닙니다.' }, 400)
  }
  const allowed = ['coupang_partners_id', 'linkprice_id']
  try {
    for (const key of allowed) {
      if (body[key] !== undefined) {
        await setSetting(c.env.DB, key, String(body[key]).trim())
      }
    }
    return c.json({ ok: true, message: '레퍼럴 ID 저장 완료' })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})

// ---------- 게임 "제목만" 추가 (자동화 방향: 제목만 넣으면 끝) ----------
admin.post('/api/games', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '올바른 JSON이 아닙니다.' }, 400)
  }
  if (!body.title || !String(body.title).trim()) {
    return c.json({ ok: false, error: '게임 제목은 필수입니다.' }, 400)
  }
  try {
    const result = await insertGame(c.env.DB, {
      title: String(body.title).trim(),
      image_url: body.image_url ?? null,
      release_date: body.release_date ?? null,
      original_price: body.original_price ?? null,
    })
    return c.json({
      ok: true,
      game_id: result.meta.last_row_id,
      message: `'${body.title}' 등록 완료. 다음 자동 수집 때 플랫폼별 가격이 채워집니다.`,
    })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})

// ============================================================
// 자동 임포트: 제목만 던지면 → 검색 → 게임타이틀/신품 필터 →
//             플랫폼 자동분류 → (dryRun 아니면) 작품/에디션/가격 자동 저장
//   POST /admin/api/auto-import
//   바디: { "titles": ["엘든링", ...], "dryRun": true }
// ============================================================
admin.post('/api/auto-import', async (c) => {
  const clientId = c.env.NAVER_CLIENT_ID
  const clientSecret = c.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return c.json({ ok: false, error: '네이버 API 키가 설정되지 않았습니다.' }, 500)
  }

  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '올바른 JSON이 아닙니다.' }, 400)
  }

  // titles: 배열 또는 줄바꿈 문자열 모두 허용
  let titles: string[] = []
  if (Array.isArray(body.titles)) {
    titles = body.titles
  } else if (typeof body.titles === 'string') {
    titles = body.titles.split('\n')
  } else if (typeof body.title === 'string') {
    titles = [body.title]
  }
  titles = titles.map((t) => String(t).trim()).filter(Boolean)
  if (titles.length === 0) {
    return c.json({ ok: false, error: '제목(titles)을 한 개 이상 입력하세요.' }, 400)
  }

  const dryRun = body.dryRun !== false // 기본값: 미리보기(안전)
  const results: any[] = []

  for (const title of titles) {
    try {
      // 핵심 키워드: 제목 토큰 중 2글자 이상
      const kw = title.split(/\s+/).filter((w) => w.length >= 2)
      const classified = await searchAndClassify(clientId, clientSecret, title, kw)

      const platformsView: Record<string, any> = {}
      for (const b of classified.buckets) {
        platformsView[b.platform] = {
          label: PLATFORM_LABELS[b.platform] ?? b.platform,
          count: b.count,
          lowest: b.lowest,
          malls: b.prices.map((p) => ({ source: p.mallName, label: p.mallLabel, price: p.price })),
        }
      }

      const entry: any = {
        title,
        platforms: platformsView,
        skipped: classified.skipped,
        totalItems: classified.totalItems,
        saved: null,
      }

      // 실제 저장 (dryRun=false)
      if (!dryRun && classified.buckets.length > 0) {
        // 1) 작품 찾기/생성
        let game = await findGameByTitle(c.env.DB, title)
        let gameId: number
        if (game) {
          gameId = game.id
        } else {
          // 대표 이미지: 첫 버킷 첫 상품 이미지
          const firstImg = classified.buckets[0]?.prices[0]?.image ?? null
          const r = await insertGame(c.env.DB, { title, image_url: firstImg })
          gameId = Number(r.meta.last_row_id)
        }

        const savedDetail: Record<string, number> = {}
        for (const b of classified.buckets) {
          // 2) 에디션 찾기/생성
          let edition = await findEdition(c.env.DB, gameId, b.platform)
          let editionId: number
          if (edition) {
            editionId = edition.id
          } else {
            const label = PLATFORM_LABELS[b.platform] ?? b.platform
            const r = await insertEdition(c.env.DB, {
              game_id: gameId,
              platform: b.platform,
              edition_name: `${label}판`,
              search_query: `${title} ${label}`,
              keywords: kw.join(','),
            })
            editionId = Number(r.meta.last_row_id)
          }

          // 재수집 시 중복 방지: 이 에디션의 기존 가격을 먼저 삭제
          await c.env.DB.prepare('DELETE FROM prices WHERE edition_id = ?').bind(editionId).run()

          // 3) 가격 저장 (패키지)
          let cnt = 0
          for (const p of b.prices) {
            await insertPrice(c.env.DB, {
              edition_id: editionId,
              source: p.mallName,
              price: p.price,
              currency: 'KRW',
              is_digital: 0,
              product_url: p.link,
              mall_label: p.mallLabel,
            })
            cnt++
          }
          savedDetail[b.platform] = cnt
        }
        entry.game_id = gameId
        entry.saved = savedDetail
      }

      results.push(entry)
    } catch (err: any) {
      results.push({ title, error: err.message })
    }
  }

  return c.json({
    ok: true,
    dryRun,
    mode: dryRun ? '미리보기(저장 안 함)' : '실제 저장 완료',
    count: results.length,
    results,
  })
})

// ---------- 등록된 게임 목록 (관리자 콘솔 표시용) ----------
admin.get('/api/games', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT g.id, g.title, g.image_url, g.created_at,
            (SELECT COUNT(*) FROM editions e WHERE e.game_id = g.id) AS edition_count
     FROM games g ORDER BY g.id DESC`
  ).all()
  return c.json({ ok: true, games: results ?? [] })
})

// ---------- 게임 삭제 (연결된 edition/price 함께 삭제) ----------
admin.delete('/api/games/:id', async (c) => {
  const gameId = Number(c.req.param('id'))
  if (Number.isNaN(gameId)) {
    return c.json({ ok: false, error: '잘못된 게임 ID' }, 400)
  }
  try {
    // 1) 이 게임의 에디션 id 목록
    const editions = await c.env.DB
      .prepare('SELECT id FROM editions WHERE game_id = ?')
      .bind(gameId)
      .all<{ id: number }>()

    // 2) 각 에디션의 가격 삭제
    for (const e of editions.results ?? []) {
      await c.env.DB.prepare('DELETE FROM prices WHERE edition_id = ?').bind(e.id).run()
    }
    // 3) 에디션 삭제
    await c.env.DB.prepare('DELETE FROM editions WHERE game_id = ?').bind(gameId).run()
    // 4) 게임 삭제
    await c.env.DB.prepare('DELETE FROM games WHERE id = ?').bind(gameId).run()

    return c.json({ ok: true, message: '게임과 연결된 데이터를 삭제했습니다.' })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})

export default admin
