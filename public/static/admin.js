// ============================================================
// 관리자 콘솔 프론트엔드
// public/static/admin.js
//   - 토큰을 localStorage에 보관, API 호출 시 X-Admin-Token 헤더로 전송
//   - 5분 비활동 시 자동 잠금 + "사이트로" 이동 시 즉시 잠금
// ============================================================

(function () {
  'use strict'

  const TOKEN_KEY = 'gpt_admin_token'
  const TS_KEY = 'gpt_admin_ts'           // 마지막 활동 시각
  const IDLE_LIMIT = 5 * 60 * 1000        // 5분 (밀리초)
  const $ = (id) => document.getElementById(id)

  let idleTimer = null

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || ''
  }

  // 토큰 + 활동시각 기록
  function saveToken(pw) {
    localStorage.setItem(TOKEN_KEY, pw)
    localStorage.setItem(TS_KEY, String(Date.now()))
  }
  // 활동시각만 갱신 (작업 중일 때)
  function touch() {
    if (getToken()) localStorage.setItem(TS_KEY, String(Date.now()))
  }
  // 토큰 폐기 (잠금)
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TS_KEY)
  }
  // 5분 지났는지 확인
  function isExpired() {
    const ts = parseInt(localStorage.getItem(TS_KEY) || '0', 10)
    if (!ts) return true
    return Date.now() - ts > IDLE_LIMIT
  }

  function setStatus(el, msg, ok) {
    el.textContent = msg
    el.className = 'admin-status ' + (ok ? 'ok' : 'err')
  }

  async function api(path, method, body) {
    const token = getToken()
    const res = await fetch('/admin/api' + path, {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': token,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status)
    return data
  }

  // ---------- 자동 잠금 타이머 ----------
  function startIdleTimer() {
    stopIdleTimer()
    idleTimer = setInterval(() => {
      if (isExpired()) {
        clearToken()
        showLock('5분간 활동이 없어 자동 잠금되었습니다.', true)
      }
    }, 30 * 1000) // 30초마다 검사
  }
  function stopIdleTimer() {
    if (idleTimer) { clearInterval(idleTimer); idleTimer = null }
  }

  // ---------- 잠금 화면 / 인증 게이트 ----------
  function showAdmin() {
    $('lockScreen').style.display = 'none'
    $('adminContent').hidden = false
    touch()
    startIdleTimer()
    loadSettings()
    loadGames()
  }
  function showLock(msg, ok) {
    stopIdleTimer()
    $('adminContent').hidden = true
    $('lockScreen').style.display = 'flex'
    if (msg) setStatus($('lockStatus'), msg, !!ok)
  }

  // 서버에 토큰이 맞는지 확인 (틀리면 관리 화면 안 보여줌)
  async function verifyToken() {
    try {
      await api('/verify', 'POST', {})
      return true
    } catch {
      return false
    }
  }

  // 잠금 해제 폼
  $('lockForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const pw = $('lockPassword').value.trim()
    if (!pw) {
      setStatus($('lockStatus'), '비밀번호를 입력하세요.', false)
      return
    }
    saveToken(pw)
    setStatus($('lockStatus'), '확인 중…', true)
    const ok = await verifyToken()
    if (ok) {
      $('lockPassword').value = ''
      showAdmin()
    } else {
      clearToken()
      setStatus($('lockStatus'), '❌ 비밀번호가 틀렸습니다.', false)
    }
  })

  // 잠그기 버튼 (로그아웃)
  $('lockBtn').addEventListener('click', () => {
    clearToken()
    showLock('잠금 처리되었습니다.', true)
  })

  // "사이트로" 링크 → 떠날 때 즉시 잠금
  document.querySelectorAll('.admin-back, .lock-back').forEach((a) => {
    a.addEventListener('click', () => { clearToken() })
  })

  // 사용자 활동 감지 → 활동시각 갱신 (작업 중엔 안 잠김)
  ;['click', 'keydown', 'input'].forEach((ev) => {
    document.addEventListener(ev, touch, true)
  })

  // ---------- 레퍼럴 설정 ----------
  async function loadSettings() {
    try {
      const data = await api('/settings')
      const s = data.settings || {}
      $('coupang_partners_id').value = s.coupang_partners_id || ''
      $('linkprice_id').value = s.linkprice_id || ''
    } catch (e) {
      // 토큰 없거나 인증 실패는 조용히
    }
  }

  $('saveSettings').addEventListener('click', async () => {
    try {
      await api('/settings', 'POST', {
        coupang_partners_id: $('coupang_partners_id').value.trim(),
        linkprice_id: $('linkprice_id').value.trim(),
      })
      setStatus($('settingsStatus'), '✅ 레퍼럴 ID 저장 완료', true)
    } catch (e) {
      setStatus($('settingsStatus'), '❌ ' + e.message, false)
    }
  })

  // ---------- 자동 임포트 ----------
  function getTitles() {
    return $('importTitles').value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  function won(n) {
    if (n === null || n === undefined) return '-'
    return '\u20a9' + Number(n).toLocaleString('ko-KR')
  }

  function renderImportResult(data) {
    const host = $('importResult')
    const mode = data.dryRun ? '미리보기' : '저장 완료'
    const blocks = (data.results || []).map(function (r) {
      if (r.error) {
        return '<div class="imp-game imp-err"><b>' + escapeHtml(r.title) + '</b> — ' + escapeHtml(r.error) + '</div>'
      }
      const plats = Object.keys(r.platforms || {})
      const rows = plats.map(function (code) {
        const p = r.platforms[code]
        const savedCnt = r.saved && r.saved[code] !== undefined ? ' · 저장 ' + r.saved[code] + '건' : ''
        const malls = (p.malls || [])
          .map(function (m) { return escapeHtml(m.label) + ' ' + won(m.price) })
          .join(', ')
        return (
          '<li class="imp-plat"><span class="imp-plat-label">' + escapeHtml(p.label) + '</span> ' +
          '최저 <b>' + won(p.lowest) + '</b> (' + p.count + '건' + savedCnt + ')' +
          (malls ? '<div class="imp-malls">' + malls + '</div>' : '') +
          '</li>'
        )
      }).join('')
      const sk = r.skipped || {}
      const skText = '제외 — 비게임 ' + (sk.notGameTitle||0) + ', 중고 ' + (sk.used||0) +
        ', 가격범위밖 ' + (sk.outOfRange||0) + ', 플랫폼불명 ' + (sk.noPlatform||0)
      return (
        '<div class="imp-game">' +
        '<div class="imp-title">🎮 ' + escapeHtml(r.title) + (r.game_id ? ' <span class="imp-gid">#' + r.game_id + '</span>' : '') + '</div>' +
        (plats.length ? '<ul class="imp-plats">' + rows + '</ul>' : '<p class="imp-none">분류된 플랫폼 없음</p>') +
        '<p class="imp-skip">' + skText + '</p>' +
        '</div>'
      )
    }).join('')
    host.innerHTML = '<div class="imp-mode">[' + mode + '] ' + (data.count || 0) + '개 처리</div>' + blocks
  }

  async function doImport(dryRun) {
    const titles = getTitles()
    if (titles.length === 0) {
      setStatus($('importStatus'), '제목을 한 개 이상 입력하세요.', false)
      return
    }
    setStatus($('importStatus'), (dryRun ? '🔍 분석' : '⬇️ 수집/저장') + ' 중… (잠시 기다려주세요)', true)
    try {
      const data = await api('/auto-import', 'POST', { titles: titles, dryRun: dryRun })
      setStatus($('importStatus'), '✅ ' + data.mode + ' (' + data.count + '개)', true)
      renderImportResult(data)
      if (!dryRun) loadGames()
    } catch (e) {
      setStatus($('importStatus'), '❌ ' + e.message, false)
    }
  }

  $('previewImport').addEventListener('click', function () { doImport(true) })
  $('runImport').addEventListener('click', function () {
    if (confirm('실제로 DB에 저장합니다. 진행할까요?')) doImport(false)
  })

  // ---------- 게임 목록 ----------
  async function loadGames() {
    const list = $('gameList')
    try {
      const data = await api('/games')
      const games = data.games || []
      if (games.length === 0) {
        list.innerHTML = '<li class="admin-empty">등록된 게임이 없습니다.</li>'
        return
      }
      list.innerHTML = games
        .map(
          (g) =>
            '<li class="admin-game-item">' +
            '<span class="ag-id">#' + g.id + '</span>' +
            '<span class="ag-title">' + escapeHtml(g.title) + '</span>' +
            '<span class="ag-editions">' + (g.edition_count || 0) + '개 플랫폼</span>' +
            '<button class="ag-delete" data-id="' + g.id + '" data-title="' + escapeHtml(g.title) + '" title="삭제">−</button>' +
            '</li>'
        )
        .join('')
    } catch (e) {
      list.innerHTML = '<li class="admin-empty">목록을 불러오지 못했습니다 (' + escapeHtml(e.message) + ')</li>'
    }
  }
  $('refreshGames').addEventListener('click', loadGames)

  // ---------- 게임 삭제 (이벤트 위임) ----------
  $('gameList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.ag-delete')
    if (!btn) return
    const id = btn.getAttribute('data-id')
    const title = btn.getAttribute('data-title')
    if (!confirm("'" + title + "' 게임을 삭제하시겠습니까?\n연결된 플랫폼/가격 데이터도 모두 삭제됩니다.")) return
    btn.disabled = true
    try {
      await api('/games/' + id, 'DELETE')
      loadGames()
    } catch (err) {
      alert('삭제 실패: ' + err.message)
      btn.disabled = false
    }
  })

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  // ---------- 초기화 ----------
  document.addEventListener('DOMContentLoaded', async () => {
    const saved = getToken()
    if (saved) {
      // 5분 지났으면 만료 처리
      if (isExpired()) {
        clearToken()
        showLock('세션이 만료되었습니다. 다시 로그인하세요.', false)
        return
      }
      const ok = await verifyToken()
      if (ok) {
        showAdmin()
        return
      }
      clearToken()
    }
    showLock()
  })
})()
