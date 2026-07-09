// ============================================================
// 공개 페이지 라우트
// src/routes/games.tsx
//   GET /games               - 콘솔 탭 + 게임 그리드 + 할인 사이드바
//   GET /games?platform=ps5  - 특정 콘솔 필터
//   GET /games/:gameId            - 게임 상세 (플랫폼 탭)
//   GET /games/:gameId/:platform  - 특정 플랫폼 가격 상세
// [2026-07-06] 패키지 섹션에 쿠폰·배송비 안내(price-note) 추가
// [2026-07-08] 역대최저 배지 제거 → 이번 주 최고가 대비 하락률(▼X%)만 표시
//              + 헤더에 가격 업데이트 시각(KST) 표시
// ============================================================

import { Hono } from 'hono'
import type { Bindings, Price, PriceHistory, Edition } from '../types'
import { SOURCE_LABELS, PLATFORMS, PLATFORM_LABELS, PLATFORM_ICONS } from '../types'
import {
  getGameById,
  getCurrentPrices,
  getPriceHistory,
  listGamesByPlatform,
  listEditionsByGame,
  getEditionById,
  getTopDiscounts,
  getLastUpdated,
  getGameCount,
} from '../db'

const games = new Hono<{ Bindings: Bindings }>()

function won(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-'
  return '₩' + n.toLocaleString('ko-KR')
}
function discountRate(price: number, original: number | null): number | null {
  if (!original || original <= 0 || price >= original) return null
  return Math.round((1 - price / original) * 100)
}

// [2026-07-08] 이번 주 최고가 대비 하락률(%) — drop_rate(0~1)를 정수 %로.
//   2% 미만은 노이즈로 보고 표시 안 함(null 반환).
function weekDropPct(dropRate: number | null | undefined): number | null {
  if (dropRate == null || dropRate <= 0) return null
  const pct = Math.round(dropRate * 100)
  return pct >= 2 ? pct : null
}

// [2026-07-08] UTC 문자열 → KST 표시 라벨
//   prices.recorded_at 은 UTC로 저장됨. 화면에는 +9시간(KST)으로 보여준다.
function toKstLabel(utc: string | null): string {
  if (!utc) return ''
  const d = new Date(utc.replace(' ', 'T') + 'Z') // UTC로 파싱
  d.setHours(d.getHours() + 9)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ---------- 사이드바: 특가 순위 (이번 주 하락폭 큰 순) ----------
async function DiscountSidebar({ db }: { db: D1Database }) {
  const items = await getTopDiscounts(db, 10)
  return (
    <aside class="sidebar">
      <h2 class="sidebar-title">🔥 특가 순위</h2>
      <p class="sidebar-sub">이번 주 많이 내린 순</p>
      {items.length === 0 ? (
        <p class="no-data">아직 가격 데이터가 없습니다.</p>
      ) : (
        <ol class="discount-list">
          {items.map((it) => {
            const drop = weekDropPct(it.drop_rate)
            return (
              <li class="discount-item">
                <a href={`/games/${it.game_id}/${it.platform}`}>
                  <span class="discount-platform">{PLATFORM_LABELS[it.platform] ?? it.platform}</span>
                  <span class="discount-name">{it.title}</span>
                  <span class="discount-price">
                    {won(it.lowest_price)}
                    {drop !== null && <span class="discount-rate">▼{drop}%</span>}
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

// ---------- 콘솔 탭 ----------
function ConsoleTabs({ active }: { active: string }) {
  return (
    <nav class="console-tabs">
      {PLATFORMS.map((p) => (
        <a
          href={`/games?platform=${p.code}`}
          class={`console-tab ${active === p.code ? 'active' : ''}`}
        >
          <span class="tab-icon">{p.icon}</span> {p.label}
        </a>
      ))}
    </nav>
  )
}

// ---------- 오늘의 특가 페이지 ----------
games.get('/deals', async (c) => {
  const items = await getTopDiscounts(c.env.DB, 30)

  // 하락폭 큰 순 (getTopDiscounts가 이미 drop_rate DESC로 정렬해 주지만
  // 30개 범위에서도 확실히 하락폭 우선이 되도록 한 번 더 안정 정렬)
  const sorted = [...items].sort((a, b) => {
    const ad = a.drop_rate ?? 0
    const bd = b.drop_rate ?? 0
    if (bd !== ad) return bd - ad
    return (a.lowest_price ?? Infinity) - (b.lowest_price ?? Infinity)
  })

  return c.render(
    <main class="container">
      <a href="/games" class="back-link">← 전체 목록으로</a>

      <div class="deals-head">
        <h1>🔥 오늘의 특가</h1>
        <p class="subtitle">이번 주 최고가 대비 가격이 많이 내린 순으로 모았습니다.</p>
      </div>

      {sorted.length === 0 ? (
        <p class="no-data">아직 특가로 보여줄 가격 데이터가 없습니다.</p>
      ) : (
        <ul class="deals-list">
          {sorted.map((it) => {
            const drop = weekDropPct(it.drop_rate)
            return (
              <li class={`deal-card ${drop !== null && drop >= 10 ? 'deal-hot' : ''}`}>
                <a href={`/games/${it.game_id}/${it.platform}`} class="deal-link">
                  <div
                    class="deal-thumb-wrap"
                    style={it.image_url ? `--thumb-bg:url('${it.image_url}')` : undefined}
                  >
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.title} class="deal-thumb" loading="lazy" />
                    ) : (
                      <div class="game-thumb-placeholder" aria-hidden="true">🎮</div>
                    )}
                  </div>
                  <div class="deal-body">
                    <span class="platform-badge">{PLATFORM_LABELS[it.platform] ?? it.platform}</span>
                    <h3 class="deal-title">{it.title}</h3>
                    <p class="deal-price">
                      최저 <strong>{won(it.lowest_price)}</strong>
                      {drop !== null && <span class="card-discount"> ▼{drop}%</span>}
                    </p>
                  </div>
                  <span class="deal-cta">보러가기 →</span>
                </a>
              </li>
            )
          })}
        </ul>
      )}

      <p class="notice">
        ※ 표시 가격은 수집 시점의 노출가 기준이며, 쿠폰·카드할인·배송비 등에 따라 실제 결제가와 다를 수 있습니다.
        <br />
        ※ 이 사이트는 쿠팡 파트너스 등 제휴 마케팅 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.
      </p>
    </main>
  )
})

// ---------- 메인: 콘솔별 게임 목록 ----------
games.get('/', async (c) => {
  const platform = c.req.query('platform') || 'pc'
  const query = (c.req.query('q') || '').trim()
  let list = await listGamesByPlatform(c.env.DB, platform)

  if (query) {
    const q = query.toLowerCase()
    list = list.filter((g) => (g.title || '').toLowerCase().includes(q))
  }

  const sidebar = await DiscountSidebar({ db: c.env.DB })
  const lastUpdated = toKstLabel(await getLastUpdated(c.env.DB)) // [2026-07-08]
  const gameCount = await getGameCount(c.env.DB) // [2026-07-09]

  return c.render(
    <div class="page">
      <header class="site-header">
        <a href="/admin" class="admin-link header-admin" aria-label="게임 추가/관리">⚙️ 추가/관리</a>
        <div class="header-text">
          <h1>🎮 여누의 게임 가격 추적기</h1>
          <p class="subtitle">콘솔별 · 디지털/패키지 분리 가격 비교</p>
          <p class="update-time">🎮 총 {gameCount}개 게임 추적 중</p>
          {lastUpdated && (
            <p class="update-time">🕓 가격 업데이트: {lastUpdated} 기준</p>
          )}

        </div>
        <form class="search-box" action="/games" method="get" role="search">
          <input type="hidden" name="platform" value={platform} />
          <input
            type="search"
            name="q"
            id="game-search"
            class="search-input"
            placeholder="게임 이름 검색…"
            value={query}
            autocomplete="off"
          />
          <button type="submit" class="search-btn">🔍 검색</button>
        </form>
      </header>

      <div class="layout">
        <main class="main-col">
          <ConsoleTabs active={platform} />

          {query && (
            <p class="search-meta">
              '<strong>{query}</strong>' 검색 결과 {list.length}건
              {' '}<a href={`/games?platform=${platform}`} class="search-clear">✕ 검색 해제</a>
            </p>
          )}

          {list.length === 0 ? (
            <p class="no-data">
              {query
                ? `'${query}'에 해당하는 게임이 없습니다.`
                : `'${PLATFORM_LABELS[platform] ?? platform}' 플랫폼에 등록된 게임이 없습니다.`}
            </p>
          ) : (
            <ul class="game-grid">
              {list.map((g) => {
                const rate = discountRate(g.lowest_price ?? Infinity, g.original_price)
                return (
                  <li class="game-card" data-game-id={String(g.id)} data-platform={platform}>
                       <button
                      type="button"
                      class="game-card-trigger"
                      aria-expanded="false"
                    >
                      <div
                        class="game-thumb-wrap"
                        style={g.image_url ? `--thumb-bg:url('${g.image_url}')` : undefined}
                      >
                        {g.image_url ? (
                          <img src={g.image_url} alt={g.title} class="game-thumb" loading="lazy" />
                        ) : (
                          <div class="game-thumb-placeholder" aria-hidden="true">🎮</div>
                        )}
                      </div>
                      <div class="game-card-body">
                        <span class="platform-badge">{PLATFORM_LABELS[platform] ?? platform}</span>
                        <h3>{g.title}</h3>
                        <p class="game-price">
                          {g.lowest_price ? (
                            <>
                              최저 <strong>{won(g.lowest_price)}</strong>
                              {rate !== null && <span class="card-discount"> -{rate}%</span>}
                            </>
                          ) : (
                            <span class="no-price">가격 정보 없음</span>
                          )}
                        </p>
                      </div>
                      <span class="accordion-chevron" aria-hidden="true">▼</span>
                    </button>

                    {/* [2026-07-09] 크롤러용 상세 페이지 링크 (SEO: 내부링크 확보) */}
                    <a class="game-card-permalink" href={`/games/${g.id}/${platform}`}>
                      {g.title} {PLATFORM_LABELS[platform] ?? platform} 최저가 상세 보기
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </main>

        {sidebar}
      </div>
    </div>
  )
})

// ---------- 가격 표시 컴포넌트 ----------
function PriceRow({ p, original, lowest }: { p: Price; original: number | null; lowest: number | null }) {
  const label =
    p.source === 'etc' && p.mall_label
      ? p.mall_label
      : SOURCE_LABELS[p.source] ?? p.mall_label ?? p.source
  const rate = discountRate(p.price, original)
  const isLowest = lowest !== null && p.price <= lowest
  return (
    <li class="price-row">
      <span class="source-name">{label}</span>
      <span class="price-value">
        {won(p.price)}
        {rate !== null && <span class="discount">-{rate}%</span>}
        {isLowest && <span class="lowest-badge">최저</span>}
      </span>
      {p.product_url && (
        <a class="buy-link" href={`/go/${p.id}`} target="_blank" rel="noopener">
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
  const filtered = prices.filter((p) => p.is_digital === isDigital)
  const currentLowest = filtered.length > 0 ? Math.min(...filtered.map((p) => p.price)) : null

  return (
    <section class="price-section">
      <h2>
        <span class="section-icon">{icon}</span> {title}
      </h2>
      {filtered.length === 0 ? (
        <p class="no-data">등록된 {title} 가격이 없습니다.</p>
      ) : (
        <>
          <div class="lowest-info">
            현재 최저가: <strong>{won(currentLowest)}</strong>
          </div>
          <ul class="price-list">
            {filtered.map((p) => (
              <PriceRow p={p} original={original} lowest={currentLowest} />
            ))}
          </ul>
          {isDigital === 0 && (
            <p class="price-note">ⓘ 표시가는 쇼핑몰 노출가입니다. 쿠폰·배송비에 따라 실제 결제가가 달라질 수 있어요.</p>
          )}
        </>
      )}
    </section>
  )
}

// 플랫폼 전환 탭 (상세 페이지 내부)
function PlatformSwitch({ gameId, editions, active }: { gameId: number; editions: Edition[]; active: string }) {
  return (
    <nav class="platform-switch">
      {editions.map((e) => (
        <a
          href={`/games/${gameId}/${e.platform}`}
          class={`platform-pill ${active === e.platform ? 'active' : ''}`}
        >
          {PLATFORM_ICONS[e.platform] ?? '📀'} {PLATFORM_LABELS[e.platform] ?? e.platform}
        </a>
      ))}
    </nav>
  )
}

// ---------- 게임 상세: 플랫폼 미지정 → 첫 에디션으로 리다이렉트 ----------
games.get('/:gameId', async (c) => {
  const gameId = Number(c.req.param('gameId'))
  if (Number.isNaN(gameId)) return c.render(<main class="container"><h1>잘못된 게임 ID</h1></main>)

  const editions = await listEditionsByGame(c.env.DB, gameId)
  if (editions.length === 0) {
    const game = await getGameById(c.env.DB, gameId)
    return c.render(
      <main class="container">
        <a href="/games" class="back-link">← 목록으로</a>
        <h1>{game?.title ?? '게임'}</h1>
        <p class="no-data">아직 등록된 플랫폼(에디션)이 없습니다.</p>
      </main>
    )
  }
  return c.redirect(`/games/${gameId}/${editions[0].platform}`)
})

// ---------- 게임 상세: 특정 플랫폼 ----------
games.get('/:gameId/:platform', async (c) => {
  const gameId = Number(c.req.param('gameId'))
  const platform = c.req.param('platform')
  if (Number.isNaN(gameId)) return c.render(<main class="container"><h1>잘못된 게임 ID</h1></main>)

  const game = await getGameById(c.env.DB, gameId)
  if (!game) {
    return c.render(
      <main class="container">
        <h1>게임을 찾을 수 없습니다</h1>
        <a href="/games">← 목록으로</a>
      </main>
    )
  }

  const editions = await listEditionsByGame(c.env.DB, gameId)
  const edition = editions.find((e) => e.platform === platform)
  if (!edition) {
    return c.render(
      <main class="container">
        <a href={`/games/${gameId}`} class="back-link">← 다른 플랫폼 보기</a>
        <h1>{game.title}</h1>
        <p class="no-data">'{PLATFORM_LABELS[platform] ?? platform}' 플랫폼 정보가 없습니다.</p>
      </main>
    )
  }

  const prices = await getCurrentPrices(c.env.DB, edition.id)
  const history = await getPriceHistory(c.env.DB, edition.id)

  return c.render(
    <main class="container">
      <a href="/games" class="back-link">← 목록으로</a>

      <div class="game-header">
        {game.image_url && <img src={game.image_url} alt={game.title} class="game-hero" />}
        <div class="game-meta">
          <h1>{game.title}</h1>
          <p class="current-platform">
            {PLATFORM_ICONS[platform]} {PLATFORM_LABELS[platform] ?? platform}
            {edition.edition_name && <span class="edition-name"> · {edition.edition_name}</span>}
          </p>
          {game.release_date && <p class="release">출시일: {game.release_date}</p>}
          {game.original_price && <p class="original">정가: {won(game.original_price)}</p>}
          {edition.steam_appid && (
            <a class="steam-link" href={`https://store.steampowered.com/app/${edition.steam_appid}`} target="_blank" rel="noopener">
              스팀 상점 ↗
            </a>
          )}
        </div>
      </div>

      <PlatformSwitch gameId={gameId} editions={editions} active={platform} />

      <div class="price-sections">
        <PriceSection title="디지털" icon="💾" prices={prices} original={game.original_price} history={history} isDigital={1} />
        <PriceSection title="패키지" icon="📦" prices={prices} original={game.original_price} history={history} isDigital={0} />
      </div>

      <p class="notice">
        ※ 디지털 가격은 정보 제공용, 패키지 가격은 한국 쇼핑몰 비교입니다. 플랫폼마다 가격이 다릅니다.
        <br />
        ※ 이 사이트는 쿠팡 파트너스 등 제휴 마케팅 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.
      </p>

    </main>
  )
})

export default games
