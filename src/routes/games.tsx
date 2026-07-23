// ==============================================================
// 공개 페이지 라우트
// src/routes/games.tsx
//   GET /games                    - 플랫폼 탭 + 게임 목록
//   GET /games?platform=ps5       - 특정 플랫폼 목록
//   GET /games/deals              - 오늘의 특가
//   GET /games/:gameId            - 첫 번째 플랫폼 상세로 이동
//   GET /games/:gameId/:platform  - 특정 플랫폼 가격 상세
// ==============================================================

import { Hono } from 'hono'
import type {
  Bindings,
  Price,
  PriceHistory,
  Edition,
} from '../types'
import {
  SOURCE_LABELS,
  PLATFORMS,
  PLATFORM_LABELS,
  PLATFORM_ICONS,
} from '../types'
import {
  getGameById,
  getCurrentPrices,
  getPriceHistory,
  listGamesByPlatform,
  listEditionsByGame,
  searchGamesAllPlatforms,
  getTopDiscounts,
  getLastUpdated,
  getTrackingCounts,
} from '../db'

const games = new Hono<{ Bindings: Bindings }>()

type GameSort =
  | 'recent'
  | 'name'
  | 'price_asc'
  | 'price_desc'

const GAMES_PER_PAGE = 24

function normalizePage(
  value: string | undefined
): number {
  if (!value) return 1

  const parsed = Number(value)

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    return 1
  }

  return parsed
}

function buildGamesListHref({
  platform,
  query,
  sort,
  page,
}: {
  platform: string
  query: string
  sort: GameSort
  page: number
}): string {
  const params = new URLSearchParams()

  params.set('platform', platform)

  if (query) {
    params.set('q', query)
  }

  if (sort !== 'recent') {
    params.set('sort', sort)
  }

  if (page > 1) {
    params.set('page', String(page))
  }

  return `/games?${params.toString()}`
}

function paginationSequence(
  currentPage: number,
  totalPages: number
): Array<number | 'ellipsis'> {
  // 7페이지 이하는 모든 페이지 번호 표시
  if (totalPages <= 7) {
    return Array.from(
      { length: totalPages },
      (_, index) => index + 1
    )
  }

  const visiblePages: number[] = []

  for (
    let page = 1;
    page <= totalPages;
    page += 1
  ) {
    const shouldShow =
      page === 1 ||
      page === totalPages ||
      Math.abs(page - currentPage) <= 1

    if (shouldShow) {
      visiblePages.push(page)
    }
  }

  const sequence: Array<
    number | 'ellipsis'
  > = []

  let previousPage = 0

  for (const page of visiblePages) {
    if (
      previousPage > 0 &&
      page - previousPage > 1
    ) {
      sequence.push('ellipsis')
    }

    sequence.push(page)
    previousPage = page
  }

  return sequence
}


function Pagination({
  platform,
  query,
  sort,
  currentPage,
  totalPages,
}: {
  platform: string
  query: string
  sort: GameSort
  currentPage: number
  totalPages: number
}) {
  if (totalPages <= 1) {
    return null
  }

  const sequence = paginationSequence(
    currentPage,
    totalPages
  )

  const pageHref = (page: number) =>
    buildGamesListHref({
      platform,
      query,
      sort,
      page,
    })

  return (
    <nav
      class="pagination"
      aria-label="게임 목록 페이지"
    >
      {currentPage > 1 ? (
        <a
          href={pageHref(currentPage - 1)}
          class="pagination-link pagination-direction"
          rel="prev"
          aria-label="이전 페이지"
        >
          <span aria-hidden="true">←</span>
          <span class="pagination-label">
            이전
          </span>
        </a>
      ) : (
        <span
          class="pagination-disabled pagination-direction"
          aria-disabled="true"
        >
          <span aria-hidden="true">←</span>
          <span class="pagination-label">
            이전
          </span>
        </span>
      )}

      <div class="pagination-pages">
        {sequence.map((item) =>
          item === 'ellipsis' ? (
            <span
              class="pagination-ellipsis"
              aria-hidden="true"
            >
              …
            </span>
          ) : item === currentPage ? (
            <span
              class="pagination-current"
              aria-current="page"
            >
              {item}
            </span>
          ) : (
            <a
              href={pageHref(item)}
              class="pagination-link"
              aria-label={`${item}페이지로 이동`}
            >
              {item}
            </a>
          )
        )}
      </div>

      {currentPage < totalPages ? (
        <a
          href={pageHref(currentPage + 1)}
          class="pagination-link pagination-direction"
          rel="next"
          aria-label="다음 페이지"
        >
          <span class="pagination-label">
            다음
          </span>
          <span aria-hidden="true">→</span>
        </a>
      ) : (
        <span
          class="pagination-disabled pagination-direction"
          aria-disabled="true"
        >
          <span class="pagination-label">
            다음
          </span>
          <span aria-hidden="true">→</span>
        </span>
      )}
    </nav>
  )
}


function won(
  n: number | null | undefined
): string {
  if (n === null || n === undefined) {
    return '-'
  }

  return `₩${n.toLocaleString('ko-KR')}`
}

function discountRate(
  price: number,
  original: number | null
): number | null {
  if (
    !original ||
    original <= 0 ||
    price >= original
  ) {
    return null
  }

  return Math.round(
    (1 - price / original) * 100
  )
}

// 이번 주 최고가 대비 하락률
function weekDropPct(
  dropRate: number | null | undefined
): number | null {
  if (
    dropRate == null ||
    dropRate <= 0
  ) {
    return null
  }

  const pct = Math.round(dropRate * 100)

  return pct >= 2 ? pct : null
}

// UTC 문자열을 KST 표시 형식으로 변환
function toKstLabel(
  utc: string | null
): string {
  if (!utc) return ''

  const d = new Date(
    utc.replace(' ', 'T') + 'Z'
  )

  d.setHours(d.getHours() + 9)

  const p = (n: number) =>
    String(n).padStart(2, '0')

  return `${d.getFullYear()}-${p(
    d.getMonth() + 1
  )}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`
}

// 허용된 정렬값만 사용
function normalizeSort(
  value: string | undefined
): GameSort {
  switch (value) {
    case 'name':
    case 'price_asc':
    case 'price_desc':
      return value

    default:
      return 'recent'
  }
}

// 게임 목록 정렬
function sortGameList(
  items: any[],
  sort: GameSort
): any[] {
  const sorted = [...items]

  const compareTitle = (
    a: any,
    b: any
  ) =>
    String(a.title || '').localeCompare(
      String(b.title || ''),
      'ko',
      {
        numeric: true,
        sensitivity: 'base',
      }
    )

  const getPrice = (
    item: any
  ): number | null =>
    typeof item.lowest_price === 'number'
      ? item.lowest_price
      : null

  if (sort === 'name') {
    return sorted.sort(compareTitle)
  }

  if (sort === 'price_asc') {
    return sorted.sort((a, b) => {
      const aPrice = getPrice(a)
      const bPrice = getPrice(b)

      if (
        aPrice === null &&
        bPrice === null
      ) {
        return compareTitle(a, b)
      }

      if (aPrice === null) return 1
      if (bPrice === null) return -1

      return (
        aPrice - bPrice ||
        compareTitle(a, b)
      )
    })
  }

  if (sort === 'price_desc') {
    return sorted.sort((a, b) => {
      const aPrice = getPrice(a)
      const bPrice = getPrice(b)

      if (
        aPrice === null &&
        bPrice === null
      ) {
        return compareTitle(a, b)
      }

      if (aPrice === null) return 1
      if (bPrice === null) return -1

      return (
        bPrice - aPrice ||
        compareTitle(a, b)
      )
    })
  }

  // 최근 등록순:
  // created_at 우선, 같은 경우 id 역순
  return sorted.sort((a, b) => {
    const aParsed = a.created_at
      ? Date.parse(a.created_at)
      : 0

    const bParsed = b.created_at
      ? Date.parse(b.created_at)
      : 0

    const aTime = Number.isNaN(aParsed)
      ? 0
      : aParsed

    const bTime = Number.isNaN(bParsed)
      ? 0
      : bParsed

    if (bTime !== aTime) {
      return bTime - aTime
    }

    return Number(b.id) - Number(a.id)
  })
}

// ---------- 사이드바: 특가 순위 ----------
async function DiscountSidebar({
  db,
}: {
  db: D1Database
}) {
  const items = await getTopDiscounts(
    db,
    10
  )

  return (
    <aside class="sidebar">
      <h2 class="sidebar-title">
        🔥 특가 순위
      </h2>

      <p class="sidebar-sub">
        이번 주 많이 내린 순
      </p>

      {items.length === 0 ? (
        <p class="no-data">
          아직 가격 데이터가 없습니다.
        </p>
      ) : (
        <ol class="discount-list">
          {items.map((it) => {
            const drop = weekDropPct(
              it.drop_rate
            )

            return (
              <li class="discount-item">
                <a
                  href={`/games/${it.game_id}/${it.platform}`}
                >
                  <span class="discount-platform">
                    {PLATFORM_LABELS[
                      it.platform
                    ] ?? it.platform}
                  </span>

                  <span class="discount-name">
                    {it.title}
                  </span>

                  <span class="discount-price">
                    {won(it.lowest_price)}

                    {drop !== null && (
                      <span class="discount-rate">
                        ▼{drop}%
                      </span>
                    )}
                  </span>
                </a>
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}

// ---------- 플랫폼 탭 ----------
function ConsoleTabs({
  active,
  sort,
}: {
  active: string
  sort: GameSort
}) {
  const sortQuery =
    sort === 'recent'
      ? ''
      : `&sort=${encodeURIComponent(sort)}`

  return (
    <nav
      class="console-tabs"
      aria-label="플랫폼 선택"
    >
      {PLATFORMS.map((p) => (
        <a
          href={`/games?platform=${p.code}${sortQuery}`}
          class={`console-tab ${
            active === p.code
              ? 'active'
              : ''
          }`}
        >
          <span class="tab-icon">
            {p.icon}
          </span>{' '}
          {p.label}
        </a>
      ))}
    </nav>
  )
}

// ---------- 오늘의 특가 ----------
games.get('/deals', async (c) => {
  const items = await getTopDiscounts(
    c.env.DB,
    30
  )

  const sorted = [...items].sort(
    (a, b) => {
      const ad = a.drop_rate ?? 0
      const bd = b.drop_rate ?? 0

      if (bd !== ad) {
        return bd - ad
      }

      return (
        (a.lowest_price ?? Infinity) -
        (b.lowest_price ?? Infinity)
      )
    }
  )

  return c.render(
    <main class="container">
      <a
        href="/games?platform=ps5"
        class="back-link"
      >
        ← 전체 목록으로
      </a>

      <div class="deals-head">
        <h1>🔥 오늘의 특가</h1>

        <p class="subtitle">
          이번 주 최고가 대비 가격이 많이
          내린 순으로 모았습니다.
        </p>
      </div>

      {sorted.length === 0 ? (
        <p class="no-data">
          아직 특가로 보여줄 가격 데이터가
          없습니다.
        </p>
      ) : (
        <ul class="deals-list">
          {sorted.map((it) => {
            const drop = weekDropPct(
              it.drop_rate
            )

            return (
              <li
                class={`deal-card ${
                  drop !== null &&
                  drop >= 10
                    ? 'deal-hot'
                    : ''
                }`}
              >
                <a
                  href={`/games/${it.game_id}/${it.platform}`}
                  class="deal-link"
                >
                  <div
                    class="deal-thumb-wrap"
                    style={
                      it.image_url
                        ? `--thumb-bg:url('${it.image_url}')`
                        : undefined
                    }
                  >
                    {it.image_url ? (
                      <img
                        src={it.image_url}
                        alt={it.title}
                        class="deal-thumb"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        class="game-thumb-placeholder"
                        aria-hidden="true"
                      >
                        🎮
                      </div>
                    )}
                  </div>

                  <div class="deal-body">
                    <span class="platform-badge">
                      {PLATFORM_LABELS[
                        it.platform
                      ] ?? it.platform}
                    </span>

                    <h3 class="deal-title">
                      {it.title}
                    </h3>

                    <p class="deal-price">
                      최저{' '}
                      <strong>
                        {won(
                          it.lowest_price
                        )}
                      </strong>

                      {drop !== null && (
                        <span class="card-discount">
                          {' '}
                          ▼{drop}%
                        </span>
                      )}
                    </p>
                  </div>

                  <span class="deal-cta">
                    보러가기 →
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </main>,
    {
      title:
        '오늘의 게임 특가 · 최저가 순위 | 여누딜',
      description:
        '이번 주 가격이 많이 내린 게임 특가 순위. PS5·스위치·Xbox 게임 최저가를 쇼핑몰별로 비교하세요.',
      ogUrl:
        'https://yeonudeal.com/games/deals',
    }
  )
})

// ---------- 플랫폼별 게임 목록 ----------
games.get('/', async (c) => {
  const platform =
    c.req.query('platform') || 'ps5'

  const query = (
    c.req.query('q') || ''
  ).trim()

  const sort = normalizeSort(
    c.req.query('sort')
  )

  const requestedPage = normalizePage(
  c.req.query('page')
)

  // 검색어가 있으면 전체 플랫폼에서 검색
  const isSearch = query.length > 0

  const rawList = isSearch
    ? await searchGamesAllPlatforms(
        c.env.DB,
        query
      )
    : await listGamesByPlatform(
        c.env.DB,
        platform
      )

  const list = sortGameList(
  rawList,
  sort
)

const totalItems = list.length

const totalPages = Math.max(
  1,
  Math.ceil(
    totalItems / GAMES_PER_PAGE
  )
)

const currentPage = Math.min(
  requestedPage,
  totalPages
)

// 존재하지 않는 페이지는 마지막 페이지로 이동
if (requestedPage > totalPages) {
  return c.redirect(
    buildGamesListHref({
      platform,
      query,
      sort,
      page: totalPages,
    })
  )
}

const pageStart =
  (currentPage - 1) *
  GAMES_PER_PAGE

const pageEnd = Math.min(
  pageStart + GAMES_PER_PAGE,
  totalItems
)

const pageList = list.slice(
  pageStart,
  pageEnd
)

const rangeStart =
  totalItems === 0
    ? 0
    : pageStart + 1


  const sidebar = await DiscountSidebar({
    db: c.env.DB,
  })

  const lastUpdated = toKstLabel(
    await getLastUpdated(c.env.DB)
  )

  const trackingCounts =
    await getTrackingCounts(c.env.DB)

  const platformLabel =
    PLATFORM_LABELS[platform] ?? platform

  const listTitle = isSearch
    ? `'${query}' 검색결과 · 게임 최저가 | 여누딜`
    : `${platformLabel} 게임 최저가 목록 | 여누딜`

  const listDesc = isSearch
    ? `'${query}' 게임 최저가를 쇼핑몰별로 비교하세요. 쿠팡·G마켓·옥션 가격을 한눈에 확인.`
    : `${platformLabel} 게임 최저가를 쇼핑몰별로 비교하세요. 쿠팡·G마켓·옥션 가격을 한눈에 확인.`

  const clearSearchHref =
    `/games?platform=${encodeURIComponent(
      platform
    )}${
      sort === 'recent'
        ? ''
        : `&sort=${encodeURIComponent(
            sort
          )}`
    }`

  return c.render(
    <div class="page">
      <header class="site-header">
        <div class="header-text">
          <h1>🎮 게임 가격 비교</h1>

          <p class="subtitle">
            플랫폼별 · 디지털/패키지 가격
            비교
          </p>

          <p class="tracking-summary">
            등록 게임{' '}
            {trackingCounts.uniqueGames}종
            {' · '}
            플랫폼판{' '}
            {
              trackingCounts.platformEditions
            }
            개
            {lastUpdated &&
              ` · ${lastUpdated} 업데이트`}
          </p>
        </div>
      </header>

      <div class="layout">
        <main class="main-col">
          {isSearch ? (
            <p class="search-meta">
              '<strong>{query}</strong>' 전체
              플랫폼 검색 결과 {totalItems}건
              {' '}
              <a
                href={clearSearchHref}
                class="search-clear"
              >
                ✕ 검색 해제
              </a>
            </p>
          ) : (
            <ConsoleTabs
              active={platform}
              sort={sort}
            />
          )}

          <div class="sort-toolbar">
            <p class="game-list-summary">
              {isSearch
                ? `검색 결과 ${totalItems}개 · ${rangeStart}–${pageEnd}번째`
                : `${platformLabel} 게임 ${totalItems}개 · ${rangeStart}–${pageEnd}번째`}
            </p>
            <div class="sort-controls">
              <form
                class="sort-form"
                action="/games"
                method="get"
              >
                <input
                  type="hidden"
                  name="platform"
                  value={platform}
                />

                {query && (
                  <input
                    type="hidden"
                    name="q"
                    value={query}
                  />
                )}

                <label
                  for="game-sort"
                  class="sort-label"
                >
                  정렬
                </label>

                <select
                  id="game-sort"
                  name="sort"
                  class="sort-select"
                  onchange="this.form.submit()"
                >
                  <option
                    value="recent"
                    selected={
                      sort === 'recent'
                    }
                  >
                    최근 등록순
                  </option>

                  <option
                    value="name"
                    selected={
                      sort === 'name'
                    }
                  >
                    이름순
                  </option>

                  <option
                    value="price_asc"
                    selected={
                      sort === 'price_asc'
                    }
                  >
                    낮은 가격순
                  </option>

                  <option
                    value="price_desc"
                    selected={
                      sort === 'price_desc'
                    }
                  >
                    높은 가격순
                  </option>
                </select>
              </form>

              <div class="sort-help">
                <button
                  type="button"
                  class="sort-help-button"
                  aria-label="정렬 기준 설명"
                  aria-describedby="sort-help-tooltip"
                >
                  ⓘ
                </button>

                <div
                  id="sort-help-tooltip"
                  class="sort-tooltip"
                  role="tooltip"
                >
                  <strong>
                    정렬 기준
                  </strong>

                  <span>
                    최근 등록순 — 여누딜 DB
                    등록 순서
                  </span>

                  <span>
                    이름순 — 가나다·ABC 순서
                  </span>

                  <span>
                    낮은 가격순 — 확인된
                    최저가가 낮은 순
                  </span>

                  <span>
                    높은 가격순 — 확인된
                    최저가가 높은 순
                  </span>

                  <small>
                    목록에서는 선택한 플랫폼의
                    디지털·패키지 중 최저가를
                    사용합니다. 전체 검색에서는
                    검색 결과에 포함된 플랫폼의
                    최저가를 사용하며, 가격
                    정보가 없는 게임은 마지막에
                    표시됩니다.
                  </small>
                </div>
              </div>
            </div>
          </div>

          {totalItems === 0 ? (
            <p class="no-data">
              {isSearch
                ? `'${query}'에 해당하는 게임이 없습니다.`
                : `'${
                    PLATFORM_LABELS[
                      platform
                    ] ?? platform
                  }' 플랫폼에 등록된 게임이 없습니다.`}
            </p>
                    ) : (
            <>
              <ul class="game-grid">
                {pageList.map((g: any) => {
                  const rate = discountRate(
                    g.lowest_price ??
                      Infinity,
                    g.original_price
                  )

                  const platformCodes:
                    string[] = isSearch
                    ? String(
                        g.platforms || ''
                      )
                        .split(',')
                        .filter(Boolean)
                    : [platform]

                  const detailHref =
                    isSearch
                      ? `/games/${g.id}`
                      : `/games/${g.id}/${platform}`

                  return (
                    <li
                      class="game-card"
                      data-game-id={String(
                        g.id
                      )}
                      data-platform={
                        platform
                      }
                    >
                      <button
                        type="button"
                        class="game-card-trigger"
                        aria-expanded="false"
                      >
                        <div
                          class="game-thumb-wrap"
                          style={
                            g.image_url
                              ? `--thumb-bg:url('${g.image_url}')`
                              : undefined
                          }
                        >
                          {g.image_url ? (
                            <img
                              src={
                                g.image_url
                              }
                              alt={g.title}
                              class="game-thumb"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              class="game-thumb-placeholder"
                              aria-hidden="true"
                            >
                              🎮
                            </div>
                          )}
                        </div>

                        <div class="game-card-body">
                          <div class="platform-badges">
                            {platformCodes.map(
                              (code) => (
                                <span class="platform-badge">
                                  {PLATFORM_LABELS[
                                    code
                                  ] ?? code}
                                </span>
                              )
                            )}
                          </div>

                          <h3>
                            {g.title}
                          </h3>

                          <p class="game-price">
                            {g.lowest_price ? (
                              <>
                                <span class="price-type">
                                  {g.lowest_price_type ===
                                  'package'
                                    ? '📦 패키지 최저'
                                    : '💾 다운로드 최저'}
                                </span>{' '}

                                <strong>
                                  {won(
                                    g.lowest_price
                                  )}
                                </strong>

                                {rate !==
                                  null && (
                                  <span class="discount">
                                    -{rate}%
                                  </span>
                                )}
                              </>
                            ) : (
                              <span class="no-price">
                                가격 정보 없음
                              </span>
                            )}
                          </p>
                        </div>

                        <span
                          class="accordion-chevron"
                          aria-hidden="true"
                        >
                          ▼
                        </span>
                      </button>

                      <a
                        class="game-card-permalink"
                        href={detailHref}
                      >
                        {g.title} 최저가 상세 보기
                      </a>
                    </li>
                  )
                })}
              </ul>

              <Pagination
                platform={platform}
                query={query}
                sort={sort}
                currentPage={
                  currentPage
                }
                totalPages={
                  totalPages
                }
              />
            </>
          )}

        </main>

        <div class="side-col">
          <form
            class="search-box"
            action="/games"
            method="get"
            role="search"
          >
            <input
              type="hidden"
              name="platform"
              value={platform}
            />

            <input
              type="hidden"
              name="sort"
              value={sort}
            />

            <input
              type="search"
              name="q"
              id="game-search"
              class="search-input"
              placeholder="게임 이름 검색…"
              value={query}
              autocomplete="off"
            />

            <button
              type="submit"
              class="search-btn"
            >
              🔍 검색
            </button>
          </form>

          {sidebar}
        </div>
      </div>
    </div>,
    {
      title: listTitle,
      description: listDesc,
      ogUrl:
        `https://yeonudeal.com/games?platform=${platform}`,
    }
  )
})

// ---------- 가격 표시 컴포넌트 ----------
function PriceRow({
  p,
  original,
  lowest,
}: {
  p: Price
  original: number | null
  lowest: number | null
}) {
  const label =
    p.source === 'etc' &&
    p.mall_label
      ? p.mall_label
      : SOURCE_LABELS[p.source] ??
        p.mall_label ??
        p.source

  const rate = discountRate(
    p.price,
    original
  )

  const isLowest =
    lowest !== null &&
    p.price <= lowest

  return (
    <li class="price-row">
      <span class="source-name">
        {label}
      </span>

      <span class="price-value">
        {won(p.price)}

        {rate !== null && (
          <span class="discount">
            -{rate}%
          </span>
        )}

        {isLowest && (
          <span class="lowest-badge">
            최저
          </span>
        )}
      </span>

      {p.product_url && (
        <a
          class="buy-link"
          href={`/go/${p.id}`}
          target="_blank"
          rel="noopener"
        >
          구매 →
        </a>
      )}
    </li>
  )
}

function PriceSection({
  title,
  icon,
  prices,
  original,
  history,
  isDigital,
}: {
  title: string
  icon: string
  prices: Price[]
  original: number | null
  history: PriceHistory[]
  isDigital: number
}) {
  const filtered = prices.filter(
    (p) =>
      p.is_digital === isDigital
  )

  const currentLowest =
    filtered.length > 0
      ? Math.min(
          ...filtered.map(
            (p) => p.price
          )
        )
      : null

  return (
    <section class="price-section">
      <h2>
        <span class="section-icon">
          {icon}
        </span>{' '}
        {title}
      </h2>

      {filtered.length === 0 ? (
        <p class="no-data">
          등록된 {title} 가격이 없습니다.
        </p>
      ) : (
        <>
          <div class="lowest-info">
            현재 최저가:{' '}
            <strong>
              {won(currentLowest)}
            </strong>
          </div>

          <ul class="price-list">
            {filtered.map((p) => (
              <PriceRow
                p={p}
                original={original}
                lowest={currentLowest}
              />
            ))}
          </ul>

          {isDigital === 0 && (
            <p class="price-note">
              ⓘ 배송비와 적용 가능한 쿠폰은
              구매 페이지에서 확인하세요.
            </p>
          )}
        </>
      )}
    </section>
  )
}

// ---------- 상세 페이지 플랫폼 전환 ----------
function PlatformSwitch({
  gameId,
  editions,
  active,
}: {
  gameId: number
  editions: Edition[]
  active: string
}) {
  return (
    <nav
      class="platform-switch"
      aria-label="플랫폼 전환"
    >
      {editions.map((e) => (
        <a
          href={`/games/${gameId}/${e.platform}`}
          class={`platform-pill ${
            active === e.platform
              ? 'active'
              : ''
          }`}
        >
          {PLATFORM_ICONS[
            e.platform
          ] ?? '📀'}{' '}
          {PLATFORM_LABELS[
            e.platform
          ] ?? e.platform}
        </a>
      ))}
    </nav>
  )
}

// ---------- 공개 예약판매 이미지 ----------
//
// 비공개 R2 객체를 직접 공개하지 않고,
// 공개 완료된 V2 예약판매에 연결된 승인 이미지만 전달한다.
// ------------------------------------------------------------

games.get(
  '/preorder-images/:imageId',
  async (c) => {
    const imageId = Number(
      c.req.param('imageId')
    )

    if (
      !Number.isInteger(imageId) ||
      imageId <= 0
    ) {
      return c.notFound()
    }

    const record =
      await c.env.DB.prepare(`
        SELECT
          g.id AS game_id,

          gos.watch_item_id,

          wii.id AS image_id,
          wii.stored_image_url,
          wii.image_hash,
          wii.permission_status
            AS image_permission_status,

          sip.permission_status
            AS source_permission_status,
          sip.local_storage_allowed

        FROM variant_preorder_images vpi

        INNER JOIN variant_preorders vp
          ON vp.id = vpi.preorder_id

        INNER JOIN product_variants pv
          ON pv.id = vp.variant_id

        INNER JOIN editions e
          ON e.id = pv.edition_id

        INNER JOIN games g
          ON g.id = e.game_id

        INNER JOIN watch_item_images wii
          ON wii.id = vpi.image_id

        INNER JOIN game_official_sources gos
          ON gos.id = vp.official_source_id

        LEFT JOIN source_image_policies sip
          ON sip.source_id = gos.source_id

        WHERE
          wii.id = ?
          AND wii.watch_item_id =
            gos.watch_item_id
          AND g.publish_status =
            'PUBLISHED'
          AND pv.publish_status =
            'ACTIVE'
          AND vp.publish_status =
            'PUBLISHED'
          AND wii.permission_status =
            'APPROVED'

        LIMIT 1
      `)
        .bind(imageId)
        .first<{
          game_id: number
          watch_item_id: number
          image_id: number
          stored_image_url: string | null
          image_hash: string | null
          image_permission_status: string
          source_permission_status:
            string | null
          local_storage_allowed:
            number | null
        }>()

    if (!record) {
      return c.notFound()
    }

    const sourcePermissionStatus =
      String(
        record.source_permission_status ||
        'PENDING'
      ).toUpperCase()

    if (
      sourcePermissionStatus !==
        'APPROVED' &&
      sourcePermissionStatus !==
        'CONDITIONAL'
    ) {
      return c.notFound()
    }

    if (
      Number(
        record.local_storage_allowed
      ) !== 1
    ) {
      return c.notFound()
    }

    const objectKey =
      `watcher/games/${record.game_id}/` +
      `images/${record.image_id}/original`

    const expectedStoredImageUrl =
      `r2://GAME_IMAGES/${objectKey}`

    if (
      record.stored_image_url !==
        expectedStoredImageUrl ||
      !record.image_hash
    ) {
      return c.notFound()
    }

    const object =
      await c.env.GAME_IMAGES.get(
        objectKey
      )

    if (!object) {
      return c.notFound()
    }

    const metadata =
      object.customMetadata || {}

    if (
      metadata.watchItemId !==
        String(record.watch_item_id) ||
      metadata.imageId !==
        String(record.image_id) ||
      metadata.gameId !==
        String(record.game_id) ||
      metadata.sha256 !==
        record.image_hash
    ) {
      return c.notFound()
    }

    const contentType =
      object.httpMetadata
        ?.contentType || ''

    if (
      contentType !== 'image/jpeg' &&
      contentType !== 'image/png' &&
      contentType !== 'image/webp'
    ) {
      return c.notFound()
    }

    const headers = new Headers()

    object.writeHttpMetadata(headers)

    headers.set(
      'Content-Type',
      contentType
    )

    headers.set(
      'Cache-Control',
      'public, max-age=3600, s-maxage=86400'
    )

    headers.set(
      'X-Content-Type-Options',
      'nosniff'
    )

    headers.set(
      'ETag',
      object.httpEtag
    )

    return new Response(
      object.body,
      {
        status: 200,
        headers,
      }
    )
  }
)


// ---------- 플랫폼 미지정 상세 ----------
games.get('/:gameId', async (c) => {
  const gameId = Number(
    c.req.param('gameId')
  )

  if (Number.isNaN(gameId)) {
    return c.render(
      <main class="container">
        <h1>잘못된 게임 ID</h1>
      </main>
    )
  }

  const editions =
    await listEditionsByGame(
      c.env.DB,
      gameId
    )

  if (editions.length === 0) {
    const game = await getGameById(
      c.env.DB,
      gameId
    )

    return c.render(
      <main class="container">
        <a
          href="/games?platform=ps5"
          class="back-link"
        >
          ← 게임 목록으로
        </a>

        <h1>
          {game?.title ?? '게임'}
        </h1>

        <p class="no-data">
          아직 등록된 플랫폼(에디션)이
          없습니다.
        </p>
      </main>
    )
  }

  return c.redirect(
    `/games/${gameId}/${editions[0].platform}`
  )
})

// ---------- 특정 플랫폼 상세 ----------
games.get(
  '/:gameId/:platform',
  async (c) => {
    const gameId = Number(
      c.req.param('gameId')
    )

    const platform =
      c.req.param('platform')

    if (Number.isNaN(gameId)) {
      return c.render(
        <main class="container">
          <h1>잘못된 게임 ID</h1>
        </main>
      )
    }

    const game = await getGameById(
      c.env.DB,
      gameId
    )

    if (!game) {
      return c.render(
        <main class="container">
          <h1>
            게임을 찾을 수 없습니다
          </h1>

          <a
            href={`/games?platform=${platform}`}
            class="back-link"
          >
            ← 게임 목록으로
          </a>
        </main>
      )
    }

    const editions =
      await listEditionsByGame(
        c.env.DB,
        gameId
      )

    const edition = editions.find(
      (e) =>
        e.platform === platform
    )

    if (!edition) {
      return c.render(
        <main class="container">
          <a
            href={`/games/${gameId}`}
            class="back-link"
          >
            ← 다른 플랫폼 보기
          </a>

          <h1>{game.title}</h1>

          <p class="no-data">
            {`'${
              PLATFORM_LABELS[
                platform
              ] ?? platform
            }' 플랫폼 정보가 없습니다.`}
          </p>
        </main>
      )
    }

    const prices =
      await getCurrentPrices(
        c.env.DB,
        edition.id
      )

    const history =
      await getPriceHistory(
        c.env.DB,
        edition.id
      )

    const platformLabel =
      PLATFORM_LABELS[platform] ??
      platform

    const lowestPrice =
      prices.length > 0
        ? Math.min(
            ...prices.map(
              (p) => p.price
            )
          )
        : null

    const pageTitle =
      `${game.title} 최저가 · ${platformLabel} 가격비교 | 여누딜`

    const pageDesc = lowestPrice
      ? `${game.title} ${platformLabel} 최저 ${won(
          lowestPrice
        )}. 쿠팡·G마켓·옥션 등 쇼핑몰별 가격을 비교하세요.`
      : `${game.title} ${platformLabel} 가격을 쇼핑몰별로 비교하세요. 여누딜에서 최저가 확인.`

    const ogUrl =
      `https://yeonudeal.com/games/${gameId}/${platform}`

    const ogImage =
      game.image_url ||
      'https://yeonudeal.com/static/og-image.png'

    return c.render(
      <main class="container">
        <a
          href={`/games?platform=${platform}`}
          class="back-link"
        >
          ← {platformLabel} 목록으로
        </a>

        <div class="game-header">
          {game.image_url && (
            <img
              src={game.image_url}
              alt={game.title}
              class="game-hero"
            />
          )}

          <div class="game-meta">
            <h1>{game.title}</h1>

            <p class="current-platform">
              {
                PLATFORM_ICONS[
                  platform
                ]
              }{' '}
              {platformLabel}

              {edition.edition_name && (
                <span class="edition-name">
                  {' '}
                  ·{' '}
                  {
                    edition.edition_name
                  }
                </span>
              )}
            </p>

            {game.release_date && (
              <p class="release">
                출시일:{' '}
                {game.release_date}
              </p>
            )}

            {game.original_price && (
              <p class="original">
                정가:{' '}
                {won(
                  game.original_price
                )}
              </p>
            )}

            {edition.steam_appid && (
              <a
                class="steam-link"
                href={`https://store.steampowered.com/app/${edition.steam_appid}`}
                target="_blank"
                rel="noopener"
              >
                스팀 상점 ↗
              </a>
            )}
          </div>
        </div>

        <PlatformSwitch
          gameId={gameId}
          editions={editions}
          active={platform}
        />

        <div class="price-sections">
          <PriceSection
            title="디지털"
            icon="💾"
            prices={prices}
            original={
              game.original_price
            }
            history={history}
            isDigital={1}
          />

          <PriceSection
            title="패키지"
            icon="📦"
            prices={prices}
            original={
              game.original_price
            }
            history={history}
            isDigital={0}
          />
        </div>

        <p class="notice">
          ※ 디지털 가격은 정보 제공용입니다.
          쿠팡 파트너스 등 제휴 링크를 통해
          수수료를 제공받을 수 있습니다.
        </p>
      </main>,
      {
        title: pageTitle,
        description: pageDesc,
        ogUrl,
        ogImage,
      }
    )
  }
)

export default games
