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
import { searchAndClassify } from '../naver'
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
    // 에디션 단위 수집: 정제된 editions.keywords(예: '용과같이,2')를 필수 필터로 사용
    const classified = await searchAndClassify(clientId, clientSecret, edition.search_query, keywords)

    // 이 에디션의 플랫폼에 해당하는 버킷만 골라서 저장
    const bucket = classified.buckets.find((b) => b.platform === edition.platform)
    const prices = bucket ? bucket.prices : []

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
        is_digital: p.isDigital ?? 0,
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
// 자동 임포트: 그룹(별칭묶음) 또는 제목 배열을 받아
//   → 대표이름 + 별칭들로 각각 검색 → 플랫폼별 결과 병합(최저가) →
//   → 대표이름(name) 하나로 작품/에디션/가격 저장
//   POST /admin/api/auto-import
//   바디(신규): { "groups": [{ "name":"발더스 게이트 3", "aliases":["발더스 게이트 3","BG3"] }], "dryRun": true }
//   바디(구):  { "titles": ["엘든링", ...], "dryRun": true }  ← 그대로 지원
//
//   ※ 필터 정책: 자동 임포트는 "검색어(별칭) 자체"가 필터 역할을 하므로
//     searchAndClassify에 keywords를 넘기지 않는다([]). 이렇게 해야
//     대표 이름 검색 결과가 별칭 토큰 every 필터에 죽지 않는다.
//     시리즈 오염(용과 같이 2/3 등)은 등록 후 에디션 keywords에
//     최소 조각(예: '용과같이,2')을 수동 입력해 관리한다.
// ============================================================
// [2026-07-07] 제외어(exclude)를 미리보기·실제저장 검색에 즉시 반영 + 저장 시 exclude_keywords 저장.
//   기존: exclude를 검색에 안 넘겨 미리보기에서 무시 + 저장 후 apply-filters로만 반영(당일 오염).
//   변경: groups[].exclude 를 받아 searchAndClassify 에 전달, insertEdition 에 저장.
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

  // 입력 정규화: groups(신규) 우선, 없으면 titles/title(구)를 단일별칭 그룹으로 변환
  let groups: { name: string; aliases: string[]; exclude: string[] }[] = []
  if (Array.isArray(body.groups)) {
    groups = body.groups
      .map((g: any) => {
        const rawAliases = (Array.isArray(g.aliases) ? g.aliases : [])
          .map((a: any) => String(a).trim())
          .filter(Boolean)
        const name = String(g.name ?? rawAliases[0] ?? '').trim()

        // 대표 이름을 항상 검색어 맨 앞에 포함 + 별칭 추가 + 중복 제거(공백무시·대소문자무시)
        const seen = new Set<string>()
        const aliases: string[] = []
        for (const term of [name, ...rawAliases]) {
          if (!term) continue
          const k = term.toLowerCase().replace(/\s+/g, '')
          if (!seen.has(k)) { seen.add(k); aliases.push(term) }
        }

        // [2026-07-07] 제외어 파싱: 문자열/배열 모두 허용, 쉼표 분리·트림·중복제거
        let rawExclude: string[] = []
        if (Array.isArray(g.exclude)) rawExclude = g.exclude.map((s: any) => String(s))
        else if (typeof g.exclude === 'string') rawExclude = g.exclude.split(',')
        const exclude = Array.from(
          new Set(rawExclude.map((s) => s.trim()).filter(Boolean))
        )

        return { name, aliases, exclude }
      })
      .filter((g: any) => g.name && g.aliases.length)
  } else {
    let titles: string[] = []
    if (Array.isArray(body.titles)) titles = body.titles
    else if (typeof body.titles === 'string') titles = body.titles.split('\n')
    else if (typeof body.title === 'string') titles = [body.title]
    titles = titles.map((t) => String(t).trim()).filter(Boolean)
    groups = titles.map((t) => ({ name: t, aliases: [t], exclude: [] }))
  }

  if (groups.length === 0) {
    return c.json({ ok: false, error: '게임 이름(또는 그룹)을 한 개 이상 입력하세요.' }, 400)
  }

  const dryRun = body.dryRun !== false // 기본값: 미리보기(안전)
  const results: any[] = []

  for (const group of groups) {
    try {
      const name = group.name
      const excludeKeywords = group.exclude // [2026-07-07] 이 그룹의 제외어

      const mergedByPlatform = new Map<string, Map<string, any>>()
      const skippedTotal = { notGameTitle: 0, blacklisted: 0, used: 0, catalog: 0, outOfRange: 0, noPlatform: 0, excluded: 0 }
      let totalItems = 0
      let firstImage: string | null = null

      for (const alias of group.aliases) {
        // ★ keywords는 넘기지 않음([]). 검색어(alias) 자체가 필터 역할.
        //   [2026-07-07] excludeKeywords는 전달 → 미리보기·저장 모두 제외 즉시 반영.
        const classified = await searchAndClassify(clientId, clientSecret, alias, [], excludeKeywords)
        totalItems += classified.totalItems
        for (const k of Object.keys(skippedTotal)) {
          if (classified.skipped && (classified.skipped as any)[k] !== undefined) {
            ;(skippedTotal as any)[k] += (classified.skipped as any)[k]
          }
        }
        for (const b of classified.buckets) {
          if (!mergedByPlatform.has(b.platform)) mergedByPlatform.set(b.platform, new Map())
          const pmap = mergedByPlatform.get(b.platform)!
          for (const p of b.prices) {
            if (!firstImage && p.image) firstImage = p.image
            const key = p.link || `${p.mallName}|${p.isDigital}`
            const existing = pmap.get(key)
            if (!existing || p.price < existing.price) pmap.set(key, p)
          }
        }
      }

      const order = ['pc', 'ps5', 'ps4', 'xbox', 'switch', 'etc']
      const mergedBuckets = Array.from(mergedByPlatform.entries())
        .map(([platform, pmap]) => {
          const prices = Array.from(pmap.values()).sort((a, b) => a.price - b.price)
          return {
            platform,
            prices,
            count: prices.length,
            lowest: prices.length ? prices[0].price : null,
          }
        })
        .sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform))

      const platformsView: Record<string, any> = {}
      for (const b of mergedBuckets) {
        platformsView[b.platform] = {
          label: PLATFORM_LABELS[b.platform] ?? b.platform,
          count: b.count,
          lowest: b.lowest,
          malls: b.prices.map((p) => ({ source: p.mallName, label: p.mallLabel, price: p.price })),
        }
      }

      const entry: any = {
        title: name,
        aliases: group.aliases,
        exclude: excludeKeywords,   // [2026-07-07] 응답에 제외어 표시(확인용)
        platforms: platformsView,
        skipped: skippedTotal,
        totalItems,
        saved: null,
      }

      // 실제 저장 (dryRun=false)
      if (!dryRun && mergedBuckets.length > 0) {
        let game = await findGameByTitle(c.env.DB, name)
        let gameId: number
        if (game) {
          gameId = game.id
        } else {
          const r = await insertGame(c.env.DB, { title: name, image_url: firstImage })
          gameId = Number(r.meta.last_row_id)
        }

        // [2026-07-07] 제외어를 문자열로(에디션 저장용). 빈 배열이면 null.
        const excludeStr = excludeKeywords.length ? excludeKeywords.join(',') : null

        const savedDetail: Record<string, number> = {}
        for (const b of mergedBuckets) {
          let edition = await findEdition(c.env.DB, gameId, b.platform)
          let editionId: number
          if (edition) {
            editionId = edition.id
            // [2026-07-07] 기존 에디션이면 제외어 갱신(입력값 있을 때만 덮어씀)
            if (excludeStr !== null) {
              await c.env.DB
                .prepare('UPDATE editions SET exclude_keywords = ? WHERE id = ?')
                .bind(excludeStr, editionId).run()
            }
          } else {
            const label = PLATFORM_LABELS[b.platform] ?? b.platform
            const r = await insertEdition(c.env.DB, {
              game_id: gameId,
              platform: b.platform,
              edition_name: `${label}판`,
              search_query: `${name} ${label}`,
              keywords: null,
              exclude_keywords: excludeStr,  // [2026-07-07] 등록 시 제외어 저장
            })
            editionId = Number(r.meta.last_row_id)
          }

          await c.env.DB.prepare('DELETE FROM prices WHERE edition_id = ?').bind(editionId).run()

          let cnt = 0
          for (const p of b.prices) {
            await insertPrice(c.env.DB, {
              edition_id: editionId,
              source: p.mallName,
              price: p.price,
              currency: 'KRW',
              is_digital: p.isDigital ?? 0,
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
      results.push({ title: group.name, error: err.message })
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
    const editions = await c.env.DB
      .prepare('SELECT id FROM editions WHERE game_id = ?')
      .bind(gameId)
      .all<{ id: number }>()

    for (const e of editions.results ?? []) {
      await c.env.DB.prepare('DELETE FROM prices WHERE edition_id = ?').bind(e.id).run()
      await c.env.DB.prepare('DELETE FROM price_history WHERE edition_id = ?').bind(e.id).run()
    }
    await c.env.DB.prepare('DELETE FROM editions WHERE game_id = ?').bind(gameId).run()
    await c.env.DB.prepare('DELETE FROM games WHERE id = ?').bind(gameId).run()

    return c.json({ ok: true, message: '게임과 연결된 데이터를 삭제했습니다.' })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})
// ---------- 게임 정보 수정 (현재는 이미지 URL) ----------
// 바디: { "image_url": "https://..." }  (빈 문자열/null 이면 이미지 제거)
admin.patch('/api/games/:id', async (c) => {
  const gameId = Number(c.req.param('id'))
  if (Number.isNaN(gameId)) {
    return c.json({ ok: false, error: '잘못된 게임 ID' }, 400)
  }

  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '올바른 JSON이 아닙니다.' }, 400)
  }

  if (body.image_url === undefined) {
    return c.json({ ok: false, error: '수정할 필드(image_url)가 없습니다.' }, 400)
  }

  const url = body.image_url ? String(body.image_url).trim() : null
  if (url && !/^https?:\/\//i.test(url)) {
    return c.json({ ok: false, error: '이미지 URL은 http(s)로 시작해야 합니다.' }, 400)
  }

  try {
    await c.env.DB.prepare('UPDATE games SET image_url = ? WHERE id = ?')
      .bind(url, gameId)
      .run()
    return c.json({ ok: true, image_url: url, message: '대표 이미지를 변경했습니다.' })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})

// ---------- 게임 여러 개 선택 삭제 (체크박스 다중 삭제) ----------
// 바디: { "ids": [12, 15, 20] }
admin.post('/api/games/bulk-delete', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '올바른 JSON이 아닙니다.' }, 400)
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((n: any) => Number(n)).filter((n: number) => !Number.isNaN(n))
    : []

  if (ids.length === 0) {
    return c.json({ ok: false, error: '삭제할 게임을 한 개 이상 선택하세요.' }, 400)
  }

  try {
    let deleted = 0
    for (const gameId of ids) {
      const editions = await c.env.DB
        .prepare('SELECT id FROM editions WHERE game_id = ?')
        .bind(gameId)
        .all<{ id: number }>()

      for (const e of editions.results ?? []) {
        await c.env.DB.prepare('DELETE FROM prices WHERE edition_id = ?').bind(e.id).run()
        await c.env.DB.prepare('DELETE FROM price_history WHERE edition_id = ?').bind(e.id).run()
      }
      await c.env.DB.prepare('DELETE FROM editions WHERE game_id = ?').bind(gameId).run()
      await c.env.DB.prepare('DELETE FROM games WHERE id = ?').bind(gameId).run()
      deleted++
    }

    return c.json({ ok: true, deleted, message: `${deleted}개 게임과 연결 데이터를 삭제했습니다.` })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})

// ---------- 게임의 모든 에디션에 keywords/exclude 일괄 적용 (백업 복원용) ----------
// [2026-07-06] 복원 시 대표 keywords/exclude를 그 게임의 전체 에디션에 반영
// 바디: { keywords: "용과같이,2" | null, exclude_keywords: "나이트레인" | null }
admin.post('/api/games/:id/apply-filters', async (c) => {
  const gameId = Number(c.req.param('id'))
  if (Number.isNaN(gameId)) {
    return c.json({ ok: false, error: '잘못된 게임 ID' }, 400)
  }
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '올바른 JSON이 아닙니다.' }, 400)
  }
  const kw = body.keywords != null && String(body.keywords).trim() ? String(body.keywords).trim() : null
  const exkw =
    body.exclude_keywords != null && String(body.exclude_keywords).trim()
      ? String(body.exclude_keywords).trim()
      : null
  try {
    await c.env.DB.prepare(
      'UPDATE editions SET keywords = ?, exclude_keywords = ? WHERE game_id = ?'
    )
      .bind(kw, exkw, gameId)
      .run()
    return c.json({ ok: true, message: 'keywords/exclude 적용 완료' })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})


// ---------- 게임 목록 내보내기 (keywords/exclude 포함, 붙여넣기 재등록용 텍스트) ----------
// [2026-07-06] 5칸 형식: 대표이름 | 검색어(미사용) | 이미지URL | keywords | exclude
//   keywords/exclude는 그 게임의 에디션 중 값이 있는 것을 대표로 사용(전 플랫폼 동일 정책)
admin.get('/api/export', async (c) => {
  const { results: games } = await c.env.DB.prepare(
    'SELECT id, title, image_url FROM games ORDER BY id'
  ).all<{ id: number; title: string; image_url: string | null }>()

  const lines: string[] = []
  for (const g of games ?? []) {
    const { results: eds } = await c.env.DB
      .prepare('SELECT keywords, exclude_keywords FROM editions WHERE game_id = ?')
      .bind(g.id)
      .all<{ keywords: string | null; exclude_keywords: string | null }>()

    // 에디션들 중 값이 있는 첫 keywords / exclude 를 대표로 채택
    let keywords = ''
    let exclude = ''
    for (const e of eds ?? []) {
      if (!keywords && e.keywords && e.keywords.trim()) keywords = e.keywords.trim()
      if (!exclude && e.exclude_keywords && e.exclude_keywords.trim()) exclude = e.exclude_keywords.trim()
    }

    const img = g.image_url ?? ''
    // 형식: 대표이름 | 검색어(비움) | 이미지URL | keywords | exclude
    lines.push(`${g.title} |  | ${img} | ${keywords} | ${exclude}`)
  }

  return c.json({ ok: true, count: lines.length, text: lines.join('\n') })
})


// ---------- DB 전체 초기화 (게임/에디션/가격/이력 삭제, settings 유지) ----------
// 바디: { "confirm": "RESET" }
admin.post('/api/reset-all', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '올바른 JSON이 아닙니다.' }, 400)
  }
  if (body.confirm !== 'RESET') {
    return c.json({ ok: false, error: '확인 문구가 올바르지 않습니다. confirm: "RESET" 필요.' }, 400)
  }
  try {
    await c.env.DB.prepare('DELETE FROM price_history').run()
    await c.env.DB.prepare('DELETE FROM prices').run()
    await c.env.DB.prepare('DELETE FROM editions').run()
    await c.env.DB.prepare('DELETE FROM games').run()
    return c.json({ ok: true, message: '전체 데이터를 초기화했습니다. (레퍼럴 ID는 유지)' })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})


export default admin
