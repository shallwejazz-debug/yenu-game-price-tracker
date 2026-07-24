import { Hono } from 'hono'
import type { Bindings } from '../types'
import {
  PLATFORMS,
  PLATFORM_LABELS,
} from '../types'
import {
  getLastUpdated,
  getPlatformCounts,
  getTrackingCounts,
  getRecentGames,
} from '../db'
import {
  getHomePreorderNews,
  HomePreorderNewsSection,
} from './home-preorders'

const home = new Hono<{ Bindings: Bindings }>()

function toKstLabel(utc: string | null): string {
  if (!utc) return ''

  const d = new Date(utc.replace(' ', 'T') + 'Z')
  d.setHours(d.getHours() + 9)

  const p = (n: number) =>
    String(n).padStart(2, '0')

  return `${d.getFullYear()}-${p(
    d.getMonth() + 1
  )}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}`
}

home.get('/', async (c) => {
  const [
    trackingCounts,
    platformCounts,
    lastUpdatedUtc,
    recentGames,
    preorderNews,
  ] = await Promise.all([
    getTrackingCounts(c.env.DB),
    getPlatformCounts(c.env.DB),
    getLastUpdated(c.env.DB),
    getRecentGames(c.env.DB, 8),
    getHomePreorderNews(c.env.DB),
  ])

  const lastUpdated = toKstLabel(lastUpdatedUtc)

  const platformOrder = [
    'ps5',
    'switch',
    'switch2',
    'xbox',
    'ps4',
    'pc',
  ]

  const platforms = platformOrder
    .map((code) =>
      PLATFORMS.find((p) => p.code === code)
    )
    .filter(
      (
        p
      ): p is (typeof PLATFORMS)[number] =>
        Boolean(p)
    )

  const renderRecentCards = (
    duplicate = false
  ) => (
    <div
      class="home-recent-group"
      aria-hidden={duplicate ? 'true' : undefined}
    >
      {recentGames.map((game) => {
        const platformCodes = [
          ...new Set(
            String(game.platforms || '')
              .split(',')
              .filter(Boolean)
          ),
        ]

        const detailPlatform =
          game.first_platform ||
          platformCodes[0] ||
          'ps5'

        return (
          <a
            href={`/games/${game.id}/${detailPlatform}`}
            class="home-recent-card"
            tabindex={duplicate ? '-1' : undefined}
          >
            <div class="home-recent-image-wrap">
              {game.image_url ? (
                <img
                  src={game.image_url}
                  alt={duplicate ? '' : game.title}
                  class="home-recent-image"
                  loading="lazy"
                  width="220"
                  height="124"
                />
              ) : (
                <div
                  class="home-recent-placeholder"
                  aria-hidden="true"
                >
                  🎮
                </div>
              )}
            </div>

            <div class="home-recent-body">
              <div class="home-recent-platforms">
                {platformCodes.map((code) => (
                  <span class="home-recent-platform">
                    {PLATFORM_LABELS[code] ?? code}
                  </span>
                ))}
              </div>

              <h3 class="home-recent-title">
                {game.title}
              </h3>

              <span class="home-recent-link-text">
                가격 보기 →
              </span>
            </div>
          </a>
        )
      })}
    </div>
  )

  return c.render(
    <div class="home-page">
      <header class="home-hero">


        <h1>
          게임 가격, <span class="home-hero-title-rest">한눈에 비교하세요</span>
        </h1>

        <p class="home-description">
          PS5·닌텐도 스위치·Xbox·PC 게임의
          국내 쇼핑몰 가격을 비교하고 가격 변화를
          확인하세요.
        </p>

        <form
          class="home-search"
          action="/games"
          method="get"
          role="search"
        >
          <input
            type="search"
            name="q"
            placeholder="게임 이름을 검색하세요"
            aria-label="게임 이름 검색"
            autocomplete="off"
          />

          <button type="submit">
            검색
          </button>
        </form>
      </header>

      <main class="home-content">
        <HomePreorderNewsSection
          news={preorderNews}
        />

        <section class="home-section">
          <div class="home-section-heading">
            <div>
              <h2>플랫폼별 게임 찾기</h2>

              <p>
                찾고 있는 게임의 플랫폼을
                선택하세요.
              </p>
            </div>

            <a
              href="/games?platform=ps5"
              class="home-more-link"
            >
              전체 게임 보기 →
            </a>
          </div>

          <div class="home-platform-grid">
            {platforms.map((platform) => (
              <a
                href={`/games?platform=${platform.code}`}
                class="home-platform-card"
              >
                <span class="home-platform-icon">
                  {platform.icon}
                </span>

                <span class="home-platform-name">
                  {platform.label}
                </span>

                <span class="home-platform-count">
                  {platformCounts[
                    platform.code
                  ] ?? 0}
                  개
                </span>
              </a>
            ))}
          </div>
        </section>

        <section class="home-section home-recent-section">
          <div class="home-section-heading">
            <div>
              <h2>
                🆕 최근 추가된 게임
              </h2>

              <p>
                여누딜에 새로 등록된 게임
                8개입니다.
              </p>
            </div>
        </div>

          {recentGames.length === 0 ? (
            <p class="no-data">
              아직 최근 등록 게임이 없습니다.
            </p>
          ) : (
            <div
              class="home-recent-viewport"
              aria-label="최근 추가된 게임"
            >
              <div class="home-recent-track">
                {renderRecentCards(false)}
                {renderRecentCards(true)}
              </div>
            </div>
          )}
        </section>

        <section class="home-section home-status-section">
          <div class="home-section-heading">
            <div>
              <h2>
                여누딜 가격 추적 현황
              </h2>

              <p>
                등록된 게임과 플랫폼별 가격
                정보를 계속 확인하고 있습니다.
              </p>
            </div>
          </div>

          <div class="home-status-grid">
            <div class="home-status-card">
              <span class="home-status-label">
                등록 게임
              </span>

              <strong>
                {trackingCounts.uniqueGames}종
              </strong>
            </div>

            <div class="home-status-card">
              <span class="home-status-label">
                플랫폼판
              </span>

              <strong>
                {trackingCounts.platformEditions}개
              </strong>
            </div>

            <div class="home-status-card">
              <span class="home-status-label">
                최근 가격 확인
              </span>

              <strong class="home-status-time">
                {lastUpdated || '확인 중'}
              </strong>
            </div>
          </div>
        </section>

        <section class="home-price-guide">
          <h2>가격 안내</h2>

          <p>
            가격 정보는 네이버 쇼핑 API와
            판매처의 수집 시점을 기준으로
            주기적으로 갱신됩니다.
          </p>

          <p>
            구매하기 전에 판매처·상품
            구성·배송 조건을 확인해 주세요.
          </p>
        </section>
      </main>
    </div>,
    {
      title:
        '여누딜 - 콘솔 게임 가격 비교',
      description:
        'PS5, 닌텐도 스위치, Xbox, PC 게임의 국내 쇼핑몰 가격을 비교하고 가격 변화를 확인하세요.',
      ogUrl: 'https://yeonudeal.com/',
      ogImage:
        'https://yeonudeal.com/static/og-image.png',
    }
  )
})

export default home
