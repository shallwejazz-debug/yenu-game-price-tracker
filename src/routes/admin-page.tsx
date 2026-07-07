// [2026-07-06] 자동 가져오기 UI 3칸화(대표이름/제외어/이미지URL), 별칭 입력 폐지 · 힌트 문구 정리
// ============================================================
// 관리자 콘솔 HTML 페이지
// src/routes/admin-page.tsx
//   - 등록된 게임: 전체 선택 / 선택 삭제 컨트롤
//   - 백업/복원: 내보내기 / 붙여넣기 재등록 / DB 초기화
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
          한 행이 하나의 게임입니다. <b>대표 이름</b>으로 네이버를 검색해 플랫폼별 최저가를 자동 수집합니다.<br />
          <b>키워드</b>는 시리즈/스핀오프에서 특정 작품만 남길 때 씁니다. 제목에 <b>모두 포함</b>돼야 통과(예: 할로우 나이트 실크송에서 <code>실크송</code>).<br />
          <b>제외어</b>는 파생판/스핀오프를 걸러낼 때만 씁니다 (쉼표로 여러 개). 예) 엘든링에서 <code>나이트레인,nightreign</code> 제외.<br />
          <b>이미지URL</b>은 비우면 자동 수집, 넣으면 그 이미지를 대표로 씁니다.
        </p>


      <div class="ig-table">
        <div class="ig-head">
          <span class="ig-col-name">대표 이름 (표시용)</span>
          <span class="ig-col-keywords">키워드 (포함, 쉼표)</span>
          <span class="ig-col-exclude">제외어 (쉼표, 없으면 비움)</span>
          <span class="ig-col-image">이미지URL (없으면 자동)</span>
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
      <!-- 선택 삭제 컨트롤 바 -->
      <div class="admin-bulk-bar">
        <label class="admin-selall">
          <input type="checkbox" id="selectAllGames" /> 전체 선택
        </label>
        <button id="bulkDeleteBtn" class="btn btn-sm btn-danger" disabled>선택 삭제</button>
        <button id="refreshGames" class="btn btn-sm">새로고침</button>
      </div>
      <ul id="gameList" class="admin-game-list"></ul>
    </section>

    <!-- ============ 백업 / 복원 ============ -->
    <section class="admin-card">
      <h2>💾 백업 / 복원</h2>
      <p class="admin-hint">
        현재 등록된 게임을 <b>대표이름 | 검색어 | 이미지URL | keywords | 제외어</b> 형식으로 내보냅니다.
        이 텍스트를 저장해두면, 나중에 아래 붙여넣기 창으로 그대로 재등록할 수 있습니다.
        (가격은 재등록 시 최신값으로 새로 수집됩니다.)
      </p>

      <div class="admin-row">
        <button id="exportBtn" class="btn">⬆️ 현재 목록 내보내기</button>
        <button id="exportTxtBtn" class="btn">📄 TXT로 저장</button>
        <button id="exportCsvBtn" class="btn">📊 CSV(엑셀)로 저장</button>
      </div>

      <textarea id="exportArea" class="admin-textarea" rows="6"
        placeholder="내보내기 버튼을 누르면 여기에 목록이 출력됩니다. (전체 선택 후 복사해서 보관하세요)"></textarea>
      <p id="exportStatus" class="admin-status"></p>

      <hr class="admin-hr" />

      <p class="admin-hint">
        아래 창에 <b>대표이름 | 검색어 | 이미지URL | keywords | 제외어</b> 형식으로 한 줄에 한 게임씩 붙여넣으세요.<br />
        (검색어·이미지·keywords·제외어는 모두 생략 가능. 검색어 생략 시 대표이름으로 검색.
        keywords는 시리즈물 구분용 필수조각 예:<code>용과같이,2</code>, 제외어는 예:<code>나이트레인</code>)
      </p>
      <textarea id="importPasteArea" class="admin-textarea" rows="8"
        placeholder="예)&#10;용과 같이 2 | 용과 같이 2 | https://.../img.jpg | 용과같이,2 | &#10;엘든링 | 엘든링 | | | 나이트레인"></textarea>
      <div class="admin-row">
        <button id="pastePreviewBtn" class="btn">🔍 붙여넣기 미리보기</button>
        <button id="pasteImportBtn" class="btn btn-primary">⬇️ 붙여넣기로 재등록 (실제 저장)</button>
      </div>
      <p id="pasteStatus" class="admin-status"></p>
      <div id="pasteResult" class="import-result"></div>
    </section>

    <!-- ============ 위험 구역 ============ -->
    <section class="admin-card admin-danger-zone">
      <h2>⚠️ 위험 구역</h2>
      <p class="admin-hint">
        모든 게임/에디션/가격/이력 데이터를 삭제합니다. (레퍼럴 ID 설정은 유지됩니다.)
        되돌릴 수 없으니 <b>반드시 먼저 위에서 내보내기로 백업</b>하세요.
      </p>
      <button id="resetAllBtn" class="btn btn-danger">전체 데이터 초기화</button>
      <p id="resetStatus" class="admin-status"></p>
    </section>
  </main>

  <script src="/static/admin.js"></script>
</body>
</html>`
}
