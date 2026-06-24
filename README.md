# 🎮 여누의 게임 가격 추적기

한국형 게임 가격 비교/추적 서비스. **디지털/패키지 가격 분리**, **콘솔별 카테고리**,
**플랫폼별 개별 가격**, **한국 쇼핑몰 비교(쿠팡/G마켓/11번가)** 가 핵심 차별점.

## 프로젝트 개요
- **목표**: 맨두얏(노트북 가성비) 모델을 게임에 적용 — 같은 게임도 플랫폼(PC/PS5/PS4/XBOX/SWITCH)마다 다른 가격을 한눈에 비교
- **수익 모델**: 패키지(실물)는 쿠팡 파트너스/G마켓/11번가 제휴, 디지털(Steam/PSN/닌텐도)은 제휴 없음 → 정보 제공만
- **운영 철학**: 100개 이상 게임을 **사람 검수 없이 자동 수집** (자동화 우선)

## 주요 기능 (완료)
- ✅ 콘솔 탭(PC/PS5/PS4/XBOX/SWITCH/ETC) + 게임 그리드 + 특가 사이드바
- ✅ **인라인 아코디언**: 카드 클릭 시 페이지 이동 없이 카드 아래로 상세 펼침
  - 펼친 영역 안에서 플랫폼 전환(스위치) + 디지털/패키지 가격 분리 표시
- ✅ 플랫폼별 개별 가격(엘든링 PS5/PS4/PC는 각각 다른 상품·다른 가격)
- ✅ 네이버 쇼핑 연동 + 굿즈 필터(category3="게임타이틀") + 신품 필터(중고 제외)
- ✅ **자동 임포트**: 제목만 입력 → 검색 → 게임타이틀/신품 필터 → 플랫폼 자동분류 → 작품/에디션/가격 자동 저장 (멱등성 보장)
- ✅ 경량 관리자 콘솔: 레퍼럴 ID 설정 + 자동 임포트(미리보기/가져오기)
- ✅ 어필리에이트 리다이렉터(/go/:id) — ID는 서버에서만 결합(노출 방지)

## 기능별 URL
### 공개 페이지
- `GET /` → `/games?platform=pc` 리다이렉트
- `GET /games?platform=<코드>` — 콘솔별 게임 목록 (코드: pc/ps5/ps4/xbox/switch/etc)
- `GET /games/:gameId` — 첫 플랫폼 상세로 리다이렉트(폴백, 아코디언 미지원 환경용)
- `GET /games/:gameId/:platform` — 특정 플랫폼 상세(폴백 페이지)
- `GET /go/:priceId` — 어필리에이트 결합 후 상품 페이지로 302

### JSON API (아코디언/프론트엔드용)
- `GET /api/games/:gameId` — 게임의 전체 에디션 + 디지털/패키지 가격(JSON)

### 관리자 (X-Admin-Token 헤더 필요)
- `GET  /admin` — 관리자 콘솔(토큰/레퍼럴/자동임포트)
- `GET  /admin/api/settings` · `POST /admin/api/settings` — 레퍼럴 ID 조회/저장
- `POST /admin/api/auto-import` — 자동 임포트
  - 바디: `{ "titles": ["엘든링", ...], "dryRun": true }`
  - `dryRun=true`: 분류 결과만 미리보기(저장 안 함) / `false`: 실제 저장
- `GET  /admin/api/games` — 등록된 게임 목록
- (저수준) `POST /admin/games`, `/admin/games/:id/editions`, `PATCH /admin/editions/:id`,
  `POST /admin/editions/:id/prices`, `POST /admin/editions/:id/fetch-prices`

## 데이터 구조
2단 구조: **games(작품) → editions(플랫폼판) → prices(가격)**
- `games`: 작품 공통 정보(제목, 이미지, 정가)
- `editions`: 플랫폼판(game_id, platform, search_query, keywords, steam_appid)
- `prices`: edition_id별 source/가격/is_digital(1=디지털,0=패키지)/product_url
- `price_history`: edition_id + is_digital별 역대 최저가
- `settings`: 레퍼럴 ID 등 key-value 설정
- **저장소**: Cloudflare D1 (로컬 개발은 `--local` SQLite)

## 자동화 설계
→ `docs/AUTOMATION_DESIGN.md` 참고. 핵심:
- **제목만으로 플랫폼 자동 분류 가능**(실측 검증). 상품 제목에 PS5/PS4/XBOX/스팀 등 키워드가 거의 항상 포함.
- 파이프라인: 제목 → 네이버 검색(display=100) → 게임타이틀/신품/가격 필터 → 플랫폼 버킷 분리 → 에디션 자동생성 → 가격 저장 → price_history 갱신
- dryRun 미리보기로 오분류를 사전 점검 → 신뢰 쌓이면 완전 자동 전환
- (예정) Cron 주기적 가격 갱신

## 사용 가이드
**일반 사용자**: 콘솔 탭 선택 → 게임 카드 클릭 → 펼쳐진 상세에서 플랫폼 전환하며 디지털/패키지 최저가 비교 → 구매 버튼.

**관리자**: `/admin` 접속 → 토큰 입력 → (1회) 레퍼럴 ID 저장 → 게임 제목을 줄단위로 입력 → **미리보기**로 분류 확인 → **가져오기**로 저장.

## 로컬 개발
```bash
npm run build
pm2 start ecosystem.config.cjs        # wrangler pages dev (port 3000)
# D1 마이그레이션
npx wrangler d1 migrations apply webapp-production --local
```

## 배포
- **플랫폼**: Cloudflare Pages
- **상태**: 로컬 개발 중 (프로덕션 미배포)
- **기술 스택**: Hono + TypeScript + Cloudflare D1 + Vanilla JS(아코디언)
- **외부 API**: 네이버 쇼핑(연동 완료), Steam/IsThereAnyDeal/Resend(예정)

## 남은 작업
- 오분류 튜닝(예: 스파이더맨2가 SWITCH로 잘못 잡히는 케이스) — 작품-플랫폼 화이트리스트/신뢰도 점수
- 가격 추이 그래프(3/6개월, Chart.js)
- Cron 주기적 가격 자동 수집
- 위시리스트 + 가격 알림(이메일/브라우저 푸시)
- 디지털 스토어 정가/할인 연동(Steam, ITAD)

_최종 수정: 2026-06-23_
