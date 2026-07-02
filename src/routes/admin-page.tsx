// ============================================================
// 관리자 콘솔 HTML 페이지
// src/routes/admin-page.tsx
//   - 등록된 게임: 전체 선택 / 선택 삭제 컨트롤 추가
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

  <main class="admin-wrap" id="adminContent" hidden>
    <header class="admin-head">
      <h1>⚙️ 관리자 콘솔</h1>
      <div class="admin-head-actions">
        <button id="lockBtn" class="btn btn-sm">🔒 잠그기</button>
        <a href="/games" class="admin-back">← 사이트로</a>
      </div>
    </header>

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

    <section class="admin-card">
      <h2>🤖 게임 자동 가져오기</h2>
      <p class="admin-hint">
        한 행이 하나의 게임입니다. <b>대표 이름</b>은 사이트에 표시될 제목이고,
        <b>검색어(별칭)</b>는 쉼표(,)로 여러 개 넣으면 각각 검색한 결과를 하나로 합쳐 최저가를 뽑습니다.<br />
        예) 대표: <code>발더스 게이트 3</code> / 검색어: <code>발더스게이트3, BG3, Baldurs Gate 3</code>
      </p>

      <div class="ig-table">
        <div class="ig-head">
          <span class="ig-col-name">대표 이름 (표시용)</span>
          <span class="ig-col-alias">검색어 / 별칭 (쉼표로 구분)</span>
          <span class="ig-col-act"></span>
        </div>
        <div id="importGroups" class="ig-body"></div>
      </div>

      <div class="admin-row">
        <button id="addGroupRow" class="btn btn-sm">➕ 행 추가</button>
      </div>

      <div class="admin-row">
        <button id="previewImport" class="btn">🔍 미리보기 (저장 안 함)</button>
        <button id="runImport" class="btn btn-primary">⬇️ 가져오기 (실제 저장)</button>
      </div>
      <p id="importStatus" class="admin-status"></p>
      <div id="importResult" class="import-result"></div>
    </section>

    <section class="admin-card">
      <h2>📋 등록된 게임</h2>
      <!-- [추가] 선택 삭제 컨트롤 바 -->
      <div class="admin-bulk-bar">
        <label class="admin-selall">
          <input type="checkbox" id="selectAllGames" /> 전체 선택
        </label>
        <button id="bulkDeleteBtn" class="btn btn-sm btn-danger" disabled>선택 삭제</button>
        <button id="refreshGames" class="btn btn-sm">새로고침</button>
      </div>
      <ul id="gameList" class="admin-game-list"></ul>
    </section>
  </main>

  <script src="/static/admin.js"></script>
</body>
</html>`
}
