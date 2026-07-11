// [2026-07-10] switch_policy 지원 / [2026-07-07] 로마자 정규화 / [2026-07-11] rejected·start·화이트리스트
// =============================================================
// 네이버 쇼핑 API 연동 모듈  src/naver.ts
// =============================================================

interface NaverShopItem { title: string; link: string; image: string; lprice: string; hprice: string; mallName: string; productId: string; productType: string; category1: string; category2: string; category3: string; category4: string; }
interface NaverShopResponse { total: number; start: number; display: number; items: NaverShopItem[]; }
export interface CleanedPrice { mallName: string; mallLabel: string; price: number; link: string; title: string; image: string; isDigital: number; }

function stripTags(s: string): string { return s.replace(/<[^>]+>/g, '').trim(); }
function mapMallToSource(mallName: string): string {
  const n = mallName.toLowerCase();
  if (n.includes('쿠팡') || n.includes('coupang')) return 'coupang';
  if (n.includes('g마켓') || n.includes('gmarket') || n.includes('지마켓')) return 'gmarket';
  if (n.includes('11번가') || n.includes('11st')) return '11st';
  if (n.includes('옥션') || n.includes('auction')) return 'auction';
  // [2026-07-11] 어필리에이트 화이트리스트 몰 매핑 추가
  if (n.includes('롯데on') || n.includes('롯데온') || n.includes('lotteon')) return 'lotteon';
  if (n.includes('yes24') || n.includes('예스24') || n.includes('예스이십사')) return 'yes24';
  if (n.includes('hmall') || n.includes('현대hmall') || n.includes('현대몰') || n.includes('the현대')) return 'hmall';
  if (n.includes('하이마트') || n.includes('himart')) return 'himart';
  if (n.includes('오늘의집') || n.includes('ohou') || n.includes('bucketplace')) return 'ohou';
  if (n === '네이버' || n.includes('naver') || n.includes('스마트스토어')) return 'naver';
  return 'etc';
}

// [2026-07-11] 어필리에이트 화이트리스트 (특전/예약 필터 완화 + 가격방어)
const WHITELIST_MALLS = new Set<string>([
  '11st', 'gmarket', 'auction', 'lotteon', // 필수 4
  'yes24', 'hmall', 'himart',              // 추가 3
  'ohou',                                  // 오늘의집(승인대기, 선반영)
]);
const WL_PRICE_MIN = 30000;
const WL_PRICE_MAX = 200000; // 상한(필요시 220000 등으로 조정)
// 화이트리스트여도 무조건 차단하는 순수 굿즈 단품
// [2026-07-11] 화이트리스트여도 무조건 차단하는 순수 굿즈/액세서리 (본품 아님)
const WL_HARD_BLOCK_RE = /카드\s*팟|카드\s*포드|card\s*pod|카드\s*케이스|수납\s*케이스|키링|피규어|아미보|amiibo|스틸북|steel\s*?book|아트북|art\s*?book|사운드트랙|ost|포스터|엽서|스티커|인형|쿠션|머그|텀블러|배지|뱃지|키캡|파우치|가방|스트랩|보호\s*필름|그립|거치대|스탠드/i;
function isWhitelistMall(mallName: string): boolean {
  return WHITELIST_MALLS.has(mapMallToSource(mallName));
}

// ---------- 로마자 숫자 정규화 (키워드 매칭 전용) ----------
const ROMAN_MAP: Record<string, string> = {
  i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8',
  ix: '9', x: '10', xi: '11', xii: '12', xiii: '13'
};
function normalizeTitleForMatch(loweredTitle: string): string {
  const converted = loweredTitle.replace(
    /\b(viii|vii|vi|iv|ix|xiii|xii|xi|x|iii|ii|i|v)\b/g,
    (m) => ROMAN_MAP[m] ?? m
  );
  return converted.replace(/\s+/g, '');
}

// ---------- 블랙리스트 & 차단몰 ----------
const BLACKLIST_KEYWORDS = ['계정','기존계정','공유계정','신규계정','대리','대행','해외계정','지역우회','vpn','미개통','미사용계정','na버전','aa버전','na 버전','aa 버전','상점환율','상점국가','국가변경','환율변경','strategy guide','walkthrough','공략집','전략 가이드','tips and tricks'];
const BLACKLIST_REGEX = [
  /\b(na|aa)\s*버전\b/i,
  /\b(na|aa)\s*계정\b/i,
  /[\(\[]\s*(na|aa)\s*[\)\]]/i,
  /\b(na|aa)\s*ver\b/i,
  /(na|aa)\s*$/i
];
const BLOCKED_MALLS = ['마리오친구','메루카리','번개장터','중고나라','유나이트게임','yunitegame','메이저코드','영게임스토어','영게임즈','영게임','younggames','아이티케어스토어','아이티케어','게임하다','크리스랑','코드나라','GAME창고','game창고','마켓몬스터','marketmonster','원클릭샵','오피스토이몰','sqgame','정직한게임판매','정직한게임'];

function isBlacklisted(title: string): boolean { const t = title.toLowerCase(); if (BLACKLIST_KEYWORDS.some(w => t.includes(w.toLowerCase()))) return true; if (BLACKLIST_REGEX.some(re => re.test(title))) return true; return false; }
function isBlockedMall(mallName: string): boolean { return BLOCKED_MALLS.some(w => mallName.toLowerCase().includes(w.toLowerCase())); }

// ---------- 네이버 가격비교(catalog) 상품 판별 ----------
const CATALOG_PRODUCT_TYPES = new Set([1, 4, 7, 10]);
function isCatalogProduct(item: NaverShopItem): boolean {
  const pt = Number(item.productType);
  if (CATALOG_PRODUCT_TYPES.has(pt)) return true;
  const link = (item.link || '').toLowerCase();
  if (link.includes('search.shopping.naver.com/catalog')) return true;
  return false;
}

// ---------- 디지털 판별 ----------
const DIGITAL_KEYWORDS = ['스팀','steam','스팀키','cd키','cd-key','cdkey','시리얼키','시리얼번호','디지털','digital','다운로드','download','이메일발송','온라인코드','이숍','eshop','다운로드 번호','psn','플레이스테이션 스토어','닌텐도 e숍'];
const DIGITAL_REGEX = [
  /다운로드\s*코드/i,
  /온라인\s*(게임\s*)?코드/i,
  /게임\s*코드/i,
  /디지털\s*코드/i,
  /코드\s*발송/i,
  /이메일\s*코드/i,
  /\bcd[\s\-]?key\b/i,
  /(다운로드|온라인|디지털|이메일)\s*(번호|키)/i,
];
function isDigitalKey(title: string): boolean { const t = title.toLowerCase(); if (DIGITAL_KEYWORDS.some(w => t.includes(w.toLowerCase()))) return true; if (DIGITAL_REGEX.some(re => re.test(title))) return true; return false; }

// ---------- 특수판(CE/디럭스/한정판/예약) 판별 ----------
const EDITION_REGEX = [
  /\bce\b/i,
  /\bdx\b/i,
  /컬(렉|랙)터/,
  /collector/i,
  /디럭스|deluxe/i,
  /얼티밋|ultimate/i,
  /골드\s*에디션|gold\s*edition/i,
  /스페셜\s*에디션|special\s*edition/i,
  /스페셜리스트|specialist/i,
  /한정|리미티드|limited/i,
  /예약|예구|선주문|pre[\s-]?order/i,
];
function isSpecialEdition(title: string): boolean { return EDITION_REGEX.some(re => re.test(title)); }

// ---------- 제외 키워드(excludeKeywords) 매칭 ----------
function isExcludedTitle(normTitle: string, excludeKeywords: string[]): boolean {
  if (excludeKeywords.length === 0) return false;
  return excludeKeywords.some(k => {
    const nk = k.toLowerCase().replace(/\s+/g, '');
    return nk.length > 0 && normTitle.includes(nk);
  });
}

// [2026-07-11] 화이트리스트 몰 우회 인자(wl) 추가:
//   wl=true 이면 특수판(예약/특전) 및 banned 굿즈어 필터를 완화한다.
//   단, 키워드 AND / 제외어 / 카테고리 검사는 그대로 유지한다.
function isLikelyGameTitle(item: NaverShopItem, gameKeywords: string[], excludeKeywords: string[] = [], wl: boolean = false): boolean {
  if (item.category3 !== '게임타이틀') return false;
  const title = stripTags(item.title).toLowerCase();

  // [2026-07-11] 화이트리스트 여부와 무관하게 순수 굿즈/액세서리는 무조건 차단
  if (WL_HARD_BLOCK_RE.test(title)) return false;

  if (!wl) {
    const banned = [ /* ...기존 그대로... */ ];
    if (banned.some(w => title.includes(w))) return false;
    if (isSpecialEdition(title)) return false;
  }
  const normTitle = normalizeTitleForMatch(title);
  if (isExcludedTitle(normTitle, excludeKeywords)) return false;

  if (gameKeywords.length > 0) {
    const allMatch = gameKeywords.every(k => {
      const nk = k.toLowerCase().replace(/\s+/g, '');
      return nk.length > 0 && normTitle.includes(nk);
    });
    if (!allMatch) return false;
  }
  return true;
}
function isReasonablePrice(price: number): boolean { return price >= 5000 && price <= 300000; }
function isUsedItem(title: string): boolean { const t = title.toLowerCase(); const usedWords = ['중고','대여','렌탈','렌트','used','리퍼']; return usedWords.some(w => t.includes(w)); }

// ---------- 가격 이상치(중고 의심) 제외 ----------
function filterPriceOutliers(list: CleanedPrice[]): CleanedPrice[] {
  const groups: Record<string, CleanedPrice[]> = { '0': [], '1': [] };
  for (const c of list) groups[String(c.isDigital)].push(c);

  const result: CleanedPrice[] = [];
  for (const key of Object.keys(groups)) {
    const g = groups[key];
    if (g.length < 3) { result.push(...g); continue; }
    const sorted = g.map(c => c.price).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const floor = median * 0.55;
    for (const c of g) { if (c.price >= floor) result.push(c); }
  }
  return result;
}

const PLATFORM_RULES: Array<{code:string;patterns:RegExp[]}> = [
  {code:'ps5',patterns:[/ps5/i,/플레이스테이션\s*5/,/플스\s*5/]},
  {code:'ps4',patterns:[/ps4/i,/플레이스테이션\s*4/,/플스\s*4/]},
  {code:'xbox',patterns:[/xbox/i,/엑스박스/,/엑박/,/series\s*[xs]/i,/xbox\s*one/i]},
  {code:'switch2',patterns:[/스위치\s*2/,/switch\s*2/i,/\bns2\b/i,/닌텐도\s*스위치\s*2/]},
  {code:'switch',patterns:[/스위치/,/switch/i,/\bns\b/i,/닌텐도/]},
  {code:'pc',patterns:[/\bpc\b/i,/스팀/,/steam/i,/에픽/,/epic/i,/gog/i]}
];
export function detectPlatform(title: string): string | null {
  const hasPS4 = /ps4|플레이스테이션\s*4|플스\s*4/i.test(title);
  const hasPS5 = /ps5|플레이스테이션\s*5|플스\s*5/i.test(title);
  if (hasPS4 && hasPS5) return 'ps4';
  if (/스위치\s*2|switch\s*2|\bns2\b/i.test(title)) return 'switch2';
  for (const rule of PLATFORM_RULES) { if (rule.patterns.some(re => re.test(title))) return rule.code; }
  return null;
}

// [2026-07-11] 탈락 상품 상세 기록
export interface RejectedItem { reason:string; mall:string; title:string; category:string; platform:string|null; price:number; wl:boolean; }
export interface PlatformBucket { platform:string; prices:CleanedPrice[]; count:number; lowest:number|null; }
export interface ClassifyResult {
  buckets:PlatformBucket[];
  skipped:{notGameTitle:number;blacklisted:number;used:number;catalog:number;outOfRange:number;noPlatform:number;excluded:number;};
  totalItems:number;
  rejected:RejectedItem[];
}

export async function searchAndClassify(
  clientId: string,
  clientSecret: string,
  query: string,
  keywords: string[] = [],
  excludeKeywords: string[] = [],
  switchPolicy: string | null = null,   // [2026-07-10] null|'auto'|'s2'|'s1'
  startParam: number = 1                // [2026-07-11] 네이버 start (1,101,201...)
): Promise<ClassifyResult> {
  let targetPlatform = detectPlatform(query);

  const forceSwitch2 = switchPolicy === 's2';
  const forceSwitch1 = switchPolicy === 's1';
  if (forceSwitch2 && (targetPlatform === 'switch' || targetPlatform === 'switch2')) targetPlatform = 'switch2';
  if (forceSwitch1 && (targetPlatform === 'switch' || targetPlatform === 'switch2')) targetPlatform = 'switch';

  const normExcludes = excludeKeywords.map(k => k.toLowerCase().replace(/\s+/g, '')).filter(k => k.length > 0);

  const skipped={notGameTitle:0,blacklisted:0,used:0,catalog:0,outOfRange:0,noPlatform:0,excluded:0};
  const rejected:RejectedItem[]=[];
const rej=(reason:string,item:NaverShopItem,title:string,platform:string|null,wl:boolean=false)=>{
  if (rejected.length<200) rejected.push({reason,mall:item.mallName,title,category:item.category3||'',platform,price:parseInt(item.lprice,10)||0,wl});
};
  const byPlatform=new Map<string,CleanedPrice[]>();

  // [2026-07-11] start=1, 101 두 페이지 병합 (롯데ON 등 100위 밖 매물 확보)
  const MAX_PAGES = 2;
  const startBase = Math.min(Math.max(startParam || 1, 1), 1000);
  const starts:number[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const s = startBase + p * 100;
    if (s <= 1000) starts.push(s);
  }

  let totalItems = 0;
  const seenLinks = new Set<string>();

  for (const s of starts) {
    const url='https://openapi.naver.com/v1/search/shop.json?query=' + encodeURIComponent(query) + '&display=100&start=' + s + '&sort=sim&exclude=used:rental:cbshop';
    const res=await fetch(url,{headers:{'X-Naver-Client-Id':clientId,'X-Naver-Client-Secret':clientSecret}});
    if (!res.ok) { const txt=await res.text(); throw new Error(`네이버 API 오류 (${res.status}): ${txt}`); }
    const data=await res.json() as NaverShopResponse;
    totalItems += data.items.length;
    if (data.items.length === 0) break; // 더 없으면 중단

    for (const item of data.items) {
      const title=stripTags(item.title);
      if (seenLinks.has(item.link)) continue; // 페이지 간 중복 제거
      seenLinks.add(item.link);

      const wl = isWhitelistMall(item.mallName); // [2026-07-11] 화이트리스트 여부

      // 제외 키워드 우선 검사
      if (normExcludes.length > 0) {
        const normTitle = title.toLowerCase().replace(/\s+/g, '');
        if (normExcludes.some(nk => normTitle.includes(nk))) { skipped.excluded++; rej('excluded',item,title,null); continue; }
      }

      // 굿즈 단품은 화이트리스트여도 무조건 차단
      if (WL_HARD_BLOCK_RE.test(title)) { skipped.notGameTitle++; rej('goodsBlock',item,title,null,wl); continue; }
      if (!isLikelyGameTitle(item,keywords,excludeKeywords,wl)) { skipped.notGameTitle++; rej('notGameTitle',item,title,null,wl); continue; }

      // notGameTitle(특전/예약 등): 화이트리스트 몰은 완화(wl 전달)
      if (!isLikelyGameTitle(item,keywords,excludeKeywords,wl)) { skipped.notGameTitle++; rej('notGameTitle',item,title,null); continue; }
      if (isBlacklisted(title)) { skipped.blacklisted++; rej('blacklisted',item,title,null); continue; }
      if (isCatalogProduct(item)) { skipped.catalog++; rej('catalog',item,title,null); continue; }
      if (isUsedItem(title)) { skipped.used++; rej('used',item,title,null); continue; }
      if (isBlockedMall(item.mallName)) { skipped.used++; rej('blockedMall',item,title,null); continue; }

      const price=parseInt(item.lprice,10);
      // 가격 필터: 화이트리스트는 3만~20만 방어, 일반몰은 기존 로직
      if (wl) {
        if (price < WL_PRICE_MIN || price > WL_PRICE_MAX) { skipped.outOfRange++; rej('wlOutOfRange:'+price,item,title,null); continue; }
      } else {
        if (!isReasonablePrice(price)) { skipped.outOfRange++; rej('outOfRange',item,title,null); continue; }
      }

      let platform=detectPlatform(title);
      if (!platform) { skipped.noPlatform++; rej('noPlatform(none)',item,title,null); continue; }

      // [2026-07-10] switch_policy 승격/강등 (스위치 계열만)
      if (forceSwitch2 && platform === 'switch') platform = 'switch2';
      if (forceSwitch1 && platform === 'switch2') platform = 'switch';

      if (targetPlatform && platform !== targetPlatform) { skipped.noPlatform++; rej('platformMismatch:'+platform,item,title,platform); continue; }

      const cleaned:CleanedPrice={mallName:mapMallToSource(item.mallName),mallLabel:item.mallName,price,link:item.link,title,image:item.image,isDigital:isDigitalKey(title)?1:0};
      const arr=byPlatform.get(platform)||[]; arr.push(cleaned); byPlatform.set(platform,arr);
    }
  }

  const buckets:PlatformBucket[]=[];
  for (const [platform,list] of byPlatform.entries()) {
    const filtered = filterPriceOutliers(list);
    skipped.used += (list.length - filtered.length);

    const bySource=new Map<string,CleanedPrice>();
    for (const c of filtered) { const key=`${c.mallName}|${c.isDigital}`; const existing=bySource.get(key); if (!existing||c.price<existing.price) bySource.set(key,c); }
    const prices=Array.from(bySource.values()).sort((a,b)=>a.price-b.price);
    buckets.push({platform,prices,count:filtered.length,lowest:prices.length?prices[0].price:null});
  }

  const order=['pc','ps5','ps4','xbox','switch','switch2','etc'];
  buckets.sort((a,b)=>order.indexOf(a.platform)-order.indexOf(b.platform));
  return {buckets,skipped,totalItems,rejected};
}
