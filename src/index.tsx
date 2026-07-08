// =============================================================
// 메인 앱 엔트리포인트
// src/index.tsx
//   - 각 라우트 그룹 연결
//   - 리다이렉터 패턴(/go/:priceId) 으로 어필리에이트 변조 방지
// [2026-07-08] SEO: /sitemap.xml, /robots.txt 라우트 추가 (구글 색인 유도)
// =============================================================

import { Hono } from 'hono'
import { renderer } from './renderer'
import type { Bindings, Price } from './types'
import admin from './routes/admin'
import games from './routes/games'
import api from './routes/api'
import { getAllSettings, listGames, listEditionsByGame } from './db'

const app = new Hono<{ Bindings: Bindings }>()

// HTML 페이지에는 공통 레이아웃(renderer) 적용
app.use(renderer)

// ---------- 홈 → 게임 목록(PC 탭)으로 ----------
app.get('/', (c) => c.redirect('/games?platform=pc'))

// ---------- robots.txt ----------
// 크롤러 허용 + 관리자/리다이렉터/API 경로 차단 + sitemap 위치 안내
app.get('/robots.txt', (c) => {
  const host = new URL(c.req.url).origin
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /go/',
    'Disallow: /api/',
    '',
    `Sitemap: ${host}/sitemap.xml`,
    '',
  ].join('\n')
  return c.body(body, 200, { 'Content-Type': 'text/plain; charset=utf-8' })
})

// Google Search Console 소유권 확인용
app.get('/google8f207302de894f94.html', (c) => {
  return c.body('google-site-verification: google8f207302de894f94.html', 200, {
    'Content-Type': 'text/html; charset=utf-8',
  })
})


// ---------- sitemap.xml ----------
// 메인 + deals + 모든 게임 상세(/games/:id/:platform) URL을 담아 구글 색인 유도
//   ※ renderer(HTML 래핑)를 거치지 않도록 c.body로 XML 직접 반환
app.get('/sitemap.xml', async (c) => {
  const host = new URL(c.req.url).origin
  const urls: Array<{ loc: string; priority: string }> = []

  // 고정 페이지
  urls.push({ loc: `${host}/games?platform=pc`, priority: '0.9' })
  urls.push({ loc: `${host}/games/deals`, priority: '0.8' })

  // 게임별 상세 페이지 (에디션 = 플랫폼별 URL)
  try {
    const gameList = await listGames(c.env.DB)
    for (const g of gameList) {
      const editions = await listEditionsByGame(c.env.DB, g.id)
      for (const e of editions) {
        urls.push({
          loc: `${host}/games/${g.id}/${e.platform}`,
          priority: '0.7',
        })
      }
    }
  } catch {
    // DB 조회 실패 시 고정 페이지만이라도 반환
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${u.loc.replace(/&/g, '&amp;')}</loc><priority>${u.priority}</priority></url>`
      )
      .join('\n') +
    `\n</urlset>\n`

  return c.body(body, 200, { 'Content-Type': 'application/xml; charset=utf-8' })
})

// ---------- 라우트 그룹 연결 ----------
app.route('/admin', admin)
app.route('/games', games)
app.route('/api', api)

// ---------- 리다이렉터 (어필리에이트 보안 패턴) ----------
// /go/:priceId 로 접속 → 서버에서 원본 URL + 어필리에이트 ID 결합 후 302 리다이렉트
// 클라이언트는 최종 어필리에이트 링크를 직접 조작할 수 없음
app.get('/go/:priceId', async (c) => {
  const priceId = Number(c.req.param('priceId'))
  if (Number.isNaN(priceId)) return c.text('잘못된 요청', 400)

  const price = await c.env.DB.prepare('SELECT * FROM prices WHERE id = ?')
    .bind(priceId)
    .first<Price>()

  if (!price || !price.product_url) {
    return c.text('상품 링크를 찾을 수 없습니다.', 404)
  }

  // 어필리에이트 ID 결합
  // 우선순위: 환경변수(secret) > D1 settings(관리자 콘솔 입력) > 없으면 원본 그대로
  // 코드에 하드코딩 금지, 클라이언트 변조 방지(서버에서만 결합)
  let settings: Record<string, string> = {}
  try {
    settings = await getAllSettings(c.env.DB)
  } catch {
    // settings 테이블이 아직 없거나 조회 실패 → env만 사용
  }
  const target = appendAffiliate(price.source, price.product_url, c.env as any, settings)
  return c.redirect(target, 302)
})

// 소스별 어필리에이트 링크 생성 로직
// - 쿠팡: 상품 URL에 파트너스 태그(lptag) 결합
// - G마켓/옥션: 링크프라이스 딥링크(lpweb.kr)로 래핑
function appendAffiliate(
  source: string,
  url: string,
  env: Record<string, string>,
  settings: Record<string, string> = {}
): string {
  const pick = (envKey: string, settingKey: string) =>
    env[envKey] || settings[settingKey] || ''

  // ── 링크프라이스 설정 ──
  const LINKPRICE_DOMAIN = 'lpweb.kr'
  // 링크프라이스 퍼블리셔 ID (a 값). env(secret) 우선, 없으면 DB settings.
  const lpId = pick('LINKPRICE_ID', 'linkprice_id')
  // source(내부 몰코드) → 링크프라이스 m 값
  const LINKPRICE_M: Record<string, string> = {
    gmarket: 'gmarket',
    auction: 'auction',
    // 11번가 승인 후 실제 m 값 확인해서 추가 (예: '11st': '11st')
  }

  try {
    // 1) 링크프라이스 대상 몰이면 딥링크로 래핑
    if (LINKPRICE_M[source] && lpId) {
      const m = LINKPRICE_M[source]
      // 딥링크가 인식하도록 원본 상품 URL을 표준 상품 페이지 형식으로 정규화
      const cleanUrl = normalizeMallUrl(source, url)
      const tu = encodeURIComponent(cleanUrl)
      return `https://${LINKPRICE_DOMAIN}/click.php?m=${m}&a=${lpId}&l=9999&l_cd1=3&l_cd2=0&tu=${tu}`
    }

    // 2) 쿠팡은 상품 URL에 파트너스 태그 결합
    if (source === 'coupang') {
      const id = pick('COUPANG_PARTNERS_ID', 'coupang_partners_id')
      if (id) {
        const u = new URL(url)
        u.searchParams.set('lptag', id)
        return u.toString()
      }
    }

    // 3) 그 외(제휴 없는 몰, 디지털 등)는 원본 그대로
    return url
  } catch {
    return url
  }
}

// 몰별 원본 URL을 링크프라이스 딥링크가 인식하는 표준 상품 URL로 변환
// - G마켓: link.gmarket.co.kr/gate/pcs?item-no=XXX → item.gmarket.co.kr/Item?goodscode=XXX
// - 옥션: gate/게이트 형식이면 itempage3.auction.co.kr/DetailView.aspx?itemno=XXX 로
// (이미 표준 상품 URL이면 그대로 반환)
function normalizeMallUrl(source: string, url: string): string {
  try {
    if (source === 'gmarket') {
      // 이미 정상 상품 URL이면 그대로
      if (/item\.gmarket\.co\.kr\/Item/i.test(url)) return url
      // gate 링크 등에서 상품번호 추출 (item-no 또는 goodscode)
      const m = url.match(/[?&]item-no=(\d+)/i) || url.match(/goodscode=(\d+)/i)
      if (m) return `https://item.gmarket.co.kr/Item?goodscode=${m[1]}`
      return url
    }
    if (source === 'auction') {
      // 이미 정상 상품 URL이면 그대로
      if (/itempage\d*\.auction\.co\.kr\/DetailView/i.test(url)) return url
      // gate 링크 등에서 상품번호 추출 (itemno / item-no)
      const m = url.match(/itemno=(\w+)/i) || url.match(/[?&]item-?no=(\w+)/i)
      if (m) return `https://itempage3.auction.co.kr/DetailView.aspx?itemno=${m[1]}`
      return url
    }
    return url
  } catch {
    return url
  }
}

// ---------- 헬스체크 ----------
app.get('/health', (c) => c.json({ ok: true, service: 'game-price-tracker' }))

export default app
