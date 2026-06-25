// ============================================================
// 네이버 쇼핑 API 연동 모듈
// src/naver.ts
//   - 게임명으로 검색 → 패키지(실물) / 디지털 키 가격 + 구매 링크 수집
//   - 굿즈/액세서리 필터링 (category3 = "게임타이틀" 만 통과)
//   - 계정/대리 등 회색지대 상품 제외 (정식 유통만 노출)
//   - 중고/개인거래성 판매처 제외
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
  isDigital: number // 1 = 디지털 키/코드, 0 = 실물 패키지
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

// ============================================================
// 디지털/패키지/블랙리스트 분류 정책
//   - 정식 유통 상품만 노출 (계정/대리/지역우회 등 회색지대 제외)
//   - 분류 키워드는 운영 중 보강 가능하도록 이 상수 블록에 집약
//   - (백로그 #8) 추후 DB 테이블화 + 관리자 편집
// ============================================================

// 1) 수집 자체에서 제외 (블랙리스트) — 걸리면 결과 폐기
const BLACKLIST_KEYWORDS = [
  '계정', '기존계정', '공유계정', '신규계정', '대리', '대행',
  '해외계정', '지역우회', 'vpn',
  '미개통', '미사용계정',
  // 스팀 계정성/지역우회 코드 (NA/AA 등) 차단
  'na버전', 'aa버전', 'na 버전', 'aa 버전',
  '상점환율', '상점국가', '국가변경', '환율변경',
]

// 블랙리스트 정규식 (단어 경계 필요한 것 — NA버전/AA버전/NA계정 등)
const BLACKLIST_REGEX = [
  /\b(na|aa)\s*버전\b/i,
  /\b(na|aa)\s*계정\b/i,
]

// 중고/개인거래성 판매처 (네이버 API title엔 '중고'가 없어도 이런 몰은 거름)
const BLOCKED_MALLS = [
  '마리오친구', '메루카리', '번개장터', '중고나라',
]

// 2) 디지털 키로 분류 (is_digital = 1) — 단순 부분일치
const DIGITAL_KEYWORDS = [
  '스팀', 'steam', '스팀키',
  'cd키', 'cd-key', 'cdkey', '시리얼키', '시리얼번호',
  '디지털', 'digital', '다운로드', 'download',
  '이메일발송', '온라인코드', 'pc판 키', '에디션 키',
  '이숍', 'eshop', '다운로드 번호',
]

// 2-보강) 단어 경계가 필요한 디지털 신호 (예: "code"가 "QR코드"에 오탐되지 않도록)
const DIGITAL_REGEX = [
  /\bcode\b/i,                         // 영문 code (단어 경계)
  /(^|[^가-힣])코드([^가-힣]|$)/,      // 한글 코드 (앞뒤가 한글이 아닐 때만)
]

/**
 * 블랙리스트(계정/대리 등 회색지대) 판별 → true면 수집에서 제외
 */
function isBlacklisted(title: string): boolean {
  const t = title.toLowerCase()
  if (BLACKLIST_KEYWORDS.some((w) => t.includes(w.toLowerCase()))) return true
  if (BLACKLIST_REGEX.some((re) => re.test(title))) return true
  return false
}

/**
 * 중고/개인거래성 판매처 판별 → true면 수집에서 제외
 */
function isBlockedMall(mallName: string): boolean {
  const n = mallName.toLowerCase()
  return BLOCKED_MALLS.some((w) => n.includes(w.toLowerCase()))
}

/**
 * 디지털 키/코드 판별 → true면 is_digital = 1 로 저장
 * (블랙리스트 통과 후 호출되는 것을 전제)
 */
function isDigitalKey(title: string): boolean {
  const t = title.toLowerCase()
  if (DIGITAL_KEYWORDS.some((w) => t.includes(w.toLowerCase()))) return true
  if (DIGITAL_REGEX.some((re) => re.test(title))) return true
  return false
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
    blacklisted: number // 계정/대리 등 회색지대
    used: number // 중고/대여/차단몰
    outOfRange: number // 가격 범위 밖
    noPlatform: number // 플랫폼 판별 실패
  }
  totalItems: number // 네이버가 돌려준 전체 건수
}

/**
 * 게임명만으로 검색 → 게임타이틀 필터 → 블랙리스트/신품/가격필터 → 플랫폼 자동분류.
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
  const skipped = { notGameTitle: 0, blacklisted: 0, used: 0, outOfRange: 0, noPlatform: 0 }

  // 플랫폼별로 원본 모으기
  const byPlatform = new Map<string, CleanedPrice[]>()

  for (const item of data.items) {
    const title = stripTags(item.title)

    if (!isLikelyGameTitle(item, keywords)) {
      skipped.notGameTitle++
      continue
    }
    if (isBlacklisted(title)) {
      skipped.blacklisted++
      continue
    }
    if (isUsedItem(title)) {
      skipped.used++
      continue
    }
    if (isBlockedMall(item.mallName)) {
      skipped.used++ // 중고/개인거래성 판매처 → 중고로 같이 카운트
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
      isDigital: isDigitalKey(title) ? 1 : 0,
    }
    const arr = byPlatform.get(platform) ?? []
    arr.push(cleaned)
    byPlatform.set(platform, arr)
  }

  // 플랫폼별: (source + 디지털여부)당 최저가 1건만 + 오름차순 정렬
  const buckets: PlatformBucket[] = []
  for (const [platform, list] of byPlatform.entries()) {
    const bySource = new Map<string, CleanedPrice>()
    for (const c of list) {
      const key = `${c.mallName}|${c.isDigital}`
      const existing = bySource.get(key)
      if (!existing || c.price < existing.price) bySource.set(key, c)
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
 * 게임 패키지/디지털 가격을 네이버 쇼핑에서 검색
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
    const title = stripTags(item.title)
    if (isBlacklisted(title)) continue
    if (isUsedItem(title)) continue
    if (isBlockedMall(item.mallName)) continue
    const price = parseInt(item.lprice, 10)
    if (!isReasonablePrice(price)) continue

    cleaned.push({
      mallName: mapMallToSource(item.mallName),
      mallLabel: item.mallName,
      price,
      link: item.link,
      title,
      image: item.image,
      isDigital: isDigitalKey(title) ? 1 : 0,
    })
  }

  // 같은 (쇼핑몰 + 디지털여부)는 최저가 1건만 유지
  const bySource = new Map<string, CleanedPrice>()
  for (const c of cleaned) {
    const key = `${c.mallName}|${c.isDigital}`
    const existing = bySource.get(key)
    if (!existing || c.price < existing.price) {
      bySource.set(key, c)
    }
  }

  // 가격 오름차순 정렬
  return Array.from(bySource.values()).sort((a, b) => a.price - b.price)
}
