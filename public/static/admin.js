// ============================================================
// 관리자 콘솔 프론트엔드
// public/static/admin.js
//   - 토큰을 localStorage에 보관, API 호출 시 X-Admin-Token 헤더로 전송
// ============================================================

(function () {
  'use strict'

  const TOKEN_KEY = 'gpt_admin_token'
  const $ = (id) => document.getElementById(id)

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || ''
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

  // ---------- 잠금 화면 / 인증 게이트 ----------
  function showAdmin() {
    $('lockScreen').style.display = 'none'
    $('adminContent').hidden = false
    loadSettings()
    loadGames()
  }
  function showLock(msg, ok) {
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
    localStorage.setItem(TOKEN_KEY, pw)
    setStatus($('lockStatus'), '확인 중…', true)
    const ok = await verifyToken()
    if (ok) {
      $('lockPassword').value = ''
      showAdmin()
    } else {
      localStorage.removeItem(TOKEN_KEY)
      setStatus($('lockStatus'), '❌ 비밀번호가 틀렸습니다.', false)
    }
  })

  // 잠그기 버튼 (로그아웃)
  $('lockBtn').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY)
    showLock('잠금 처리되었습니다.', true)
  })

  // ---------- 레퍼럴 설정 ----------
  async function loadSettings() {
    try {
      const data = await api('/settings')
      const s = data.settings || {}
      $('coupang_partners_id').value = s.coupang_partners_id || ''
      $('gmarket_esm_id').value = s.gmarket_esm_id || ''
      $('elevenst_affiliate_id').value = s.elevenst_affiliate_id || ''
    } catch (e) {
      // 토큰 없거나 인증 실패는 조용히
    }
  }

  $('saveSettings').addEventListener('click', async () => {
    try {
      await api('/settings', 'POST', {
        coupang_partners_id: $('coupang_partners_id').value.trim(),
        gmarket_esm_id: $('gmarket_esm_id').value.trim(),
        elevenst_affiliate_id: $('elevenst_affiliate_id').value.trim(),
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
            '</li>'
        )
        .join('')
    } catch (e) {
      list.innerHTML = '<li class="admin-empty">목록을 불러오지 못했습니다 (' + escapeHtml(e.message) + ')</li>'
    }
  }
  $('refreshGames').addEventListener('click', loadGames)

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
      // 저장된 비밀번호가 여전히 유효한지 확인
      const ok = await verifyToken()
      if (ok) {
        showAdmin()
        return
      }
      localStorage.removeItem(TOKEN_KEY)
    }
    showLock()
  })
})()
