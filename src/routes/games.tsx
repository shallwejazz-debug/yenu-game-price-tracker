// ============================================================
// 공개 페이지 라우트
// src/routes/games.tsx
//   GET /games               - 콘솔 탭 + 게임 그리드 + 할인 사이드바
//   GET /games?platform=ps5  - 특정 콘솔 필터
//   GET /games/:gameId            - 게임 상세 (플랫폼 탭)
//   GET /games/:gameId/:platform  - 특정 플랫폼 가격 상세
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

// ---------- 사이드바: 특가 순위 (역대 최저가 근접 순) ----------
async function DiscountSidebar({ db }: { db: D1Database }) {
  const items = await getTopDiscounts(db, 10)
  return (
    <aside class="sidebar">
      <h2 class="sidebar-title">🔥 특가 순위</h2>
      <p class="sidebar-sub">지금 사기 좋은 순</p>
      {items.length === 0 ? (
        <p class="no-data">아직 가격 데이터가 없습니다.</p>
      ) : (
        <ol class="discount-list">
          {items.map((it) => {
            // 현재가가 역대 최저가와 같거나 낮으면 "역대 최저" 표시
            const atLowest =
              it.lowest_ever != null && it.lowest_price != null && it.lowest_price <= it.lowest_ever
            return (
              <li class="discount-item">
                <a href={`/games/${it.game_id}/${it.platform}`}>
                  <span class="discount-platform">{PLATFORM_LABELS[it.platform] ?? it.platform}</span>
                  <span class="discount-name">{it.title}</span>
                  <span class="discount-price">
                    {won(it.lowest_price)}
                    {atLowest && <span class="discount-rate">역대최저</span>}
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

// ---------- 메인: 콘솔별 게임 목록 ----------
games.get('/', async (c) => {
  const platform = c.req.query('platform') || 'pc'
  const query = (c.req.query('q') || '').trim()
  let list = await listGamesByPlatform(c.env.DB, platform)

  // 검색어가 있으면 제목으로 필터 (대소문자 무시, 부분 일치)
  if (query) {
    const q = query.toLowerCase()
    list = list.filter((g) => (g.title || '').toLowerCase().includes(q))
  }

  const sidebar = await DiscountSidebar({ db: c.env.DB })

  return c.render(
    <div class="page">
      {/* 헤더: 제목 가운데 + 검색창 우측 (전체 폭) */}
      <header class="site-header">
        <a href="/admin" class="admin-link header-admin" aria-label="게임 추가/관리">⚙️ 추가/관리</a>
        <div class="header-text">
          <h1>🎮 여누의 게임 가격 추적기</h1>
          <p class="subtitle">콘솔별 · 디지털/패키지 분리 가격 비교</p>
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

      {/* 본문: 좌(탭+게임) / 우(특가순위) — 탭 라인부터 시작 */}
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
                    {/* 카드: 클릭해도 모양/크기 그대로. 상세는 행 아래에 따로 펼쳐짐 */}
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
  const hist = history.find((h) => h.is_digital === isDigital)
  const lowestEver = hist?.lowest_ever ?? null
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
            역대 최저가: <strong>{won(lowestEver)}</strong>
            {hist?.lowest_date && <span class="lowest-date"> ({hist.lowest_date.slice(0, 10)})</span>}
          </div>
          <ul class="price-list">
            {filtered.map((p) => (
              <PriceRow p={p} original={original} lowest={currentLowest} />
            ))}
          </ul>
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
  // 첫 번째 플랫폼으로 이동
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
