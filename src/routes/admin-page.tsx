// ============================================================
// 관리자 콘솔 HTML 페이지
// src/routes/admin-page.tsx
//   - 가벼운 관리자 모드
//   - 1) 관리자 토큰 입력 (localStorage 저장)
//   - 2) 쇼핑몰별 레퍼럴 ID 입력/저장
//   - 3) 게임 "제목만" 추가
//   - 4) 등록된 게임 목록 확인
//   모든 데이터 변경은 /admin/api/* (X-Admin-Token 헤더 필요)
// ============================================================

export function AdminPage(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>관리자 콘솔 · 게임 가격 추적기</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚙️</text></svg>" />
  <link href="/static/style.css" rel="stylesheet" />
  <link href="/static/admin.css" rel="stylesheet" />
</head>
<body>
  <!-- 잠금 화면: 비밀번호 통과 전에는 이 화면만 보임 -->
  <div id="lockScreen" class="lock-screen">
    <div class="lock-box">
      <div class="lock-icon">🔒</div>
      <h1>관리자 인증</h1>
      <p class="lock-hint">관리자 비밀번호를 입력하세요.</p>
      <form id="lockForm" autocomplete="off">
        <input type="password" id="lockPassword" class="lock-input" placeholder="비밀번호" autocomplete="current-password" />
        <button type="submit" class="btn btn-primary lock-btn">잠금 해제</button>
      </form>
      <p id="lockStatus" class="admin-status"></p>
      <a href="/games" class="lock-back">← 사이트로 돌아가기</a>
    </div>
  </div>

  <!-- 관리 콘텐츠: 인증 통과 후에만 표시 -->
  <main class="admin-wrap" id="adminContent" hidden>
    <header class="admin-head">
      <h1>⚙️ 관리자 콘솔</h1>
      <div class="admin-head-actions">
        <button id="lockBtn" class="btn btn-sm">🔒 잠그기</button>
        <a href="/games" class="admin-back">← 사이트로</a>
      </div>
    </header>

    <!-- 2) 레퍼럴 ID -->
    <section class="admin-card">
      <h2>💰 쇼핑몰 레퍼럴 ID</h2>
      <p class="admin-hint">한 번만 넣어두면 구매 링크에 자동으로 붙습니다. (서버에서만 결합 — 노출 안 됨)</p>
      <label class="admin-field">
        <span>쿠팡 파트너스 ID</span>
        <input type="text" id="coupang_partners_id" placeholder="예: AF1234567" />
      </label>
      <label class="admin-field">
        <span>링크프라이스 퍼블리셔 ID (a값)</span>
        <input type="text" id="linkprice_id" placeholder="예: A100705627" />
      </label>
      <button id="saveSettings" class="btn btn-primary">레퍼럴 저장</button>
      <p id="settingsStatus" class="admin-status"></p>
    </section>

    <!-- 3) 자동 임포트 (제목만 → 자동 검색/분류/저장) -->
    <section class="admin-card">
      <h2>🤖 게임 자동 가져오기</h2>
      <p class="admin-hint">제목을 한 줄에 하나씩 넣고 <b>미리보기</b>로 분류 결과를 확인한 뒤 <b>가져오기</b>를 누르세요. 검수/수동등록 없이 플랫폼별 가격이 자동으로 채워집니다.</p>
      <textarea id="importTitles" rows="5" placeholder="엘든링&#10;발더스 게이트 3&#10;사이버펑크 2077"></textarea>
      <div class="admin-row">
        <button id="previewImport" class="btn">🔍 미리보기 (저장 안 함)</button>
        <button id="runImport" class="btn btn-primary">⬇️ 가져오기 (실제 저장)</button>
      </div>
      <p id="importStatus" class="admin-status"></p>
      <div id="importResult" class="import-result"></div>
    </section>

    <!-- 4) 등록 목록 -->
    <section class="admin-card">
      <h2>📋 등록된 게임</h2>
      <button id="refreshGames" class="btn btn-sm">새로고침</button>
      <ul id="gameList" class="admin-game-list"></ul>
    </section>
  </main>

  <script src="/static/admin.js"></script>
</body>
</html>`
}
