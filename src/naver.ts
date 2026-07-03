// =============================================================
// 네이버 쇼핑 API 연동 모듈  src/naver.ts
//   - 게임명 검색 → 패키지/디지털 가격 + 구매 링크 수집
//   - 굿즈/스틸북/계정/중고/회색지대 상품 제외
//   - PS4+PS5 동시 언급 매물은 실물 기준 PS4로 분류
//   - "코드" 단독 오탐 방지: 다운로드/온라인 코드 등 명확한 조합만 디지털 인정
//   - 네이버 가격비교(catalog) 상품 제외 + exclude 파라미터로 중고/렌탈/직구 원천 제외
// =============================================================

interface NaverShopItem { title: string; link: string; image: string; lprice: string; hprice: string; mallName: string; productId: string; productType: string; category1: string; category2: string; category3: string; category4: string; }
interface NaverShopResponse { total: number; start: number; display: number; items: NaverShopItem[]; }
export interface CleanedPrice { mallName: string; mallLabel: string; price: number; link: string; title: string; image: string; isDigital: number; }

function stripTags(s: string): string { return s.replace(/<[^>]+>/g, '').trim(); }
function mapMallToSource(mallName: string): string { const n = mallName.toLowerCase(); if (n.includes('쿠팡') || n.includes('coupang')) return 'coupang'; if (n.includes('g마켓') || n.includes('gmarket') || n.includes('지마켓')) return 'gmarket'; if (n.includes('11번가') || n.includes('11st')) return '11st'; if (n.includes('옥션') || n.includes('auction')) return 'auction'; if (n === '네이버' || n.includes('naver') || n.includes('스마트스토어')) return 'naver'; return 'etc'; }

// ---------- 블랙리스트 & 차단몰 ----------
const BLACKLIST_KEYWORDS = ['계정','기존계정','공유계정','신규계정','대리','대행','해외계정','지역우회','vpn','미개통','미사용계정','na버전','aa버전','na 버전','aa 버전','상점환율','상점국가','국가변경','환율변경'];
const BLACKLIST_REGEX = [
  /\b(na|aa)\s*버전\b/i,
  /\b(na|aa)\s*계정\b/i,
  /[\(\[]\s*(na|aa)\s*[\)\]]/i,   // (AA) [NA] 괄호 형태
  /\b(na|aa)\s*ver\b/i,           // AA Ver / NA ver
  /(na|aa)\s*$/i                  // 제목 맨 끝 NA/AA
];
// 중고/개인거래성 판매처 차단 (네이버 API 제목엔 "중고"가 없고 상세페이지에만 있는 케이스 대응)
const BLOCKED_MALLS = ['마리오친구','메루카리','번개장터','중고나라','유나이트게임','yunitegame','메이저코드','영게임스토어','영게임즈','영게임','younggames','아이티케어스토어','아이티케어','게임하다','크리스랑'];

function isBlacklisted(title: string): boolean { const t = title.toLowerCase(); if (BLACKLIST_KEYWORDS.some(w => t.includes(w.toLowerCase()))) return true; if (BLACKLIST_REGEX.some(re => re.test(title))) return true; return false; }
function isBlockedMall(mallName: string): boolean { return BLOCKED_MALLS.some(w => mallName.toLowerCase().includes(w.toLowerCase())); }

// ---------- 네이버 가격비교(catalog) 상품 판별 ----------
// 네이버 공식 productType 정의:
//   1  = 일반상품·가격비교 상품      → catalog 페이지로 연결(개별 판매처 아님)
//   2  = 일반상품·가격비교 비매칭 일반상품 → 개별 판매처 (유지)
//   3  = 일반상품·가격비교 매칭 일반상품  → 개별 판매처 (유지)
//   4  = 중고상품·가격비교 상품
//   7  = 단종상품·가격비교 상품
//   10 = 판매예정상품·가격비교 상품
// → 각 상품군의 "가격비교 상품"(1,4,7,10)은 클릭 시 search.shopping.naver.com/catalog 로
//   넘어가 레퍼럴 연결이 끊기므로 제외한다.
const CATALOG_PRODUCT_TYPES = new Set([1, 4, 7, 10]);
function isCatalogProduct(item: NaverShopItem): boolean {
  const pt = Number(item.productType);
  if (CATALOG_PRODUCT_TYPES.has(pt)) return true;
  // 보조 안전장치: link URL 자체에 /catalog/ 가 포함된 경우도 제외
  const link = (item.link || '').toLowerCase();
  if (link.includes('search.shopping.naver.com/catalog')) return true;
  return false;
}

// ---------- 디지털 판별 ----------
// 주의: "코드"/"code" 단독은 게임 제목(코드 베인, 코드기어스 등)에 흔해 오탐이 크다.
// 따라서 "다운로드/온라인/디지털/이메일 + 코드/번호/키" 조합처럼 명확한 표현만 디지털로 인정.
// 네이버 쇼핑 매물은 대부분 실물(패키지)이므로 기본값은 패키지(0).
const DIGITAL_KEYWORDS = ['스팀','steam','스팀키','cd키','cd-key','cdkey','시리얼키','시리얼번호','디지털','digital','다운로드','download','이메일발송','온라인코드','이숍','eshop','다운로드 번호','psn','플레이스테이션 스토어','닌텐도 e숍'];
const DIGITAL_REGEX = [
  /다운로드\s*코드/i,
  /온라인\s*코드/i,
  /디지털\s*코드/i,
  /코드\s*발송/i,
  /이메일\s*코드/i,
  /\bcd[\s\-]?key\b/i,
  /(다운로드|온라인|디지털|이메일)\s*(번호|키)/i,
];
function isDigitalKey(title: string): boolean { const t = title.toLowerCase(); if (DIGITAL_KEYWORDS.some(w => t.includes(w.toLowerCase()))) return true; if (DIGITAL_REGEX.some(re => re.test(title))) return true; return false; }

function isLikelyGameTitle(item: NaverShopItem, gameKeywords: string[]): boolean {
  if (item.category3 !== '게임타이틀') return false;
  const title = stripTags(item.title).toLowerCase();
  // 본품이 아닌 굿즈/주변기기/부가콘텐츠 제외 (가짜 초저가의 주범)
  const banned = ['굿즈','피규어','커버','스티커','키링','포스터','머천','인형','쿠션','악세사리','악세서리','스킨','케이스','스틸북','steelbook','스틸 북','거치대','스탠드','컨트롤러','패드','충전','거치','파우치','가방','보호필름','그립','키캡','테마','dlc','시즌패스','시즌 패스','확장팩','추가콘텐츠','아트북','사운드트랙','ost'];
  if (banned.some(w => title.includes(w))) return false;
  if (gameKeywords.length > 0 && !gameKeywords.some(k => title.includes(k.toLowerCase()))) return false;
  return true;
}
function isReasonablePrice(price: number): boolean { return price >= 5000 && price <= 300000; }
function isUsedItem(title: string): boolean { const t = title.toLowerCase(); const usedWords = ['중고','대여','렌탈','렌트','used','리퍼']; return usedWords.some(w => t.includes(w)); }

// ---------- 가격 이상치(중고 의심) 제외 ----------
// 같은 플랫폼 매물들의 중앙값 대비 지나치게 싼 것을 제외.
// 중고는 제목에 "중고"가 없어도 가격이 비정상적으로 낮으므로 이걸로 잡힘.
// 디지털/패키지는 정상 가격대가 다르므로 나눠서 계산.
function filterPriceOutliers(list: CleanedPrice[]): CleanedPrice[] {
  const groups: Record<string, CleanedPrice[]> = { '0': [], '1': [] };
  for (const c of list) groups[String(c.isDigital)].push(c);

  const result: CleanedPrice[] = [];
  for (const key of Object.keys(groups)) {
    const g = groups[key];
    // 매물이 3개 미만이면 중앙값 신뢰도가 낮아 필터 미적용 (정상품 제거 위험)
    if (g.length < 3) { result.push(...g); continue; }

    const sorted = g.map(c => c.price).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    // 중앙값의 55% 미만이면 중고/비정상으로 판단해 제외 (보수적 기준)
    const floor = median * 0.55;
    for (const c of g) {
      if (c.price >= floor) result.push(c);
    }
  }
  return result;
}

const PLATFORM_RULES: Array<{code:string;patterns:RegExp[]}> = [
  {code:'ps5',patterns:[/ps5/i,/플레이스테이션\s*5/,/플스\s*5/]},
  {code:'ps4',patterns:[/ps4/i,/플레이스테이션\s*4/,/플스\s*4/]},
  {code:'xbox',patterns:[/xbox/i,/엑스박스/,/엑박/,/series\s*[xs]/i,/\bone\b/i]},
  {code:'switch',patterns:[/스위치/,/switch/i,/\bns\b/i,/닌텐도/]},
  {code:'pc',patterns:[/\bpc\b/i,/스팀/,/steam/i,/에픽/,/epic/i,/gog/i]}
];
export function detectPlatform(title: string): string | null {
  // PS4와 PS5가 동시 언급되면 실물 기준 PS4로 분류 (호환/PS5업그레이드 매물)
  const hasPS4 = /ps4|플레이스테이션\s*4|플스\s*4/i.test(title);
  const hasPS5 = /ps5|플레이스테이션\s*5|플스\s*5/i.test(title);
  if (hasPS4 && hasPS5) return 'ps4';
  for (const rule of PLATFORM_RULES) { if (rule.patterns.some(re => re.test(title))) return rule.code; }
  return null;
}

export interface PlatformBucket { platform:string; prices:CleanedPrice[]; count:number; lowest:number|null; }
export interface ClassifyResult { buckets:PlatformBucket[]; skipped:{notGameTitle:number;blacklisted:number;used:number;catalog:number;outOfRange:number;noPlatform:number;}; totalItems:number; }

export async function searchAndClassify(clientId:string,clientSecret:string,query:string,keywords:string[]=[]): Promise<ClassifyResult> {
  // exclude=used:rental:cbshop → 중고/렌탈/해외직구·구매대행을 네이버 단에서 원천 제외
  const url='https://openapi.naver.com/v1/search/shop.json?query=' + encodeURIComponent(query) + '&display=100&sort=sim&exclude=used:rental:cbshop';
  const res=await fetch(url,{headers:{'X-Naver-Client-Id':clientId,'X-Naver-Client-Secret':clientSecret}});
  if (!res.ok) { const txt=await res.text(); throw new Error(`네이버 API 오류 (${res.status}): ${txt}`); }
  const data=await res.json() as NaverShopResponse;
  const skipped={notGameTitle:0,blacklisted:0,used:0,catalog:0,outOfRange:0,noPlatform:0};
  const byPlatform=new Map<string,CleanedPrice[]>();
  for (const item of data.items) {
    const title=stripTags(item.title);
    if (!isLikelyGameTitle(item,keywords)) {skipped.notGameTitle++; continue;}
    if (isBlacklisted(title)) {skipped.blacklisted++; continue;}
    if (isCatalogProduct(item)) {skipped.catalog++; continue;}
    if (isUsedItem(title)) {skipped.used++; continue;}
    if (isBlockedMall(item.mallName)) {skipped.used++; continue;}
    const price=parseInt(item.lprice,10);
    if (!isReasonablePrice(price)) {skipped.outOfRange++; continue;}
    const platform=detectPlatform(title);
    if (!platform) {skipped.noPlatform++; continue;}
    const cleaned:CleanedPrice={mallName:mapMallToSource(item.mallName),mallLabel:item.mallName,price,link:item.link,title,image:item.image,isDigital:isDigitalKey(title)?1:0};
    const arr=byPlatform.get(platform)||[]; arr.push(cleaned); byPlatform.set(platform,arr);
  }
  const buckets:PlatformBucket[]=[];
  for (const [platform,list] of byPlatform.entries()) {
    // 가격 이상치(중고 의심) 제외
    const filtered = filterPriceOutliers(list);
    skipped.used += (list.length - filtered.length);

    const bySource=new Map<string,CleanedPrice>();
    for (const c of filtered) { const key=`${c.mallName}|${c.isDigital}`; const existing=bySource.get(key); if (!existing||c.price<existing.price) bySource.set(key,c); }
    const prices=Array.from(bySource.values()).sort((a,b)=>a.price-b.price);
    buckets.push({platform,prices,count:filtered.length,lowest:prices.length?prices[0].price:null});
  }

  const order=['pc','ps5','ps4','xbox','switch','etc'];
  buckets.sort((a,b)=>order.indexOf(a.platform)-order.indexOf(b.platform));
  return {buckets,skipped,totalItems:data.items.length};
}
