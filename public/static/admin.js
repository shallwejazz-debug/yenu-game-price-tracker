// ============================================================
// 관리자 콘솔 프론트엔드
// public/static/admin.js
//   - 자동 가져오기: 엑셀식 별칭 그룹(groups) 입력 지원
//   - 게임 목록: 체크박스 선택 삭제 지원
//   - 백업/복원: 내보내기 / 붙여넣기 재등록(1개씩 순차) / DB 초기화
// ============================================================

(function () {
  'use strict'

  const TOKEN_KEY = 'gpt_admin_token'
  const TS_KEY = 'gpt_admin_ts'
  const IDLE_LIMIT = 5 * 60 * 1000
  const $ = (id) => document.getElementById(id)

  let idleTimer = null

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || ''
  }
  function saveToken(pw) {
    localStorage.setItem(TOKEN_KEY, pw)
    localStorage.setItem(TS_KEY, String(Date.now()))
  }
  function touch() {
    if (getToken()) localStorage.setItem(TS_KEY, String(Date.now()))
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TS_KEY)
  }
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

  function startIdleTimer() {
    stopIdleTimer()
    idleTimer = setInterval(() => {
      if (isExpired()) {
        clearToken()
        showLock('5분간 활동이 없어 자동 잠금되었습니다.', true)
      }
    }, 30 * 1000)
  }
  function stopIdleTimer() {
    if (idleTimer) { clearInterval(idleTimer); idleTimer = null }
  }

  function showAdmin() {
    $('lockScreen').style.display = 'none'
    $('adminContent').hidden = false
    touch()
    startIdleTimer()
    ensureAtLeastOneRow()
    loadSettings()
    loadGames()
  }
  function showLock(msg, ok) {
    stopIdleTimer()
    $('adminContent').hidden = true
    $('lockScreen').style.display = 'flex'
    if (msg) setStatus($('lockStatus'), msg, !!ok)
  }

  async function verifyToken() {
    try {
      await api('/verify', 'POST', {})
      return true
    } catch {
      return false
    }
  }

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

  $('lockBtn').addEventListener('click', () => {
    clearToken()
    showLock('잠금 처리되었습니다.', true)
  })

  document.querySelectorAll('.admin-back, .lock-back').forEach((a) => {
    a.addEventListener('click', () => { clearToken() })
  })

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
    } catch (e) {}
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

  // ============================================================
  // 자동 임포트 (엑셀식 별칭 그룹)
  // ============================================================
  function addGroupRow(name, aliases) {
    const body = $('importGroups')
    const row = document.createElement('div')
    row.className = 'ig-row'
    row.innerHTML =
      '<input type="text" class="ig-name" placeholder="예: 발더스 게이트 3" />' +
      '<input type="text" class="ig-alias" placeholder="예: 발더스게이트3, BG3, Baldurs Gate 3" />' +
      '<button type="button" class="ig-remove" title="이 행 삭제">−</button>'
    body.appendChild(row)
    if (name) row.querySelector('.ig-name').value = name
    if (aliases) row.querySelector('.ig-alias').value = aliases
    return row
  }

  function ensureAtLeastOneRow() {
    const body = $('importGroups')
    if (body && body.querySelectorAll('.ig-row').length === 0) {
      addGroupRow()
    }
  }

  $('addGroupRow').addEventListener('click', function () {
    const row = addGroupRow()
    const nameInput = row.querySelector('.ig-name')
    if (nameInput) nameInput.focus()
  })

  $('importGroups').addEventListener('click', function (e) {
    const btn = e.target.closest('.ig-remove')
    if (!btn) return
    const body = $('importGroups')
    const rows = body.querySelectorAll('.ig-row')
    if (rows.length <= 1) {
      const row = btn.closest('.ig-row')
      row.querySelector('.ig-name').value = ''
      row.querySelector('.ig-alias').value = ''
    } else {
      btn.closest('.ig-row').remove()
    }
  })

  function getGroups() {
    const rows = Array.from($('importGroups').querySelectorAll('.ig-row'))
    const groups = []
    rows.forEach(function (row) {
      const name = row.querySelector('.ig-name').value.trim()
      const aliasRaw = row.querySelector('.ig-alias').value.trim()
      const aliases = aliasRaw
        .split(',')
        .map(function (s) { return s.trim() })
        .filter(Boolean)

      let repName = name
      if (!repName && aliases.length > 0) repName = aliases[0]

      let terms = aliases.slice()
      if (terms.length === 0 && repName) terms = [repName]

      if (!repName || terms.length === 0) return

      const seen = {}
      const uniqTerms = []
      terms.forEach(function (t) {
        const k = t.toLowerCase()
        if (!seen[k]) { seen[k] = true; uniqTerms.push(t) }
      })

      groups.push({ name: repName, aliases: uniqTerms })
    })
    return groups
  }

  function won(n) {
    if (n === null || n === undefined) return '-'
    return '\u20a9' + Number(n).toLocaleString('ko-KR')
  }

  function renderImportResult(data, hostId) {
    const host = $(hostId || 'importResult')
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
        ', 가격비교 ' + (sk.catalog||0) +
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
    const groups = getGroups()
    if (groups.length === 0) {
      setStatus($('importStatus'), '게임을 한 개 이상 입력하세요.', false)
      return
    }
    setStatus($('importStatus'), (dryRun ? '🔍 분석' : '⬇️ 수집/저장') + ' 중… (잠시 기다려주세요)', true)
    try {
      const data = await api('/auto-import', 'POST', { groups: groups, dryRun: dryRun })
      setStatus($('importStatus'), '✅ ' + (data.mode || (dryRun ? '미리보기' : '저장')) + ' (' + (data.count || 0) + '개)', true)
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
        updateBulkBar()
        return
      }
          list.innerHTML = games
        .map(
          (g) =>
            '<li class="admin-game-item">' +
            '<input type="checkbox" class="ag-check" data-id="' + g.id + '" />' +
            '<span class="ag-thumb">' +
              (g.image_url
                ? '<img src="' + escapeHtml(g.image_url) + '" alt="" loading="lazy" />'
                : '<span class="ag-thumb-empty">?</span>') +
            '</span>' +
            '<span class="ag-id">#' + g.id + '</span>' +
            '<span class="ag-title">' + escapeHtml(g.title) + '</span>' +
            '<span class="ag-editions">' + (g.edition_count || 0) + '개 플랫폼</span>' +
            '<button class="ag-image" data-id="' + g.id + '" data-title="' + escapeHtml(g.title) + '" data-url="' + escapeHtml(g.image_url || '') + '" title="대표 이미지 변경">🖼️</button>' +
            '<button class="ag-delete" data-id="' + g.id + '" data-title="' + escapeHtml(g.title) + '" title="삭제">−</button>' +
            '</li>'
        )
        .join('')

      const selAll = $('selectAllGames')
      if (selAll) selAll.checked = false
      updateBulkBar()
    } catch (e) {
      list.innerHTML = '<li class="admin-empty">목록을 불러오지 못했습니다 (' + escapeHtml(e.message) + ')</li>'
    }
  }
  $('refreshGames').addEventListener('click', loadGames)

  // ---------- 선택 삭제 ----------
  function getCheckedIds() {
    return Array.from($('gameList').querySelectorAll('.ag-check:checked'))
      .map(function (c) { return c.getAttribute('data-id') })
  }

  function updateBulkBar() {
    const btn = $('bulkDeleteBtn')
    if (!btn) return
    const n = getCheckedIds().length
    btn.disabled = n === 0
    btn.textContent = n === 0 ? '선택 삭제' : '선택 삭제 (' + n + ')'
  }

  $('gameList').addEventListener('change', function (e) {
    if (e.target.classList && e.target.classList.contains('ag-check')) {
      updateBulkBar()
    }
  })

  ;(function () {
    const selAll = $('selectAllGames')
    if (!selAll) return
    selAll.addEventListener('change', function (e) {
      const checked = e.target.checked
      $('gameList').querySelectorAll('.ag-check').forEach(function (c) { c.checked = checked })
      updateBulkBar()
    })
  })()

  ;(function () {
    const btn = $('bulkDeleteBtn')
    if (!btn) return
    btn.addEventListener('click', async function () {
      const ids = getCheckedIds()
      if (ids.length === 0) return
      if (!confirm(ids.length + '개 게임을 삭제하시겠습니까?\n연결된 플랫폼/가격/이력 데이터도 모두 삭제됩니다.')) return
      btn.disabled = true
      btn.textContent = '삭제 중…'
      try {
        await api('/games/bulk-delete', 'POST', { ids: ids.map(Number) })
        const selAll = $('selectAllGames')
        if (selAll) selAll.checked = false
        loadGames()
      } catch (err) {
        alert('선택 삭제 실패: ' + err.message)
        updateBulkBar()
      }
    })
  })()

  // ---------- 대표 이미지 변경 ----------
  $('gameList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.ag-image')
    if (!btn) return
    const id = btn.getAttribute('data-id')
    const title = btn.getAttribute('data-title')
    const current = btn.getAttribute('data-url') || ''
    const input = prompt(
      "'" + title + "'의 대표 이미지 URL을 입력하세요.\n" +
      '(비우고 확인하면 이미지를 제거합니다. 예: 스팀 커버 이미지 주소)',
      current
    )
    if (input === null) return
    const url = input.trim()
    btn.disabled = true
    try {
      await api('/games/' + id, 'PATCH', { image_url: url || null })
      loadGames()
    } catch (err) {
      alert('이미지 변경 실패: ' + err.message)
      btn.disabled = false
    }
  })

  // ---------- 게임 삭제 (단건) ----------
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

  // ============================================================
  // 백업 / 복원
  // ============================================================

  // ---------- 내보내기 ----------
  // [2026-07-06] 화면 표시 + txt/CSV 파일 다운로드 지원
  ;(function () {
    const btn = $('exportBtn')
    if (!btn) return

    let lastExportText = ''   // 마지막 내보낸 원문 보관 (파일 저장용)

    // 공통 다운로드 헬퍼: 텍스트를 Blob으로 만들어 브라우저 다운로드
    function downloadFile(filename, content, mime) {
      const blob = new Blob(['\uFEFF' + content], { type: mime })  // BOM: 엑셀 한글 깨짐 방지
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    // 오늘 날짜 문자열 (파일명용) → 2026-07-06
    function todayStr() {
      const d = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    }

    // 내보내기 원문(파이프 형식)을 CSV로 변환
    //   대표이름 | 별칭 | 이미지URL  →  "대표이름","별칭","이미지URL"
    function toCsv(text) {
      const esc = (s) => '"' + String(s || '').replace(/"/g, '""') + '"'
      const rows = String(text || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split('|').map((s) => s.trim())
          const name = parts[0] || ''
          const alias = parts[1] || ''
          const img = parts[2] || ''
          return [esc(name), esc(alias), esc(img)].join(',')
        })
      // 헤더 포함
      return ['대표이름,별칭,이미지URL'].concat(rows).join('\r\n')
    }

    // 내보내기 실행 (서버에서 최신 목록 받아 화면에 표시 + 원문 보관)
    btn.addEventListener('click', async function () {
      setStatus($('exportStatus'), '내보내는 중…', true)
      try {
        const data = await api('/export')
        lastExportText = data.text || ''
        $('exportArea').value = lastExportText
        setStatus($('exportStatus'),
          '✅ ' + (data.count || 0) + '개 게임 내보냄. 복사하거나 아래 버튼으로 파일 저장하세요.', true)
      } catch (e) {
        setStatus($('exportStatus'), '❌ ' + e.message, false)
      }
    })

    // TXT 다운로드 버튼
    const txtBtn = $('exportTxtBtn')
    if (txtBtn) {
      txtBtn.addEventListener('click', function () {
        const text = lastExportText || $('exportArea').value || ''
        if (!text.trim()) { setStatus($('exportStatus'), '먼저 내보내기를 실행하세요.', false); return }
        downloadFile('games-backup-' + todayStr() + '.txt', text, 'text/plain;charset=utf-8')
      })
    }

    // CSV(엑셀) 다운로드 버튼
    const csvBtn = $('exportCsvBtn')
    if (csvBtn) {
      csvBtn.addEventListener('click', function () {
        const text = lastExportText || $('exportArea').value || ''
        if (!text.trim()) { setStatus($('exportStatus'), '먼저 내보내기를 실행하세요.', false); return }
        downloadFile('games-backup-' + todayStr() + '.csv', toCsv(text), 'text/csv;charset=utf-8')
      })
    }
  })()


  // 붙여넣기 텍스트 → { groups:[{name,aliases}], images:{name:url} } 로 파싱
  // 한 줄 형식: 대표이름 | 별칭1, 별칭2 | 이미지URL
  function parsePasteText(text) {
    const lines = String(text || '').split('\n')
    const groups = []
    const images = {}
    lines.forEach(function (line) {
      const raw = line.trim()
      if (!raw) return
      const parts = raw.split('|').map(function (s) { return s.trim() })
      const name = parts[0] || ''
      if (!name) return
      const aliasRaw = parts[1] || ''
      const imgUrl = parts[2] || ''

      let aliases = aliasRaw.split(',').map(function (s) { return s.trim() }).filter(Boolean)
      if (aliases.length === 0) aliases = [name]

      const seen = {}
      const uniq = []
      ;[name].concat(aliases).forEach(function (t) {
        if (!t) return
        const k = t.toLowerCase()
        if (!seen[k]) { seen[k] = true; uniq.push(t) }
      })

      groups.push({ name: name, aliases: uniq })
      if (imgUrl) images[name] = imgUrl
    })
    return { groups: groups, images: images }
  }

  // ---------- 붙여넣기 미리보기 (게임 1개씩 순차 호출) ----------
  ;(function () {
    const btn = $('pastePreviewBtn')
    if (!btn) return
    btn.addEventListener('click', async function () {
      const parsed = parsePasteText($('importPasteArea').value)
      const total = parsed.groups.length
      if (total === 0) {
        setStatus($('pasteStatus'), '붙여넣은 내용이 없습니다.', false)
        return
      }
      btn.disabled = true
      $('pasteResult').innerHTML = ''
      const okResults = []
      const failed = []
      let done = 0

      for (const group of parsed.groups) {
        done++
        setStatus($('pasteStatus'), '🔍 분석 중… (' + done + '/' + total + ') ' + group.name, true)
        try {
          const data = await api('/auto-import', 'POST', { groups: [group], dryRun: true })
          const r = (data.results || [])[0]
          if (r) okResults.push(r)
        } catch (e) {
          failed.push({ title: group.name, error: e.message })
        }
      }

      renderImportResult({ dryRun: true, count: okResults.length, results: okResults }, 'pasteResult')
      if (failed.length > 0) {
        const failHtml = failed.map(function (f) {
          return '<div class="imp-game imp-err"><b>' + escapeHtml(f.title) + '</b> — ' + escapeHtml(f.error) + '</div>'
        }).join('')
        $('pasteResult').innerHTML +=
          '<div class="imp-mode">⚠️ 실패 ' + failed.length + '개</div>' + failHtml
      }
      setStatus($('pasteStatus'),
        '✅ 미리보기 완료 (' + okResults.length + '/' + total + '개)' +
        (failed.length ? ' · 실패 ' + failed.length + '개' : ''),
        failed.length === 0)
      btn.disabled = false
    })
  })()

  // ---------- 붙여넣기로 재등록 (게임 1개씩 순차 호출 → subrequest 한도 회피) ----------
  ;(function () {
    const btn = $('pasteImportBtn')
    if (!btn) return
    btn.addEventListener('click', async function () {
      const parsed = parsePasteText($('importPasteArea').value)
      const total = parsed.groups.length
      if (total === 0) {
        setStatus($('pasteStatus'), '붙여넣은 내용이 없습니다.', false)
        return
      }
      if (!confirm(total + '개 게임을 실제로 등록합니다.\n게임 수가 많으면 시간이 걸립니다. 진행할까요?')) return

      btn.disabled = true
      $('pasteResult').innerHTML = ''

      const okResults = []
      const failed = []
      let imgApplied = 0
      let done = 0

      for (const group of parsed.groups) {
        done++
        setStatus($('pasteStatus'),
          '⬇️ 등록 중… (' + done + '/' + total + ') ' + group.name, true)
        try {
          const data = await api('/auto-import', 'POST', { groups: [group], dryRun: false })
          const r = (data.results || [])[0]
          if (r && !r.error) {
            okResults.push(r)
            if (r.game_id && parsed.images[r.title]) {
              try {
                await api('/games/' + r.game_id, 'PATCH', { image_url: parsed.images[r.title] })
                imgApplied++
              } catch (e) {}
            }
          } else {
            failed.push({ title: group.name, error: (r && r.error) || '알 수 없는 오류' })
          }
        } catch (e) {
          failed.push({ title: group.name, error: e.message })
        }
      }

      renderImportResult({
        dryRun: false,
        count: okResults.length,
        results: okResults,
      }, 'pasteResult')

      if (failed.length > 0) {
        const failHtml = failed.map(function (f) {
          return '<div class="imp-game imp-err"><b>' + escapeHtml(f.title) + '</b> — ' + escapeHtml(f.error) + '</div>'
        }).join('')
        $('pasteResult').innerHTML +=
          '<div class="imp-mode">⚠️ 실패 ' + failed.length + '개 (아래 목록만 다시 붙여넣어 재시도하세요)</div>' + failHtml
      }

      const okMsg = '✅ 성공 ' + okResults.length + '/' + total + '개' +
        (imgApplied ? ', 이미지 ' + imgApplied + '건 적용' : '')
      const failMsg = failed.length ? (' · ❌ 실패 ' + failed.length + '개') : ''
      setStatus($('pasteStatus'), okMsg + failMsg, failed.length === 0)

      btn.disabled = false
      loadGames()
    })
  })()

  // ---------- 전체 초기화 ----------
  ;(function () {
    const btn = $('resetAllBtn')
    if (!btn) return
    btn.addEventListener('click', async function () {
      const answer = prompt(
        '⚠️ 모든 게임 데이터를 삭제합니다. 되돌릴 수 없습니다.\n' +
        '먼저 위에서 내보내기로 백업했는지 확인하세요.\n\n' +
        '삭제하려면 RESET 을 입력하세요.'
      )
      if (answer === null) return
      if (answer !== 'RESET') {
        setStatus($('resetStatus'), '취소되었습니다. (RESET 을 정확히 입력해야 실행됩니다)', false)
        return
      }
      btn.disabled = true
      setStatus($('resetStatus'), '초기화 중…', true)
      try {
        const data = await api('/reset-all', 'POST', { confirm: 'RESET' })
        setStatus($('resetStatus'), '✅ ' + (data.message || '초기화 완료'), true)
        loadGames()
      } catch (e) {
        setStatus($('resetStatus'), '❌ ' + e.message, false)
      } finally {
        btn.disabled = false
      }
    })
  })()

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const saved = getToken()
    if (saved) {
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
