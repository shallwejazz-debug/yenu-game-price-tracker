// [2026-07-10] 자동 가져오기 UI에 "스위치 정책" 드롭다운 추가(4칸→5칸)
//   - 대표이름 | 키워드 | 제외어 | 이미지URL | 스위치정책(자동/s2/s1)
//   - 백업/복원 양식을 6칸으로 안내: 이름 | 검색어 | 이미지 | keywords | exclude | 정책
// [2026-07-16] DB 사용자 블랙리스트·차단몰 입력란 추가
// ============================================================
// 관리자 콘솔 HTML 페이지
// src/routes/admin-page.tsx
//   - 관리자 설정: 레퍼럴 ID / 사용자 블랙리스트 / 차단 쇼핑몰
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
      <h2>⚙️ 관리자 설정</h2>

      <h3>💰 쇼핑몰 레퍼럴 ID</h3>
      <p class="admin-hint">
        한 번만 넣어두면 구매 링크에 자동으로 붙습니다.
        (서버에서만 결합 — 노출 안 됨)
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
        <span>링크프라이스 퍼블리셔 ID (a값)</span>
        <input
          type="text"
          id="linkprice_id"
          placeholder="예: A100705627"
        />
      </label>

      <hr class="admin-hr" />

      <h3>🚫 전역 수집 필터</h3>
      <p class="admin-hint">
        여기에 등록한 내용은 모든 게임의 네이버 가격 수집에 공통 적용됩니다.<br />
        웹앱의 수동 수집과 자동 가져오기뿐 아니라 같은 D1을 사용하는 Cron에도 적용됩니다.<br />
        항목은 <b>쉼표 또는 줄바꿈</b>으로 구분하세요.
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
        상품 제목에 위 문자열이 포함되면 수집에서 제외됩니다.
        게임 하나에만 적용할 제외어는 이곳이 아니라 해당 게임의
        <b>제외어</b>를 사용하세요.
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
        네이버 쇼핑의 판매처 이름에 위 문자열이 포함되면 해당 판매처 상품을 제외합니다.
      </p>

      <button id="saveSettings" class="btn btn-primary">
        관리자 설정 저장
      </button>
      <p id="settingsStatus" class="admin-status"></p>
    </section>

    <section class="admin-card">
      <h2>🤖 게임 자동 가져오기</h2>
      <p class="admin-hint">
        한 행이 하나의 게임입니다. <b>대표 이름</b>으로 네이버를 검색해 플랫폼별 최저가를 자동 수집합니다.<br />
        <b>키워드</b>는 시리즈/스핀오프에서 특정 작품만 남길 때 씁니다. 제목에 <b>모두 포함</b>돼야 통과합니다.
        예: 할로우 나이트 실크송에서 <code>실크송</code>.<br />
        <b>제외어</b>는 파생판/스핀오프를 걸러낼 때만 씁니다.
        쉼표로 여러 개 입력할 수 있습니다.
        예: 엘든링에서 <code>나이트레인,nightreign</code> 제외.<br />
        <b>이미지URL</b>은 비우면 자동 수집하고, 넣으면 그 이미지를 대표로 씁니다.<br />
        <b>스위치 정책</b>은 스위치1·스위치2 상품을 구분할 때 씁니다.
        <code>자동</code>은 판매자 표기대로 분류하고,
        <code>스위치2 전용</code>은 "SWITCH"로만 적힌 상품도 스위치2로 분류하며,
        <code>스위치1 전용</code>은 스위치2로 표기된 상품도 스위치1로 분류합니다.
        스위치 게임이 아니면 <code>자동</code>으로 두세요.
      </p>

      <div class="ig-table">
        <div class="ig-head">
          <span class="ig-col-name">대표 이름 (표시용)</span>
          <span class="ig-col-keywords">키워드 (포함, 쉼표)</span>
          <span class="ig-col-exclude">제외어 (쉼표, 없으면 비움)</span>
          <span class="ig-col-image">이미지URL (없으면 자동)</span>
          <span class="ig-col-policy">스위치 정책</span>
          <span class="ig-col-act"></span>
        </div>

        <div id="importGroups" class="ig-body"></div>
      </div>

      <div class="admin-row">
        <button id="addGroupRow" class="btn btn-sm">➕ 행 추가</button>
      </div>

      <div class="admin-row">
        <button id="previewImport" class="btn">
          🔍 미리보기 (저장 안 함)
        </button>
        <button id="runImport" class="btn btn-primary">
          ⬇️ 가져오기 (실제 저장)
        </button>
      </div>

      <p id="importStatus" class="admin-status"></p>
      <div id="importResult" class="import-result"></div>
    </section>

    <section class="admin-card">
      <h2>📋 등록된 게임</h2>

      <div class="admin-bulk-bar">
        <label class="admin-selall">
          <input type="checkbox" id="selectAllGames" />
          전체 선택
        </label>

        <button
          id="bulkDeleteBtn"
          class="btn btn-sm btn-danger"
          disabled
        >
          선택 삭제
        </button>

        <button id="refreshGames" class="btn btn-sm">
          새로고침
        </button>
      </div>

      <ul id="gameList" class="admin-game-list"></ul>
    </section>

    <section class="admin-card">
      <h2>💾 백업 / 복원</h2>

      <p class="admin-hint">
        현재 등록된 게임을
        <b>대표이름 | 검색어 | 이미지URL | keywords | 제외어 | 스위치정책</b>
        형식으로 내보냅니다.
        이 텍스트를 저장해두면 나중에 아래 붙여넣기 창으로 그대로 재등록할 수 있습니다.
        가격은 재등록 시 최신값으로 다시 수집됩니다.<br />
        맨 끝 <b>스위치정책</b> 칸은 스위치2 전용 게임이면
        <code>s2</code>, 스위치1 전용이면 <code>s1</code>,
        자동 분류는 비워둡니다.
      </p>

      <div class="admin-row">
        <button id="exportBtn" class="btn">
          ⬆️ 현재 목록 내보내기
        </button>
        <button id="exportTxtBtn" class="btn">
          📄 TXT로 저장
        </button>
        <button id="exportCsvBtn" class="btn">
          📊 CSV(엑셀)로 저장
        </button>
      </div>

      <textarea
        id="exportArea"
        class="admin-textarea"
        rows="6"
        placeholder="내보내기 버튼을 누르면 여기에 목록이 출력됩니다. (전체 선택 후 복사해서 보관하세요)"
      ></textarea>

      <p id="exportStatus" class="admin-status"></p>

      <hr class="admin-hr" />

      <p class="admin-hint">
        아래 창에
        <b>대표이름 | 검색어 | 이미지URL | keywords | 제외어 | 스위치정책</b>
        형식으로 한 줄에 한 게임씩 붙여넣으세요.<br />
        검색어·이미지·keywords·제외어·정책은 모두 생략할 수 있습니다.
        검색어를 생략하면 대표 이름으로 검색합니다.
        keywords는 시리즈물 구분용 필수 조각입니다.
        예: <code>용과같이,2</code>.
        제외어는 예: <code>나이트레인</code>.
        스위치2 전용이면 맨 끝에 <code>s2</code>,
        스위치1 전용이면 <code>s1</code>을 입력합니다.
      </p>

      <textarea
        id="importPasteArea"
        class="admin-textarea"
        rows="8"
        placeholder="예)&#10;용과 같이 2 | 용과 같이 2 | https://.../img.jpg | 용과같이,2 | |&#10;엘든링 | 엘든링 | | | 나이트레인 |&#10;007 퍼스트라이트 | | https://.../img.jpg | | | s2"
      ></textarea>

      <div class="admin-row">
        <button id="pastePreviewBtn" class="btn">
          🔍 붙여넣기 미리보기
        </button>
        <button id="pasteImportBtn" class="btn btn-primary">
          ⬇️ 붙여넣기로 재등록 (실제 저장)
        </button>
      </div>

      <p id="pasteStatus" class="admin-status"></p>
      <div id="pasteResult" class="import-result"></div>
    </section>

    <section class="admin-card admin-danger-zone">
      <h2>⚠️ 위험 구역</h2>
      <p class="admin-hint">
        모든 게임/에디션/가격/이력 데이터를 삭제합니다.
        레퍼럴 ID와 전역 수집 필터 설정은 유지됩니다.
        되돌릴 수 없으니 <b>반드시 먼저 위에서 내보내기로 백업</b>하세요.
      </p>

      <button id="resetAllBtn" class="btn btn-danger">
        전체 데이터 초기화
      </button>

      <p id="resetStatus" class="admin-status"></p>
    </section>
  </main>

  <script src="/static/admin.js"></script>
</body>
</html>`
}
