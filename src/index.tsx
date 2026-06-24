// ============================================================
// 메인 앱 엔트리포인트
// src/index.tsx
//   - 각 라우트 그룹 연결
//   - 리다이렉터 패턴(/go/:priceId) 으로 어필리에이트 변조 방지
// ============================================================

import { Hono } from 'hono'
import { renderer } from './renderer'
import type { Bindings, Price } from './types'
import admin from './routes/admin'
import games from './routes/games'
import api from './routes/api'
import { getAllSettings } from './db'

const app = new Hono<{ Bindings: Bindings }>()

// HTML 페이지에는 공통 레이아웃(renderer) 적용
app.use(renderer)

// ---------- 홈 → 게임 목록(PC 탭)으로 ----------
app.get('/', (c) => c.redirect('/games?platform=pc'))

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

// 소스별 어필리에이트 ID 결합 로직
function appendAffiliate(
  source: string,
  url: string,
  env: Record<string, string>,
  settings: Record<string, string> = {}
): string {
  // env(secret)가 있으면 우선, 없으면 D1 settings 값 사용
  const pick = (envKey: string, settingKey: string) =>
    env[envKey] || settings[settingKey] || ''
  try {
    const u = new URL(url)
    switch (source) {
      case 'coupang': {
        const id = pick('COUPANG_PARTNERS_ID', 'coupang_partners_id')
        if (id) u.searchParams.set('lptag', id)
        break
      }
      case 'gmarket': {
        const id = pick('GMARKET_ESM_ID', 'gmarket_esm_id')
        if (id) u.searchParams.set('jaehuid', id)
        break
      }
      case '11st': {
        const id = pick('ELEVENST_AFFILIATE_ID', 'elevenst_affiliate_id')
        if (id) u.searchParams.set('affiliate', id)
        break
      }
      // 디지털(steam/psn/nintendo)은 어필리에이트 없음 → 원본 그대로
    }
    return u.toString()
  } catch {
    return url
  }
}

// ---------- 헬스체크 ----------
app.get('/health', (c) => c.json({ ok: true, service: 'game-price-tracker' }))

export default app
