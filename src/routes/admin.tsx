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
//   [2026-07-16] DB 사용자 블랙리스트·차단몰 지원
//     - custom_blacklist_keywords
//     - custom_blocked_malls
//     - 수동 수집/자동 가져오기/등록안 생성에 공통 적용
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
import { searchAndClassify, type CustomFilters } from '../naver'
import { PLATFORM_LABELS } from '../types'
import { AdminPage } from './admin-page'

const admin = new Hono<{ Bindings: Bindings }>()

function parseKeywordList(value?: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

// DB settings의 쉼표/줄바꿈 목록을 배열로 변환
function parseSettingList(value?: string | null): string[] {
  return Array.from(
    new Set(
      (value ?? '')
        .split(/[\r\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

// 한 요청에서 사용자 블랙리스트 설정을 한 번만 조회
async function loadCustomFilters(db: D1Database): Promise<CustomFilters> {
  try {
    const settings = await getAllSettings(db)

    return {
      blacklistKeywords: parseSettingList(settings.custom_blacklist_keywords),
      blockedMalls: parseSettingList(settings.custom_blocked_malls),
    }
  } catch (err) {
    console.error('[webapp] 사용자 블랙리스트 설정 조회 실패:', err)

    return {
      blacklistKeywords: [],
      blockedMalls: [],
    }
  }
}

// ---------- 관리자 콘솔 HTML ----------
admin.get('/', (c) => {
  return c.html(AdminPage())
})

// ---------- 이하 모든 API는 X-Admin-Token 필요 ----------
admin.use('/api/*', async (c, next) => {
  const expected = c.env.ADMIN_TOKEN ?? 'dev-token'
  const provided = c.req.header('X-Admin-Token')

  if (provided !== expected) {
    return c.json(
      {
        ok: false,
        error: '인증 실패: 올바른 관리자 토큰이 필요합니다.',
      },
      401
    )
  }

  await next()
})

// 기존 JSON 엔드포인트도 토큰 검사
admin.use('*', async (c, next) => {
  const path = c.req.path

  if (
    path === '/admin' ||
    path === '/admin/' ||
    path.startsWith('/admin/api/')
  ) {
    return next()
  }

  const expected = c.env.ADMIN_TOKEN ?? 'dev-token'
  const provided = c.req.header('X-Admin-Token')

  if (provided !== expected) {
    return c.json(
      {
        ok: false,
        error: '인증 실패: 올바른 X-Admin-Token 헤더가 필요합니다.',
      },
      401
    )
  }

  await next()
})

// ---------- 게임(작품) 등록 ----------
admin.post('/games', async (c) => {
  let body: any

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      {
        ok: false,
        error: '올바른 JSON이 아닙니다.',
      },
      400
    )
  }

  if (!body.title) {
    return c.json(
      {
        ok: false,
        error: 'title(게임 제목)은 필수입니다.',
      },
      400
    )
  }

  try {
    const result = await insertGame(c.env.DB, {
      title: body.title,
      image_url: body.image_url ?? null,
      release_date: body.release_date ?? null,
      original_price: body.original_price ?? null,
    })

    return c.json({
      ok: true,
      game_id: result.meta.last_row_id,
      message: `게임 '${body.title}' 등록 완료`,
    })
  } catch (err: any) {
    return c.json(
      {
        ok: false,
        error: `DB 오류: ${err.message}`,
      },
      500
    )
  }
})

// ---------- 에디션(플랫폼판) 추가 ----------
admin.post('/games/:id/editions', async (c) => {
  const gameId = Number(c.req.param('id'))

  if (Number.isNaN(gameId)) {
    return c.json(
      {
        ok: false,
        error: '잘못된 게임 ID',
      },
      400
    )
  }

  let body: any

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      {
        ok: false,
        error: '올바른 JSON이 아닙니다.',
      },
      400
    )
  }

  if (!body.platform) {
    return c.json(
      {
        ok: false,
        error: 'platform(pc/ps5/ps4/xbox/switch/etc)은 필수입니다.',
      },
      400
    )
  }

  try {
    const result = await insertEdition(c.env.DB, {
      game_id: gameId,
      platform: body.platform,
      edition_name: body.edition_name ?? null,
      search_query: body.search_query ?? null,
      keywords: body.keywords ?? null,
      exclude_keywords: body.exclude_keywords ?? null,
      steam_appid: body.steam_appid ?? null,
    })

    return c.json({
      ok: true,
      edition_id: result.meta.last_row_id,
      message: `에디션(${body.platform}) 추가 완료`,
    })
  } catch (err: any) {
    return c.json(
      {
        ok: false,
        error: `DB 오류: ${err.message}`,
      },
      500
    )
  }
})

// ---------- 에디션 수정 ----------
admin.patch('/editions/:id', async (c) => {
  const id = Number(c.req.param('id'))

  if (Number.isNaN(id)) {
    return c.json(
      {
        ok: false,
        error: '잘못된 에디션 ID',
      },
      400
    )
  }

  let body: any

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      {
        ok: false,
        error: '올바른 JSON이 아닙니다.',
      },
      400
    )
  }

  const fields: string[] = []
  const values: any[] = []

  for (const key of [
    'platform',
    'edition_name',
    'search_query',
    'keywords',
    'exclude_keywords',
    'steam_appid',
  ]) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`)
      values.push(body[key])
    }
  }

  if (fields.length === 0) {
    return c.json(
      {
        ok: false,
        error: '수정할 필드가 없습니다.',
      },
      400
    )
  }

  values.push(id)

  try {
    await c.env.DB
      .prepare(
        `UPDATE editions
         SET ${fields.join(', ')}
         WHERE id = ?`
      )
      .bind(...values)
      .run()

    return c.json({
      ok: true,
      message: '에디션 수정 완료',
    })
  } catch (err: any) {
    return c.json(
      {
        ok: false,
        error: `DB 오류: ${err.message}`,
      },
      500
    )
  }
})

// ---------- 가격 수동 추가 ----------
admin.post('/editions/:id/prices', async (c) => {
  const id = Number(c.req.param('id'))

  if (Number.isNaN(id)) {
    return c.json(
      {
        ok: false,
        error: '잘못된 에디션 ID',
      },
      400
    )
  }

  let body: any

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      {
        ok: false,
        error: '올바른 JSON이 아닙니다.',
      },
      400
    )
  }

  if (!body.source || body.price === undefined) {
    return c.json(
      {
        ok: false,
        error: 'source, price 는 필수입니다.',
      },
      400
    )
  }

  try {
    const result = await insertPrice(c.env.DB, {
      edition_id: id,
      source: body.source,
      price: Number(body.price),
      currency: body.currency ?? 'KRW',
      is_digital:
        body.is_digital !== undefined
          ? Number(body.is_digital)
          : 1,
      product_url: body.product_url ?? null,
      mall_label: body.mall_label ?? null,
    })

    return c.json({
      ok: true,
      price_id: result.meta.last_row_id,
      message: '가격 추가 완료',
    })
  } catch (err: any) {
    return c.json(
      {
        ok: false,
        error: `DB 오류: ${err.message}`,
      },
      500
    )
  }
})

// ---------- 네이버에서 패키지 가격 수집 ----------
admin.post('/editions/:id/fetch-prices', async (c) => {
  const id = Number(c.req.param('id'))

  if (Number.isNaN(id)) {
    return c.json(
      {
        ok: false,
        error: '잘못된 에디션 ID',
      },
      400
    )
  }

  const clientId = c.env.NAVER_CLIENT_ID
  const clientSecret = c.env.NAVER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return c.json(
      {
        ok: false,
        error: '네이버 API 키가 설정되지 않았습니다.',
      },
      500
    )
  }

  const edition = await getEditionById(c.env.DB, id)

  if (!edition) {
    return c.json(
      {
        ok: false,
        error: '에디션을 찾을 수 없습니다.',
      },
      404
    )
  }

  if (!edition.search_query) {
    return c.json(
      {
        ok: false,
        error: '이 에디션에 search_query 가 설정되지 않았습니다.',
      },
      400
    )
  }

  const keywords = parseKeywordList(edition.keywords)
  const excludeKeywords = parseKeywordList(
    edition.exclude_keywords
  )

  try {
    const gameRow = await c.env.DB
      .prepare(
        'SELECT switch_policy FROM games WHERE id = ?'
      )
      .bind(edition.game_id)
      .first<{ switch_policy: string | null }>()

    const switchPolicy =
      gameRow?.switch_policy ?? null

    const customFilters =
      await loadCustomFilters(c.env.DB)

    const classified = await searchAndClassify(
      clientId,
      clientSecret,
      edition.search_query,
      keywords,
      excludeKeywords,
      switchPolicy,
      1,
      customFilters
    )

    let targetBucketPlatform =
      edition.platform

    if (
      switchPolicy === 's2' &&
      edition.platform === 'switch'
    ) {
      targetBucketPlatform = 'switch2'
    }

    if (
      switchPolicy === 's1' &&
      edition.platform === 'switch2'
    ) {
      targetBucketPlatform = 'switch'
    }

    const bucket = classified.buckets.find(
      (item) =>
        item.platform === targetBucketPlatform
    )

    const prices =
      bucket ? bucket.prices : []

    if (prices.length === 0) {
      return c.json({
        ok: true,
        found: 0,
        message:
          '게임 본품을 찾지 못했습니다. 검색어를 조정하세요.',
      })
    }

    await c.env.DB
      .prepare(
        'DELETE FROM prices WHERE edition_id = ?'
      )
      .bind(id)
      .run()

    let saved = 0

    for (const price of prices) {
      await insertPrice(c.env.DB, {
        edition_id: id,
        source: price.mallName,
        price: price.price,
        currency: 'KRW',
        is_digital: price.isDigital ?? 0,
        product_url: price.link,
        mall_label: price.mallLabel,
      })

      saved++
    }

    return c.json({
      ok: true,
      query: edition.search_query,
      found: prices.length,
      saved,
      prices: prices.map((price) => ({
        mall: price.mallLabel,
        source: price.mallName,
        price: price.price,
      })),
      message: `패키지 가격 ${saved}건 수집 완료`,
    })
  } catch (err: any) {
    return c.json(
      {
        ok: false,
        error: err.message,
      },
      500
    )
  }
})

// ============================================================
// 관리자 콘솔용 간편 API
// ============================================================

admin.post('/api/verify', (c) => {
  return c.json({ ok: true })
})

// ---------- 관리자 설정 조회 ----------
admin.get('/api/settings', async (c) => {
  const settings =
    await getAllSettings(c.env.DB)

  return c.json({
    ok: true,
    settings: {
      coupang_partners_id:
        settings.coupang_partners_id ?? '',
      linkprice_id:
        settings.linkprice_id ?? '',
      custom_blacklist_keywords:
        settings.custom_blacklist_keywords ?? '',
      custom_blocked_malls:
        settings.custom_blocked_malls ?? '',
    },
  })
})

// ---------- 관리자 설정 저장 ----------
admin.post('/api/settings', async (c) => {
  let body: any

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      {
        ok: false,
        error: '올바른 JSON이 아닙니다.',
      },
      400
    )
  }

  const allowed = [
    'coupang_partners_id',
    'linkprice_id',
    'custom_blacklist_keywords',
    'custom_blocked_malls',
  ]

  try {
    for (const key of allowed) {
      if (body[key] !== undefined) {
        await setSetting(
          c.env.DB,
          key,
          String(body[key]).trim()
        )
      }
    }

    return c.json({
      ok: true,
      message: '관리자 설정 저장 완료',
    })
  } catch (err: any) {
    return c.json(
      {
        ok: false,
        error: `DB 오류: ${err.message}`,
      },
      500
    )
  }
})

// ---------- 간편 게임 등록 ----------
admin.post('/api/games', async (c) => {
  let body: any

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      {
        ok: false,
        error: '올바른 JSON이 아닙니다.',
      },
      400
    )
  }

  if (!body.title || !String(body.title).trim()) {
    return c.json(
      {
        ok: false,
        error: '게임 제목은 필수입니다.',
      },
      400
    )
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
      message:
        `'${body.title}' 등록 완료. ` +
        '다음 자동 수집 때 플랫폼별 가격이 채워집니다.',
    })
  } catch (err: any) {
    return c.json(
      {
        ok: false,
        error: `DB 오류: ${err.message}`,
      },
      500
    )
  }
})

// ============================================================
// 자동 임포트
// ============================================================
admin.post('/api/auto-import', async (c) => {
  const clientId = c.env.NAVER_CLIENT_ID
  const clientSecret = c.env.NAVER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return c.json(
      {
        ok: false,
        error: '네이버 API 키가 설정되지 않았습니다.',
      },
      500
    )
  }

  let body: any

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      {
        ok: false,
        error: '올바른 JSON이 아닙니다.',
      },
      400
    )
  }

  let groups: {
    name: string
    aliases: string[]
    exclude: string[]
    keywords: string[]
    image?: string
    switchPolicy?: string
  }[] = []

  if (Array.isArray(body.groups)) {
    groups = body.groups
      .map((group: any) => {
        const rawAliases = (
          Array.isArray(group.aliases)
            ? group.aliases
            : []
        )
          .map((alias: any) =>
            String(alias).trim()
          )
          .filter(Boolean)

        const name = String(
          group.name ?? rawAliases[0] ?? ''
        ).trim()

        const seen = new Set<string>()
        const aliases: string[] = []

        for (const term of [
          name,
          ...rawAliases,
        ]) {
          if (!term) continue

          const key = term
            .toLowerCase()
            .replace(/\s+/g, '')

          if (!seen.has(key)) {
            seen.add(key)
            aliases.push(term)
          }
        }

        let rawExclude: string[] = []

        if (Array.isArray(group.exclude)) {
          rawExclude = group.exclude.map(
            (item: any) => String(item)
          )
        } else if (
          typeof group.exclude === 'string'
        ) {
          rawExclude =
            group.exclude.split(',')
        }

        const exclude = Array.from(
          new Set(
            rawExclude
              .map((item) => item.trim())
              .filter(Boolean)
          )
        )

        let rawKeywords: string[] = []

        if (Array.isArray(group.keywords)) {
          rawKeywords = group.keywords.map(
            (item: any) => String(item)
          )
        } else if (
          typeof group.keywords === 'string'
        ) {
          rawKeywords =
            group.keywords.split(',')
        }

        const keywords = Array.from(
          new Set(
            rawKeywords
              .map((item) => item.trim())
              .filter(Boolean)
          )
        )

        const image = String(
          group.image ?? ''
        ).trim()

        const rawPolicy = String(
          group.switchPolicy ??
          group.switch_policy ??
          ''
        )
          .trim()
          .toLowerCase()

        const switchPolicy =
          rawPolicy === 's2' ||
          rawPolicy === 's1'
            ? rawPolicy
            : ''

        return {
          name,
          aliases,
          exclude,
          keywords,
          image,
          switchPolicy,
        }
      })
      .filter(
        (group: any) =>
          group.name &&
          group.aliases.length
      )
  } else {
    let rawLines: string[] = []

    if (Array.isArray(body.titles)) {
      rawLines = body.titles.map(
        (title: any) => String(title)
      )
    } else if (
      typeof body.titles === 'string'
    ) {
      rawLines = body.titles.split('\n')
    } else if (
      typeof body.title === 'string'
    ) {
      rawLines = [String(body.title)]
    }

    groups = rawLines
      .map((line) => {
        const columns = line
          .split('|')
          .map((item) => item.trim())

        const name = columns[0] ?? ''
        const searchQuery =
          columns[1] ?? ''
        const image =
          columns[2] ?? ''
        const keywordsString =
          columns[3] ?? ''
        const excludeString =
          columns[4] ?? ''
        const rawPolicy =
          (columns[5] ?? '').toLowerCase()

        const switchPolicy =
          rawPolicy === 's2' ||
          rawPolicy === 's1'
            ? rawPolicy
            : ''

        const keywords =
          keywordsString
            ? keywordsString
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
            : []

        const exclude =
          excludeString
            ? excludeString
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
            : []

        // 붙여넣기의 검색어가 있으면 해당 검색어를 사용하고,
        // 없으면 대표 이름으로 검색한다.
        const alias =
          searchQuery || name

        return {
          name,
          aliases: alias ? [alias] : [],
          exclude,
          keywords,
          image,
          switchPolicy,
        }
      })
      .filter(
        (group) =>
          group.name &&
          group.aliases.length
      )
  }

  if (groups.length === 0) {
    return c.json(
      {
        ok: false,
        error:
          '게임 이름(또는 그룹)을 한 개 이상 입력하세요.',
      },
      400
    )
  }

  const dryRun =
    body.dryRun !== false

  const results: any[] = []

  // 자동 임포트 요청 시작 시 한 번만 조회
  const customFilters =
    await loadCustomFilters(c.env.DB)

  for (const group of groups) {
    try {
      const name = group.name
      const excludeKeywords =
        group.exclude
      const includeKeywords =
        group.keywords
      const switchPolicy =
        group.switchPolicy || null

      const mergedByPlatform =
        new Map<
          string,
          Map<string, any>
        >()

      const skippedTotal = {
        notGameTitle: 0,
        blacklisted: 0,
        used: 0,
        catalog: 0,
        outOfRange: 0,
        noPlatform: 0,
        excluded: 0,
      }

      let totalItems = 0
      let firstImage: string | null = null

      for (const alias of group.aliases) {
        const classified =
          await searchAndClassify(
            clientId,
            clientSecret,
            alias,
            includeKeywords,
            excludeKeywords,
            switchPolicy,
            1,
            customFilters
          )

        totalItems +=
          classified.totalItems

        for (
          const key of Object.keys(
            skippedTotal
          )
        ) {
          if (
            classified.skipped &&
            (classified.skipped as any)[key] !==
              undefined
          ) {
            ;(skippedTotal as any)[key] +=
              (classified.skipped as any)[key]
          }
        }

        for (
          const bucket of classified.buckets
        ) {
          if (
            !mergedByPlatform.has(
              bucket.platform
            )
          ) {
            mergedByPlatform.set(
              bucket.platform,
              new Map()
            )
          }

          const priceMap =
            mergedByPlatform.get(
              bucket.platform
            )!

          for (
            const price of bucket.prices
          ) {
            if (
              !firstImage &&
              price.image
            ) {
              firstImage = price.image
            }

            const key =
              price.link ||
              `${price.mallName}|${price.isDigital}`

            const existing =
              priceMap.get(key)

            if (
              !existing ||
              price.price < existing.price
            ) {
              priceMap.set(key, price)
            }
          }
        }
      }

      const order = [
        'pc',
        'ps5',
        'ps4',
        'xbox',
        'switch',
        'switch2',
        'etc',
      ]

      const mergedBuckets =
        Array.from(
          mergedByPlatform.entries()
        )
          .map(
            ([platform, priceMap]) => {
              const prices =
                Array.from(
                  priceMap.values()
                ).sort(
                  (a, b) =>
                    a.price - b.price
                )

              return {
                platform,
                prices,
                count: prices.length,
                lowest:
                  prices.length
                    ? prices[0].price
                    : null,
              }
            }
          )
          .sort(
            (a, b) =>
              order.indexOf(a.platform) -
              order.indexOf(b.platform)
          )

      let effectiveBuckets =
        mergedBuckets

      if (switchPolicy === 's2') {
        const switch1Bucket =
          effectiveBuckets.find(
            (bucket) =>
              bucket.platform === 'switch'
          )

        if (switch1Bucket) {
          let switch2Bucket =
            effectiveBuckets.find(
              (bucket) =>
                bucket.platform ===
                'switch2'
            )

          if (!switch2Bucket) {
            switch2Bucket = {
              platform: 'switch2',
              prices: [],
              count: 0,
              lowest: null,
            }

            effectiveBuckets.push(
              switch2Bucket
            )
          }

          const seenKeys = new Set(
            switch2Bucket.prices.map(
              (price: any) =>
                price.link ||
                `${price.mallName}|${price.isDigital}`
            )
          )

          for (
            const price of
              switch1Bucket.prices
          ) {
            const key =
              price.link ||
              `${price.mallName}|${price.isDigital}`

            if (!seenKeys.has(key)) {
              seenKeys.add(key)
              switch2Bucket.prices.push(
                price
              )
            }
          }

          switch2Bucket.prices.sort(
            (a: any, b: any) =>
              a.price - b.price
          )

          switch2Bucket.count =
            switch2Bucket.prices.length

          switch2Bucket.lowest =
            switch2Bucket.prices.length
              ? switch2Bucket.prices[0].price
              : null
        }

        effectiveBuckets =
          effectiveBuckets
            .filter(
              (bucket) =>
                bucket.platform !==
                'switch'
            )
            .sort(
              (a, b) =>
                order.indexOf(a.platform) -
                order.indexOf(b.platform)
            )
      }

      if (switchPolicy === 's1') {
        const switch2Bucket =
          effectiveBuckets.find(
            (bucket) =>
              bucket.platform === 'switch2'
          )

        if (switch2Bucket) {
          let switch1Bucket =
            effectiveBuckets.find(
              (bucket) =>
                bucket.platform ===
                'switch'
            )

          if (!switch1Bucket) {
            switch1Bucket = {
              platform: 'switch',
              prices: [],
              count: 0,
              lowest: null,
            }

            effectiveBuckets.push(
              switch1Bucket
            )
          }

          const seenKeys = new Set(
            switch1Bucket.prices.map(
              (price: any) =>
                price.link ||
                `${price.mallName}|${price.isDigital}`
            )
          )

          for (
            const price of
              switch2Bucket.prices
          ) {
            const key =
              price.link ||
              `${price.mallName}|${price.isDigital}`

            if (!seenKeys.has(key)) {
              seenKeys.add(key)
              switch1Bucket.prices.push(
                price
              )
            }
          }

          switch1Bucket.prices.sort(
            (a: any, b: any) =>
              a.price - b.price
          )

          switch1Bucket.count =
            switch1Bucket.prices.length

          switch1Bucket.lowest =
            switch1Bucket.prices.length
              ? switch1Bucket.prices[0].price
              : null
        }

        effectiveBuckets =
          effectiveBuckets
            .filter(
              (bucket) =>
                bucket.platform !==
                'switch2'
            )
            .sort(
              (a, b) =>
                order.indexOf(a.platform) -
                order.indexOf(b.platform)
            )
      }

      const platformsView:
        Record<string, any> = {}

      for (
        const bucket of effectiveBuckets
      ) {
        platformsView[bucket.platform] = {
          label:
            PLATFORM_LABELS[
              bucket.platform
            ] ?? bucket.platform,
          count: bucket.count,
          lowest: bucket.lowest,
          malls: bucket.prices.map(
            (price) => ({
              source: price.mallName,
              label: price.mallLabel,
              price: price.price,
            })
          ),
        }
      }

      const chosenImage =
        group.image &&
        group.image.trim()
          ? group.image.trim()
          : firstImage

      const entry: any = {
        title: name,
        aliases: group.aliases,
        keywords: includeKeywords,
        exclude: excludeKeywords,
        switchPolicy:
          switchPolicy ?? '',
        image: chosenImage,
        platforms: platformsView,
        skipped: skippedTotal,
        totalItems,
        saved: null,
      }

      if (
        !dryRun &&
        effectiveBuckets.length > 0
      ) {
        let game =
          await findGameByTitle(
            c.env.DB,
            name
          )

        let gameId: number

        if (game) {
          gameId = game.id

          if (
            group.image &&
            group.image.trim()
          ) {
            await c.env.DB
              .prepare(
                `UPDATE games
                 SET image_url = ?
                 WHERE id = ?`
              )
              .bind(
                group.image.trim(),
                gameId
              )
              .run()
          }
        } else {
          const result =
            await insertGame(c.env.DB, {
              title: name,
              image_url: chosenImage,
            })

          gameId = Number(
            result.meta.last_row_id
          )
        }

        const policyValue =
          switchPolicy === 's2' ||
          switchPolicy === 's1'
            ? switchPolicy
            : null

        await c.env.DB
          .prepare(
            `UPDATE games
             SET switch_policy = ?
             WHERE id = ?`
          )
          .bind(policyValue, gameId)
          .run()

        const excludeString =
          excludeKeywords.length
            ? excludeKeywords.join(',')
            : null

        const keywordsString =
          includeKeywords.length
            ? includeKeywords.join(',')
            : null

        const savedDetail:
          Record<string, number> = {}

        for (
          const bucket of
            effectiveBuckets
        ) {
          let edition =
            await findEdition(
              c.env.DB,
              gameId,
              bucket.platform
            )

          let editionId: number

          if (edition) {
            editionId = edition.id

            if (
              excludeString !== null ||
              keywordsString !== null
            ) {
              await c.env.DB
                .prepare(
                  `UPDATE editions
                   SET exclude_keywords =
                         COALESCE(
                           ?,
                           exclude_keywords
                         ),
                       keywords =
                         COALESCE(
                           ?,
                           keywords
                         )
                   WHERE id = ?`
                )
                .bind(
                  excludeString,
                  keywordsString,
                  editionId
                )
                .run()
            }
          } else {
            const label =
              PLATFORM_LABELS[
                bucket.platform
              ] ?? bucket.platform

            const result =
              await insertEdition(
                c.env.DB,
                {
                  game_id: gameId,
                  platform:
                    bucket.platform,
                  edition_name:
                    `${label}판`,
                  search_query:
                    `${name} ${label}`,
                  keywords:
                    keywordsString,
                  exclude_keywords:
                    excludeString,
                }
              )

            editionId = Number(
              result.meta.last_row_id
            )
          }

          await c.env.DB
            .prepare(
              `DELETE FROM prices
               WHERE edition_id = ?`
            )
            .bind(editionId)
            .run()

          let count = 0

          for (
            const price of bucket.prices
          ) {
            await insertPrice(c.env.DB, {
              edition_id: editionId,
              source: price.mallName,
              price: price.price,
              currency: 'KRW',
              is_digital:
                price.isDigital ?? 0,
              product_url: price.link,
              mall_label:
                price.mallLabel,
            })

            count++
          }

          savedDetail[
            bucket.platform
          ] = count
        }

        entry.game_id = gameId
        entry.saved = savedDetail
      }

      results.push(entry)
    } catch (err: any) {
      results.push({
        title: group.name,
        error: err.message,
      })
    }
  }

  return c.json({
    ok: true,
    dryRun,
    mode: dryRun
      ? '미리보기(저장 안 함)'
      : '실제 저장 완료',
    count: results.length,
    results,
  })
})

// ============================================================
// 등록안 텍스트 생성기
// ============================================================
admin.post('/api/generate-list', async (c) => {
  const clientId =
    c.env.NAVER_CLIENT_ID

  const clientSecret =
    c.env.NAVER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return c.json(
      {
        ok: false,
        error:
          '네이버 API 키가 설정되지 않았습니다.',
      },
      500
    )
  }

  let body: any

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      {
        ok: false,
        error: '올바른 JSON이 아닙니다.',
      },
      400
    )
  }

  let titles: string[] = []

  if (Array.isArray(body.titles)) {
    titles = body.titles.map(
      (title: any) => String(title)
    )
  } else if (
    typeof body.titles === 'string'
  ) {
    titles = body.titles.split('\n')
  }

  titles = titles
    .map((title) => title.trim())
    .filter(Boolean)

  if (titles.length === 0) {
    return c.json(
      {
        ok: false,
        error:
          '게임 이름을 한 개 이상 입력하세요.',
      },
      400
    )
  }

  const order = [
    'pc',
    'ps5',
    'ps4',
    'xbox',
    'switch',
    'switch2',
    'etc',
  ]

  const results: any[] = []
  const lines: string[] = []

  // 등록안 생성 요청 시작 시 한 번 조회
  const customFilters =
    await loadCustomFilters(c.env.DB)

  for (const title of titles) {
    try {
      const classified =
        await searchAndClassify(
          clientId,
          clientSecret,
          title,
          [],
          [],
          null,
          1,
          customFilters
        )

      const platforms:
        Record<string, any> = {}

      const sortedBuckets = [
        ...classified.buckets,
      ].sort(
        (a, b) =>
          order.indexOf(a.platform) -
          order.indexOf(b.platform)
      )

      for (
        const bucket of sortedBuckets
      ) {
        platforms[bucket.platform] = {
          count: bucket.count,
          lowest: bucket.lowest,
        }
      }

      const imageCandidates:
        string[] = []

      const seenImages =
        new Set<string>()

      for (
        const bucket of sortedBuckets
      ) {
        for (
          const price of bucket.prices
        ) {
          if (
            price.image &&
            !seenImages.has(price.image)
          ) {
            seenImages.add(price.image)
            imageCandidates.push(
              price.image
            )

            if (
              imageCandidates.length >= 6
            ) {
              break
            }
          }
        }

        if (
          imageCandidates.length >= 6
        ) {
          break
        }
      }

      const image =
        imageCandidates[0] ?? ''

      const sampleTitles:
        string[] = []

      for (
        const bucket of sortedBuckets
      ) {
        for (
          const price of bucket.prices
        ) {
          if (
            sampleTitles.length >= 5
          ) {
            break
          }

          sampleTitles.push(price.title)
        }

        if (
          sampleTitles.length >= 5
        ) {
          break
        }
      }

      const skipped =
        classified.skipped

      const hints: string[] = []

      if (skipped.blacklisted > 0) {
        hints.push(
          `계정/대행/공략집 등 차단 ` +
          `${skipped.blacklisted}건 감지`
        )
      }

      if (skipped.excluded > 0) {
        hints.push(
          `제외어 매칭 ` +
          `${skipped.excluded}건`
        )
      }

      if (skipped.notGameTitle > 8) {
        hints.push(
          `비게임/굿즈성 ` +
          `${skipped.notGameTitle}건 ` +
          '(오염 많음 — 검색어·keywords 점검 권장)'
        )
      }

      if (skipped.noPlatform > 8) {
        hints.push(
          `플랫폼 불명 ` +
          `${skipped.noPlatform}건`
        )
      }

      if (
        Object.keys(platforms).length ===
        0
      ) {
        hints.push(
          '⚠ 잡힌 상품 없음 — 검색어 확인 필요'
        )
      }

      if (
        Object.keys(platforms).length >=
        6
      ) {
        hints.push(
          '플랫폼 6종 이상 — 시리즈 혼입 가능성, 확인 권장'
        )
      }

      const line =
        `${title} |  | ${image} |  |  | `

      lines.push(line)

      results.push({
        title,
        line,
        image,
        imageCandidates,
        sampleTitles,
        platforms,
        hints,
        skipped,
        totalItems:
          classified.totalItems,
      })
    } catch (err: any) {
      const line =
        `${title} |  |  |  |  | `

      lines.push(line)

      results.push({
        title,
        line,
        error: err.message,
      })
    }
  }

  return c.json({
    ok: true,
    count: results.length,
    text: lines.join('\n'),
    results,
  })
})

// ---------- 등록된 게임 목록 ----------
admin.get('/api/games', async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT
         g.id,
         g.title,
         g.image_url,
         g.switch_policy,
         g.created_at,
         (
           SELECT COUNT(*)
           FROM editions e
           WHERE e.game_id = g.id
         ) AS edition_count
       FROM games g
       ORDER BY g.id DESC`
    )
    .all()

  return c.json({
    ok: true,
    games: results ?? [],
  })
})

// ---------- 게임 삭제 ----------
admin.delete('/api/games/:id', async (c) => {
  const gameId =
    Number(c.req.param('id'))

  if (Number.isNaN(gameId)) {
    return c.json(
      {
        ok: false,
        error: '잘못된 게임 ID',
      },
      400
    )
  }

  try {
    const editions = await c.env.DB
      .prepare(
        `SELECT id
         FROM editions
         WHERE game_id = ?`
      )
      .bind(gameId)
      .all<{ id: number }>()

    for (
      const edition of
        editions.results ?? []
    ) {
      await c.env.DB
        .prepare(
          `DELETE FROM prices
           WHERE edition_id = ?`
        )
        .bind(edition.id)
        .run()

      await c.env.DB
        .prepare(
          `DELETE FROM price_history
           WHERE edition_id = ?`
        )
        .bind(edition.id)
        .run()
    }

    await c.env.DB
      .prepare(
        `DELETE FROM editions
         WHERE game_id = ?`
      )
      .bind(gameId)
      .run()

    await c.env.DB
      .prepare(
        `DELETE FROM games
         WHERE id = ?`
      )
      .bind(gameId)
      .run()

    return c.json({
      ok: true,
      message:
        '게임과 연결된 데이터를 삭제했습니다.',
    })
  } catch (err: any) {
    return c.json(
      {
        ok: false,
        error: `DB 오류: ${err.message}`,
      },
      500
    )
  }
})

// ---------- 게임 정보 수정 ----------
admin.patch('/api/games/:id', async (c) => {
  const gameId =
    Number(c.req.param('id'))

  if (Number.isNaN(gameId)) {
    return c.json(
      {
        ok: false,
        error: '잘못된 게임 ID',
      },
      400
    )
  }

  let body: any

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      {
        ok: false,
        error: '올바른 JSON이 아닙니다.',
      },
      400
    )
  }

  const patchImage =
    body.image_url !== undefined

  const patchPolicy =
    body.switch_policy !== undefined

  if (!patchImage && !patchPolicy) {
    return c.json(
      {
        ok: false,
        error:
          '수정할 필드(image_url 또는 switch_policy)가 없습니다.',
      },
      400
    )
  }

  try {
    if (patchImage) {
      const imageUrl =
        body.image_url
          ? String(
              body.image_url
            ).trim()
          : null

      if (
        imageUrl &&
        !/^https?:\/\//i.test(imageUrl)
      ) {
        return c.json(
          {
            ok: false,
            error:
              '이미지 URL은 http(s)로 시작해야 합니다.',
          },
          400
        )
      }

      await c.env.DB
        .prepare(
          `UPDATE games
           SET image_url = ?
           WHERE id = ?`
        )
        .bind(imageUrl, gameId)
        .run()
    }

    if (patchPolicy) {
      const raw = String(
        body.switch_policy ?? ''
      )
        .trim()
        .toLowerCase()

      const policyValue =
        raw === 's2' ||
        raw === 's1'
          ? raw
          : null

      await c.env.DB
        .prepare(
          `UPDATE games
           SET switch_policy = ?
           WHERE id = ?`
        )
        .bind(policyValue, gameId)
        .run()
    }

    return c.json({
      ok: true,
      message: '게임 정보를 변경했습니다.',
    })
  } catch (err: any) {
    return c.json(
      {
        ok: false,
        error: `DB 오류: ${err.message}`,
      },
      500
    )
  }
})

// ---------- 게임 여러 개 선택 삭제 ----------
admin.post(
  '/api/games/bulk-delete',
  async (c) => {
    let body: any

    try {
      body = await c.req.json()
    } catch {
      return c.json(
        {
          ok: false,
          error:
            '올바른 JSON이 아닙니다.',
        },
        400
      )
    }

    const ids = Array.isArray(body.ids)
      ? body.ids
          .map((id: any) => Number(id))
          .filter(
            (id: number) =>
              !Number.isNaN(id)
          )
      : []

    if (ids.length === 0) {
      return c.json(
        {
          ok: false,
          error:
            '삭제할 게임을 한 개 이상 선택하세요.',
        },
        400
      )
    }

    try {
      let deleted = 0

      for (const gameId of ids) {
        const editions =
          await c.env.DB
            .prepare(
              `SELECT id
               FROM editions
               WHERE game_id = ?`
            )
            .bind(gameId)
            .all<{ id: number }>()

        for (
          const edition of
            editions.results ?? []
        ) {
          await c.env.DB
            .prepare(
              `DELETE FROM prices
               WHERE edition_id = ?`
            )
            .bind(edition.id)
            .run()

          await c.env.DB
            .prepare(
              `DELETE FROM price_history
               WHERE edition_id = ?`
            )
            .bind(edition.id)
            .run()
        }

        await c.env.DB
          .prepare(
            `DELETE FROM editions
             WHERE game_id = ?`
          )
          .bind(gameId)
          .run()

        await c.env.DB
          .prepare(
            `DELETE FROM games
             WHERE id = ?`
          )
          .bind(gameId)
          .run()

        deleted++
      }

      return c.json({
        ok: true,
        deleted,
        message:
          `${deleted}개 게임과 ` +
          '연결 데이터를 삭제했습니다.',
      })
    } catch (err: any) {
      return c.json(
        {
          ok: false,
          error:
            `DB 오류: ${err.message}`,
        },
        500
      )
    }
  }
)

// ---------- 게임 필터 일괄 적용 ----------
admin.post(
  '/api/games/:id/apply-filters',
  async (c) => {
    const gameId =
      Number(c.req.param('id'))

    if (Number.isNaN(gameId)) {
      return c.json(
        {
          ok: false,
          error: '잘못된 게임 ID',
        },
        400
      )
    }

    let body: any

    try {
      body = await c.req.json()
    } catch {
      return c.json(
        {
          ok: false,
          error:
            '올바른 JSON이 아닙니다.',
        },
        400
      )
    }

    const keywords =
      body.keywords != null &&
      String(body.keywords).trim()
        ? String(body.keywords).trim()
        : null

    const excludeKeywords =
      body.exclude_keywords != null &&
      String(
        body.exclude_keywords
      ).trim()
        ? String(
            body.exclude_keywords
          ).trim()
        : null

    try {
      await c.env.DB
        .prepare(
          `UPDATE editions
           SET keywords = ?,
               exclude_keywords = ?
           WHERE game_id = ?`
        )
        .bind(
          keywords,
          excludeKeywords,
          gameId
        )
        .run()

      return c.json({
        ok: true,
        message:
          'keywords/exclude 적용 완료',
      })
    } catch (err: any) {
      return c.json(
        {
          ok: false,
          error:
            `DB 오류: ${err.message}`,
        },
        500
      )
    }
  }
)

// ---------- 게임 목록 내보내기 ----------
admin.get('/api/export', async (c) => {
  const { results: games } =
    await c.env.DB
      .prepare(
        `SELECT
           id,
           title,
           image_url,
           switch_policy
         FROM games
         ORDER BY id`
      )
      .all<{
        id: number
        title: string
        image_url: string | null
        switch_policy: string | null
      }>()

  const lines: string[] = []

  for (const game of games ?? []) {
    const { results: editions } =
      await c.env.DB
        .prepare(
          `SELECT
             keywords,
             exclude_keywords
           FROM editions
           WHERE game_id = ?`
        )
        .bind(game.id)
        .all<{
          keywords: string | null
          exclude_keywords: string | null
        }>()

    let keywords = ''
    let excludeKeywords = ''

    for (
      const edition of editions ?? []
    ) {
      if (
        !keywords &&
        edition.keywords &&
        edition.keywords.trim()
      ) {
        keywords =
          edition.keywords.trim()
      }

      if (
        !excludeKeywords &&
        edition.exclude_keywords &&
        edition.exclude_keywords.trim()
      ) {
        excludeKeywords =
          edition.exclude_keywords.trim()
      }
    }

    const image =
      game.image_url ?? ''

    const policy =
      game.switch_policy ?? ''

    lines.push(
      `${game.title} |  | ${image} | ` +
      `${keywords} | ${excludeKeywords} | ${policy}`
    )
  }

  return c.json({
    ok: true,
    count: lines.length,
    text: lines.join('\n'),
  })
})

// ---------- DB 전체 초기화 ----------
admin.post('/api/reset-all', async (c) => {
  let body: any

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      {
        ok: false,
        error: '올바른 JSON이 아닙니다.',
      },
      400
    )
  }

  if (body.confirm !== 'RESET') {
    return c.json(
      {
        ok: false,
        error:
          '확인 문구가 올바르지 않습니다. confirm: "RESET" 필요.',
      },
      400
    )
  }

  try {
    await c.env.DB
      .prepare(
        'DELETE FROM price_history'
      )
      .run()

    await c.env.DB
      .prepare(
        'DELETE FROM prices'
      )
      .run()

    await c.env.DB
      .prepare(
        'DELETE FROM editions'
      )
      .run()

    await c.env.DB
      .prepare(
        'DELETE FROM games'
      )
      .run()

    return c.json({
      ok: true,
      message:
        '전체 데이터를 초기화했습니다. (관리자 설정은 유지)',
    })
  } catch (err: any) {
    return c.json(
      {
        ok: false,
        error: `DB 오류: ${err.message}`,
      },
      500
    )
  }
})

export default admin
