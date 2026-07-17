// ============================================================
// 관리자 API 라우트
// src/routes/admin.tsx
//
// 관리자 콘솔
//   GET    /admin
//
// 신규 관리자 API
//   GET    /admin/api/verify
//   GET    /admin/api/dashboard
//   GET    /admin/api/settings
//   POST   /admin/api/settings
//   POST   /admin/api/candidates/evaluate
//   POST   /admin/api/import/preview
//   POST   /admin/api/import/run
//   GET    /admin/api/games
//   DELETE /admin/api/games/:id
//   POST   /admin/api/reset
//
// 기존 호환 API
//   POST   /admin/api/verify
//   POST   /admin/api/auto-import
//   POST   /admin/games
//   POST   /admin/games/:id/editions
//   PATCH  /admin/editions/:id
//   POST   /admin/editions/:id/prices
//   POST   /admin/editions/:id/fetch-prices
//
// 인증
//   X-Admin-Token 헤더 사용
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { PLATFORM_LABELS } from '../types'
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
import {
  searchAndClassify,
  type CustomFilters,
  type PlatformBucket,
} from '../naver'
import { AdminPage } from './admin-page'

const admin = new Hono<{ Bindings: Bindings }>()

// ============================================================
// 공통 타입
// ============================================================

type ImportGroup = {
  name: string
  searchQuery: string
  keywords: string[]
  exclude: string[]
  imageUrl: string
  switchPolicy: string
}

type GameListRow = {
  id: number
  title: string
  image_url: string | null
  switch_policy: string | null
  created_at: string
  edition_count: number
  platforms: string | null
  search_query: string | null
  keywords: string | null
  exclude_keywords: string | null
}

// ============================================================
// 공통 유틸리티
// ============================================================

function parseKeywordList(value?: string | null): string[] {
  return Array.from(
    new Set(
      String(value ?? '')
        .split(/[\r\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function parseSettingList(value?: string | null): string[] {
  return Array.from(
    new Set(
      String(value ?? '')
        .split(/[\r\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function normalizeTitle(value?: string | null): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[™®©]/g, '')
    .replace(/[·ㆍ:：\-–—_()[\]{}]/g, '')
    .replace(/\s+/g, '')
    .trim()
}

// ============================================================
// 후보 게임명과 네이버 상품명 비교
//
// 목적
// - 스파이더맨 2 후보에 스파이더맨 1·3·4 등이 포함되는 문제 방지
// - PS5, PS4, Switch 2 등에 포함된 플랫폼 숫자는 작품 번호에서 제외
// - 연도는 후보 판정에 사용하지 않음
// ============================================================

const ROMAN_NUMBER_MAP: Record<string, string> = {
  i: '1',
  ii: '2',
  iii: '3',
  iv: '4',
  v: '5',
  vi: '6',
  vii: '7',
  viii: '8',
  ix: '9',
  x: '10',
  xi: '11',
  xii: '12',
  xiii: '13',
}

function normalizeCandidateMatchText(
  value?: string | null
): string {
  let text = String(value ?? '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[™®©]/g, ' ')

  // 영문·한글 표기를 같은 제목으로 비교
  text = text
    .replace(
      /spider[\s\-–—_]*man/g,
      '스파이더맨'
    )

  // 로마 숫자를 일반 숫자로 변환
  text = text.replace(
    /\b(xiii|xii|xi|viii|vii|vi|iv|ix|iii|ii|x|v|i)\b/g,
    (matched) =>
      ROMAN_NUMBER_MAP[matched] ?? matched
  )

  // 이하 기존 코드 그대로


  // 플랫폼명에 포함된 숫자가 작품 번호로 인식되지 않도록 제거
  text = text
    .replace(
      /\bplaystation\s*5\b|\bps\s*5\b|\bps5\b/g,
      ' '
    )
    .replace(
      /\bplaystation\s*4\b|\bps\s*4\b|\bps4\b/g,
      ' '
    )
    .replace(
      /닌텐도\s*스위치\s*2|스위치\s*2|switch\s*2/g,
      ' '
    )
    .replace(
      /닌텐도\s*스위치|스위치|nintendo\s*switch|switch/g,
      ' '
    )
    .replace(/\bxbox(?:\s*series\s*[xs])?\b/g, ' ')
    .replace(/\bwindows\b|\bsteam\b|\bpc\b/g, ' ')

  // 제목 비교에 의미가 적은 일반 표기 제거
  text = text
    .replace(/\bmarvel'?s?\b/g, ' ')
    .replace(/마블/g, ' ')
    .replace(
      /한글판|한국어판|정식발매|정발|국내판|패키지판|패키지|게임타이틀/g,
      ' '
    )

  return text
    .replace(/[^0-9a-z가-힣]+/g, '')
    .trim()
}

function extractTitleNumbers(
  value?: string | null
): string[] {
  const normalized =
    normalizeCandidateMatchText(value)

  return Array.from(
    new Set(
      normalized.match(/\d+/g) ?? []
    )
  )
}

function isCandidateTitleMatch(
  candidateTitle: string,
  productTitle: string
): boolean {
  const candidate =
    normalizeCandidateMatchText(candidateTitle)

  const product =
    normalizeCandidateMatchText(productTitle)

  if (!candidate || !product) {
    return false
  }

  const candidateNumbers =
    extractTitleNumbers(candidateTitle)

  const productNumbers =
    extractTitleNumbers(productTitle)

  // 후보에 작품 번호가 있으면 상품명에도 같은 번호가 반드시 있어야 함
  for (const number of candidateNumbers) {
    if (!productNumbers.includes(number)) {
      return false
    }
  }

  // 숫자를 제외한 핵심 제목 비교
  const candidateCore =
    candidate.replace(/\d+/g, '')

  const productCore =
    product.replace(/\d+/g, '')

  if (
    candidateCore.length < 2 ||
    productCore.length < 2
  ) {
    return false
  }

  // 완전 정규화 제목 포함
  if (product.includes(candidate)) {
    return true
  }

  // 작품 번호는 위에서 별도 검사했으므로 핵심 제목 포함으로 한 번 더 검사
  return productCore.includes(candidateCore)
}

function uniqueProductTitles(
  prices: any[],
  limit = 5
): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const price of prices) {
    const title =
      String(price?.title ?? '').trim()

    if (!title) continue

    const key =
      normalizeCandidateMatchText(title)

    if (!key || seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(title)

    if (result.length >= limit) {
      break
    }
  }

  return result
}



function normalizeSwitchPolicy(value?: string | null): string {
  const policy = String(value ?? '')
    .trim()
    .toLowerCase()

  if (policy === 's1' || policy === 's2') {
    return policy
  }

  return ''
}

function normalizePlatform(value?: string | null): string {
  const platform = String(value ?? '')
    .trim()
    .toLowerCase()

  const allowed = new Set([
    'pc',
    'ps5',
    'ps4',
    'xbox',
    'switch',
    'switch2',
    'etc',
  ])

  return allowed.has(platform)
    ? platform
    : 'switch'
}

function platformSearchWord(platform: string): string {
  const words: Record<string, string> = {
    pc: 'PC',
    ps5: 'PS5',
    ps4: 'PS4',
    xbox: 'XBOX',
    switch: '닌텐도 스위치',
    switch2: '닌텐도 스위치2',
    etc: '',
  }

  return words[platform] ?? ''
}

function parseImportGroup(raw: any): ImportGroup | null {
  const name = String(raw?.name ?? raw?.title ?? '').trim()

  if (!name) {
    return null
  }

  let searchQuery = String(
    raw?.searchQuery ??
    raw?.search_query ??
    raw?.query ??
    ''
  ).trim()

  if (
    !searchQuery &&
    Array.isArray(raw?.aliases) &&
    raw.aliases.length
  ) {
    searchQuery = String(raw.aliases[0] ?? '').trim()
  }

  const keywords = Array.isArray(raw?.keywords)
    ? Array.from(
        new Set(
          raw.keywords
            .map((item: any) => String(item).trim())
            .filter(Boolean)
        )
      )
    : parseKeywordList(raw?.keywords)

  const rawExclude =
    raw?.exclude ??
    raw?.excludeKeywords ??
    raw?.exclude_keywords ??
    ''

  const exclude = Array.isArray(rawExclude)
    ? Array.from(
        new Set(
          rawExclude
            .map((item: any) => String(item).trim())
            .filter(Boolean)
        )
      )
    : parseKeywordList(rawExclude)

  const imageUrl = String(
    raw?.imageUrl ??
    raw?.image_url ??
    raw?.image ??
    ''
  ).trim()

  const switchPolicy = normalizeSwitchPolicy(
    raw?.switchPolicy ??
    raw?.switch_policy
  )

  return {
    name,
    searchQuery: searchQuery || name,
    keywords,
    exclude,
    imageUrl,
    switchPolicy,
  }
}

function mergeLowestByMall(
  buckets: PlatformBucket[]
): PlatformBucket[] {
  const order = [
    'pc',
    'ps5',
    'ps4',
    'xbox',
    'switch',
    'switch2',
    'etc',
  ]

  return buckets
    .map((bucket) => {
      const byMall = new Map<string, any>()

      for (const price of bucket.prices ?? []) {
        const key =
          `${price.mallName}|${price.isDigital}`

        const existing = byMall.get(key)

        if (
          !existing ||
          Number(price.price) < Number(existing.price)
        ) {
          byMall.set(key, price)
        }
      }

      const prices = Array.from(byMall.values())
        .sort(
          (a, b) =>
            Number(a.price) - Number(b.price)
        )

      return {
        platform: bucket.platform,
        prices,
        count: bucket.count ?? prices.length,
        lowest:
          prices.length > 0
            ? Number(prices[0].price)
            : null,
      }
    })
    .sort(
      (a, b) =>
        order.indexOf(a.platform) -
        order.indexOf(b.platform)
    )
}

function applySwitchPolicy(
  buckets: PlatformBucket[],
  switchPolicy: string
): PlatformBucket[] {
  const result = mergeLowestByMall(buckets)

  if (
    switchPolicy !== 's1' &&
    switchPolicy !== 's2'
  ) {
    return result
  }

  const sourcePlatform =
    switchPolicy === 's2'
      ? 'switch'
      : 'switch2'

  const targetPlatform =
    switchPolicy === 's2'
      ? 'switch2'
      : 'switch'

  const source = result.find(
    (bucket) =>
      bucket.platform === sourcePlatform
  )

  let target = result.find(
    (bucket) =>
      bucket.platform === targetPlatform
  )

  if (source) {
    if (!target) {
      target = {
        platform: targetPlatform,
        prices: [],
        count: 0,
        lowest: null,
      }

      result.push(target)
    }

    const priceMap = new Map<string, any>()

    for (const price of target.prices ?? []) {
      const key =
        `${price.mallName}|${price.isDigital}`

      priceMap.set(key, price)
    }

    for (const price of source.prices ?? []) {
      const key =
        `${price.mallName}|${price.isDigital}`

      const existing = priceMap.get(key)

      if (
        !existing ||
        Number(price.price) < Number(existing.price)
      ) {
        priceMap.set(key, price)
      }
    }

    target.prices = Array.from(priceMap.values())
      .sort(
        (a, b) =>
          Number(a.price) - Number(b.price)
      )

    target.count = target.prices.length
    target.lowest =
      target.prices.length > 0
        ? Number(target.prices[0].price)
        : null
  }

  return mergeLowestByMall(
    result.filter(
      (bucket) =>
        bucket.platform !== sourcePlatform
    )
  )
}

async function loadCustomFilters(
  db: D1Database
): Promise<CustomFilters> {
  try {
    const settings = await getAllSettings(db)

    return {
      blacklistKeywords: parseSettingList(
        settings.custom_blacklist_keywords
      ),
      blockedMalls: parseSettingList(
        settings.custom_blocked_malls
      ),
    }
  } catch (error) {
    console.error(
      '[admin] 사용자 필터 설정 조회 실패:',
      error
    )

    return {
      blacklistKeywords: [],
      blockedMalls: [],
    }
  }
}

function buildPlatformView(
  buckets: PlatformBucket[]
): Record<string, any> {
  const platforms: Record<string, any> = {}

  for (const bucket of buckets) {
    platforms[bucket.platform] = {
      label:
        PLATFORM_LABELS[bucket.platform] ??
        bucket.platform,
      count: bucket.count,
      lowest: bucket.lowest,
      malls: bucket.prices.map((price) => ({
        source: price.mallName,
        label: price.mallLabel,
        price: price.price,
      })),
    }
  }

  return platforms
}

function firstImage(
  buckets: PlatformBucket[]
): string | null {
  for (const bucket of buckets) {
    for (const price of bucket.prices ?? []) {
      if (price.image) {
        return price.image
      }
    }
  }

  return null
}

async function findExistingGame(
  db: D1Database,
  title: string
): Promise<{ id: number; title: string } | null> {
  const exact = await findGameByTitle(db, title)

  if (exact) {
    return {
      id: exact.id,
      title: exact.title,
    }
  }

  const normalized = normalizeTitle(title)

  if (!normalized) {
    return null
  }

  const { results } = await db
    .prepare(
      `SELECT id, title
       FROM games
       ORDER BY id DESC`
    )
    .all<{ id: number; title: string }>()

  for (const game of results ?? []) {
    if (
      normalizeTitle(game.title) === normalized
    ) {
      return game
    }
  }

  return null
}

function scoreCandidate(
  stores: number,
  totalProducts: number,
  spread: number,
  title: string,
  existing: boolean
): {
  score: number
  verdict: string
  reasons: string[]
} {
  if (existing) {
    return {
      score: 0,
      verdict: 'existing',
      reasons: ['이미 여누딜에 등록된 게임입니다.'],
    }
  }

  let score = 0
  const reasons: string[] = []

  if (stores >= 7) {
    score += 4
    reasons.push(`정상 판매처 ${stores}곳 +4`)
  } else if (stores >= 4) {
    score += 3
    reasons.push(`정상 판매처 ${stores}곳 +3`)
  } else if (stores >= 2) {
    score += 2
    reasons.push(`정상 판매처 ${stores}곳 +2`)
  } else if (stores === 1) {
    score += 1
    reasons.push('정상 판매처 1곳 +1')
  } else {
    reasons.push('정상 판매처를 찾지 못함')
  }

  if (totalProducts >= 8) {
    score += 2
    reasons.push(`정상 상품 ${totalProducts}개 +2`)
  } else if (totalProducts >= 3) {
    score += 1
    reasons.push(`정상 상품 ${totalProducts}개 +1`)
  }

  if (spread >= 20000) {
    score += 2
    reasons.push(`가격 차이 ${spread.toLocaleString('ko-KR')}원 +2`)
  } else if (spread >= 8000) {
    score += 1
    reasons.push(`가격 차이 ${spread.toLocaleString('ko-KR')}원 +1`)
  }

  const franchisePattern =
    /마리오|젤다|포켓몬|피크민|커비|동물의\s*숲|스플래툰|몬스터\s*헌터|파이널\s*판타지|드래곤\s*퀘스트|용과\s*같이|페르소나|바이오하자드|소닉|메트로이드|파이어\s*엠블렘|제노블레이드|다크\s*소울|엘든\s*링|콜\s*오브\s*듀티|어쌔신\s*크리드|스타워즈/i

  if (franchisePattern.test(title)) {
    score += 1
    reasons.push('주요 프랜차이즈 +1')
  }

  score = Math.min(10, score)

  let verdict = 'exclude'

  if (
    score >= 6 &&
    stores >= 3
  ) {
    verdict = 'recommend'
  } else if (
    score >= 3 &&
    stores >= 1
  ) {
    verdict = 'review'
  }

  if (verdict === 'recommend') {
    reasons.push('등록 추천 기준 충족')
  } else if (verdict === 'review') {
    reasons.push('사람의 추가 확인 권장')
  } else {
    reasons.push('현재 검색 결과로는 등록 우선순위가 낮음')
  }

  return {
    score,
    verdict,
    reasons,
  }
}

// ============================================================
// 관리자 콘솔 HTML
// ============================================================

admin.get('/', (c) => {
  return c.html(AdminPage())
})

// ============================================================
// 인증 미들웨어
// ============================================================

admin.use('/api/*', async (c, next) => {
  const expected =
    c.env.ADMIN_TOKEN ?? 'dev-token'

  const provided =
    c.req.header('X-Admin-Token') ?? ''

  if (provided !== expected) {
    return c.json(
      {
        ok: false,
        error:
          '인증 실패: 올바른 관리자 토큰이 필요합니다.',
      },
      401
    )
  }

  await next()
})

// 기존 /admin/games, /admin/editions API 인증
admin.use('*', async (c, next) => {
  const path = c.req.path

  if (
    path === '/admin' ||
    path === '/admin/' ||
    path.startsWith('/admin/api/')
  ) {
    return next()
  }

  const expected =
    c.env.ADMIN_TOKEN ?? 'dev-token'

  const provided =
    c.req.header('X-Admin-Token') ?? ''

  if (provided !== expected) {
    return c.json(
      {
        ok: false,
        error:
          '인증 실패: 올바른 X-Admin-Token 헤더가 필요합니다.',
      },
      401
    )
  }

  await next()
})

// ============================================================
// 인증 확인
// ============================================================

admin.get('/api/verify', (c) => {
  return c.json({
    ok: true,
  })
})

admin.post('/api/verify', (c) => {
  return c.json({
    ok: true,
  })
})

// ============================================================
// 현황
// ============================================================

admin.get('/api/dashboard', async (c) => {
  try {
    const gameRow = await c.env.DB
      .prepare(
        `SELECT COUNT(*) AS count
         FROM games`
      )
      .first<{ count: number }>()

    const editionRow = await c.env.DB
      .prepare(
        `SELECT COUNT(*) AS count
         FROM editions`
      )
      .first<{ count: number }>()

    return c.json({
      ok: true,
      gameCount:
        Number(gameRow?.count ?? 0),
      editionCount:
        Number(editionRow?.count ?? 0),
    })
  } catch (error: any) {
    return c.json(
      {
        ok: false,
        error:
          `현황 조회 실패: ${error.message}`,
      },
      500
    )
  }
})

// ============================================================
// 관리자 설정
// ============================================================

admin.get('/api/settings', async (c) => {
  try {
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
  } catch (error: any) {
    return c.json(
      {
        ok: false,
        error:
          `설정 조회 실패: ${error.message}`,
      },
      500
    )
  }
})

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
          String(body[key] ?? '').trim()
        )
      }
    }

    return c.json({
      ok: true,
      message: '관리자 설정을 저장했습니다.',
    })
  } catch (error: any) {
    return c.json(
      {
        ok: false,
        error:
          `설정 저장 실패: ${error.message}`,
      },
      500
    )
  }
})

// ============================================================
// 후보 평가
// ============================================================

admin.post(
  '/api/candidates/evaluate',
  async (c) => {
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

    const title =
      String(body.title ?? '').trim()

    const platform =
      normalizePlatform(body.platform)

    const year =
      body.year
        ? String(body.year).trim()
        : ''

    if (!title) {
      return c.json(
        {
          ok: false,
          error: '후보 게임명이 필요합니다.',
        },
        400
      )
    }

    if (title.length > 150) {
      return c.json(
        {
          ok: false,
          error:
            '게임명이 너무 깁니다. 150자 이하로 입력하세요.',
        },
        400
      )
    }

    try {
      const existing =
        await findExistingGame(
          c.env.DB,
          title
        )

      if (existing) {
        return c.json({
          ok: true,
          result: {
            title,
            platform,
            year,
            existing: true,
            existingGameId: existing.id,
            existingTitle: existing.title,
            score: 0,
            verdict: 'existing',
            reasons: [
              `이미 등록됨: ${existing.title}`,
            ],
            stores: 0,
            lowest: null,
            highest: null,
            spread: null,
            totalProducts: 0,
            imageUrl: '',
            keywords: '',
            excludeKeywords: '',
            switchPolicy:
              platform === 'switch2'
                ? 's2'
                : platform === 'switch'
                  ? 's1'
                  : '',
          },
        })
      }

      const customFilters =
        await loadCustomFilters(c.env.DB)

      const platformWord =
        platformSearchWord(platform)

      const query =
        platformWord &&
        !normalizeTitle(title).includes(
          normalizeTitle(platformWord)
        )
          ? `${title} ${platformWord}`
          : title

      const switchPolicy =
        platform === 'switch2'
          ? 's2'
          : platform === 'switch'
            ? 's1'
            : ''

      const classified =
        await searchAndClassify(
          clientId,
          clientSecret,
          query,
          [],
          [],
          switchPolicy || null,
          1,
          customFilters
        )

      const buckets =
        applySwitchPolicy(
          classified.buckets,
          switchPolicy
        )

      const bucket =
        buckets.find(
          (item) =>
            item.platform === platform
        ) ?? null

            const platformPrices =
        bucket?.prices ?? []

      // 요청한 작품명과 작품 번호가 일치하는 상품만 점수 계산에 사용
      const matchedPrices =
        platformPrices.filter(
          (price) =>
            isCandidateTitleMatch(
              title,
              String(price.title ?? '')
            )
        )

      const mismatchedPrices =
        platformPrices.filter(
          (price) =>
            !isCandidateTitleMatch(
              title,
              String(price.title ?? '')
            )
        )

      const numericPrices =
        matchedPrices
          .map((price) =>
            Number(price.price)
          )
          .filter(
            (price) =>
              Number.isFinite(price) &&
              price > 0
          )

      const lowest =
        numericPrices.length > 0
          ? Math.min(...numericPrices)
          : null

      const highest =
        numericPrices.length > 0
          ? Math.max(...numericPrices)
          : null

      const spread =
        lowest !== null &&
        highest !== null
          ? Math.max(
              0,
              highest - lowest
            )
          : 0

      const stores =
        new Set(
          matchedPrices.map(
            (price) =>
              `${price.mallName}|${price.isDigital}`
          )
        ).size

      const matchedProducts =
        matchedPrices.length

      const mismatchedProducts =
        mismatchedPrices.length

      const totalPlatformProducts =
        platformPrices.length

      const matchRate =
        totalPlatformProducts > 0
          ? Math.round(
              (
                matchedProducts /
                totalPlatformProducts
              ) * 100
            )
          : 0

      let assessment:
        {
          score: number
          verdict: string
          reasons: string[]
        }

      if (matchedProducts === 0) {
        assessment = {
          score: 0,
          verdict: 'exclude',
          reasons: [
            '요청한 게임명과 작품 번호가 일치하는 상품을 찾지 못함',
            mismatchedProducts > 0
              ? `다른 작품 또는 오검색 상품 ${mismatchedProducts}개 제외`
              : '요청 플랫폼의 정상 상품을 찾지 못함',
            '기준연도는 참고값이며 이 판정에 사용하지 않음',
          ],
        }
      } else {
        assessment =
          scoreCandidate(
            stores,
            matchedProducts,
            spread,
            title,
            false
          )

        assessment.reasons.unshift(
          `제목·숫자 일치 상품 ${matchedProducts}개`
        )

        if (mismatchedProducts > 0) {
          assessment.reasons.push(
            `다른 작품 또는 오검색 상품 ${mismatchedProducts}개 제외`
          )
        }

        assessment.reasons.push(
          `제목 일치 비율 ${matchRate}%`
        )

        assessment.reasons.push(
          '기준연도는 참고값이며 판정에 사용하지 않음'
        )

        // 일치 비율이 지나치게 낮으면 자동 추천하지 않고 검토로 낮춤
        if (
          assessment.verdict === 'recommend' &&
          matchRate < 50
        ) {
          assessment.verdict = 'review'
          assessment.score =
            Math.min(
              assessment.score,
              5
            )

          assessment.reasons.push(
            '오검색 비율이 높아 자동 추천 대신 검토로 변경'
          )
        }
      }

      const image =
        matchedPrices.find(
          (price) => price.image
        )?.image ??
        platformPrices.find(
          (price) => price.image
        )?.image ??
        ''

     

      return c.json({
        ok: true,
        result: {
          title,
          platform,
          year,
          yearIsReference: true,
          existing: false,
          score: assessment.score,
          verdict: assessment.verdict,
          reasons: assessment.reasons,
          stores,
          lowest,
          highest,
          spread,
          // 점수 계산에 실제 사용한 제목 일치 상품 수
          totalProducts:
            matchedProducts,

          matchedProducts,
          mismatchedProducts,
          totalPlatformProducts,
          matchRate,

          matchedProductTitles:
            uniqueProductTitles(
              matchedPrices
            ),

          mismatchedProductTitles:
            uniqueProductTitles(
              mismatchedPrices
            ),

          totalSearchItems:
            classified.totalItems,
          totalSearchItems:
            classified.totalItems,
          skipped:
            classified.skipped,
          imageUrl: image,
          searchQuery: title,
          keywords: '',
          excludeKeywords: '',
          switchPolicy,
        },
      })
    } catch (error: any) {
      return c.json(
        {
          ok: false,
          error:
            `후보 평가 실패: ${error.message}`,
        },
        500
      )
    }
  }
)

// ============================================================
// 자동 가져오기 공통 처리
// ============================================================

async function processImport(
  c: any,
  dryRun: boolean
) {
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

  const rawGroups =
    Array.isArray(body.groups)
      ? body.groups
      : []

  const groups = rawGroups
    .map(parseImportGroup)
    .filter(
      (
        group
      ): group is ImportGroup =>
        group !== null
    )

  if (!groups.length) {
    return c.json(
      {
        ok: false,
        error:
          '가져올 게임을 한 개 이상 입력하세요.',
      },
      400
    )
  }

  const customFilters =
    await loadCustomFilters(c.env.DB)

  const results: any[] = []

  for (const group of groups) {
    try {
      const classified =
        await searchAndClassify(
          clientId,
          clientSecret,
          group.searchQuery,
          group.keywords,
          group.exclude,
          group.switchPolicy || null,
          1,
          customFilters
        )

      const buckets =
        applySwitchPolicy(
          classified.buckets,
          group.switchPolicy
        )

      const chosenImage =
        group.imageUrl ||
        firstImage(buckets)

      const existing =
        await findExistingGame(
          c.env.DB,
          group.name
        )

      const resultEntry: any = {
        title: group.name,
        query: group.searchQuery,
        image: chosenImage,
        existing: Boolean(existing),
        platforms:
          buildPlatformView(buckets),
        totalItems:
          classified.totalItems,
        skipped:
          classified.skipped,
        saved: null,
      }

      if (dryRun) {
        results.push(resultEntry)
        continue
      }

      if (!buckets.length) {
        results.push({
          ...resultEntry,
          error:
            '게임 본품 가격을 찾지 못해 저장하지 않았습니다.',
        })

        continue
      }

      let gameId: number

      if (existing) {
        gameId = existing.id

        if (group.imageUrl) {
          await c.env.DB
            .prepare(
              `UPDATE games
               SET image_url = ?
               WHERE id = ?`
            )
            .bind(
              group.imageUrl,
              gameId
            )
            .run()
        }
      } else {
        const inserted =
          await insertGame(
            c.env.DB,
            {
              title: group.name,
              image_url:
                chosenImage || null,
            }
          )

        gameId = Number(
          inserted.meta.last_row_id
        )
      }

      const policyValue =
        group.switchPolicy ||
        null

      await c.env.DB
        .prepare(
          `UPDATE games
           SET switch_policy = ?
           WHERE id = ?`
        )
        .bind(
          policyValue,
          gameId
        )
        .run()

      const keywordsString =
        group.keywords.length
          ? group.keywords.join(',')
          : null

      const excludeString =
        group.exclude.length
          ? group.exclude.join(',')
          : null

      const saved:
        Record<string, number> = {}

      for (const bucket of buckets) {
        let edition =
          await findEdition(
            c.env.DB,
            gameId,
            bucket.platform
          )

        let editionId: number

        const platformLabel =
          PLATFORM_LABELS[bucket.platform] ??
          bucket.platform.toUpperCase()

        if (edition) {
          editionId = edition.id

          await c.env.DB
            .prepare(
              `UPDATE editions
               SET search_query = ?,
                   keywords = ?,
                   exclude_keywords = ?
               WHERE id = ?`
            )
            .bind(
              `${group.name} ${platformLabel}`,
              keywordsString,
              excludeString,
              editionId
            )
            .run()
        } else {
          const insertedEdition =
            await insertEdition(
              c.env.DB,
              {
                game_id: gameId,
                platform:
                  bucket.platform,
                edition_name:
                  `${platformLabel}판`,
                search_query:
                  `${group.name} ${platformLabel}`,
                keywords:
                  keywordsString,
                exclude_keywords:
                  excludeString,
              }
            )

          editionId = Number(
            insertedEdition.meta.last_row_id
          )
        }

        await c.env.DB
          .prepare(
            `DELETE FROM prices
             WHERE edition_id = ?`
          )
          .bind(editionId)
          .run()

        let savedCount = 0

        for (const price of bucket.prices) {
          await insertPrice(
            c.env.DB,
            {
              edition_id: editionId,
              source: price.mallName,
              price: Number(price.price),
              currency: 'KRW',
              is_digital:
                Number(price.isDigital ?? 0),
              product_url:
                price.link || null,
              mall_label:
                price.mallLabel || null,
              title:
                price.title || null,
            }
          )

          savedCount += 1
        }

        saved[bucket.platform] =
          savedCount
      }

      resultEntry.game_id = gameId
      resultEntry.saved = saved

      results.push(resultEntry)
    } catch (error: any) {
      results.push({
        title: group.name,
        error: error.message,
      })
    }
  }

  return c.json({
    ok: true,
    dryRun,
    count: results.length,
    results,
  })
}

admin.post(
  '/api/import/preview',
  async (c) => {
    return processImport(c, true)
  }
)

admin.post(
  '/api/import/run',
  async (c) => {
    return processImport(c, false)
  }
)

// 기존 자동 가져오기 API 호환
admin.post(
  '/api/auto-import',
  async (c) => {
    let clonedBody: any

    try {
      clonedBody = await c.req.json()
    } catch {
      return c.json(
        {
          ok: false,
          error: '올바른 JSON이 아닙니다.',
        },
        400
      )
    }

    const dryRun =
      clonedBody.dryRun !== false

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

    const rawGroups =
      Array.isArray(clonedBody.groups)
        ? clonedBody.groups
        : []

    const groups = rawGroups
      .map((raw: any) => {
        if (
          !raw.searchQuery &&
          Array.isArray(raw.aliases) &&
          raw.aliases.length
        ) {
          raw.searchQuery =
            raw.aliases[0]
        }

        return parseImportGroup(raw)
      })
      .filter(
        (
          group: ImportGroup | null
        ): group is ImportGroup =>
          group !== null
      )

    if (!groups.length) {
      return c.json(
        {
          ok: false,
          error:
            '가져올 게임을 한 개 이상 입력하세요.',
        },
        400
      )
    }

    const customFilters =
      await loadCustomFilters(c.env.DB)

    const results: any[] = []

    for (const group of groups) {
      try {
        const classified =
          await searchAndClassify(
            clientId,
            clientSecret,
            group.searchQuery,
            group.keywords,
            group.exclude,
            group.switchPolicy || null,
            1,
            customFilters
          )

        const buckets =
          applySwitchPolicy(
            classified.buckets,
            group.switchPolicy
          )

        const image =
          group.imageUrl ||
          firstImage(buckets)

        const entry: any = {
          title: group.name,
          image,
          platforms:
            buildPlatformView(buckets),
          skipped:
            classified.skipped,
          totalItems:
            classified.totalItems,
          saved: null,
        }

        if (
          !dryRun &&
          buckets.length
        ) {
          let game =
            await findGameByTitle(
              c.env.DB,
              group.name
            )

          let gameId: number

          if (game) {
            gameId = game.id
          } else {
            const inserted =
              await insertGame(
                c.env.DB,
                {
                  title: group.name,
                  image_url:
                    image || null,
                }
              )

            gameId = Number(
              inserted.meta.last_row_id
            )
          }

          await c.env.DB
            .prepare(
              `UPDATE games
               SET switch_policy = ?
               WHERE id = ?`
            )
            .bind(
              group.switchPolicy || null,
              gameId
            )
            .run()

          const saved:
            Record<string, number> = {}

          for (const bucket of buckets) {
            let edition =
              await findEdition(
                c.env.DB,
                gameId,
                bucket.platform
              )

            let editionId: number

            if (edition) {
              editionId = edition.id
            } else {
              const label =
                PLATFORM_LABELS[
                  bucket.platform
                ] ??
                bucket.platform.toUpperCase()

              const inserted =
                await insertEdition(
                  c.env.DB,
                  {
                    game_id: gameId,
                    platform:
                      bucket.platform,
                    edition_name:
                      `${label}판`,
                    search_query:
                      `${group.name} ${label}`,
                    keywords:
                      group.keywords.join(',') ||
                      null,
                    exclude_keywords:
                      group.exclude.join(',') ||
                      null,
                  }
                )

              editionId = Number(
                inserted.meta.last_row_id
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

            for (const price of bucket.prices) {
              await insertPrice(
                c.env.DB,
                {
                  edition_id: editionId,
                  source:
                    price.mallName,
                  price:
                    Number(price.price),
                  currency: 'KRW',
                  is_digital:
                    Number(
                      price.isDigital ?? 0
                    ),
                  product_url:
                    price.link || null,
                  mall_label:
                    price.mallLabel || null,
                  title:
                    price.title || null,
                }
              )

              count += 1
            }

            saved[bucket.platform] =
              count
          }

          entry.game_id = gameId
          entry.saved = saved
        }

        results.push(entry)
      } catch (error: any) {
        results.push({
          title: group.name,
          error: error.message,
        })
      }
    }

    return c.json({
      ok: true,
      dryRun,
      count: results.length,
      results,
    })
  }
)

// ============================================================
// 등록 게임 목록
// ============================================================

admin.get('/api/games', async (c) => {
  try {
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
             FROM editions ec
             WHERE ec.game_id = g.id
           ) AS edition_count,
           (
             SELECT GROUP_CONCAT(platform)
             FROM (
               SELECT DISTINCT e2.platform AS platform
               FROM editions e2
               WHERE e2.game_id = g.id
               ORDER BY e2.platform
             )
           ) AS platforms,
           (
             SELECT e3.search_query
             FROM editions e3
             WHERE e3.game_id = g.id
             ORDER BY e3.id
             LIMIT 1
           ) AS search_query,
           (
             SELECT e4.keywords
             FROM editions e4
             WHERE e4.game_id = g.id
               AND e4.keywords IS NOT NULL
               AND e4.keywords != ''
             ORDER BY e4.id
             LIMIT 1
           ) AS keywords,
           (
             SELECT e5.exclude_keywords
             FROM editions e5
             WHERE e5.game_id = g.id
               AND e5.exclude_keywords IS NOT NULL
               AND e5.exclude_keywords != ''
             ORDER BY e5.id
             LIMIT 1
           ) AS exclude_keywords
         FROM games g
         ORDER BY g.id DESC`
      )
      .all<GameListRow>()

    const games =
      (results ?? []).map((game) => ({
        id: game.id,
        title: game.title,
        imageUrl:
          game.image_url ?? '',
        image_url:
          game.image_url ?? '',
        switchPolicy:
          game.switch_policy ?? '',
        switch_policy:
          game.switch_policy ?? '',
        createdAt:
          game.created_at,
        editionCount:
          Number(game.edition_count ?? 0),
        platforms:
          String(game.platforms ?? '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        searchQuery:
          game.search_query ?? '',
        search_query:
          game.search_query ?? '',
        keywords:
          game.keywords ?? '',
        excludeKeywords:
          game.exclude_keywords ?? '',
        exclude_keywords:
          game.exclude_keywords ?? '',
      }))

    return c.json({
      ok: true,
      games,
    })
  } catch (error: any) {
    return c.json(
      {
        ok: false,
        error:
          `게임 목록 조회 실패: ${error.message}`,
      },
      500
    )
  }
})

// ============================================================
// 게임 삭제
// ============================================================

admin.delete(
  '/api/games/:id',
  async (c) => {
    const gameId =
      Number(c.req.param('id'))

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error: '잘못된 게임 ID입니다.',
        },
        400
      )
    }

    try {
      const { results } =
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
          results ?? []
      ) {
        await c.env.DB
          .prepare(
            `DELETE FROM price_log
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

        await c.env.DB
          .prepare(
            `DELETE FROM prices
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
    } catch (error: any) {
      return c.json(
        {
          ok: false,
          error:
            `게임 삭제 실패: ${error.message}`,
        },
        500
      )
    }
  }
)

// ============================================================
// 전체 데이터 초기화
// ============================================================

admin.post('/api/reset', async (c) => {
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

  if (
    body.confirmation !==
    '전체 데이터 삭제'
  ) {
    return c.json(
      {
        ok: false,
        error:
          '초기화 확인 문장이 일치하지 않습니다.',
      },
      400
    )
  }

  try {
    await c.env.DB
      .prepare('DELETE FROM price_log')
      .run()

    await c.env.DB
      .prepare('DELETE FROM price_history')
      .run()

    await c.env.DB
      .prepare('DELETE FROM prices')
      .run()

    await c.env.DB
      .prepare('DELETE FROM editions')
      .run()

    await c.env.DB
      .prepare('DELETE FROM games')
      .run()

    return c.json({
      ok: true,
      message:
        '모든 게임 데이터를 초기화했습니다.',
    })
  } catch (error: any) {
    return c.json(
      {
        ok: false,
        error:
          `데이터 초기화 실패: ${error.message}`,
      },
      500
    )
  }
})

// ============================================================
// 기존 수동 게임 등록 API
// ============================================================

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

  const title =
    String(body.title ?? '').trim()

  if (!title) {
    return c.json(
      {
        ok: false,
        error: '게임 제목은 필수입니다.',
      },
      400
    )
  }

  try {
    const existing =
      await findGameByTitle(
        c.env.DB,
        title
      )

    if (existing) {
      return c.json(
        {
          ok: false,
          error:
            '이미 같은 제목의 게임이 등록되어 있습니다.',
        },
        409
      )
    }

    const result =
      await insertGame(
        c.env.DB,
        {
          title,
          image_url:
            body.image_url ?? null,
          release_date:
            body.release_date ?? null,
          original_price:
            body.original_price ?? null,
        }
      )

    return c.json({
      ok: true,
      game_id:
        result.meta.last_row_id,
      message:
        `'${title}' 게임을 등록했습니다.`,
    })
  } catch (error: any) {
    return c.json(
      {
        ok: false,
        error:
          `게임 등록 실패: ${error.message}`,
      },
      500
    )
  }
})

// ============================================================
// 기존 에디션 등록 API
// ============================================================

admin.post(
  '/games/:id/editions',
  async (c) => {
    const gameId =
      Number(c.req.param('id'))

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error: '잘못된 게임 ID입니다.',
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

    const platform =
      normalizePlatform(body.platform)

    try {
      const existing =
        await findEdition(
          c.env.DB,
          gameId,
          platform
        )

      if (existing) {
        return c.json(
          {
            ok: false,
            error:
              '해당 플랫폼 에디션이 이미 있습니다.',
          },
          409
        )
      }

      const result =
        await insertEdition(
          c.env.DB,
          {
            game_id: gameId,
            platform,
            edition_name:
              body.edition_name ?? null,
            search_query:
              body.search_query ?? null,
            keywords:
              body.keywords ?? null,
            exclude_keywords:
              body.exclude_keywords ?? null,
            steam_appid:
              body.steam_appid ?? null,
          }
        )

      return c.json({
        ok: true,
        edition_id:
          result.meta.last_row_id,
        message:
          '에디션을 추가했습니다.',
      })
    } catch (error: any) {
      return c.json(
        {
          ok: false,
          error:
            `에디션 등록 실패: ${error.message}`,
        },
        500
      )
    }
  }
)

// ============================================================
// 기존 에디션 수정 API
// ============================================================

admin.patch(
  '/editions/:id',
  async (c) => {
    const editionId =
      Number(c.req.param('id'))

    if (
      !Number.isInteger(editionId) ||
      editionId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error:
            '잘못된 에디션 ID입니다.',
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

    const allowed = [
      'platform',
      'edition_name',
      'search_query',
      'keywords',
      'exclude_keywords',
      'steam_appid',
    ]

    const fields: string[] = []
    const values: any[] = []

    for (const key of allowed) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(body[key])
      }
    }

    if (!fields.length) {
      return c.json(
        {
          ok: false,
          error: '수정할 값이 없습니다.',
        },
        400
      )
    }

    values.push(editionId)

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
        message:
          '에디션 정보를 수정했습니다.',
      })
    } catch (error: any) {
      return c.json(
        {
          ok: false,
          error:
            `에디션 수정 실패: ${error.message}`,
        },
        500
      )
    }
  }
)

// ============================================================
// 기존 가격 수동 등록 API
// ============================================================

admin.post(
  '/editions/:id/prices',
  async (c) => {
    const editionId =
      Number(c.req.param('id'))

    if (
      !Number.isInteger(editionId) ||
      editionId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error:
            '잘못된 에디션 ID입니다.',
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

    if (
      !body.source ||
      body.price === undefined
    ) {
      return c.json(
        {
          ok: false,
          error:
            'source와 price가 필요합니다.',
        },
        400
      )
    }

    try {
      const result =
        await insertPrice(
          c.env.DB,
          {
            edition_id: editionId,
            source:
              String(body.source),
            price:
              Number(body.price),
            currency:
              body.currency ?? 'KRW',
            is_digital:
              Number(
                body.is_digital ?? 1
              ),
            product_url:
              body.product_url ?? null,
            mall_label:
              body.mall_label ?? null,
            title:
              body.title ?? null,
          }
        )

      return c.json({
        ok: true,
        price_id:
          result.meta.last_row_id,
        message:
          '가격을 추가했습니다.',
      })
    } catch (error: any) {
      return c.json(
        {
          ok: false,
          error:
            `가격 등록 실패: ${error.message}`,
        },
        500
      )
    }
  }
)

// ============================================================
// 기존 네이버 가격 수집 API
// ============================================================

admin.post(
  '/editions/:id/fetch-prices',
  async (c) => {
    const editionId =
      Number(c.req.param('id'))

    if (
      !Number.isInteger(editionId) ||
      editionId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error:
            '잘못된 에디션 ID입니다.',
        },
        400
      )
    }

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

    const edition =
      await getEditionById(
        c.env.DB,
        editionId
      )

    if (!edition) {
      return c.json(
        {
          ok: false,
          error:
            '에디션을 찾을 수 없습니다.',
        },
        404
      )
    }

    if (!edition.search_query) {
      return c.json(
        {
          ok: false,
          error:
            '에디션에 검색어가 설정되지 않았습니다.',
        },
        400
      )
    }

    try {
      const game =
        await c.env.DB
          .prepare(
            `SELECT switch_policy
             FROM games
             WHERE id = ?`
          )
          .bind(edition.game_id)
          .first<{
            switch_policy:
              string | null
          }>()

      const customFilters =
        await loadCustomFilters(c.env.DB)

      const classified =
        await searchAndClassify(
          clientId,
          clientSecret,
          edition.search_query,
          parseKeywordList(
            edition.keywords
          ),
          parseKeywordList(
            edition.exclude_keywords
          ),
          game?.switch_policy ?? null,
          1,
          customFilters
        )

      const buckets =
        applySwitchPolicy(
          classified.buckets,
          game?.switch_policy ?? ''
        )

      const bucket =
        buckets.find(
          (item) =>
            item.platform ===
            edition.platform
        )

      const prices =
        bucket?.prices ?? []

      if (!prices.length) {
        return c.json({
          ok: true,
          found: 0,
          saved: 0,
          message:
            '게임 본품 가격을 찾지 못했습니다.',
        })
      }

      await c.env.DB
        .prepare(
          `DELETE FROM prices
           WHERE edition_id = ?`
        )
        .bind(editionId)
        .run()

      let saved = 0

      for (const price of prices) {
        await insertPrice(
          c.env.DB,
          {
            edition_id: editionId,
            source:
              price.mallName,
            price:
              Number(price.price),
            currency: 'KRW',
            is_digital:
              Number(
                price.isDigital ?? 0
              ),
            product_url:
              price.link || null,
            mall_label:
              price.mallLabel || null,
            title:
              price.title || null,
          }
        )

        saved += 1
      }

      return c.json({
        ok: true,
        query:
          edition.search_query,
        found:
          prices.length,
        saved,
        message:
          `패키지 가격 ${saved}건을 수집했습니다.`,
      })
    } catch (error: any) {
      return c.json(
        {
          ok: false,
          error:
            `가격 수집 실패: ${error.message}`,
        },
        500
      )
    }
  }
)

export default admin
