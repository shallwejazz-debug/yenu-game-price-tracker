// ============================================================
// 관리자 콘솔 HTML 페이지
// src/routes/admin-page.tsx
//
// 탭 구성
//   1. 현황
//   2. 후보 선별
//   3. 게임 가져오기
//   4. 게임 관리
//   5. 설정 / 백업
//
// 주의
//   - 후보 평가만으로 게임을 바로 저장하지 않음
//   - 선택 후보는 게임 가져오기 탭으로만 전달
//   - 실제 저장 전 기존 미리보기 단계를 거침
// ============================================================

export function AdminPage(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>관리자 콘솔 · 여누딜</title>

  <link
    rel="icon"
    href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚙️</text></svg>"
  />

  <link href="/static/style.css" rel="stylesheet" />
  <link
    href="/static/admin.css?v=20260721-watcher-transform-1"
    rel="stylesheet"
  />
</head>

<body>
  <!-- ======================================================
       관리자 잠금 화면
       ====================================================== -->
  <div id="lockScreen" class="lock-screen">
    <div class="lock-box">
      <div class="lock-icon">🔒</div>

      <h1>관리자 인증</h1>

      <p class="lock-hint">
        관리자 비밀번호를 입력하세요.
      </p>

      <form id="lockForm" autocomplete="off">
        <input
          type="password"
          id="lockPassword"
          class="lock-input"
          placeholder="비밀번호"
          autocomplete="current-password"
        />

        <button
          type="submit"
          class="btn btn-primary lock-btn"
        >
          잠금 해제
        </button>
      </form>

      <p id="lockStatus" class="admin-status"></p>

      <a href="/games" class="lock-back">
        ← 사이트로 돌아가기
      </a>
    </div>
  </div>

  <!-- ======================================================
       관리자 본문
       ====================================================== -->
  <main class="admin-wrap" id="adminContent" hidden>
    <header class="admin-head">
      <div>
        <h1>⚙️ 관리자 콘솔</h1>
        <p class="admin-head-sub">
          여누딜 게임·가격·후보 관리
        </p>
      </div>

      <div class="admin-head-actions">
        <button
          id="lockBtn"
          class="btn btn-sm"
          type="button"
        >
          🔒 잠그기
        </button>

        <a href="/games" class="admin-back">
          ← 사이트로
        </a>
      </div>
    </header>

    <!-- ====================================================
         상단 탭
         ==================================================== -->
    <nav
      class="admin-tabs"
      id="adminTabs"
      aria-label="관리자 메뉴"
    >
      <button
        type="button"
        class="admin-tab is-active"
        data-admin-tab="dashboard"
        aria-selected="true"
      >
        <span class="admin-tab-icon">🏠</span>
        <span>현황</span>
      </button>

      <button
              type="button"
              class="admin-tab"
              data-admin-tab="watcher"
              aria-selected="false"
            >
              <span class="admin-tab-icon">📡</span>
              <span>예판 WATCHER</span>
              <span
                id="watcherTabBadge"
                class="admin-tab-badge"
                hidden
              >
                0
              </span>
            </button>

      <button
        type="button"
        class="admin-tab"
        data-admin-tab="candidates"
        aria-selected="false"
      >
        <span class="admin-tab-icon">📊</span>
        <span>후보 선별</span>
        <span
          id="candidateTabBadge"
          class="admin-tab-badge"
          hidden
        >
          0
        </span>
      </button>

      <button
        type="button"
        class="admin-tab"
        data-admin-tab="import"
        aria-selected="false"
      >
        <span class="admin-tab-icon">🤖</span>
        <span>게임 가져오기</span>
        <span
          id="importTabBadge"
          class="admin-tab-badge"
          hidden
        >
          0
        </span>
      </button>

      <button
        type="button"
        class="admin-tab"
        data-admin-tab="games"
        aria-selected="false"
      >
        <span class="admin-tab-icon">🎮</span>
        <span>게임 관리</span>
      </button>

      <button
        type="button"
        class="admin-tab"
        data-admin-tab="settings"
        aria-selected="false"
      >
        <span class="admin-tab-icon">⚙️</span>
        <span>설정·백업</span>
      </button>
    </nav>

    <!-- ====================================================
         탭 1: 현황
         ==================================================== -->
    <section
      class="admin-panel is-active"
      data-admin-panel="dashboard"
    >
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>🏠 관리 현황</h2>
            <p class="admin-hint">
              등록된 게임과 현재 후보 작업 상태를 한눈에 확인합니다.
            </p>
          </div>

          <button
            id="refreshDashboard"
            class="btn btn-sm"
            type="button"
          >
            새로고침
          </button>
        </div>

        <div class="dashboard-grid">
          <article class="dashboard-stat">
            <span class="dashboard-stat-label">
              등록된 게임
            </span>
            <strong
              id="dashboardGameCount"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">
              전체 작품 수
            </span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">
              등록된 에디션
            </span>
            <strong
              id="dashboardEditionCount"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">
              플랫폼별 등록 합계
            </span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">
              평가된 후보
            </span>
            <strong
              id="dashboardCandidateCount"
              class="dashboard-stat-value"
            >
              0
            </strong>
            <span class="dashboard-stat-sub">
              현재 브라우저 임시 작업
            </span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">
              가져오기 대기
            </span>
            <strong
              id="dashboardImportCount"
              class="dashboard-stat-value"
            >
              0
            </strong>
            <span class="dashboard-stat-sub">
              아직 저장하지 않은 행
            </span>
          </article>
        </div>
      </section>

      <section class="admin-card">
        <h2>🚀 빠른 작업</h2>

        <p class="admin-hint">
          원하는 작업으로 바로 이동할 수 있습니다.
        </p>

        <div class="dashboard-actions">
          <button
            type="button"
            class="btn btn-primary"
            data-go-admin-tab="candidates"
          >
            📊 후보 게임 선별
          </button>

          <button
            type="button"
            class="btn"
            data-go-admin-tab="import"
          >
            🤖 게임 가져오기
          </button>

          <button
            type="button"
            class="btn"
            data-go-admin-tab="games"
          >
            🎮 등록 게임 관리
          </button>

          <button
            type="button"
            class="btn"
            data-go-admin-tab="settings"
          >
            ⚙️ 설정 및 백업
          </button>
        </div>
      </section>

      <section class="admin-card">
        <h2>💡 권장 작업 순서</h2>

        <ol class="admin-step-list">
          <li>
            다나와 등에서 후보 게임명을 복사합니다.
          </li>
          <li>
            <b>후보 선별</b> 탭에 한 줄에 하나씩 붙여넣습니다.
          </li>
          <li>
            여누딜의 자동 평가 결과와 판정 이유를 확인합니다.
          </li>
          <li>
            등록할 후보만 체크하여 <b>게임 가져오기</b>로 전달합니다.
          </li>
          <li>
            가져오기 미리보기를 확인한 후 실제 저장합니다.
          </li>
        </ol>

        <div class="admin-notice">
          후보 평가 결과만으로 게임이 자동 등록되지는 않습니다.
          실제 저장은 반드시 게임 가져오기 탭에서 직접 실행해야 합니다.
        </div>
      </section>
    </section>

      <!-- ====================================================
         탭 2: 예판 WATCHER
         ==================================================== -->
    <section
      class="admin-panel"
      data-admin-panel="watcher"
      hidden
    >
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>📡 예판 WATCHER</h2>
            <p class="admin-hint">
              공식 보도자료 발견 현황과 출처별 이미지 사용 정책을
              확인합니다. 허가 대기 이미지는 공개되지 않습니다.
            </p>
          </div>

                    <div class="admin-row" style="margin-top: 0;">
            <button
              id="collectArcWatcher"
              class="btn btn-sm"
              type="button"
            >
              아크 수집 실행
            </button>

            <button
              id="refreshWatcher"
              class="btn btn-sm"
              type="button"
            >
              새로고침
            </button>
          </div>

        </div>

        <div class="watcher-summary-grid">
          <article class="dashboard-stat">
            <span class="dashboard-stat-label">활성 출처</span>
            <strong
              id="watcherEnabledSources"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">현재 감시 대상</span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">신규 발견</span>
            <strong
              id="watcherDiscoveredItems"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">변환 전 보도자료</span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">변환 완료</span>
            <strong
              id="watcherTransformedItems"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">검수 준비 완료</span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">검수 중</span>
            <strong
              id="watcherReviewingItems"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">관리자 확인 필요</span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">출처 허가 대기</span>
            <strong
              id="watcherPendingPermissions"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">출처별 정책 회신 대기</span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">새 이벤트</span>
            <strong
              id="watcherUnreadEvents"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">읽지 않은 알림</span>
          </article>
        </div>

        <p
          id="watcherStatus"
          class="admin-status"
          aria-live="polite"
        ></p>
      </section>

      <!-- ======================================================
           WATCHER 이벤트
           ====================================================== -->
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>🔔 WATCHER 이벤트</h2>
      
            <p class="admin-hint">
              보도자료와 이미지 후보 발견 이력을 표시합니다.
              읽음 처리해도 기록은 삭제되지 않습니다.
            </p>
          </div>
      
          <button
            id="markAllWatcherEventsRead"
            class="btn btn-sm"
            type="button"
          >
            모두 읽음
          </button>
        </div>
      
        <div
          id="watcherEventList"
          class="watcher-event-list"
        >
          <div class="admin-empty">
            이벤트를 불러오는 중입니다.
          </div>
        </div>
      </section>

            <!-- ==================================================
           WATCHER 게임 등록 초안
           ================================================== -->
      <section
        id="watcherTransformCard"
        class="admin-card"
        hidden
      >
        <div class="admin-section-head">
          <div>
            <h2>📝 게임 등록 초안</h2>

            <p class="admin-hint">
              보도자료에서 확인한 사실 정보만 입력합니다.
              초안 저장만으로 게임이 공개되지는 않습니다.
            </p>
          </div>

          <button
            id="closeWatcherTransform"
            class="btn btn-sm"
            type="button"
          >
            닫기
          </button>
        </div>

        <input
          id="watcherTransformItemId"
          type="hidden"
          value=""
        />

        <div class="admin-notice">
          <strong id="watcherTransformSourceTitle">
            보도자료를 선택해 주세요.
          </strong>

          <div>
            <a
              id="watcherTransformSourceLink"
              class="watcher-item-link"
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              hidden
            >
              공식 보도자료 열기 ↗
            </a>
          </div>
        </div>

        <div class="watcher-transform-grid">
          <label class="admin-field">
            <span>게임 제목</span>

            <input
              id="watcherTransformTitle"
              type="text"
              placeholder="게임 공식 제목"
            />
          </label>

          <label class="admin-field">
            <span>플랫폼</span>

            <select id="watcherTransformPlatform">
              <option value="switch">
                Nintendo Switch
              </option>

              <option value="ps5">
                PlayStation 5
              </option>

              <option value="ps4">
                PlayStation 4
              </option>

              <option value="xbox">
                Xbox
              </option>

              <option value="pc">
                PC
              </option>

              <option value="etc">
                기타
              </option>
            </select>
          </label>

          <label class="admin-field">
            <span>에디션 표시명</span>

            <input
              id="watcherTransformEditionName"
              type="text"
              placeholder="예: Nintendo Switch 한국어 패키지판"
            />
          </label>

          <label class="admin-field">
            <span>장르</span>

            <input
              id="watcherTransformGenre"
              type="text"
              placeholder="예: 판타지 RPG"
            />
          </label>

          <label class="admin-field">
            <span>패키지 발매일</span>

            <input
              id="watcherTransformReleaseDate"
              type="date"
            />
          </label>

          <label class="admin-field">
            <span>예약판매 시작일</span>

            <input
              id="watcherTransformPreorderStart"
              type="date"
            />
          </label>

          <label class="admin-field">
            <span>예약판매 종료일</span>

            <input
              id="watcherTransformPreorderEnd"
              type="date"
            />
          </label>

          <label class="admin-field">
            <span>가격 후보</span>

            <input
              id="watcherTransformCandidatePrice"
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              placeholder="예: 44800"
            />
          </label>
        </div>

        <label class="admin-field">
          <span>예약 구매 특전</span>

          <input
            id="watcherTransformBonus"
            type="text"
            placeholder="예: 멀티 클리너"
          />
        </label>

        <label class="admin-field">
          <span>특전 참고사항</span>

          <textarea
            id="watcherTransformBonusNote"
            rows="3"
            placeholder="예: 약 200 × 200mm, 수량 한정, 조기 소진 가능"
          ></textarea>
        </label>

        <label class="admin-field">
          <span>공식 트레일러 URL</span>

          <input
            id="watcherTransformTrailer"
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </label>

  <!-- ==================================================
       WATCHER 대표 이미지 후보
       ================================================== -->
  <div
    id="watcherTransformImageSection"
    class="watcher-transform-images"
  >
    <div class="admin-section-head">
      <div>
        <h3>🖼️ 공식 이미지 후보</h3>

        <p class="admin-hint">
          공식 보도자료에서 수집된 이미지 중 대표 이미지 후보를
          한 장 선택합니다. 후보 선택만으로 이미지를 다운로드하거나
          공개하지 않습니다.
        </p>
      </div>

      <span
        id="watcherTransformImageCount"
        class="watcher-badge"
      >
        0개
      </span>
    </div>

    <div
      id="watcherTransformImagePolicy"
      class="admin-notice"
    >
      <strong>이미지 정책 확인 중</strong>

      <p class="admin-hint">
        출처의 이미지 사용 정책과 게임 등록 상태를 확인합니다.
      </p>
    </div>

    <div
      id="watcherTransformSelectedImage"
      class="admin-notice"
      hidden
    >
      <strong>선택된 대표 이미지</strong>

      <p
        id="watcherTransformSelectedImageText"
        class="admin-hint"
      ></p>
    </div>

    <div
      id="watcherTransformImageList"
      class="watcher-transform-image-grid"
    >
      <div class="admin-empty">
        보도자료를 열면 공식 이미지 후보를 불러옵니다.
      </div>
    </div>

    <p
      id="watcherTransformImageStatus"
      class="admin-status"
      aria-live="polite"
    ></p>

    <div class="admin-notice">
      <strong>현재 단계의 안전 원칙</strong>

      <p class="admin-hint">
        대표 이미지 후보를 선택해도 게임은 DRAFT 상태로 유지됩니다.
        games.image_url은 변경하지 않으며 이미지 다운로드·R2 저장·
        공개 처리는 별도의 최종 승인 단계에서만 진행합니다.
      </p>
    </div>
  </div>

     
        <div class="admin-row admin-row-wrap">
          <button
            id="saveWatcherTransform"
            class="btn btn-primary"
            type="button"
          >
            초안 저장
          </button>
            <button
              id="registerWatcherDraft"
              class="btn"
              type="button"
              disabled
            >
              초안 저장 후 등록
            </button>

          <button
            id="cancelWatcherTransform"
            class="btn"
            type="button"
          >
            취소
          </button>
        </div>

        <p
          id="watcherTransformStatus"
          class="admin-status"
          aria-live="polite"
        ></p>
      </section>


      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>🏢 수집 출처 및 이미지 정책</h2>
            <p class="admin-hint">
              PENDING은 사용 허가를 의미하지 않습니다.
              회신 전에는 관리자 후보 확인만 가능합니다.
            </p>
          </div>
        </div>

        <div
          id="watcherSourceList"
          class="watcher-source-list"
        >
          <div class="admin-empty">
            출처 정보를 불러오는 중입니다.
          </div>
        </div>
      </section>

      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>📰 발견된 공식 보도자료</h2>
            <p class="admin-hint">
              최신 발견 항목 50개를 표시합니다.
            </p>
          </div>
        </div>

        <div
          id="watcherItemList"
          class="watcher-item-list"
        >
          <div class="admin-empty">
            수집 항목을 불러오는 중입니다.
          </div>
        </div>
      </section>

      <section class="admin-card">
        <h2>🔒 현재 이미지 운영 원칙</h2>

        <div class="admin-notice">
          이미지 정책이 PENDING인 출처는 공식 이미지 URL만 후보로
          기록합니다. 사이트 공개, 자체 저장, 리사이즈 및 재배포는
          허가 범위가 확인될 때까지 차단합니다.
        </div>
      </section>
    </section>

    <!-- ====================================================
         탭 3: 후보 선별
         ==================================================== -->
    <section
      class="admin-panel"
      data-admin-panel="candidates"
      hidden
    >
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>📊 후보 게임 자동 선별</h2>
            <p class="admin-hint">
              후보명을 한꺼번에 입력하면 기존 등록 여부와 네이버 쇼핑
              검색 결과를 바탕으로 추천·검토·제외로 분류합니다.
            </p>
          </div>

          <button
            id="resetCandidateWork"
            class="btn btn-sm"
            type="button"
          >
            임시 작업 초기화
          </button>
        </div>

        <div class="candidate-options">
          <label class="admin-field candidate-option">
            <span>대상 플랫폼</span>

            <select id="candidatePlatform">
              <option value="switch">SWITCH</option>
              <option value="switch2">SWITCH 2</option>
              <option value="ps5">PS5</option>
              <option value="ps4">PS4</option>
              <option value="xbox">XBOX</option>
              <option value="pc">PC</option>
            </select>
          </label>

          <label class="admin-field candidate-option">
            <span>출시연도 또는 순위연도</span>

            <select id="candidateYear">
              <option value="">연도 미지정</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
              <option value="2022">2022</option>
              <option value="2021">2021</option>
              <option value="2020">2020</option>
              <option value="2019">2019</option>
              <option value="2018">2018</option>
              <option value="2017">2017</option>
            </select>
          </label>
        </div>

        <label class="admin-field">
          <span>후보 게임명</span>

          <textarea
            id="candidateTitles"
            class="admin-textarea candidate-textarea"
            rows="12"
            placeholder="한 줄에 게임 하나씩 붙여넣으세요.&#10;&#10;예)&#10;피크민 4&#10;슈퍼 마리오브라더스 원더&#10;젤다의 전설 티어스 오브 더 킹덤"
          ></textarea>
        </label>

        <div class="candidate-input-summary">
          <span>
            입력:
            <b id="candidateInputCount">0</b>개
          </span>

          <span>
            중복 제거 후:
            <b id="candidateUniqueCount">0</b>개
          </span>

          <span>
            한 번에 최대 100개
          </span>
        </div>

        <div class="admin-row admin-row-wrap">
          <button
            id="evaluateCandidates"
            class="btn btn-primary"
            type="button"
          >
            🔍 후보 자동 평가 시작
          </button>

          <button
            id="stopCandidateEvaluation"
            class="btn"
            type="button"
            disabled
          >
            평가 중단
          </button>

          <button
            id="restoreCandidateDraft"
            class="btn"
            type="button"
          >
            임시 저장 복원
          </button>
        </div>

        <p
          id="candidateStatus"
          class="admin-status"
          aria-live="polite"
        ></p>

        <div
          id="candidateProgressWrap"
          class="candidate-progress-wrap"
          hidden
        >
          <div class="candidate-progress-head">
            <span id="candidateProgressText">
              평가 준비 중
            </span>

            <span id="candidateProgressPercent">
              0%
            </span>
          </div>

          <div
            class="candidate-progress"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="0"
          >
            <div
              id="candidateProgressBar"
              class="candidate-progress-bar"
            ></div>
          </div>

          <p
            id="candidateCurrentTitle"
            class="candidate-current-title"
          ></p>
        </div>
      </section>

      <section
        id="candidateResultCard"
        class="admin-card"
        hidden
      >
        <div class="admin-section-head">
          <div>
            <h2>📋 평가 결과</h2>

            <p class="admin-hint">
              점수와 판정 이유를 확인한 뒤 등록할 게임만 선택하세요.
            </p>
          </div>

          <button
            id="retryFailedCandidates"
            class="btn btn-sm"
            type="button"
            hidden
          >
            실패 항목 재시도
          </button>
        </div>

        <div class="candidate-summary-grid">
          <button
            type="button"
            class="candidate-summary is-active"
            data-candidate-filter="all"
          >
            <span>전체</span>
            <strong id="candidateCountAll">0</strong>
          </button>

          <button
            type="button"
            class="candidate-summary candidate-summary-recommend"
            data-candidate-filter="recommend"
          >
            <span>추천</span>
            <strong id="candidateCountRecommend">0</strong>
          </button>

          <button
            type="button"
            class="candidate-summary candidate-summary-review"
            data-candidate-filter="review"
          >
            <span>검토</span>
            <strong id="candidateCountReview">0</strong>
          </button>

          <button
            type="button"
            class="candidate-summary candidate-summary-exclude"
            data-candidate-filter="exclude"
          >
            <span>제외</span>
            <strong id="candidateCountExclude">0</strong>
          </button>

          <button
            type="button"
            class="candidate-summary candidate-summary-existing"
            data-candidate-filter="existing"
          >
            <span>기등록</span>
            <strong id="candidateCountExisting">0</strong>
          </button>

          <button
            type="button"
            class="candidate-summary candidate-summary-error"
            data-candidate-filter="error"
          >
            <span>오류</span>
            <strong id="candidateCountError">0</strong>
          </button>
        </div>

        <div class="candidate-toolbar">
          <div class="candidate-toolbar-left">
            <label class="admin-selall">
              <input
                type="checkbox"
                id="selectAllCandidates"
              />
              현재 목록 전체 선택
            </label>

            <button
              id="selectRecommendedCandidates"
              class="btn btn-sm"
              type="button"
            >
              추천만 선택
            </button>

            <button
              id="clearCandidateSelection"
              class="btn btn-sm"
              type="button"
            >
              선택 해제
            </button>
          </div>

          <div class="candidate-toolbar-right">
            <label class="candidate-sort-label">
              정렬

              <select id="candidateSort">
                <option value="score-desc">
                  점수 높은 순
                </option>
                <option value="stores-desc">
                  판매처 많은 순
                </option>
                <option value="price-spread-desc">
                  가격 차이 큰 순
                </option>
                <option value="name-asc">
                  이름 순
                </option>
                <option value="input-order">
                  입력 순서
                </option>
              </select>
            </label>
          </div>
        </div>

        <div
          id="candidateResultList"
          class="candidate-result-list"
        ></div>

        <div class="candidate-bottom-bar">
          <div class="candidate-selected-info">
            <b id="candidateSelectedCount">0</b>개 선택됨
          </div>

          <button
            id="sendCandidatesToImport"
            class="btn btn-primary"
            type="button"
            disabled
          >
            선택 후보를 게임 가져오기로 보내기
          </button>
        </div>
      </section>
    </section>

    <!-- ====================================================
         탭 4: 게임 가져오기
         ==================================================== -->
    <section
      class="admin-panel"
      data-admin-panel="import"
      hidden
    >
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>🤖 게임 자동 가져오기</h2>

            <p class="admin-hint">
              한 행이 하나의 게임입니다. 먼저 미리보기로 검색 결과를
              확인하고 문제가 없을 때만 실제 저장을 실행하세요.
            </p>
          </div>

          <button
            id="clearImportRows"
            class="btn btn-sm"
            type="button"
          >
            입력 행 초기화
          </button>
        </div>

        <div class="admin-notice">
          후보 선별에서 전달된 게임은 기존 입력 행을 덮어쓰지 않고
          아래쪽에 추가됩니다. 이미 같은 이름이 입력돼 있으면 중복으로
          추가하지 않습니다.
        </div>

        <details class="admin-details">
          <summary>입력 항목 사용법 보기</summary>

          <div class="admin-details-body">
            <ul class="admin-help-list">
              <li>
                <b>대표 이름</b>: 사이트에 표시할 게임명입니다.
              </li>
              <li>
                <b>키워드</b>: 시리즈물에서 특정 작품을 구분할 때
                사용합니다. 쉼표로 여러 개 입력할 수 있습니다.
              </li>
              <li>
                <b>제외어</b>: 파생판이나 스핀오프 등을 제외할 때
                사용합니다.
              </li>
              <li>
                <b>이미지 URL</b>: 비우면 네이버 결과에서 자동
                수집합니다.
              </li>
              <li>
                <b>스위치 정책</b>: Switch 1·Switch 2 분류가
                애매할 때만 지정합니다.
              </li>
            </ul>
          </div>
        </details>

        <div class="ig-table">
          <div class="ig-head">
            <span class="ig-col-name">
              대표 이름
            </span>

            <span class="ig-col-keywords">
              키워드
            </span>

            <span class="ig-col-bottom">
              제외어 / 이미지 URL / 스위치 정책
            </span>

            <span class="ig-col-exclude">
              제외어
            </span>

            <span class="ig-col-image">
              이미지 URL
            </span>

            <span class="ig-col-policy">
              스위치 정책
            </span>

            <span class="ig-col-act"></span>
          </div>

          <div id="importGroups" class="ig-body"></div>
        </div>

        <div class="admin-row admin-row-wrap">
          <button
            id="addGroupRow"
            class="btn btn-sm"
            type="button"
          >
            ➕ 행 추가
          </button>

          <button
            id="removeEmptyImportRows"
            class="btn btn-sm"
            type="button"
          >
            빈 행 정리
          </button>
        </div>

        <div class="admin-row admin-row-wrap import-action-row">
          <button
            id="previewImport"
            class="btn"
            type="button"
          >
            🔍 미리보기
          </button>

          <button
            id="runImport"
            class="btn btn-primary"
            type="button"
          >
            ⬇️ 실제 저장
          </button>
        </div>

        <p
          id="importStatus"
          class="admin-status"
          aria-live="polite"
        ></p>

        <div
          id="importResult"
          class="import-result"
        ></div>
      </section>
    </section>

    <!-- ====================================================
         탭 5: 게임 관리
         ==================================================== -->
    <section
      class="admin-panel"
      data-admin-panel="games"
      hidden
    >
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>🎮 등록된 게임</h2>

            <p class="admin-hint">
              현재 등록된 게임을 확인하거나 선택한 게임을 삭제할 수
              있습니다.
            </p>
          </div>

          <button
            id="refreshGames"
            class="btn btn-sm"
            type="button"
          >
            새로고침
          </button>
        </div>

        <label class="admin-field">
          <span>게임 검색</span>

          <input
            type="text"
            id="gameListSearch"
            placeholder="게임명으로 검색"
          />
        </label>

        <div class="admin-bulk-bar">
          <label class="admin-selall">
            <input
              type="checkbox"
              id="selectAllGames"
            />
            현재 목록 전체 선택
          </label>

          <span id="selectedGameCount" class="admin-selection-count">
            0개 선택됨
          </span>

          <button
            id="bulkDeleteBtn"
            class="btn btn-sm btn-danger"
            type="button"
            disabled
          >
            선택 삭제
          </button>
        </div>

        <p
          id="gameListStatus"
          class="admin-status"
        ></p>

        <ul
          id="gameList"
          class="admin-game-list"
        ></ul>
      </section>
    </section>

    <!-- ====================================================
         탭 6: 설정 및 백업
         ==================================================== -->
    <section
      class="admin-panel"
      data-admin-panel="settings"
      hidden
    >
      <section class="admin-card">
        <h2>⚙️ 관리자 설정</h2>

        <h3>💰 쇼핑몰 레퍼럴 ID</h3>

        <p class="admin-hint">
          한 번만 입력해두면 구매 링크에 자동으로 적용됩니다.
          서버에서 결합되므로 일반 사용자 화면에는 설정값이 직접
          노출되지 않습니다.
        </p>

        <label class="admin-field">
          <span>쿠팡 파트너스 ID</span>

          <input
            type="text"
            id="coupang_partners_id"
            placeholder="예: AF1234567"
          />
        </label>

        <label class="admin-field">
          <span>링크프라이스 퍼블리셔 ID</span>

          <input
            type="text"
            id="linkprice_id"
            placeholder="예: A100705627"
          />
        </label>

        <hr class="admin-hr" />

        <h3>🚫 전역 수집 필터</h3>

        <p class="admin-hint">
          모든 게임의 네이버 가격 수집에 공통으로 적용됩니다.
          항목은 쉼표 또는 줄바꿈으로 구분하세요.
          정규식이 아닌 일반 문자열로 검색됩니다.
        </p>

        <label class="admin-field">
          <span>추가 블랙리스트 키워드</span>

          <textarea
            id="custom_blacklist_keywords"
            class="admin-textarea"
            rows="6"
            placeholder="예)&#10;해외판&#10;계정판매&#10;게임 공략집"
          ></textarea>
        </label>

        <p class="admin-hint">
          상품 제목에 위 문자열이 포함되면 가격 수집 대상에서
          제외됩니다. 특정 게임 하나에만 적용할 제외어는 게임
          가져오기의 제외어 항목을 사용하세요.
        </p>

        <label class="admin-field">
          <span>추가 차단 쇼핑몰</span>

          <textarea
            id="custom_blocked_malls"
            class="admin-textarea"
            rows="5"
            placeholder="예)&#10;문제쇼핑몰&#10;업체명"
          ></textarea>
        </label>

        <p class="admin-hint">
          네이버 쇼핑의 판매처 이름에 위 문자열이 포함되면 해당
          판매처 상품을 제외합니다.
        </p>

        <button
          id="saveSettings"
          class="btn btn-primary"
          type="button"
        >
          관리자 설정 저장
        </button>

        <p
          id="settingsStatus"
          class="admin-status"
        ></p>
      </section>

      <section class="admin-card">
        <h2>💾 백업 / 복원</h2>

        <p class="admin-hint">
          현재 등록된 게임을 아래 형식으로 내보냅니다.
        </p>

        <div class="admin-format-box">
          대표이름 | 검색어 | 이미지URL | keywords | 제외어 | 스위치정책
        </div>

        <p class="admin-hint">
          내보낸 텍스트를 별도로 보관하면 나중에 붙여넣기 방식으로
          다시 등록할 수 있습니다. 가격은 복원 시 최신값으로 다시
          수집됩니다.
        </p>

        <div class="admin-row admin-row-wrap">
          <button
            id="exportBtn"
            class="btn"
            type="button"
          >
            ⬆️ 목록 내보내기
          </button>

          <button
            id="exportTxtBtn"
            class="btn"
            type="button"
          >
            📄 TXT 저장
          </button>

          <button
            id="exportCsvBtn"
            class="btn"
            type="button"
          >
            📊 CSV 저장
          </button>
        </div>

        <textarea
          id="exportArea"
          class="admin-textarea"
          rows="8"
          placeholder="내보내기 버튼을 누르면 여기에 목록이 표시됩니다."
        ></textarea>

        <p
          id="exportStatus"
          class="admin-status"
        ></p>

        <hr class="admin-hr" />

        <h3>♻️ 붙여넣기로 복원</h3>

        <p class="admin-hint">
          백업한 내용을 한 줄에 한 게임씩 붙여넣으세요.
          먼저 미리보기를 실행한 뒤 실제 저장하는 것을 권장합니다.
        </p>

        <textarea
          id="importPasteArea"
          class="admin-textarea"
          rows="10"
          placeholder="예)&#10;용과 같이 2 | 용과 같이 2 | https://.../img.jpg | 용과같이,2 | |&#10;엘든링 | 엘든링 | | | 나이트레인 |&#10;007 퍼스트라이트 | | https://.../img.jpg | | | s2"
        ></textarea>

        <div class="admin-row admin-row-wrap">
          <button
            id="pastePreviewBtn"
            class="btn"
            type="button"
          >
            🔍 붙여넣기 미리보기
          </button>

          <button
            id="pasteImportBtn"
            class="btn btn-primary"
            type="button"
          >
            ⬇️ 붙여넣기로 실제 저장
          </button>
        </div>

        <p
          id="pasteStatus"
          class="admin-status"
        ></p>

        <div
          id="pasteResult"
          class="import-result"
        ></div>
      </section>

      <section class="admin-card admin-danger-zone">
        <h2>⚠️ 위험 구역</h2>

        <p class="admin-hint">
          모든 게임·에디션·가격·이력 데이터를 삭제합니다.
          레퍼럴 ID와 전역 수집 필터 설정은 유지됩니다.
          이 작업은 되돌릴 수 없으므로 반드시 먼저 백업하세요.
        </p>

        <button
          id="resetAllBtn"
          class="btn btn-danger"
          type="button"
        >
          전체 데이터 초기화
        </button>

        <p
          id="resetStatus"
          class="admin-status"
        ></p>
      </section>
    </section>

    <!-- 화면 알림 -->
    <div
      id="adminToast"
      class="admin-toast"
      role="status"
      aria-live="polite"
      hidden
    ></div>
  </main>

    <script src="/static/admin.js?v=20260721-watcher-tab"></script>
    <script src="/static/watcher-admin.js?v=20260721-watcher-register-2"></script>
</body>
</html>`
}
