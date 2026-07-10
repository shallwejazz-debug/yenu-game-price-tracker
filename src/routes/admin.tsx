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
//   [2026-07-10] switch_policy 지원: s2(스위치2 전용)/s1(스위치1 전용)/빈칸(자동).
//     - 6칸 백업 양식: 이름 | 검색어 | 이미지 | keywords | exclude | 정책
//     - s2면 switch 버킷을 switch2로 흡수하고 switch 에디션을 만들지 않음.
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
    // [2026-07-10] 이 게임의 switch_policy를 조회해 승격에 반영
    const gameRow = await c.env.DB
      .prepare('SELECT switch_policy FROM games WHERE id = ?')
      .bind(edition.game_id)
      .first<{ switch_policy: string | null }>()
    const switchPolicy = gameRow?.switch_policy ?? null

    const classified = await searchAndClassify(clientId, clientSecret, edition.search_query, keywords, [], switchPolicy)

    // [2026-07-10] s2 게임의 switch 에디션이면 승격된 switch2 버킷을 참조
    let targetBucketPlatform = edition.platform
    if (switchPolicy === 's2' && edition.platform === 'switch') targetBucketPlatform = 'switch2'
    if (switchPolicy === 's1' && edition.platform === 'switch2') targetBucketPlatform = 'switch'

    const bucket = classified.buckets.find((b) => b.platform === targetBucketPlatform)
    const prices = bucket ? bucket.prices : []

    if (prices.length === 0) {
      return c.json({ ok: true, found: 0, message: '게임 본품을 찾지 못했습니다. 검색어를 조정하세요.' })
    }

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

admin.post('/api/verify', (c) => {
  return c.json({ ok: true })
})

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
// 자동 임포트
//   POST /admin/api/auto-import
//   [2026-07-10] 6칸 양식 + switch_policy(s2/s1) 지원:
//     - 폼(groups) 방식: g.switchPolicy 로 정책 수신.
//     - 붙여넣기(titles) 방식: '이름 | 검색어 | 이미지 | keywords | exclude | 정책' 6칸 파싱.
//     - s2면 searchAndClassify에 policy 전달(승격) + switch 버킷을 switch2로 흡수 + switch 에디션 미생성.
//     - games.switch_policy 저장(신규/기존).
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

  // 입력 정규화: groups(신규) 우선, 없으면 titles/title(구)를 6칸 양식으로 파싱
  // [2026-07-10] image, switchPolicy 필드 추가
  let groups: { name: string; aliases: string[]; exclude: string[]; keywords: string[]; image?: string; switchPolicy?: string }[] = []
  if (Array.isArray(body.groups)) {
    groups = body.groups
      .map((g: any) => {
        const rawAliases = (Array.isArray(g.aliases) ? g.aliases : [])
          .map((a: any) => String(a).trim())
          .filter(Boolean)
        const name = String(g.name ?? rawAliases[0] ?? '').trim()

        const seen = new Set<string>()
        const aliases: string[] = []
        for (const term of [name, ...rawAliases]) {
          if (!term) continue
          const k = term.toLowerCase().replace(/\s+/g, '')
          if (!seen.has(k)) { seen.add(k); aliases.push(term) }
        }

        let rawExclude: string[] = []
        if (Array.isArray(g.exclude)) rawExclude = g.exclude.map((s: any) => String(s))
        else if (typeof g.exclude === 'string') rawExclude = g.exclude.split(',')
        const exclude = Array.from(new Set(rawExclude.map((s) => s.trim()).filter(Boolean)))

        let rawKeywords: string[] = []
        if (Array.isArray(g.keywords)) rawKeywords = g.keywords.map((s: any) => String(s))
        else if (typeof g.keywords === 'string') rawKeywords = g.keywords.split(',')
        const keywords = Array.from(new Set(rawKeywords.map((s) => s.trim()).filter(Boolean)))

        const image = String(g.image ?? '').trim()

        // [2026-07-10] 스위치 정책: '', 's2', 's1' (그 외 값은 무시하고 자동)
        const rawPolicy = String(g.switchPolicy ?? g.switch_policy ?? '').trim().toLowerCase()
        const switchPolicy = (rawPolicy === 's2' || rawPolicy === 's1') ? rawPolicy : ''

        return { name, aliases, exclude, keywords, image, switchPolicy }
      })
      .filter((g: any) => g.name && g.aliases.length)
  } else {
    // [2026-07-10] titles(붙여넣기/백업 복원) → 6칸 양식 파서
    // 형식: 대표이름 | 검색어(미사용) | 이미지URL | keywords | exclude | 정책(s2/s1/빈칸)
    let rawLines: string[] = []
    if (Array.isArray(body.titles)) rawLines = body.titles.map((t: any) => String(t))
    else if (typeof body.titles === 'string') rawLines = body.titles.split('\n')
    else if (typeof body.title === 'string') rawLines = [String(body.title)]

    groups = rawLines
      .map((line) => {
        const cols = line.split('|').map((s) => s.trim())
        const name = cols[0] ?? ''
        const image = cols[2] ?? ''
        const keywordsStr = cols[3] ?? ''
        const excludeStr = cols[4] ?? ''
        const rawPolicy = (cols[5] ?? '').toLowerCase()
        const switchPolicy = (rawPolicy === 's2' || rawPolicy === 's1') ? rawPolicy : ''
        const keywords = keywordsStr ? keywordsStr.split(',').map((s) => s.trim()).filter(Boolean) : []
        const exclude = excludeStr ? excludeStr.split(',').map((s) => s.trim()).filter(Boolean) : []
        return { name, aliases: name ? [name] : [], exclude, keywords, image, switchPolicy }
      })
      .filter((g) => g.name && g.aliases.length)
  }

  if (groups.length === 0) {
    return c.json({ ok: false, error: '게임 이름(또는 그룹)을 한 개 이상 입력하세요.' }, 400)
  }

  const dryRun = body.dryRun !== false // 기본값: 미리보기(안전)
  const results: any[] = []

  for (const group of groups) {
    try {
      const name = group.name
      const excludeKeywords = group.exclude
      const includeKeywords = group.keywords
      const switchPolicy = group.switchPolicy || null   // [2026-07-10] 's2'|'s1'|null

      const mergedByPlatform = new Map<string, Map<string, any>>()
      const skippedTotal = { notGameTitle: 0, blacklisted: 0, used: 0, catalog: 0, outOfRange: 0, noPlatform: 0, excluded: 0 }
      let totalItems = 0
      let firstImage: string | null = null

      for (const alias of group.aliases) {
        // [2026-07-10] switch_policy 전달 → s2면 "SWITCH"만 적힌 상품도 switch2로 승격
        const classified = await searchAndClassify(clientId, clientSecret, alias, includeKeywords, excludeKeywords, switchPolicy)
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

      const order = ['pc', 'ps5', 'ps4', 'xbox', 'switch', 'switch2', 'etc']
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

      // [2026-07-10] s2 정책이면 switch 버킷을 switch2로 흡수하고 switch 버킷 제거.
      //   (승격 로직으로 대부분 switch2로 들어오지만, 안전하게 이중 차단)
      let effectiveBuckets = mergedBuckets
      if (switchPolicy === 's2') {
        const s1 = effectiveBuckets.find((b) => b.platform === 'switch')
        if (s1) {
          let s2 = effectiveBuckets.find((b) => b.platform === 'switch2')
          if (!s2) {
            s2 = { platform: 'switch2', prices: [], count: 0, lowest: null }
            effectiveBuckets.push(s2)
          }
          const seenKey = new Set(s2.prices.map((p: any) => p.link || `${p.mallName}|${p.isDigital}`))
          for (const p of s1.prices) {
            const key = p.link || `${p.mallName}|${p.isDigital}`
            if (!seenKey.has(key)) { seenKey.add(key); s2.prices.push(p) }
          }
          s2.prices.sort((a: any, b: any) => a.price - b.price)
          s2.count = s2.prices.length
          s2.lowest = s2.prices.length ? s2.prices[0].price : null
        }
        effectiveBuckets = effectiveBuckets
          .filter((b) => b.platform !== 'switch')
          .sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform))
      }
      if (switchPolicy === 's1') {
        const s2 = effectiveBuckets.find((b) => b.platform === 'switch2')
        if (s2) {
          let s1 = effectiveBuckets.find((b) => b.platform === 'switch')
          if (!s1) {
            s1 = { platform: 'switch', prices: [], count: 0, lowest: null }
            effectiveBuckets.push(s1)
          }
          const seenKey = new Set(s1.prices.map((p: any) => p.link || `${p.mallName}|${p.isDigital}`))
          for (const p of s2.prices) {
            const key = p.link || `${p.mallName}|${p.isDigital}`
            if (!seenKey.has(key)) { seenKey.add(key); s1.prices.push(p) }
          }
          s1.prices.sort((a: any, b: any) => a.price - b.price)
          s1.count = s1.prices.length
          s1.lowest = s1.prices.length ? s1.prices[0].price : null
        }
        effectiveBuckets = effectiveBuckets
          .filter((b) => b.platform !== 'switch2')
          .sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform))
      }

      const platformsView: Record<string, any> = {}
      for (const b of effectiveBuckets) {
        platformsView[b.platform] = {
          label: PLATFORM_LABELS[b.platform] ?? b.platform,
          count: b.count,
          lowest: b.lowest,
          malls: b.prices.map((p) => ({ source: p.mallName, label: p.mallLabel, price: p.price })),
        }
      }

      // [2026-07-10] 양식에 이미지가 있으면 우선, 없으면 검색 자동수집 이미지
      const chosenImage = (group.image && group.image.trim()) ? group.image.trim() : firstImage

      const entry: any = {
        title: name,
        aliases: group.aliases,
        keywords: includeKeywords,
        exclude: excludeKeywords,
        switchPolicy: switchPolicy ?? '',   // [2026-07-10] 응답에 정책 표시(확인용)
        image: chosenImage,
        platforms: platformsView,
        skipped: skippedTotal,
        totalItems,
        saved: null,
      }

      // 실제 저장 (dryRun=false)
      if (!dryRun && effectiveBuckets.length > 0) {
        let game = await findGameByTitle(c.env.DB, name)
        let gameId: number
        if (game) {
          gameId = game.id
          if (group.image && group.image.trim()) {
            await c.env.DB.prepare('UPDATE games SET image_url = ? WHERE id = ?')
              .bind(group.image.trim(), gameId).run()
          }
        } else {
          const r = await insertGame(c.env.DB, { title: name, image_url: chosenImage })
          gameId = Number(r.meta.last_row_id)
        }

        // [2026-07-10] switch_policy 저장(신규/기존 모두). 빈 문자열이면 NULL(=자동).
        {
          const policyVal = (switchPolicy === 's2' || switchPolicy === 's1') ? switchPolicy : null
          await c.env.DB.prepare('UPDATE games SET switch_policy = ? WHERE id = ?')
            .bind(policyVal, gameId).run()
        }

        const excludeStr = excludeKeywords.length ? excludeKeywords.join(',') : null
        const keywordsStr = includeKeywords.length ? includeKeywords.join(',') : null

        const savedDetail: Record<string, number> = {}
        for (const b of effectiveBuckets) {
          let edition = await findEdition(c.env.DB, gameId, b.platform)
          let editionId: number
          if (edition) {
            editionId = edition.id
            if (excludeStr !== null || keywordsStr !== null) {
              await c.env.DB
                .prepare(
                  'UPDATE editions SET exclude_keywords = COALESCE(?, exclude_keywords), keywords = COALESCE(?, keywords) WHERE id = ?'
                )
                .bind(excludeStr, keywordsStr, editionId).run()
            }
          } else {
            const label = PLATFORM_LABELS[b.platform] ?? b.platform
            const r = await insertEdition(c.env.DB, {
              game_id: gameId,
              platform: b.platform,
              edition_name: `${label}판`,
              search_query: `${name} ${label}`,
              keywords: keywordsStr,
              exclude_keywords: excludeStr,
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

// ============================================================
// 등록안 텍스트 생성기 (B단계)
//   POST /admin/api/generate-list
//   [2026-07-10] 6칸 양식으로 출력(정책 칸 빈칸 추가)
// ============================================================
admin.post('/api/generate-list', async (c) => {
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

  let titles: string[] = []
  if (Array.isArray(body.titles)) titles = body.titles.map((t: any) => String(t))
  else if (typeof body.titles === 'string') titles = body.titles.split('\n')
  titles = titles.map((t) => t.trim()).filter(Boolean)

  if (titles.length === 0) {
    return c.json({ ok: false, error: '게임 이름을 한 개 이상 입력하세요.' }, 400)
  }

  const order = ['pc', 'ps5', 'ps4', 'xbox', 'switch', 'switch2', 'etc']
  const results: any[] = []
  const lines: string[] = []

  for (const title of titles) {
    try {
      const classified = await searchAndClassify(clientId, clientSecret, title)

      const platforms: Record<string, any> = {}
      const sortedBuckets = [...classified.buckets].sort(
        (a, b) => order.indexOf(a.platform) - order.indexOf(b.platform)
      )
      for (const b of sortedBuckets) {
        platforms[b.platform] = { count: b.count, lowest: b.lowest }
      }

      const imageCandidates: string[] = []
      const seenImg = new Set<string>()
      for (const b of sortedBuckets) {
        for (const p of b.prices) {
          if (p.image && !seenImg.has(p.image)) {
            seenImg.add(p.image)
            imageCandidates.push(p.image)
            if (imageCandidates.length >= 6) break
          }
        }
        if (imageCandidates.length >= 6) break
      }
      const image = imageCandidates[0] ?? ''

      const sampleTitles: string[] = []
      for (const b of sortedBuckets) {
        for (const p of b.prices) {
          if (sampleTitles.length >= 5) break
          sampleTitles.push(p.title)
        }
        if (sampleTitles.length >= 5) break
      }

      const s = classified.skipped
      const hints: string[] = []
      if (s.blacklisted > 0) hints.push(`계정/대행/공략집 등 차단 ${s.blacklisted}건 감지`)
      if (s.excluded > 0) hints.push(`제외어 매칭 ${s.excluded}건`)
      if (s.notGameTitle > 8) hints.push(`비게임/굿즈성 ${s.notGameTitle}건 (오염 많음 — 검색어·keywords 점검 권장)`)
      if (s.noPlatform > 8) hints.push(`플랫폼 불명 ${s.noPlatform}건`)
      if (Object.keys(platforms).length === 0) hints.push('⚠ 잡힌 상품 없음 — 검색어 확인 필요')
      if (Object.keys(platforms).length >= 6) hints.push('플랫폼 6종 이상 — 시리즈 혼입 가능성, 확인 권장')

      // [2026-07-10] 6칸 양식: 대표이름 | 검색어 | 이미지 | keywords | exclude | 정책(빈칸)
      const line = `${title} |  | ${image} |  |  | `
      lines.push(line)

      results.push({
        title,
        line,
        image,
        imageCandidates,
        sampleTitles,
        platforms,
        hints,
        skipped: s,
        totalItems: classified.totalItems,
      })
    } catch (err: any) {
      // [2026-07-10] 6칸 양식
      const line = `${title} |  |  |  |  | `
      lines.push(line)
      results.push({ title, line, error: err.message })
    }
  }

  return c.json({
    ok: true,
    count: results.length,
    text: lines.join('\n'),
    results,
  })
})

// ---------- 등록된 게임 목록 (관리자 콘솔 표시용) ----------
admin.get('/api/games', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT g.id, g.title, g.image_url, g.switch_policy, g.created_at,
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

  // [2026-07-10] switch_policy 수정도 허용
  const patchImage = body.image_url !== undefined
  const patchPolicy = body.switch_policy !== undefined

  if (!patchImage && !patchPolicy) {
    return c.json({ ok: false, error: '수정할 필드(image_url 또는 switch_policy)가 없습니다.' }, 400)
  }

  try {
    if (patchImage) {
      const url = body.image_url ? String(body.image_url).trim() : null
      if (url && !/^https?:\/\//i.test(url)) {
        return c.json({ ok: false, error: '이미지 URL은 http(s)로 시작해야 합니다.' }, 400)
      }
      await c.env.DB.prepare('UPDATE games SET image_url = ? WHERE id = ?').bind(url, gameId).run()
    }
    if (patchPolicy) {
      const raw = String(body.switch_policy ?? '').trim().toLowerCase()
      const policyVal = (raw === 's2' || raw === 's1') ? raw : null
      await c.env.DB.prepare('UPDATE games SET switch_policy = ? WHERE id = ?').bind(policyVal, gameId).run()
    }
    return c.json({ ok: true, message: '게임 정보를 변경했습니다.' })
  } catch (err: any) {
    return c.json({ ok: false, error: `DB 오류: ${err.message}` }, 500)
  }
})

// ---------- 게임 여러 개 선택 삭제 (체크박스 다중 삭제) ----------
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

// ---------- 게임 목록 내보내기 (붙여넣기 재등록용 텍스트) ----------
// [2026-07-10] 6칸 형식: 대표이름 | 검색어(미사용) | 이미지URL | keywords | exclude | 정책(s2/s1/빈칸)
admin.get('/api/export', async (c) => {
  const { results: games } = await c.env.DB.prepare(
    'SELECT id, title, image_url, switch_policy FROM games ORDER BY id'
  ).all<{ id: number; title: string; image_url: string | null; switch_policy: string | null }>()

  const lines: string[] = []
  for (const g of games ?? []) {
    const { results: eds } = await c.env.DB
      .prepare('SELECT keywords, exclude_keywords FROM editions WHERE game_id = ?')
      .bind(g.id)
      .all<{ keywords: string | null; exclude_keywords: string | null }>()

    let keywords = ''
    let exclude = ''
    for (const e of eds ?? []) {
      if (!keywords && e.keywords && e.keywords.trim()) keywords = e.keywords.trim()
      if (!exclude && e.exclude_keywords && e.exclude_keywords.trim()) exclude = e.exclude_keywords.trim()
    }

    const img = g.image_url ?? ''
    const policy = g.switch_policy ?? ''   // [2026-07-10] 6번째 칸
    lines.push(`${g.title} |  | ${img} | ${keywords} | ${exclude} | ${policy}`)
  }

  return c.json({ ok: true, count: lines.length, text: lines.join('\n') })
})

// ---------- DB 전체 초기화 (게임/에디션/가격/이력 삭제, settings 유지) ----------
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
