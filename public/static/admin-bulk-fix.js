// ============================================================
// 관리자 대량 미리보기/복원 회귀 수정
// public/static/admin-bulk-fix.js
//
// - 기존 admin.js를 직접 변경하지 않고 붙여넣기 버튼만 가로챔
// - 전체 목록을 게임 1개씩 순차 요청
// - 100개 제한 우회
// - 현재/전체, 성공/실패/중복, 경과/예상 시간 표시
// - 연도는 후보 판정에 사용하지 않는 참고값으로 안내
// ============================================================

(function () {
  'use strict'

  const TOKEN_KEY = 'gpt_admin_token'

  let running = false
  let stopRequested = false

  const $ = function (id) {
    return document.getElementById(id)
  }

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

  function parseList(value) {
    return Array.from(
      new Set(
        String(value || '')
          .split(/[\r\n,]+/)
          .map(function (item) {
            return item.trim()
          })
          .filter(Boolean)
      )
    )
  }

  function normalizeSwitchPolicy(value) {
    const policy = String(value || '')
      .trim()
      .toLowerCase()

    if (policy === 's1' || policy === 's2') {
      return policy
    }

    return ''
  }

  /**
   * 백업/복원 6칸 형식
   *
   * 이름 | 검색어 | 이미지URL | keywords | 제외어 | 스위치정책
   */
  function parsePasteGroups(text) {
    const groups = []
    const seen = new Set()
    const invalid = []

    String(text || '')
      .split(/\r?\n/)
      .forEach(function (rawLine, index) {
        const line = rawLine.trim()

        if (!line) return

        const columns = line
          .split('|')
          .map(function (column) {
            return column.trim()
          })

        const name = columns[0] || ''

        if (!name) {
          invalid.push({
            line: index + 1,
            reason: '대표 이름이 없습니다.'
          })
          return
        }

        const searchQuery = columns[1] || name
        const imageUrl = columns[2] || ''
        const keywords = parseList(columns[3] || '')
        const exclude = parseList(columns[4] || '')
        const switchPolicy = normalizeSwitchPolicy(
          columns[5] || ''
        )

        const duplicateKey =
          normalizeTitle(name) +
          '|' +
          normalizeTitle(searchQuery)

        if (seen.has(duplicateKey)) {
          invalid.push({
            line: index + 1,
            reason: '붙여넣기 목록 안의 중복 게임입니다.',
            name: name
          })
          return
        }

        seen.add(duplicateKey)

        groups.push({
          name: name,
          searchQuery: searchQuery,
          keywords: keywords,
          exclude: exclude,
          imageUrl: imageUrl,
          switchPolicy: switchPolicy,

          // 기존 API 필드명과의 호환성
          search_query: searchQuery,
          image_url: imageUrl,
          exclude_keywords: exclude,
          switch_policy: switchPolicy
        })
      })

    return {
      groups: groups,
      invalid: invalid
    }
  }

  function formatDuration(milliseconds) {
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

  function setStatus(message, type) {
    const element = $('pasteStatus')

    if (!element) return

    element.textContent = message || ''
    element.className = 'admin-status'

    if (type) {
      element.classList.add(type)
    }
  }

  function setButtonsBusy(busy) {
    const previewButton = $('pastePreviewBtn')
    const importButton = $('pasteImportBtn')

    if (previewButton) {
      previewButton.disabled = busy
    }

    if (importButton) {
      importButton.disabled = busy
    }
  }

  function ensureProgressUi() {
    const status = $('pasteStatus')

    if (!status || !status.parentElement) {
      return null
    }

    let box = $('bulkSequentialProgress')

    if (box) return box

    box = document.createElement('div')
    box.id = 'bulkSequentialProgress'
    box.style.marginTop = '12px'
    box.style.padding = '14px'
    box.style.border = '1px solid rgba(148,163,184,.25)'
    box.style.borderRadius = '10px'
    box.style.background = 'rgba(15,23,42,.35)'
    box.hidden = true

    box.innerHTML = [
      '<div style="display:flex;gap:8px;',
      'justify-content:space-between;',
      'align-items:center;flex-wrap:wrap">',
      '  <strong id="bulkProgressCount">0 / 0</strong>',
      '  <button type="button" id="bulkStopBtn"',
      '    class="btn btn-danger btn-sm">중지</button>',
      '</div>',
      '<div style="height:8px;margin-top:10px;',
      'background:rgba(148,163,184,.2);',
      'border-radius:999px;overflow:hidden">',
      '  <div id="bulkProgressBar"',
      '    style="height:100%;width:0%;',
      '    background:#6366f1;transition:width .2s">',
      '  </div>',
      '</div>',
      '<p id="bulkCurrentGame"',
      '  class="admin-status" style="margin-top:10px"></p>',
      '<p id="bulkProgressStats"',
      '  class="admin-status" style="margin-top:6px"></p>'
    ].join('')

    status.parentElement.insertBefore(
      box,
      status.nextSibling
    )

    const stopButton = box.querySelector('#bulkStopBtn')

    if (stopButton) {
      stopButton.addEventListener('click', function () {
        stopRequested = true
        stopButton.disabled = true
        stopButton.textContent = '중지 요청됨'
      })
    }

    return box
  }

  function updateProgress(options) {
    const box = ensureProgressUi()

    if (!box) return

    box.hidden = false

    const current = Number(options.current || 0)
    const total = Number(options.total || 0)
    const percent =
      total > 0
        ? Math.min(100, Math.round((current / total) * 100))
        : 0

    const count = $('bulkProgressCount')
    const bar = $('bulkProgressBar')
    const currentGame = $('bulkCurrentGame')
    const stats = $('bulkProgressStats')

    if (count) {
      count.textContent =
        current.toLocaleString('ko-KR') +
        ' / ' +
        total.toLocaleString('ko-KR') +
        ' (' +
        percent +
        '%)'
    }

    if (bar) {
      bar.style.width = percent + '%'
    }

    if (currentGame) {
      currentGame.textContent = options.game
        ? '현재 처리: ' + options.game
        : ''
    }

    if (stats) {
      const parts = [
        '성공 ' + Number(options.success || 0),
        '중복 ' + Number(options.duplicate || 0),
        '실패 ' + Number(options.failed || 0),
        '경과 ' + formatDuration(options.elapsed || 0)
      ]

      if (
        Number.isFinite(options.remaining) &&
        options.remaining >= 0
      ) {
        parts.push(
          '예상 남은 시간 ' +
          formatDuration(options.remaining)
        )
      }

      stats.textContent = parts.join(' · ')
    }
  }

  function resetProgress(total) {
    const box = ensureProgressUi()

    if (!box) return

    box.hidden = false

    const stopButton = $('bulkStopBtn')

    if (stopButton) {
      stopButton.disabled = false
      stopButton.textContent = '중지'
    }

    updateProgress({
      current: 0,
      total: total,
      game: '',
      success: 0,
      duplicate: 0,
      failed: 0,
      elapsed: 0,
      remaining: 0
    })
  }

  async function requestOne(path, group) {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token':
          localStorage.getItem(TOKEN_KEY) || ''
      },
      body: JSON.stringify({
        groups: [group]
      })
    })

    let data = null

    try {
      data = await response.json()
    } catch (error) {
      data = {
        ok: false,
        error: '서버 응답을 JSON으로 읽지 못했습니다.'
      }
    }

    if (response.status === 401) {
      throw new Error(
        '관리자 인증이 만료되었습니다. 다시 로그인하세요.'
      )
    }

    if (!response.ok || !data || data.ok === false) {
      throw new Error(
        data && (data.error || data.message)
          ? data.error || data.message
          : 'HTTP ' + response.status
      )
    }

    return data
  }

  function extractOneResult(data, group) {
    let result = null

    if (Array.isArray(data && data.results)) {
      result = data.results[0] || null
    } else if (Array.isArray(data && data.preview)) {
      result = data.preview[0] || null
    } else if (data && data.result) {
      result = data.result
    }

    if (!result) {
      result = data || {}
    }

    const status = String(
      result.status ||
      result.verdict ||
      result.action ||
      ''
    ).toLowerCase()

    const message = String(
      result.message ||
      result.reason ||
      result.error ||
      data.message ||
      ''
    )

    const duplicate =
      result.existing === true ||
      result.duplicate === true ||
      status === 'existing' ||
      status === 'duplicate' ||
      /이미|중복/.test(message)

    const failed =
      result.ok === false ||
      status === 'failed' ||
      status === 'error'

    return {
      name: group.name,
      ok: !failed,
      duplicate: duplicate,
      message: message || (
        duplicate
          ? '이미 등록된 게임입니다.'
          : '처리 완료'
      ),
      raw: result
    }
  }

  function renderSequentialResults(results, mode, invalid) {
    const container = $('pasteResult')

    if (!container) return

    const title =
      mode === 'preview'
        ? '미리보기 결과'
        : '실제 저장 결과'

    let html = [
      '<div class="import-summary">',
      '<strong>' + escapeHtml(title) + '</strong>',
      '<span>총 ' + results.length + '개 처리</span>',
      '</div>'
    ].join('')

    if (invalid && invalid.length > 0) {
      html += [
        '<div class="admin-status err">',
        '붙여넣기 형식 오류 또는 목록 내 중복 ',
        invalid.length,
        '개',
        '</div>'
      ].join('')
    }

    html += '<div class="import-result-list">'

    results.forEach(function (result, index) {
      let badge = '완료'
      let badgeClass = 'ok'

      if (!result.ok) {
        badge = '실패'
        badgeClass = 'err'
      } else if (result.duplicate) {
        badge = '중복'
        badgeClass = 'warn'
      }

      html += [
        '<div class="import-result-item">',
        '  <div>',
        '    <strong>',
        escapeHtml(index + 1 + '. ' + result.name),
        '</strong>',
        '    <p class="admin-hint">',
        escapeHtml(result.message),
        '</p>',
        '  </div>',
        '  <span class="admin-status ',
        badgeClass,
        '">',
        escapeHtml(badge),
        '</span>',
        '</div>'
      ].join('')
    })

    if (invalid && invalid.length > 0) {
      invalid.forEach(function (item) {
        html += [
          '<div class="import-result-item">',
          '  <div>',
          '    <strong>',
          escapeHtml(
            '줄 ' +
            item.line +
            (item.name ? ' · ' + item.name : '')
          ),
          '</strong>',
          '    <p class="admin-hint">',
          escapeHtml(item.reason),
          '</p>',
          '  </div>',
          '  <span class="admin-status err">제외</span>',
          '</div>'
        ].join('')
      })
    }

    html += '</div>'

    container.innerHTML = html
  }

  async function runSequential(mode) {
    if (running) return

    const textarea = $('importPasteArea')

    if (!textarea) {
      setStatus(
        '붙여넣기 입력창을 찾지 못했습니다.',
        'err'
      )
      return
    }

    const parsed = parsePasteGroups(textarea.value)
    const groups = parsed.groups

    if (groups.length === 0) {
      setStatus(
        '처리할 게임이 없습니다. 백업 내용을 붙여넣어 주세요.',
        'err'
      )
      return
    }

    if (
      mode === 'run' &&
      !window.confirm(
        groups.length.toLocaleString('ko-KR') +
        '개 게임을 한 개씩 순차 저장합니다.\n\n' +
        '이미 등록된 게임은 중복으로 표시될 수 있습니다.\n' +
        '계속하시겠습니까?'
      )
    ) {
      return
    }

    running = true
    stopRequested = false
    setButtonsBusy(true)
    resetProgress(groups.length)

    const startedAt = Date.now()
    const results = []

    let success = 0
    let duplicate = 0
    let failed = 0

    const path =
      mode === 'preview'
        ? '/admin/api/import/preview'
        : '/admin/api/import/run'

    setStatus(
      mode === 'preview'
        ? '대량 미리보기를 순차 처리하고 있습니다.'
        : '대량 저장을 순차 처리하고 있습니다.',
      'ok'
    )

    for (let index = 0; index < groups.length; index += 1) {
      if (stopRequested) break

      const group = groups[index]
      const current = index + 1
      const beforeRequest = Date.now()

      updateProgress({
        current: index,
        total: groups.length,
        game: group.name,
        success: success,
        duplicate: duplicate,
        failed: failed,
        elapsed: Date.now() - startedAt,
        remaining:
          index > 0
            ? (
                (Date.now() - startedAt) / index
              ) * (groups.length - index)
            : 0
      })

      try {
        const data = await requestOne(path, group)
        const result = extractOneResult(data, group)

        results.push(result)

        if (result.duplicate) {
          duplicate += 1
        } else if (result.ok) {
          success += 1
        } else {
          failed += 1
        }
      } catch (error) {
        const message =
          error && error.message
            ? error.message
            : String(error)

        // 중복 응답은 전체 작업을 멈추지 않음
        if (/이미|중복|존재/.test(message)) {
          duplicate += 1

          results.push({
            name: group.name,
            ok: true,
            duplicate: true,
            message: message
          })
        } else {
          failed += 1

          results.push({
            name: group.name,
            ok: false,
            duplicate: false,
            message: message
          })
        }
      }

      const processed = index + 1
      const elapsed = Date.now() - startedAt
      const average = elapsed / processed
      const remaining =
        average * (groups.length - processed)

      updateProgress({
        current: processed,
        total: groups.length,
        game: group.name,
        success: success,
        duplicate: duplicate,
        failed: failed,
        elapsed: elapsed,
        remaining: remaining
      })

      // 브라우저 화면 갱신과 서버 과부하 방지
      const requestTime = Date.now() - beforeRequest

      if (requestTime < 120) {
        await new Promise(function (resolve) {
          window.setTimeout(resolve, 120 - requestTime)
        })
      }
    }

    const elapsed = Date.now() - startedAt
    const processedCount = results.length

    renderSequentialResults(
      results,
      mode,
      parsed.invalid
    )

    if (stopRequested) {
      setStatus(
        '사용자가 중지했습니다. ' +
        processedCount +
        ' / ' +
        groups.length +
        ' 처리 · 성공 ' +
        success +
        ' · 중복 ' +
        duplicate +
        ' · 실패 ' +
        failed +
        ' · 경과 ' +
        formatDuration(elapsed),
        'err'
      )
    } else {
      setStatus(
        '완료: ' +
        processedCount +
        ' / ' +
        groups.length +
        ' · 성공 ' +
        success +
        ' · 중복 ' +
        duplicate +
        ' · 실패 ' +
        failed +
        ' · 경과 ' +
        formatDuration(elapsed),
        failed > 0 ? 'err' : 'ok'
      )
    }

    const stopButton = $('bulkStopBtn')

    if (stopButton) {
      stopButton.disabled = true
      stopButton.textContent = '처리 완료'
    }

    running = false
    setButtonsBusy(false)

    // 실제 저장 후 현황과 게임 목록 갱신을 위해 이벤트 발생
    if (mode === 'run') {
      window.dispatchEvent(
        new CustomEvent('yenu-admin-import-complete', {
          detail: {
            success: success,
            duplicate: duplicate,
            failed: failed
          }
        })
      )
    }
  }

  /**
   * 기존 admin.js가 버튼에 연결한 일괄 요청을 실행하지 못하도록
   * 캡처 단계에서 클릭을 먼저 가로챕니다.
   */
  document.addEventListener(
    'click',
    function (event) {
      const target =
        event.target && event.target.closest
          ? event.target.closest(
              '#pastePreviewBtn, #pasteImportBtn'
            )
          : null

      if (!target) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      if (target.id === 'pastePreviewBtn') {
        runSequential('preview')
      } else {
        runSequential('run')
      }
    },
    true
  )

  function updateYearNotice() {
    const yearInput = $('candidateYear')

    if (!yearInput) return

    yearInput.title =
      '기준연도는 참고 표시용이며 추천 점수와 제외 판정에 사용하지 않습니다.'

    const label = yearInput.closest('label')

    if (label) {
      const labelText = label.querySelector(
        'span, strong, .admin-field-label'
      )

      if (
        labelText &&
        !/참고|판정 미사용/.test(labelText.textContent || '')
      ) {
        labelText.textContent =
          '기준연도 (참고 · 판정 미사용)'
      }
    }

    let notice = $('candidateYearNotice')

    if (!notice) {
      notice = document.createElement('p')
      notice.id = 'candidateYearNotice'
      notice.className = 'admin-hint'
      notice.textContent =
        '기준연도는 후보 목록을 구분하기 위한 참고값입니다. ' +
        '추천 점수·제외 판정·실제 출시연도 확인에는 사용하지 않습니다.'

      label.insertAdjacentElement('afterend', notice)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      updateYearNotice
    )
  } else {
    updateYearNotice()
  }
})()
