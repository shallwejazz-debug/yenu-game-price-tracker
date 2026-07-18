// ============================================================
// 관리자 콘솔 프론트엔드
// public/static/admin.js
//
// 기능
//   - 관리자 인증 및 자동 잠금
//   - 관리자 탭 전환
//   - 현황 표시
//   - 후보 게임 일괄 평가
//   - 평가 결과 필터/정렬/선택
//   - 선택 후보를 게임 가져오기로 전달
//   - 게임 가져오기 미리보기 및 실제 저장
//   - 등록 게임 조회 및 삭제
//   - 설정 저장
//   - 백업/복원
// ============================================================

(function () {
  'use strict'

  const TOKEN_KEY = 'gpt_admin_token'
  const TOKEN_TS_KEY = 'gpt_admin_ts'
  const TAB_KEY = 'yenu_admin_active_tab'
  const CANDIDATE_DRAFT_KEY = 'yenu_candidate_draft_v1'
  const IMPORT_DRAFT_KEY = 'yenu_import_draft_v1'

  const IDLE_LIMIT = 5 * 60 * 1000
  const MAX_CANDIDATES = 100

  const $ = function (id) {
    return document.getElementById(id)
  }

  let idleTimer = null
  let toastTimer = null
  let evaluationStopped = false
  let candidateFilter = 'all'
  let candidateResults = []
  let allGames = []

  // ----------------------------------------------------------
  // 공통 유틸리티
  // ----------------------------------------------------------

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  function normalizeTitle(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[™®©]/g, '')
      .replace(/[·ㆍ:：\-–—_()[\]{}]/g, '')
      .replace(/\s+/g, '')
      .trim()
  }

  function won(value) {
    const number = Number(value)

    if (!Number.isFinite(number) || number <= 0) {
      return '-'
    }

    return number.toLocaleString('ko-KR') + '원'
  }

  function setStatus(element, message, type) {
    if (!element) return

    element.textContent = message || ''
    element.className = 'admin-status'

    if (type) {
      element.classList.add(type)
    }
  }

  function setBusy(button, busy, busyText) {
    if (!button) return

    if (busy) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent
      }

      button.disabled = true
      button.textContent = busyText || '처리 중...'
    } else {
      button.disabled = false
      button.textContent =
        button.dataset.originalText || button.textContent
    }
  }

  function showToast(message, type) {
    const toast = $('adminToast')
    if (!toast) return

    window.clearTimeout(toastTimer)

    toast.textContent = message
    toast.className = 'admin-toast'

    if (type) {
      toast.classList.add(type)
    }

    toast.hidden = false

    toastTimer = window.setTimeout(function () {
      toast.hidden = true
    }, 3200)
  }

  function downloadText(filename, text, contentType) {
    const blob = new Blob([text], {
      type: contentType || 'text/plain;charset=utf-8'
    })

    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = filename

    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    URL.revokeObjectURL(url)
  }

  function uniqueTitles(text) {
    const seen = new Set()
    const result = []

    String(text || '')
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim()
      })
      .filter(Boolean)
      .forEach(function (title) {
        const key = normalizeTitle(title)

        if (!key || seen.has(key)) return

        seen.add(key)
        result.push(title)
      })

    return result
  }

  function platformLabel(code) {
    const labels = {
      pc: 'PC',
      ps5: 'PS5',
      ps4: 'PS4',
      xbox: 'XBOX',
      switch: 'SWITCH',
      switch2: 'SWITCH 2',
      etc: '기타'
    }

    return labels[code] || String(code || '').toUpperCase()
  }

  function getSwitchPolicy(platform) {
    if (platform === 'switch2') return 's2'
    if (platform === 'switch') return 's1'
    return ''
  }

  // ----------------------------------------------------------
  // 인증
  // ----------------------------------------------------------

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || ''
  }

  function saveToken(token) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(TOKEN_TS_KEY, String(Date.now()))
  }

  function touchToken() {
    if (getToken()) {
      localStorage.setItem(TOKEN_TS_KEY, String(Date.now()))
    }
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_TS_KEY)
  }

  function isTokenExpired() {
    const timestamp = Number(
      localStorage.getItem(TOKEN_TS_KEY) || 0
    )

    if (!timestamp) return true

    return Date.now() - timestamp > IDLE_LIMIT
  }

  async function api(path, options) {
    const config = options || {}
    const headers = Object.assign({}, config.headers || {})

    headers['X-Admin-Token'] = getToken()

    if (
      config.body !== undefined &&
      !(config.body instanceof FormData)
    ) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(path, {
      method: config.method || 'GET',
      headers: headers,
      body:
        config.body === undefined
          ? undefined
          : config.body instanceof FormData
            ? config.body
            : JSON.stringify(config.body)
    })

    let data = null

    try {
      data = await response.json()
    } catch (error) {
      data = {
        ok: false,
        error: '서버 응답을 읽을 수 없습니다.'
      }
    }

    if (response.status === 401) {
      clearToken()
      showLock('인증이 만료되었습니다. 다시 로그인하세요.', 'err')
      throw new Error('관리자 인증이 필요합니다.')
    }

    if (!response.ok || !data || data.ok === false) {
      throw new Error(
        data && (data.error || data.message)
          ? data.error || data.message
          : '요청 처리에 실패했습니다.'
      )
    }

    touchToken()
    return data
  }

  function showLock(message, type) {
    const lockScreen = $('lockScreen')
    const adminContent = $('adminContent')

    if (lockScreen) lockScreen.hidden = false
    if (adminContent) adminContent.hidden = true

    setStatus($('lockStatus'), message || '', type || '')

    window.setTimeout(function () {
      const input = $('lockPassword')
      if (input) input.focus()
    }, 50)
  }

  function showAdmin() {
    const lockScreen = $('lockScreen')
    const adminContent = $('adminContent')

    if (lockScreen) lockScreen.hidden = true
    if (adminContent) adminContent.hidden = false

    startIdleTimer()
    restoreCandidateDraft(false)
    restoreImportDraft()
    switchTab(localStorage.getItem(TAB_KEY) || 'dashboard', false)
    refreshAll()
  }

  async function verifyToken(token) {
    const previous = getToken()

    if (token !== undefined) {
      saveToken(token)
    }

    try {
      await api('/admin/api/verify')
      return true
    } catch (error) {
      if (token !== undefined) {
        if (previous) {
          saveToken(previous)
        } else {
          clearToken()
        }
      }

      return false
    }
  }

  function startIdleTimer() {
    window.clearInterval(idleTimer)

    idleTimer = window.setInterval(function () {
      if (isTokenExpired()) {
        clearToken()
        window.clearInterval(idleTimer)
        showLock('5분 동안 활동이 없어 자동으로 잠겼습니다.', 'err')
      }
    }, 15000)
  }

  function bindActivityTracking() {
    ;['click', 'keydown', 'touchstart'].forEach(function (eventName) {
      document.addEventListener(
        eventName,
        function () {
          if (
            getToken() &&
            $('adminContent') &&
            !$('adminContent').hidden
          ) {
            touchToken()
          }
        },
        { passive: true }
      )
    })
  }

  // ----------------------------------------------------------
  // 탭
  // ----------------------------------------------------------

  function switchTab(tabName, save) {
    const validTabs = [
      'dashboard',
      'candidates',
      'import',
      'games',
      'settings'
    ]

    const target = validTabs.includes(tabName)
      ? tabName
      : 'dashboard'

    document
      .querySelectorAll('[data-admin-tab]')
      .forEach(function (button) {
        const active = button.dataset.adminTab === target
        button.classList.toggle('is-active', active)
        button.setAttribute('aria-selected', active ? 'true' : 'false')
      })

    document
      .querySelectorAll('[data-admin-panel]')
      .forEach(function (panel) {
        const active = panel.dataset.adminPanel === target
        panel.classList.toggle('is-active', active)
        panel.hidden = !active
      })

    if (save !== false) {
      localStorage.setItem(TAB_KEY, target)
    }

    if (target === 'dashboard') {
      refreshDashboard()
    }

    if (target === 'games') {
      loadGames()
    }

    if (target === 'settings') {
      loadSettings()
    }

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  function bindTabs() {
    document
      .querySelectorAll('[data-admin-tab]')
      .forEach(function (button) {
        button.addEventListener('click', function () {
          switchTab(button.dataset.adminTab)
        })
      })

    document
      .querySelectorAll('[data-go-admin-tab]')
      .forEach(function (button) {
        button.addEventListener('click', function () {
          switchTab(button.dataset.goAdminTab)
        })
      })
  }

  // ----------------------------------------------------------
  // 현황
  // ----------------------------------------------------------

  async function refreshDashboard() {
    try {
      const data = await api('/admin/api/dashboard')

      if ($('dashboardGameCount')) {
        $('dashboardGameCount').textContent =
          String(data.gameCount || 0)
      }

      if ($('dashboardEditionCount')) {
        $('dashboardEditionCount').textContent =
          String(data.editionCount || 0)
      }
    } catch (error) {
      if ($('dashboardGameCount')) {
        $('dashboardGameCount').textContent = '-'
      }

      if ($('dashboardEditionCount')) {
        $('dashboardEditionCount').textContent = '-'
      }
    }

    updateDraftCounts()
  }

  function updateDraftCounts() {
    const candidateCount = candidateResults.length
    const importCount = getImportGroups().length

    if ($('dashboardCandidateCount')) {
      $('dashboardCandidateCount').textContent =
        String(candidateCount)
    }

    if ($('dashboardImportCount')) {
      $('dashboardImportCount').textContent =
        String(importCount)
    }

    updateBadge($('candidateTabBadge'), candidateCount)
    updateBadge($('importTabBadge'), importCount)
  }

  function updateBadge(element, count) {
    if (!element) return

    element.textContent = String(count)
    element.hidden = count < 1
  }

  // ----------------------------------------------------------
  // 후보 입력 및 임시저장
  // ----------------------------------------------------------

  function getCandidateDraft() {
    return {
      platform: $('candidatePlatform')
        ? $('candidatePlatform').value
        : 'switch',
      year: $('candidateYear')
        ? $('candidateYear').value
        : '',
      titles: $('candidateTitles')
        ? $('candidateTitles').value
        : '',
      results: candidateResults,
      savedAt: Date.now()
    }
  }

  function saveCandidateDraft() {
    try {
      localStorage.setItem(
        CANDIDATE_DRAFT_KEY,
        JSON.stringify(getCandidateDraft())
      )
    } catch (error) {
      // 저장 용량 초과는 기능 실행을 막지 않음
    }

    updateDraftCounts()
  }

  function restoreCandidateDraft(showMessage) {
    const raw = localStorage.getItem(CANDIDATE_DRAFT_KEY)

    if (!raw) {
      if (showMessage) {
        showToast('복원할 후보 임시 작업이 없습니다.')
      }
      updateCandidateInputCount()
      return
    }

    try {
      const draft = JSON.parse(raw)

      if ($('candidatePlatform') && draft.platform) {
        $('candidatePlatform').value = draft.platform
      }

      if ($('candidateYear')) {
        $('candidateYear').value = draft.year || ''
      }

      if ($('candidateTitles')) {
        $('candidateTitles').value = draft.titles || ''
      }

      candidateResults = Array.isArray(draft.results)
        ? draft.results
        : []

      updateCandidateInputCount()
      renderCandidateResults()

      if (showMessage) {
        showToast('후보 임시 작업을 복원했습니다.', 'ok')
      }
    } catch (error) {
      localStorage.removeItem(CANDIDATE_DRAFT_KEY)

      if (showMessage) {
        showToast('임시 저장 내용을 복원하지 못했습니다.', 'err')
      }
    }
  }

  function resetCandidateWork() {
    const hasWork =
      candidateResults.length > 0 ||
      ($('candidateTitles') &&
        $('candidateTitles').value.trim().length > 0)

    if (
      hasWork &&
      !window.confirm(
        '입력한 후보와 평가 결과를 모두 초기화할까요?'
      )
    ) {
      return
    }

    evaluationStopped = true
    candidateResults = []
    candidateFilter = 'all'

    if ($('candidateTitles')) {
      $('candidateTitles').value = ''
    }

    localStorage.removeItem(CANDIDATE_DRAFT_KEY)

    updateCandidateInputCount()
    renderCandidateResults()
    setStatus($('candidateStatus'), '')
    showToast('후보 임시 작업을 초기화했습니다.')
  }

  function updateCandidateInputCount() {
    const text = $('candidateTitles')
      ? $('candidateTitles').value
      : ''

    const inputCount = String(text || '')
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim()
      })
      .filter(Boolean).length

    const uniqueCount = uniqueTitles(text).length

    if ($('candidateInputCount')) {
      $('candidateInputCount').textContent =
        String(inputCount)
    }

    if ($('candidateUniqueCount')) {
      $('candidateUniqueCount').textContent =
        String(uniqueCount)
    }
  }

  // ----------------------------------------------------------
  // 후보 평가
  // ----------------------------------------------------------

  async function evaluateCandidates(titlesOverride) {
    const button = $('evaluateCandidates')
    const stopButton = $('stopCandidateEvaluation')

    const titles = Array.isArray(titlesOverride)
      ? titlesOverride
      : uniqueTitles(
          $('candidateTitles') ? $('candidateTitles').value : ''
        )

    if (!titles.length) {
      setStatus(
        $('candidateStatus'),
        '후보 게임명을 한 줄에 하나씩 입력하세요.',
        'err'
      )
      return
    }

    if (titles.length > MAX_CANDIDATES) {
      setStatus(
        $('candidateStatus'),
        '한 번에 최대 ' + MAX_CANDIDATES + '개까지 평가할 수 있습니다.',
        'err'
      )
      return
    }

    const platform = $('candidatePlatform').value
    const year = $('candidateYear').value

    evaluationStopped = false

    if (!titlesOverride) {
      candidateResults = []
    } else {
      const retryKeys = new Set(
        titles.map(function (title) {
          return normalizeTitle(title)
        })
      )

      candidateResults = candidateResults.filter(function (item) {
        return !retryKeys.has(normalizeTitle(item.title))
      })
    }

    setBusy(button, true, '평가 중...')
    stopButton.disabled = false

    $('candidateProgressWrap').hidden = false
    $('candidateResultCard').hidden = false

    setStatus(
      $('candidateStatus'),
      '후보 평가를 시작합니다.',
      'info'
    )

    updateProgress(0, titles.length, '')

    for (let index = 0; index < titles.length; index += 1) {
      if (evaluationStopped) break

      const title = titles[index]

      updateProgress(index, titles.length, title)

      try {
        const data = await api('/admin/api/candidates/evaluate', {
          method: 'POST',
          body: {
            title: title,
            platform: platform,
            year: year || null
          }
        })

        const result = data.result || {}

        result.title = result.title || title
        result.inputIndex = index
        result.selected =
          result.verdict === 'recommend' && !result.existing

        candidateResults.push(result)
      } catch (error) {
        candidateResults.push({
          title: title,
          platform: platform,
          year: year || '',
          score: 0,
          verdict: 'error',
          reasons: [error.message],
          stores: 0,
          lowest: null,
          highest: null,
          spread: null,
          totalProducts: 0,
          selected: false,
          error: error.message,
          inputIndex: index
        })
      }

      renderCandidateResults()
      saveCandidateDraft()
      updateProgress(index + 1, titles.length, title)
    }

    setBusy(button, false)
    stopButton.disabled = true

    if (evaluationStopped) {
      setStatus(
        $('candidateStatus'),
        '평가를 중단했습니다. 완료된 결과는 임시 저장되었습니다.',
        'err'
      )
    } else {
      setStatus(
        $('candidateStatus'),
        candidateResults.length +
          '개 후보 평가가 완료되었습니다.',
        'ok'
      )
    }

    updateProgress(
      evaluationStopped ? candidateResults.length : titles.length,
      titles.length,
      ''
    )

    renderCandidateResults()
    saveCandidateDraft()
  }

  function updateProgress(done, total, currentTitle) {
    const safeTotal = Math.max(1, Number(total) || 1)
    const percent = Math.min(
      100,
      Math.round((Number(done) / safeTotal) * 100)
    )

    if ($('candidateProgressText')) {
      $('candidateProgressText').textContent =
        done + ' / ' + total
    }

    if ($('candidateProgressPercent')) {
      $('candidateProgressPercent').textContent =
        percent + '%'
    }

    if ($('candidateProgressBar')) {
      $('candidateProgressBar').style.width =
        percent + '%'
    }

    if ($('candidateCurrentTitle')) {
      $('candidateCurrentTitle').textContent =
        currentTitle ? '현재 평가: ' + currentTitle : ''
    }

    const progress = document.querySelector(
      '.candidate-progress'
    )

    if (progress) {
      progress.setAttribute('aria-valuenow', String(percent))
    }
  }

  function retryFailedCandidates() {
    const failed = candidateResults
      .filter(function (item) {
        return item.verdict === 'error'
      })
      .map(function (item) {
        return item.title
      })

    if (!failed.length) {
      showToast('재시도할 오류 항목이 없습니다.')
      return
    }

    evaluateCandidates(failed)
  }

  // ----------------------------------------------------------
  // 후보 결과 표시
  // ----------------------------------------------------------

  function verdictLabel(verdict) {
    const labels = {
      recommend: '✅ 추천',
      review: '🟡 검토',
      exclude: '🔴 제외',
      existing: '⚪ 기등록',
      error: '오류'
    }

    return labels[verdict] || '검토'
  }

  function getSortedCandidates() {
    const sort = $('candidateSort')
      ? $('candidateSort').value
      : 'score-desc'

    const items = candidateResults.slice()

    items.sort(function (a, b) {
      if (sort === 'stores-desc') {
        return Number(b.stores || 0) - Number(a.stores || 0)
      }

      if (sort === 'price-spread-desc') {
        return Number(b.spread || 0) - Number(a.spread || 0)
      }

      if (sort === 'name-asc') {
        return String(a.title || '').localeCompare(
          String(b.title || ''),
          'ko'
        )
      }

      if (sort === 'input-order') {
        return Number(a.inputIndex || 0) - Number(b.inputIndex || 0)
      }

      return Number(b.score || 0) - Number(a.score || 0)
    })

    return items
  }

  function candidateMatchesFilter(item) {
    if (candidateFilter === 'all') return true
    if (candidateFilter === 'existing') return Boolean(item.existing)

    return item.verdict === candidateFilter
  }

  function renderCandidateResults() {
    const card = $('candidateResultCard')
    const list = $('candidateResultList')

    if (!card || !list) return

    card.hidden = candidateResults.length === 0

    updateCandidateSummary()

    if (!candidateResults.length) {
      list.innerHTML =
        '<div class="admin-empty">' +
        '아직 평가 결과가 없습니다.<br>' +
        '후보 게임명을 입력하고 자동 평가를 시작하세요.' +
        '</div>'

      updateCandidateSelection()
      updateDraftCounts()
      return
    }

    const visible = getSortedCandidates().filter(
      candidateMatchesFilter
    )

    if (!visible.length) {
      list.innerHTML =
        '<div class="admin-empty">' +
        '현재 필터에 해당하는 후보가 없습니다.' +
        '</div>'

      updateCandidateSelection()
      return
    }

    list.innerHTML = visible
      .map(function (item) {
        const key = normalizeTitle(item.title)
        const verdict = item.existing
          ? 'existing'
          : item.verdict || 'review'

        const reasons = Array.isArray(item.reasons)
          ? item.reasons.join(' / ')
          : item.reason || '판정 이유가 없습니다.'

        const checked =
          item.selected && !item.existing && verdict !== 'exclude'
            ? ' checked'
            : ''

        const disabled =
          item.existing ||
          verdict === 'exclude' ||
          verdict === 'error'
            ? ' disabled'
            : ''

        const selectedClass = checked ? ' is-selected' : ''
        const existingClass = item.existing
          ? ' is-existing'
          : ''

        return (
          '<article class="candidate-item' +
          selectedClass +
          existingClass +
          '" data-candidate-key="' +
          escapeHtml(key) +
          '">' +
            '<div class="candidate-check">' +
              '<input type="checkbox" class="candidate-select"' +
              ' data-candidate-key="' +
              escapeHtml(key) +
              '"' +
              checked +
              disabled +
              ' aria-label="' +
              escapeHtml(item.title) +
              ' 선택">' +
            '</div>' +

            '<div class="candidate-main">' +
              '<strong class="candidate-name">' +
                escapeHtml(item.title) +
              '</strong>' +

              '<div class="candidate-meta">' +
                '<span class="candidate-platform-badge">' +
                  escapeHtml(platformLabel(item.platform)) +
                '</span>' +

                (item.year
                  ? '<span class="candidate-year-badge">' +
                    escapeHtml(item.year) +
                    '</span>'
                  : '') +

                (item.existing
                  ? '<span class="candidate-existing-badge">' +
                    '이미 등록됨' +
                    '</span>'
                  : '') +
              '</div>' +
            '</div>' +

            '<div class="candidate-detail">' +
              '<p class="candidate-reason">' +
                escapeHtml(reasons) +
              '</p>' +

              '<div class="candidate-metrics">' +
                '<span>판매처 <b>' +
                  escapeHtml(item.stores || 0) +
                '</b>곳</span>' +

                '<span>최저 <b>' +
                  escapeHtml(won(item.lowest)) +
                '</b></span>' +

                '<span>최고 <b>' +
                  escapeHtml(won(item.highest)) +
                '</b></span>' +

                '<span>가격 차이 <b>' +
                  escapeHtml(won(item.spread)) +
                '</b></span>' +

                '<span>정상 상품 <b>' +
                  escapeHtml(item.totalProducts || 0) +
                '</b>개</span>' +
              '</div>' +
            '</div>' +

            '<div class="candidate-score-area">' +
              '<span class="candidate-score">' +
                escapeHtml(item.score || 0) +
                '<small> / 10</small>' +
              '</span>' +

              '<span class="candidate-verdict candidate-verdict-' +
                escapeHtml(verdict) +
                '">' +
                escapeHtml(verdictLabel(verdict)) +
              '</span>' +
            '</div>' +
          '</article>'
        )
      })
      .join('')

    list
      .querySelectorAll('.candidate-select')
      .forEach(function (checkbox) {
        checkbox.addEventListener('change', function () {
          const key = checkbox.dataset.candidateKey
          const item = candidateResults.find(function (candidate) {
            return normalizeTitle(candidate.title) === key
          })

          if (item) {
            item.selected = checkbox.checked
          }

          renderCandidateResults()
          saveCandidateDraft()
        })
      })

    updateCandidateSelection()
    updateDraftCounts()
  }

  function updateCandidateSummary() {
    const counts = {
      all: candidateResults.length,
      recommend: 0,
      review: 0,
      exclude: 0,
      existing: 0,
      error: 0
    }

    candidateResults.forEach(function (item) {
      if (item.existing) {
        counts.existing += 1
      } else if (counts[item.verdict] !== undefined) {
        counts[item.verdict] += 1
      }
    })

    if ($('candidateCountAll')) {
      $('candidateCountAll').textContent = String(counts.all)
    }

    if ($('candidateCountRecommend')) {
      $('candidateCountRecommend').textContent =
        String(counts.recommend)
    }

    if ($('candidateCountReview')) {
      $('candidateCountReview').textContent =
        String(counts.review)
    }

    if ($('candidateCountExclude')) {
      $('candidateCountExclude').textContent =
        String(counts.exclude)
    }

    if ($('candidateCountExisting')) {
      $('candidateCountExisting').textContent =
        String(counts.existing)
    }

    if ($('candidateCountError')) {
      $('candidateCountError').textContent =
        String(counts.error)
    }

    if ($('retryFailedCandidates')) {
      $('retryFailedCandidates').hidden =
        counts.error === 0
    }

    document
      .querySelectorAll('[data-candidate-filter]')
      .forEach(function (button) {
        button.classList.toggle(
          'is-active',
          button.dataset.candidateFilter === candidateFilter
        )
      })
  }

  function updateCandidateSelection() {
    const selected = candidateResults.filter(function (item) {
      return item.selected && !item.existing
    })

    if ($('candidateSelectedCount')) {
      $('candidateSelectedCount').textContent =
        String(selected.length)
    }

    if ($('sendCandidatesToImport')) {
      $('sendCandidatesToImport').disabled =
        selected.length === 0
    }

    const visibleSelectable = candidateResults.filter(function (item) {
      return (
        candidateMatchesFilter(item) &&
        !item.existing &&
        item.verdict !== 'exclude' &&
        item.verdict !== 'error'
      )
    })

    const allSelected =
      visibleSelectable.length > 0 &&
      visibleSelectable.every(function (item) {
        return item.selected
      })

    if ($('selectAllCandidates')) {
      $('selectAllCandidates').checked = allSelected
      $('selectAllCandidates').indeterminate =
        !allSelected &&
        visibleSelectable.some(function (item) {
          return item.selected
        })
    }
  }

  function setVisibleCandidateSelection(selected) {
    candidateResults.forEach(function (item) {
      if (
        candidateMatchesFilter(item) &&
        !item.existing &&
        item.verdict !== 'exclude' &&
        item.verdict !== 'error'
      ) {
        item.selected = selected
      }
    })

    renderCandidateResults()
    saveCandidateDraft()
  }

  function selectRecommendedCandidates() {
    candidateResults.forEach(function (item) {
      item.selected =
        !item.existing && item.verdict === 'recommend'
    })

    renderCandidateResults()
    saveCandidateDraft()
  }

  // ----------------------------------------------------------
  // 게임 가져오기 입력 행
  // ----------------------------------------------------------

  function addImportRow(values, options) {
    const container = $('importGroups')
    if (!container) return null

    const data = values || {}
    const row = document.createElement('div')

    row.className = 'ig-row'

    if (options && options.fromCandidate) {
      row.classList.add('is-new-from-candidate')
    }

    row.innerHTML =
      '<input' +
        ' class="ig-name"' +
        ' type="text"' +
        ' placeholder="대표 이름"' +
        ' value="' +
        escapeHtml(data.name || '') +
      '">' +

      '<input' +
        ' class="ig-keywords"' +
        ' type="text"' +
        ' placeholder="키워드: 예) 용과같이,2"' +
        ' value="' +
        escapeHtml(data.keywords || '') +
      '">' +

      '<div class="ig-bottom">' +
        '<input' +
          ' class="ig-exclude"' +
          ' type="text"' +
          ' placeholder="제외어"' +
          ' value="' +
          escapeHtml(data.exclude || '') +
        '">' +

        '<input' +
          ' class="ig-image"' +
          ' type="url"' +
          ' placeholder="이미지 URL · 비우면 자동"' +
          ' value="' +
          escapeHtml(data.imageUrl || '') +
        '">' +

        '<select class="ig-policy">' +
          '<option value=""' +
            (!data.switchPolicy ? ' selected' : '') +
          '>자동</option>' +

          '<option value="s2"' +
            (data.switchPolicy === 's2' ? ' selected' : '') +
          '>Switch 2 전용</option>' +

          '<option value="s1"' +
            (data.switchPolicy === 's1' ? ' selected' : '') +
          '>Switch 1 전용</option>' +
        '</select>' +
      '</div>' +

      '<button' +
        ' type="button"' +
        ' class="ig-remove"' +
        ' aria-label="입력 행 삭제"' +
      '>×</button>'

    row.querySelector('.ig-remove').addEventListener(
      'click',
      function () {
        row.remove()

        if (!$('importGroups').children.length) {
          addImportRow()
        }

        saveImportDraft()
        updateDraftCounts()
      }
    )

    row
      .querySelectorAll('input, select')
      .forEach(function (input) {
        input.addEventListener('input', function () {
          saveImportDraft()
          updateDraftCounts()
        })

        input.addEventListener('change', function () {
          saveImportDraft()
          updateDraftCounts()
        })
      })

    container.appendChild(row)
    saveImportDraft()
    updateDraftCounts()

    return row
  }

  function getImportGroups() {
    const rows = Array.from(
      document.querySelectorAll('#importGroups .ig-row')
    )

    return rows
      .map(function (row) {
        return {
          name: row.querySelector('.ig-name').value.trim(),
          keywords: row
            .querySelector('.ig-keywords')
            .value.trim(),
          exclude: row
            .querySelector('.ig-exclude')
            .value.trim(),
          imageUrl: row
            .querySelector('.ig-image')
            .value.trim(),
          switchPolicy: row
            .querySelector('.ig-policy')
            .value.trim()
        }
      })
      .filter(function (group) {
        return group.name.length > 0
      })
  }

  function saveImportDraft() {
    try {
      localStorage.setItem(
        IMPORT_DRAFT_KEY,
        JSON.stringify(getImportGroups())
      )
    } catch (error) {
      // 임시 저장 실패는 가져오기를 막지 않음
    }
  }

  function restoreImportDraft() {
    const container = $('importGroups')
    if (!container) return

    container.innerHTML = ''

    let groups = []

    try {
      groups = JSON.parse(
        localStorage.getItem(IMPORT_DRAFT_KEY) || '[]'
      )
    } catch (error) {
      groups = []
    }

    if (!Array.isArray(groups) || !groups.length) {
      addImportRow()
      return
    }

    groups.forEach(function (group) {
      addImportRow(group)
    })

    updateDraftCounts()
  }

  function removeEmptyImportRows() {
    const rows = Array.from(
      document.querySelectorAll('#importGroups .ig-row')
    )

    rows.forEach(function (row) {
      const name = row
        .querySelector('.ig-name')
        .value.trim()

      if (!name) row.remove()
    })

    if (!$('importGroups').children.length) {
      addImportRow()
    }

    saveImportDraft()
    updateDraftCounts()
    showToast('빈 입력 행을 정리했습니다.')
  }

  function clearImportRows() {
    if (
      getImportGroups().length &&
      !window.confirm(
        '게임 가져오기 입력 행을 모두 초기화할까요?'
      )
    ) {
      return
    }

    $('importGroups').innerHTML = ''
    localStorage.removeItem(IMPORT_DRAFT_KEY)
    addImportRow()

    if ($('importResult')) {
      $('importResult').innerHTML = ''
    }

    setStatus($('importStatus'), '')
    updateDraftCounts()
  }

  function sendCandidatesToImport() {
    const selected = candidateResults.filter(function (item) {
      return item.selected && !item.existing
    })

    if (!selected.length) {
      showToast('게임 가져오기로 보낼 후보를 선택하세요.', 'err')
      return
    }

    const existingKeys = new Set(
      getImportGroups().map(function (group) {
        return normalizeTitle(group.name)
      })
    )

    let added = 0
    let skipped = 0
    let firstRow = null

    selected.forEach(function (item) {
      const key = normalizeTitle(item.title)

      if (!key || existingKeys.has(key)) {
        skipped += 1
        return
      }

      existingKeys.add(key)

      const row = addImportRow(
        {
          name: item.title,
          keywords: item.keywords || '',
          exclude: item.excludeKeywords || '',
          imageUrl: item.imageUrl || '',
          switchPolicy:
            item.switchPolicy ||
            getSwitchPolicy(item.platform)
        },
        {
          fromCandidate: true
        }
      )

      if (!firstRow) firstRow = row
      added += 1
    })

    removeEmptyImportRows()
    saveImportDraft()
    switchTab('import')

    if (firstRow) {
      window.setTimeout(function () {
        firstRow.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })

        const input = firstRow.querySelector('.ig-name')
        if (input) input.focus()
      }, 180)
    }

    let message =
      added + '개 후보를 게임 가져오기에 추가했습니다.'

    if (skipped) {
      message += ' 중복 ' + skipped + '개는 건너뛰었습니다.'
    }

    showToast(message, 'ok')
  }

  // ----------------------------------------------------------
  // 가져오기 미리보기 및 저장
  // ----------------------------------------------------------

  async function runImport(preview) {
    const groups = getImportGroups()
    const button = preview
      ? $('previewImport')
      : $('runImport')

    if (!groups.length) {
      setStatus(
        $('importStatus'),
        '가져올 게임 이름을 입력하세요.',
        'err'
      )
      return
    }

    if (
      !preview &&
      !window.confirm(
        groups.length +
          '개 게임을 실제로 저장할까요?\n' +
          '저장 전 미리보기 결과를 확인하는 것을 권장합니다.'
      )
    ) {
      return
    }

    setBusy(
      button,
      true,
      preview ? '미리보기 중...' : '저장 중...'
    )

    setStatus(
      $('importStatus'),
      preview
        ? '네이버 쇼핑 검색 결과를 확인하고 있습니다.'
        : '게임과 가격을 저장하고 있습니다.',
      'info'
    )

    try {
      const data = await api(
        preview
          ? '/admin/api/import/preview'
          : '/admin/api/import/run',
        {
          method: 'POST',
          body: {
            groups: groups
          }
        }
      )

      renderImportResults(data.results || [])

      if (preview) {
        setStatus(
          $('importStatus'),
          '미리보기가 완료되었습니다. 플랫폼과 가격을 확인하세요.',
          'ok'
        )
      } else {
        const successCount = (data.results || []).filter(
          function (result) {
            return !result.error
          }
        ).length

        setStatus(
          $('importStatus'),
          successCount +
            '개 게임 저장 처리가 완료되었습니다.',
          'ok'
        )

        localStorage.removeItem(IMPORT_DRAFT_KEY)
        await loadGames()
        await refreshDashboard()
      }
    } catch (error) {
      setStatus($('importStatus'), error.message, 'err')
    } finally {
      setBusy(button, false)
    }
  }

  function renderImportResults(results) {
    const container = $('importResult')
    if (!container) return

    if (!Array.isArray(results) || !results.length) {
      container.innerHTML =
        '<div class="admin-empty">검색 결과가 없습니다.</div>'
      return
    }

    container.innerHTML = results
      .map(function (result) {
        if (result.error) {
          return (
            '<article class="imp-card imp-error">' +
              '<div class="imp-body">' +
                '<h3 class="imp-title">' +
                  escapeHtml(result.title || '처리 실패') +
                '</h3>' +
                '<p class="admin-status err">' +
                  escapeHtml(result.error) +
                '</p>' +
              '</div>' +
            '</article>'
          )
        }

        const platforms = result.platforms || {}

        const rows = Object.keys(platforms)
          .map(function (code) {
            const platform = platforms[code] || {}
            const malls = Array.isArray(platform.malls)
              ? platform.malls
                  .map(function (mall) {
                    return (
                      escapeHtml(mall.label || mall.mallLabel || '') +
                      ' ' +
                      won(mall.price)
                    )
                  })
                  .join(', ')
              : ''

            const saved =
              result.saved &&
              result.saved[code] !== undefined
                ? ' · 저장 ' + result.saved[code] + '건'
                : ''

            return (
              '<li class="imp-plat">' +
                '<span class="imp-plat-label">' +
                  escapeHtml(
                    platform.label || platformLabel(code)
                  ) +
                '</span> ' +
                '최저 <b>' +
                  escapeHtml(won(platform.lowest)) +
                '</b>' +
                saved +
                (malls ? '<br>' + malls : '') +
              '</li>'
            )
          })
          .join('')

        return (
          '<article class="imp-card">' +
            (result.image
              ? '<img class="imp-img" src="' +
                escapeHtml(result.image) +
                '" alt="">'
              : '') +

            '<div class="imp-body">' +
              '<h3 class="imp-title">' +
                escapeHtml(result.title || '') +
              '</h3>' +

              (result.existing
                ? '<p class="admin-status info">이미 등록된 게임입니다.</p>'
                : '') +

              '<ul class="imp-platforms">' +
                (rows ||
                  '<li>정상적인 플랫폼별 가격을 찾지 못했습니다.</li>') +
              '</ul>' +
            '</div>' +
          '</article>'
        )
      })
      .join('')
  }

  // ----------------------------------------------------------
  // 게임 목록
  // ----------------------------------------------------------

  async function loadGames() {
    const list = $('gameList')
    if (!list) return

    setStatus($('gameListStatus'), '게임 목록을 불러오는 중입니다.', 'info')

    try {
      const data = await api('/admin/api/games')
      allGames = Array.isArray(data.games) ? data.games : []

      renderGames()
      setStatus(
        $('gameListStatus'),
        allGames.length + '개 게임이 등록되어 있습니다.',
        'ok'
      )
    } catch (error) {
      setStatus($('gameListStatus'), error.message, 'err')
    }
  }

  function renderGames() {
    const list = $('gameList')
    if (!list) return

    const query = normalizeTitle(
      $('gameListSearch')
        ? $('gameListSearch').value
        : ''
    )

    const games = allGames.filter(function (game) {
      if (!query) return true
      return normalizeTitle(game.title).includes(query)
    })

    if (!games.length) {
      list.innerHTML =
        '<li class="admin-empty">해당하는 게임이 없습니다.</li>'
      updateGameSelection()
      return
    }

    list.innerHTML = games
      .map(function (game) {
        const platforms = Array.isArray(game.platforms)
          ? game.platforms
          : String(game.platforms || '')
              .split(',')
              .filter(Boolean)

        const badges = platforms
          .map(function (platform) {
            return (
              '<span class="game-badge">' +
                escapeHtml(platformLabel(platform)) +
              '</span>'
            )
          })
          .join('')

        const policy = game.switchPolicy
          ? '<span class="policy-badge">' +
            escapeHtml(
              game.switchPolicy === 's2'
                ? 'Switch 2 전용'
                : 'Switch 1 전용'
            ) +
            '</span>'
          : ''

        return (
          '<li class="game-item" data-game-id="' +
          escapeHtml(game.id) +
          '">' +
            '<input' +
              ' type="checkbox"' +
              ' class="game-check"' +
              ' value="' +
              escapeHtml(game.id) +
              '"' +
              ' aria-label="' +
              escapeHtml(game.title) +
              ' 선택"' +
            '>' +

            '<div class="game-info">' +
              '<strong class="game-title">' +
                escapeHtml(game.title) +
              '</strong>' +

              '<div class="game-meta">' +
                badges +
                policy +
                '<span>에디션 ' +
                  escapeHtml(game.editionCount || platforms.length || 0) +
                  '개</span>' +
              '</div>' +
            '</div>' +
  
          
          // === 👇 여기서부터 추가 👇 ===
            '<button' +
              ' type="button"' +
              ' class="game-edit"' +
              ' data-edit-url-game="' + escapeHtml(game.id) + '"' +
              ' data-edit-url-current="' + escapeHtml(game.imageUrl) + '"' +
              ' style="margin-right: 8px;"' + 
            '>URL 수정</button>' +
            // === 👆 여기까지 추가 👆 ===
          
            '<button' +
              ' type="button"' +
              ' class="game-delete"' +
              ' data-delete-game="' +
              escapeHtml(game.id) +
              '"' +
            '>삭제</button>' +
          '</li>'
        )
      })
      .join('')

    list
      .querySelectorAll('.game-check')
      .forEach(function (checkbox) {
        checkbox.addEventListener('change', updateGameSelection)
      })

    list
      .querySelectorAll('[data-delete-game]')
      .forEach(function (button) {
        button.addEventListener('click', function () {
          deleteGames([Number(button.dataset.deleteGame)])
        })
      })

    // === 👇 여기서부터 추가 👇 ===
    list
      .querySelectorAll('[data-edit-url-game]')
      .forEach(function (button) {
        button.addEventListener('click', function () {
          const gameId = Number(button.dataset.editUrlGame)
          const currentUrl = button.dataset.editUrlCurrent
          updateGameImage(gameId, currentUrl)
        })
      })
    // === 👆 여기까지 추가 👆 ===
    
    updateGameSelection()
  }

// === 👇 여기서부터 추가 👇 ===
  async function updateGameImage(gameId, currentUrl) {
    const newUrl = window.prompt('새로운 이미지 URL을 입력하세요:', currentUrl || '')
    
    // 취소 버튼을 누르거나 값이 변하지 않았다면 무시
    if (newUrl === null || newUrl.trim() === (currentUrl || '').trim()) {
      return
    }

    try {
      // 기존에 구현된 api() 함수 활용 (토큰 자동 포함됨)
      await api('/admin/api/games/' + gameId + '/image', {
        method: 'PATCH',
        body: { imageUrl: newUrl.trim() }
      })

      showToast('이미지 URL을 수정했습니다.', 'ok')
      
      // 목록 다시 불러오기
      await loadGames()
    } catch (error) {
      showToast('이미지 수정 실패: ' + error.message, 'err')
    }
  }
  // === 👆 여기까지 추가 👆 ===
  
  function getSelectedGameIds() {
    return Array.from(
      document.querySelectorAll('#gameList .game-check:checked')
    ).map(function (checkbox) {
      return Number(checkbox.value)
    })
  }

  function updateGameSelection() {
    const visibleChecks = Array.from(
      document.querySelectorAll('#gameList .game-check')
    )

    const selected = getSelectedGameIds()

    if ($('selectedGameCount')) {
      $('selectedGameCount').textContent =
        selected.length + '개 선택됨'
    }

    if ($('bulkDeleteBtn')) {
      $('bulkDeleteBtn').disabled =
        selected.length === 0
    }

    if ($('selectAllGames')) {
      $('selectAllGames').checked =
        visibleChecks.length > 0 &&
        visibleChecks.every(function (checkbox) {
          return checkbox.checked
        })

      $('selectAllGames').indeterminate =
        selected.length > 0 &&
        selected.length < visibleChecks.length
    }
  }

  async function deleteGames(ids) {
    if (!ids.length) return

    if (
      !window.confirm(
        ids.length +
          '개 게임을 삭제할까요?\n' +
          '연결된 에디션과 가격도 함께 삭제됩니다.'
      )
    ) {
      return
    }

    const button = $('bulkDeleteBtn')
    setBusy(button, true, '삭제 중...')

    let success = 0
    let failed = 0

    for (const id of ids) {
      try {
        await api('/admin/api/games/' + id, {
          method: 'DELETE'
        })

        success += 1
      } catch (error) {
        failed += 1
      }
    }

    setBusy(button, false)

    await loadGames()
    await refreshDashboard()

    if (failed) {
      showToast(
        success +
          '개 삭제, ' +
          failed +
          '개 삭제 실패',
        'err'
      )
    } else {
      showToast(success + '개 게임을 삭제했습니다.', 'ok')
    }
  }

  // ----------------------------------------------------------
  // 설정
  // ----------------------------------------------------------

  async function loadSettings() {
    try {
      const data = await api('/admin/api/settings')
      const settings = data.settings || {}

      ;[
        'coupang_partners_id',
        'linkprice_id',
        'custom_blacklist_keywords',
        'custom_blocked_malls'
      ].forEach(function (key) {
        const input = $(key)
        if (input) input.value = settings[key] || ''
      })
    } catch (error) {
      setStatus($('settingsStatus'), error.message, 'err')
    }
  }

  async function saveSettings() {
    const button = $('saveSettings')

    const settings = {
      coupang_partners_id:
        $('coupang_partners_id').value.trim(),
      linkprice_id:
        $('linkprice_id').value.trim(),
      custom_blacklist_keywords:
        $('custom_blacklist_keywords').value.trim(),
      custom_blocked_malls:
        $('custom_blocked_malls').value.trim()
    }

    setBusy(button, true, '저장 중...')

    try {
      await api('/admin/api/settings', {
        method: 'POST',
        body: settings
      })

      setStatus(
        $('settingsStatus'),
        '관리자 설정을 저장했습니다.',
        'ok'
      )
    } catch (error) {
      setStatus($('settingsStatus'), error.message, 'err')
    } finally {
      setBusy(button, false)
    }
  }

  // ----------------------------------------------------------
  // 백업 및 복원
  // ----------------------------------------------------------

  function gameToBackupLine(game) {
    const name = String(game.title || '').replace(/\|/g, ' ')
    const searchQuery = String(
      game.searchQuery || game.search_query || ''
    ).replace(/\|/g, ' ')

    const imageUrl = String(
      game.imageUrl || game.image_url || ''
    ).replace(/\|/g, ' ')

    const keywords = String(game.keywords || '').replace(/\|/g, ' ')

    const exclude = String(
      game.excludeKeywords ||
      game.exclude_keywords ||
      ''
    ).replace(/\|/g, ' ')

    const policy = String(
      game.switchPolicy ||
      game.switch_policy ||
      ''
    ).replace(/\|/g, ' ')

    return [
      name,
      searchQuery,
      imageUrl,
      keywords,
      exclude,
      policy
    ].join(' | ')
  }

  async function exportGames() {
    try {
      const data = await api('/admin/api/games')
      allGames = Array.isArray(data.games) ? data.games : []

      const text = allGames
        .map(gameToBackupLine)
        .join('\n')

      $('exportArea').value = text

      setStatus(
        $('exportStatus'),
        allGames.length + '개 게임을 내보냈습니다.',
        'ok'
      )

      return text
    } catch (error) {
      setStatus($('exportStatus'), error.message, 'err')
      return ''
    }
  }

  function parseBackupText(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim()
      })
      .filter(Boolean)
      .map(function (line) {
        const parts = line.split('|').map(function (part) {
          return part.trim()
        })

        return {
          name: parts[0] || '',
          searchQuery: parts[1] || '',
          imageUrl: parts[2] || '',
          keywords: parts[3] || '',
          exclude: parts[4] || '',
          switchPolicy: parts[5] || ''
        }
      })
      .filter(function (group) {
        return group.name.length > 0
      })
  }

  function formatPasteDuration(milliseconds) {
    const totalSeconds = Math.max(
      0,
      Math.round(Number(milliseconds || 0) / 1000)
    )

    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor(
      (totalSeconds % 3600) / 60
    )
    const seconds = totalSeconds % 60

    const parts = []

    if (hours > 0) {
      parts.push(hours + '시간')
    }

    if (minutes > 0 || hours > 0) {
      parts.push(minutes + '분')
    }

    parts.push(seconds + '초')

    return parts.join(' ')
  }

  function getPasteProgressCounts(results) {
    const counts = {
      success: 0,
      existing: 0,
      failed: 0
    }

    ;(Array.isArray(results) ? results : [])
      .forEach(function (result) {
        if (result && result.error) {
          counts.failed += 1
        } else if (result && result.existing) {
          counts.existing += 1
        } else {
          counts.success += 1
        }
      })

    return counts
  }

  function renderPasteProgress(
    done,
    total,
    currentTitle,
    results,
    startedAt
  ) {
    const container = $('pasteResult')

    if (!container) return

    const safeTotal = Math.max(1, Number(total) || 1)
    const safeDone = Math.max(0, Number(done) || 0)

    const percent = Math.min(
      100,
      Math.round((safeDone / safeTotal) * 100)
    )

    const elapsed = Date.now() - startedAt

    const estimatedTotal =
      safeDone > 0
        ? (elapsed / safeDone) * safeTotal
        : 0

    const remaining =
      safeDone > 0
        ? Math.max(0, estimatedTotal - elapsed)
        : 0

    const counts = getPasteProgressCounts(results)

    container.innerHTML =
      '<div class="admin-card">' +
        '<div class="admin-row admin-row-between">' +
          '<strong>' +
            escapeHtml(done + ' / ' + total) +
          '</strong>' +
          '<strong>' +
            escapeHtml(percent + '%') +
          '</strong>' +
        '</div>' +

        '<div style="' +
          'height:10px;' +
          'margin:10px 0;' +
          'overflow:hidden;' +
          'border-radius:999px;' +
          'background:rgba(255,255,255,.1);' +
        '">' +
          '<div style="' +
            'width:' + percent + '%;' +
            'height:100%;' +
            'background:#7667f5;' +
            'transition:width .2s ease;' +
          '"></div>' +
        '</div>' +

        '<p class="admin-hint">' +
          (
            currentTitle
              ? '현재 처리: ' +
                escapeHtml(currentTitle)
              : '처리를 준비하고 있습니다.'
          ) +
        '</p>' +

        '<p class="admin-hint">' +
          '성공 ' +
          escapeHtml(counts.success) +
          ' · 기등록 ' +
          escapeHtml(counts.existing) +
          ' · 실패 ' +
          escapeHtml(counts.failed) +
        '</p>' +

        '<p class="admin-hint">' +
          '경과 ' +
          escapeHtml(formatPasteDuration(elapsed)) +
          (
            safeDone > 0 && safeDone < safeTotal
              ? ' · 예상 남은 시간 ' +
                escapeHtml(
                  formatPasteDuration(remaining)
                )
              : ''
          ) +
        '</p>' +
      '</div>'
  }

  async function runPasteImport(preview) {
    const groups = parseBackupText(
      $('importPasteArea').value
    )

    const button = preview
      ? $('pastePreviewBtn')
      : $('pasteImportBtn')

    const otherButton = preview
      ? $('pasteImportBtn')
      : $('pastePreviewBtn')

    if (!groups.length) {
      setStatus(
        $('pasteStatus'),
        '복원할 백업 내용을 붙여넣으세요.',
        'err'
      )
      return
    }

    if (
      !preview &&
      !window.confirm(
        groups.length +
          '개 게임을 붙여넣기 방식으로 저장할까요?'
      )
    ) {
      return
    }

    const endpoint = preview
      ? '/admin/api/import/preview'
      : '/admin/api/import/run'

    const startedAt = Date.now()
    const allResults = []

    const previousOtherDisabled = otherButton
      ? otherButton.disabled
      : false

    setBusy(
      button,
      true,
      preview
        ? '미리보기 준비 중...'
        : '복원 준비 중...'
    )

    if (otherButton) {
      otherButton.disabled = true
    }

    setStatus(
      $('pasteStatus'),
      preview
        ? groups.length +
          '개 게임의 순차 미리보기를 시작합니다.'
        : groups.length +
          '개 게임의 순차 복원을 시작합니다.',
      'info'
    )

    renderPasteProgress(
      0,
      groups.length,
      '',
      allResults,
      startedAt
    )

    for (
      let index = 0;
      index < groups.length;
      index += 1
    ) {
      const group = groups[index]
      const current = index + 1

      if (button) {
        button.textContent =
          (preview ? '미리보기 ' : '복원 ') +
          current +
          '/' +
          groups.length
      }

      setStatus(
        $('pasteStatus'),
        current +
          ' / ' +
          groups.length +
          ' · ' +
          group.name +
          ' 처리 중',
        'info'
      )

      renderPasteProgress(
        index,
        groups.length,
        group.name,
        allResults,
        startedAt
      )

      try {
        const data = await api(endpoint, {
          method: 'POST',
          body: {
            groups: [group]
          }
        })

        const received = Array.isArray(data.results)
          ? data.results
          : []

        if (received.length) {
          received.forEach(function (result) {
            allResults.push(result)
          })
        } else {
          allResults.push({
            title: group.name,
            error: '서버에서 처리 결과를 반환하지 않았습니다.'
          })
        }
      } catch (error) {
        allResults.push({
          title: group.name,
          error:
            error && error.message
              ? error.message
              : '요청 처리에 실패했습니다.'
        })
      }

      renderPasteProgress(
        current,
        groups.length,
        current < groups.length
          ? groups[current].name
          : '',
        allResults,
        startedAt
      )
    }

    /*
     * 중요:
     * 여기서 기존 상세 미리보기 함수를 사용합니다.
     * 플랫폼·가격·쇼핑몰·이미지 표시를 그대로 보존합니다.
     */
    renderPasteResults(allResults)

    const counts = getPasteProgressCounts(allResults)
    const elapsedText = formatPasteDuration(
      Date.now() - startedAt
    )

    if (preview) {
      setStatus(
        $('pasteStatus'),
        '순차 미리보기 완료 · 전체 ' +
          groups.length +
          '개 · 성공 ' +
          counts.success +
          '개 · 기등록 ' +
          counts.existing +
          '개 · 실패 ' +
          counts.failed +
          '개 · 경과 ' +
          elapsedText,
        counts.failed > 0 ? 'err' : 'ok'
      )
    } else {
      setStatus(
        $('pasteStatus'),
        '순차 복원 완료 · 전체 ' +
          groups.length +
          '개 · 성공 ' +
          counts.success +
          '개 · 기등록 ' +
          counts.existing +
          '개 · 실패 ' +
          counts.failed +
          '개 · 경과 ' +
          elapsedText,
        counts.failed > 0 ? 'err' : 'ok'
      )

      await loadGames()
      await refreshDashboard()
    }

    setBusy(button, false)

    if (otherButton) {
      otherButton.disabled = previousOtherDisabled
    }
  }

  
    function renderPasteResults(results) {
    const original = $('importResult')
    const paste = $('pasteResult')

    if (!paste) return

    const temporary = document.createElement('div')
    temporary.id = 'importResult'

    if (original) {
      original.id = 'importResultOriginal'
    }

    document.body.appendChild(temporary)
    renderImportResults(results)

    paste.innerHTML = temporary.innerHTML
    temporary.remove()

    if (original) {
      original.id = 'importResult'
    }
  }

  async function resetAllData() {
    const first = window.confirm(
      '정말 모든 게임·에디션·가격 데이터를 삭제할까요?\n' +
      '이 작업은 되돌릴 수 없습니다.'
    )

    if (!first) return

    const confirmation = window.prompt(
      '확인을 위해 아래 문장을 정확히 입력하세요.\n\n전체 데이터 삭제'
    )

    if (confirmation !== '전체 데이터 삭제') {
      setStatus(
        $('resetStatus'),
        '확인 문장이 일치하지 않아 취소했습니다.',
        'err'
      )
      return
    }

    const button = $('resetAllBtn')
    setBusy(button, true, '초기화 중...')

    try {
      await api('/admin/api/reset', {
        method: 'POST',
        body: {
          confirmation: confirmation
        }
      })

      allGames = []
      candidateResults = []

      localStorage.removeItem(CANDIDATE_DRAFT_KEY)
      localStorage.removeItem(IMPORT_DRAFT_KEY)

      restoreImportDraft()
      renderCandidateResults()
      renderGames()
      refreshDashboard()

      setStatus(
        $('resetStatus'),
        '모든 게임 데이터를 초기화했습니다.',
        'ok'
      )
    } catch (error) {
      setStatus($('resetStatus'), error.message, 'err')
    } finally {
      setBusy(button, false)
    }
  }

  // ----------------------------------------------------------
  // 이벤트 연결
  // ----------------------------------------------------------

  function bindEvents() {
    bindTabs()
    bindActivityTracking()

    $('lockForm').addEventListener('submit', async function (event) {
      event.preventDefault()

      const password = $('lockPassword').value

      if (!password) {
        setStatus(
          $('lockStatus'),
          '관리자 비밀번호를 입력하세요.',
          'err'
        )
        return
      }

      setStatus($('lockStatus'), '인증 중입니다.', 'info')

      const ok = await verifyToken(password)

      if (!ok) {
        clearToken()
        setStatus(
          $('lockStatus'),
          '관리자 비밀번호가 올바르지 않습니다.',
          'err'
        )
        return
      }

      $('lockPassword').value = ''
      showAdmin()
    })

    $('lockBtn').addEventListener('click', function () {
      clearToken()
      showLock('관리자 화면을 잠갔습니다.')
    })

    $('refreshDashboard').addEventListener(
      'click',
      refreshDashboard
    )

    $('candidateTitles').addEventListener('input', function () {
      updateCandidateInputCount()
      saveCandidateDraft()
    })

    $('candidatePlatform').addEventListener('change', saveCandidateDraft)
    $('candidateYear').addEventListener('change', saveCandidateDraft)

    $('evaluateCandidates').addEventListener('click', function () {
      evaluateCandidates()
    })

    $('stopCandidateEvaluation').addEventListener('click', function () {
      evaluationStopped = true
      $('stopCandidateEvaluation').disabled = true
    })

    $('restoreCandidateDraft').addEventListener('click', function () {
      restoreCandidateDraft(true)
    })

    $('resetCandidateWork').addEventListener(
      'click',
      resetCandidateWork
    )

    $('retryFailedCandidates').addEventListener(
      'click',
      retryFailedCandidates
    )

    document
      .querySelectorAll('[data-candidate-filter]')
      .forEach(function (button) {
        button.addEventListener('click', function () {
          candidateFilter =
            button.dataset.candidateFilter || 'all'
          renderCandidateResults()
        })
      })

    $('candidateSort').addEventListener(
      'change',
      renderCandidateResults
    )

    $('selectAllCandidates').addEventListener(
      'change',
      function () {
        setVisibleCandidateSelection(
          $('selectAllCandidates').checked
        )
      }
    )

    $('selectRecommendedCandidates').addEventListener(
      'click',
      selectRecommendedCandidates
    )

    $('clearCandidateSelection').addEventListener(
      'click',
      function () {
        candidateResults.forEach(function (item) {
          item.selected = false
        })

        renderCandidateResults()
        saveCandidateDraft()
      }
    )

    $('sendCandidatesToImport').addEventListener(
      'click',
      sendCandidatesToImport
    )

    $('addGroupRow').addEventListener('click', function () {
      const row = addImportRow()

      if (row) {
        row.querySelector('.ig-name').focus()
      }
    })

    $('removeEmptyImportRows').addEventListener(
      'click',
      removeEmptyImportRows
    )

    $('clearImportRows').addEventListener(
      'click',
      clearImportRows
    )

    $('previewImport').addEventListener('click', function () {
      runImport(true)
    })

    $('runImport').addEventListener('click', function () {
      runImport(false)
    })

    $('refreshGames').addEventListener('click', loadGames)

    $('gameListSearch').addEventListener(
      'input',
      renderGames
    )

    $('selectAllGames').addEventListener(
      'change',
      function () {
        document
          .querySelectorAll('#gameList .game-check')
          .forEach(function (checkbox) {
            checkbox.checked = $('selectAllGames').checked
          })

        updateGameSelection()
      }
    )

    $('bulkDeleteBtn').addEventListener('click', function () {
      deleteGames(getSelectedGameIds())
    })

    $('saveSettings').addEventListener(
      'click',
      saveSettings
    )

    $('exportBtn').addEventListener(
      'click',
      exportGames
    )

    $('exportTxtBtn').addEventListener(
      'click',
      async function () {
        const text =
          $('exportArea').value || (await exportGames())

        if (!text) return

        downloadText(
          'yeonudeal-games-backup.txt',
          text,
          'text/plain;charset=utf-8'
        )
      }
    )

    $('exportCsvBtn').addEventListener(
      'click',
      async function () {
        if (!allGames.length) {
          await exportGames()
        }

        const header =
          '\uFEFF대표이름,검색어,이미지URL,keywords,제외어,스위치정책'

        const rows = allGames.map(function (game) {
          return gameToBackupLine(game)
            .split('|')
            .map(function (value) {
              return (
                '"' +
                String(value.trim()).replace(/"/g, '""') +
                '"'
              )
            })
            .join(',')
        })

        downloadText(
          'yeonudeal-games-backup.csv',
          [header].concat(rows).join('\n'),
          'text/csv;charset=utf-8'
        )
      }
    )

    $('pastePreviewBtn').addEventListener(
      'click',
      function () {
        runPasteImport(true)
      }
    )

    $('pasteImportBtn').addEventListener(
      'click',
      function () {
        runPasteImport(false)
      }
    )

    $('resetAllBtn').addEventListener(
      'click',
      resetAllData
    )
  }

  async function refreshAll() {
    await Promise.allSettled([
      refreshDashboard(),
      loadGames(),
      loadSettings()
    ])
  }

  // ----------------------------------------------------------
  // 시작
  // ----------------------------------------------------------

  document.addEventListener('DOMContentLoaded', async function () {
    bindEvents()
    updateCandidateInputCount()

    const token = getToken()

    if (!token) {
      showLock()
      return
    }

    if (isTokenExpired()) {
      clearToken()
      showLock('세션이 만료되었습니다. 다시 로그인하세요.', 'err')
      return
    }

    const valid = await verifyToken()

    if (!valid) {
      clearToken()
      showLock('관리자 인증이 필요합니다.', 'err')
      return
    }

    showAdmin()
  })
})()
