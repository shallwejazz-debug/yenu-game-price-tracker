// ============================================================
// 네이버 쇼핑 API 연동 모듈
// src/naver.ts
//   - 게임명으로 검색 → 패키지(실물) 가격 + 구매 링크 수집
//   - 굿즈/액세서리 필터링 (category3 = "게임타이틀" 만 통과)
// ============================================================

// 네이버 쇼핑 API 원본 아이템
interface NaverShopItem {
  title: string
  link: string
  image: string
  lprice: string // 최저가 (문자열로 옴)
  hprice: string
  mallName: string // 판매 쇼핑몰명
  productId: string
  productType: string
  category1: string
  category2: string
  category3: string // "게임타이틀" 여부로 필터링
  category4: string
}

interface NaverShopResponse {
  total: number
  start: number
  display: number
  items: NaverShopItem[]
}

// 정제된 가격 결과 (우리 DB에 넣기 좋은 형태)
export interface CleanedPrice {
  mallName: string // 'coupang' | 'gmarket' | '11st' | 'naver' | '기타'
  mallLabel: string // 원본 쇼핑몰 표시명
  price: number
  link: string
  title: string
  image: string
}

// HTML 태그 제거 (<b>엘든링</b> → 엘든링)
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim()
}

// 네이버 mallName → 우리 source 코드로 매핑 (어필리에이트 연결용)
function mapMallToSource(mallName: string): string {
  const n = mallName.toLowerCase()
  if (n.includes('쿠팡') || n.includes('coupang')) return 'coupang'
  if (n.includes('g마켓') || n.includes('gmarket') || n.includes('지마켓')) return 'gmarket'
  if (n.includes('11번가') || n.includes('11st')) return '11st'
  if (n.includes('옥션') || n.includes('auction')) return 'auction'
  if (n === '네이버' || n.includes('naver') || n.includes('스마트스토어')) return 'naver'
  return 'etc'
}

// 굿즈/액세서리 필터 — 게임 본품만 남기기
function isLikelyGameTitle(item: NaverShopItem, gameKeywords: string[]): boolean {
  // 1) 카테고리가 "게임타이틀" 이 아니면 제외 (굿즈/피규어/커버 등 차단)
  if (item.category3 !== '게임타이틀') return false

  // 2) 제목에 굿즈성 단어가 있으면 제외 (보조 필터)
  const title = stripTags(item.title).toLowerCase()
  const banned = ['굿즈', '피규어', '커버', '스티커', '키링', '포스터', '머천', '인형', '쿠션', '악세사리', '악세서리', '스킨', '케이스']
  if (banned.some((w) => title.includes(w))) return false

  // 3) 게임명 핵심 키워드 중 하나는 포함해야 함
  if (gameKeywords.length > 0) {
    const hit = gameKeywords.some((k) => title.includes(k.toLowerCase()))
    if (!hit) return false
  }

  return true
}

// 가격 비정상치 제거 (너무 싼 건 굿즈일 확률 높음)
function isReasonablePrice(price: number): boolean {
  return price >= 5000 && price <= 300000
}

// 중고/대여 상품 판별 (신품만 수집하기 위함)
function isUsedItem(title: string): boolean {
  const t = title.toLowerCase()
  const usedWords = ['중고', '대여', '렌탈', '렌트', 'used', '리퍼']
  return usedWords.some((w) => t.includes(w))
}

// ---------- 플랫폼 자동 분류 (제목 키워드 기반) ----------
// 더 구체적인 키워드를 우선 매칭 (PS5 > PS4 > XBOX > SWITCH > PC)
const PLATFORM_RULES: Array<{ code: string; patterns: RegExp[] }> = [
  { code: 'ps5', patterns: [/ps5/i, /플레이스테이션\s*5/, /플스\s*5/] },
  { code: 'ps4', patterns: [/ps4/i, /플레이스테이션\s*4/, /플스\s*4/] },
  {
    code: 'xbox',
    patterns: [/xbox/i, /엑스박스/, /엑박/, /series\s*[xs]/i, /\bone\b/i],
  },
  { code: 'switch', patterns: [/스위치/, /switch/i, /\bns\b/i, /닌텐도/] },
  { code: 'pc', patterns: [/\bpc\b/i, /스팀/, /steam/i, /에픽/, /epic/i, /gog/i] },
]

/**
 * 상품 제목에서 플랫폼 코드를 추론. 못 찾으면 null.
 */
export function detectPlatform(title: string): string | null {
  const t = title
  for (const rule of PLATFORM_RULES) {
    if (rule.patterns.some((re) => re.test(t))) return rule.code
  }
  return null
}

// 플랫폼별 분류 결과
export interface PlatformBucket {
  platform: string
  prices: CleanedPrice[] // source별 최저가 (오름차순)
  count: number // 분류된 원본 건수
  lowest: number | null
}

export interface ClassifyResult {
  buckets: PlatformBucket[]
  skipped: {
    notGameTitle: number // 게임타이틀 카테고리 아님
    used: number // 중고/대여
    outOfRange: number // 가격 범위 밖
    noPlatform: number // 플랫폼 판별 실패
  }
  totalItems: number // 네이버가 돌려준 전체 건수
}

/**
 * 게임명만으로 검색 → 게임타이틀 필터 → 신품/가격필터 → 플랫폼 자동분류.
 * 하나의 검색 결과가 여러 플랫폼 버킷으로 쪼개진다. (자동 임포트의 핵심)
 *
 * @param query    검색어 (보통 게임 제목 그대로, 예: "엘든링")
 * @param keywords 본품 판별 키워드 (예: ["엘든", "elden"])
 */
export async function searchAndClassify(
  clientId: string,
  clientSecret: string,
  query: string,
  keywords: string[] = []
): Promise<ClassifyResult> {
  const url =
    'https://openapi.naver.com/v1/search/shop.json?query=' +
    encodeURIComponent(query) +
    '&display=100&sort=sim'

  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`네이버 API 오류 (${res.status}): ${text}`)
  }

  const data = (await res.json()) as NaverShopResponse
  const skipped = { notGameTitle: 0, used: 0, outOfRange: 0, noPlatform: 0 }

  // 플랫폼별로 원본 모으기
  const byPlatform = new Map<string, CleanedPrice[]>()

  for (const item of data.items) {
    const title = stripTags(item.title)

    if (!isLikelyGameTitle(item, keywords)) {
      skipped.notGameTitle++
      continue
    }
    if (isUsedItem(title)) {
      skipped.used++
      continue
    }
    const price = parseInt(item.lprice, 10)
    if (!isReasonablePrice(price)) {
      skipped.outOfRange++
      continue
    }
    const platform = detectPlatform(title)
    if (!platform) {
      skipped.noPlatform++
      continue
    }

    const cleaned: CleanedPrice = {
      mallName: mapMallToSource(item.mallName),
      mallLabel: item.mallName,
      price,
      link: item.link,
      title,
      image: item.image,
    }
    const arr = byPlatform.get(platform) ?? []
    arr.push(cleaned)
    byPlatform.set(platform, arr)
  }

  // 플랫폼별: source당 최저가 1건만 + 오름차순 정렬
  const buckets: PlatformBucket[] = []
  for (const [platform, list] of byPlatform.entries()) {
    const bySource = new Map<string, CleanedPrice>()
    for (const c of list) {
      const existing = bySource.get(c.mallName)
      if (!existing || c.price < existing.price) bySource.set(c.mallName, c)
    }
    const prices = Array.from(bySource.values()).sort((a, b) => a.price - b.price)
    buckets.push({
      platform,
      prices,
      count: list.length,
      lowest: prices.length > 0 ? prices[0].price : null,
    })
  }

  // 플랫폼 표시 순서 정렬
  const order = ['pc', 'ps5', 'ps4', 'xbox', 'switch', 'etc']
  buckets.sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform))

  return { buckets, skipped, totalItems: data.items.length }
}

/**
 * 게임 패키지 가격을 네이버 쇼핑에서 검색
 * @param query     검색어 (예: "PS5 엘든링 한글판")
 * @param keywords  본품 판별용 핵심 키워드 (예: ["엘든", "elden"])
 */
export async function searchGamePrices(
  clientId: string,
  clientSecret: string,
  query: string,
  keywords: string[] = []
): Promise<CleanedPrice[]> {
  const url =
    'https://openapi.naver.com/v1/search/shop.json?query=' +
    encodeURIComponent(query) +
    '&display=30&sort=sim' // 정확도순으로 받아서 직접 필터링

  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`네이버 API 오류 (${res.status}): ${text}`)
  }

  const data = (await res.json()) as NaverShopResponse

  // 필터링 + 정제
  const cleaned: CleanedPrice[] = []
  for (const item of data.items) {
    if (!isLikelyGameTitle(item, keywords)) continue
    const price = parseInt(item.lprice, 10)
    if (!isReasonablePrice(price)) continue

    cleaned.push({
      mallName: mapMallToSource(item.mallName),
      mallLabel: item.mallName,
      price,
      link: item.link,
      title: stripTags(item.title),
      image: item.image,
    })
  }

  // 같은 쇼핑몰(source)은 최저가 1건만 유지
  const bySource = new Map<string, CleanedPrice>()
  for (const c of cleaned) {
    const existing = bySource.get(c.mallName)
    if (!existing || c.price < existing.price) {
      bySource.set(c.mallName, c)
    }
  }

  // 가격 오름차순 정렬
  return Array.from(bySource.values()).sort((a, b) => a.price - b.price)
}
