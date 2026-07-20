import { Hono } from 'hono'
import type { Bindings } from '../types'
import { PLATFORMS } from '../types'
import {
  getLastUpdated,
  getPlatformCounts,
  getTrackingCounts,
} from '../db'

const home = new Hono<{ Bindings: Bindings }>()

function toKstLabel(utc: string | null): string {
  if (!utc) return ''

  const d = new Date(utc.replace(' ', 'T') + 'Z')
  d.setHours(d.getHours() + 9)

  const p = (n: number) => String(n).padStart(2, '0')

  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(
    d.getDate()
  )} ${p(d.getHours())}:${p(d.getMinutes())}`
}

home.get('/', async (c) => {
  const [trackingCounts, platformCounts, lastUpdatedUtc] =
    await Promise.all([
      getTrackingCounts(c.env.DB),
      getPlatformCounts(c.env.DB),
      getLastUpdated(c.env.DB),
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
    .map((code) => PLATFORMS.find((p) => p.code === code))
    .filter((p): p is (typeof PLATFORMS)[number] => Boolean(p))

  return c.render(
    <div class="home-page">
      <header class="home-hero">
        <a href="/" class="home-brand">
          🎮 여누딜
        </a>

        <h1>게임 가격, 한눈에 비교하세요</h1>

        <p class="home-description">
          PS5·닌텐도 스위치·Xbox·PC 게임의 국내 쇼핑몰 가격을
          비교하고 가격 변화를 확인하세요.
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

          <button type="submit">검색</button>
        </form>
      </header>

      <main class="home-content">
        <section class="home-section">
          <div class="home-section-heading">
            <div>
              <h2>플랫폼별 게임 찾기</h2>
              <p>찾고 있는 게임의 플랫폼을 선택하세요.</p>
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
                  {platformCounts[platform.code] ?? 0}개
                </span>
              </a>
            ))}
          </div>
        </section>

        <section class="home-section home-status-section">
          <div class="home-section-heading">
            <div>
              <h2>여누딜 가격 추적 현황</h2>

              <p>
                등록된 게임과 플랫폼별 가격 정보를 계속 확인하고
                있습니다.
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
            가격 정보는 네이버 쇼핑 API와 판매처의 수집 시점을
            기준으로 주기적으로 갱신됩니다.
          </p>

          <p>
            구매하기 전에 판매처·상품 구성·배송 조건을 확인해
            주세요.
          </p>
        </section>
      </main>
    </div>,
    {
      title: '여누딜 - 콘솔 게임 가격 비교',
      description:
        'PS5, 닌텐도 스위치, Xbox, PC 게임의 국내 쇼핑몰 가격을 비교하고 가격 변화를 확인하세요.',
      ogUrl: 'https://yeonudeal.com/',
      ogImage: 'https://yeonudeal.com/static/og-image.png',
    }
  )
})

export default home
