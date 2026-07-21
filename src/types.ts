// ============================================================
// 공통 타입 정의
// src/types.ts
//   구조: games(작품) → editions(플랫폼판) → prices(가격)
// ============================================================

export type Bindings = {
  DB: D1Database
  GAME_IMAGES: R2Bucket
  NAVER_CLIENT_ID: string
  NAVER_CLIENT_SECRET: string
  ADMIN_TOKEN?: string
  COUPANG_PARTNERS_ID?: string
  GMARKET_ESM_ID?: string
  ELEVENST_AFFILIATE_ID?: string
}

// 게임(작품) — 플랫폼 공통 정보만
export interface Game {
  id: number
  title: string
  image_url: string | null
  release_date: string | null
  original_price: number | null
  genre: string | null
  created_at: string
}

// 에디션(플랫폼판) — 엘든링 PS5판, 엘든링 PC판 등
export interface Edition {
  id: number
  game_id: number
  platform: string // 'pc'|'ps5'|'ps4'|'xbox'|'switch'|'etc'
  edition_name: string | null
  search_query: string | null
  keywords: string | null
  exclude_keywords: string | null
  steam_appid: number | null
  created_at: string
}

export interface Price {
  id: number
  edition_id: number
  source: string
  price: number
  currency: string
  is_digital: number // 1 = 디지털, 0 = 패키지
  product_url: string | null
  mall_label: string | null
  recorded_at: string
}

export interface PriceHistory {
  edition_id: number
  is_digital: number
  lowest_ever: number | null
  lowest_date: string | null
}

// ---------- 플랫폼 정의 ----------
export const PLATFORMS = [
  { code: 'pc', label: 'PC', icon: '🖥️' },
  { code: 'ps5', label: 'PS5', icon: '🎮🎮' },
  { code: 'ps4', label: 'PS4', icon: '🎮' },
  { code: 'xbox', label: 'XBOX', icon: '🟢' },
  { code: 'switch', label: 'SWITCH', icon: '🔴' },
  { code: 'switch2', label: 'SWITCH2', icon: '🔴🔴' },
] as const

export const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.code, p.label])
)
export const PLATFORM_ICONS: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.code, p.icon])
)

// ---------- 가격 소스 라벨 ----------
export const SOURCE_LABELS: Record<string, string> = {
  // PC 디지털 스토어
  steam: '스팀',
  epic: '에픽',
  gog: 'GOG',
  g2a: 'G2A',
  // 콘솔 디지털
  psn: 'PSN',
  xbox_store: 'XBOX 스토어',
  nintendo: '닌텐도 e숍',
  // 한국 패키지 쇼핑몰
  coupang: '쿠팡',
  gmarket: 'G마켓',
  '11st': '11번가',
  auction: '옥션',
  naver: '네이버',
  etc: '기타몰',
}
