// ============================================================
// 네이버 쇼핑 API 연동 모듈  src/naver.ts
//   - 게임명 검색 → 패키지/디지털 가격 + 구매 링크 수집
//   - 굿즈/계정/중고/회색지대 상품 제외
//   - PS4+PS5 동시 언급 매물은 실물 기준 PS4로 분류
// ============================================================

interface NaverShopItem { title: string; link: string; image: string; lprice: string; hprice: string; mallName: string; productId: string; productType: string; category1: string; category2: string; category3: string; category4: string; }
interface NaverShopResponse { total: number; start: number; display: number; items: NaverShopItem[]; }
export interface CleanedPrice { mallName: string; mallLabel: string; price: number; link: string; title: string; image: string; isDigital: number; }

function stripTags(s: string): string { return s.replace(/<[^>]+>/g, '').trim(); }
function mapMallToSource(mallName: string): string { const n = mallName.toLowerCase(); if (n.includes('쿠팡') || n.includes('coupang')) return 'coupang'; if (n.includes('g마켓') || n.includes('gmarket') || n.includes('지마켓')) return 'gmarket'; if (n.includes('11번가') || n.includes('11st')) return '11st'; if (n.includes('옥션') || n.includes('auction')) return 'auction'; if (n === '네이버' || n.includes('naver') || n.includes('스마트스토어')) return 'naver'; return 'etc'; }

// ---------- 블랙리스트 & 차단몰 ----------
const BLACKLIST_KEYWORDS = ['계정','기존계정','공유계정','신규계정','대리','대행','해외계정','지역우회','vpn','미개통','미사용계정','na버전','aa버전','na 버전','aa 버전','상점환율','상점국가','국가변경','환율변경'];
const BLACKLIST_REGEX = [/\b(na|aa)\s*버전\b/i, /\b(na|aa)\s*계정\b/i];
// 중고/개인거래성 판매처 차단 (네이버 API 제목엔 "중고"가 없고 상세페이지에만 있는 케이스 대응)
const BLOCKED_MALLS = ['마리오친구','메루카리','번개장터','중고나라','유나이트게임','yunitegame','메이저코드'];

function isBlacklisted(title: string): boolean { const t = title.toLowerCase(); if (BLACKLIST_KEYWORDS.some(w => t.includes(w.toLowerCase()))) return true; if (BLACKLIST_REGEX.some(re => re.test(title))) return true; return false; }
function isBlockedMall(mallName: string): boolean { return BLOCKED_MALLS.some(w => mallName.toLowerCase().includes(w.toLowerCase())); }

const DIGITAL_KEYWORDS = ['스팀','steam','스팀키','cd키','cd-key','cdkey','시리얼키','시리얼번호','디지털','digital','다운로드','download','이메일발송','온라인코드','pc판 키','에디션 키','이숍','eshop','다운로드 번호'];
const DIGITAL_REGEX = [/\bcode\b/i, /(^|[^가-힣])코드([^가-힣]|$)/];
function isDigitalKey(title: string): boolean { const t = title.toLowerCase(); if (DIGITAL_KEYWORDS.some(w => t.includes(w.toLowerCase()))) return true; if (DIGITAL_REGEX.some(re => re.test(title))) return true; return false; }

function isLikelyGameTitle(item: NaverShopItem, gameKeywords: string[]): boolean {
  if (item.category3 !== '게임타이틀') return false;
  const title = stripTags(item.title).toLowerCase();
  const banned = ['굿즈','피규어','커버','스티커','키링','포스터','머천','인형','쿠션','악세사리','악세서리','스킨','케이스'];
  if (banned.some(w => title.includes(w))) return false;
  if (gameKeywords.length > 0 && !gameKeywords.some(k => title.includes(k.toLowerCase()))) return false;
  return true;
}
function isReasonablePrice(price: number): boolean { return price >= 5000 && price <= 300000; }
function isUsedItem(title: string): boolean { const t = title.toLowerCase(); const usedWords = ['중고','대여','렌탈','렌트','used','리퍼']; return usedWords.some(w => t.includes(w)); }

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
export interface ClassifyResult { buckets:PlatformBucket[]; skipped:{notGameTitle:number;blacklisted:number;used:number;outOfRange:number;noPlatform:number;}; totalItems:number; }

export async function searchAndClassify(clientId:string,clientSecret:string,query:string,keywords:string[]=[]): Promise<ClassifyResult> {
  const url='https://openapi.naver.com/v1/search/shop.json?query=' + encodeURIComponent(query) + '&display=100&sort=sim';
  const res=await fetch(url,{headers:{'X-Naver-Client-Id':clientId,'X-Naver-Client-Secret':clientSecret}});
  if (!res.ok) { const txt=await res.text(); throw new Error(`네이버 API 오류 (${res.status}): ${txt}`); }
  const data=await res.json() as NaverShopResponse;
  const skipped={notGameTitle:0,blacklisted:0,used:0,outOfRange:0,noPlatform:0};
  const byPlatform=new Map<string,CleanedPrice[]>();
  for (const item of data.items) {
    const title=stripTags(item.title);
    if (!isLikelyGameTitle(item,keywords)) {skipped.notGameTitle++; continue;}
    if (isBlacklisted(title)) {skipped.blacklisted++; continue;}
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
    const bySource=new Map<string,CleanedPrice>();
    for (const c of list) { const key=`${c.mallName}|${c.isDigital}`; const existing=bySource.get(key); if (!existing||c.price<existing.price) bySource.set(key,c); }
    const prices=Array.from(bySource.values()).sort((a,b)=>a.price-b.price);
    buckets.push({platform,prices,count:list.length,lowest:prices.length?prices[0].price:null});
  }
  const order=['pc','ps5','ps4','xbox','switch','etc'];
  buckets.sort((a,b)=>order.indexOf(a.platform)-order.indexOf(b.platform));
  return {buckets,skipped,totalItems:data.items.length};
}

export async function searchGamePrices(clientId:string,clientSecret:string,query:string,keywords:string[]=[]): Promise<CleanedPrice[]> {
  const url='https://openapi.naver.com/v1/search/shop.json?query=' + encodeURIComponent(query) + '&display=30&sort=sim';
  const res=await fetch(url,{headers:{'X-Naver-Client-Id':clientId,'X-Naver-Client-Secret':clientSecret}});
  if (!res.ok) { const txt=await res.text(); throw new Error(`네이버 API 오류 (${res.status}): ${txt}`); }
  const data=await res.json() as NaverShopResponse;
  const cleaned:CleanedPrice[]=[];
  for (const item of data.items) {
    if (!isLikelyGameTitle(item,keywords)) continue;
    const title=stripTags(item.title);
    if (isBlacklisted(title)) continue;
    if (isUsedItem(title)) continue;
    if (isBlockedMall(item.mallName)) continue;
    const price=parseInt(item.lprice,10);
    if (!isReasonablePrice(price)) continue;
    const platform=detectPlatform(title); // (참고용, 필터에는 영향 없음)
    cleaned.push({mallName:mapMallToSource(item.mallName),mallLabel:item.mallName,price,link:item.link,title,image:item.image,isDigital:isDigitalKey(title)?1:0});
  }
  const bySource=new Map<string,CleanedPrice>();
  for (const c of cleaned) { const key=`${c.mallName}|${c.isDigital}`; const existing=bySource.get(key); if (!existing||c.price<existing.price) bySource.set(key,c); }
  return Array.from(bySource.values()).sort((a,b)=>a.price-b.price);
}
