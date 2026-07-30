// ============================================================
// 예판 WATCHER 관리자 화면
// public/static/watcher-admin.js
// ============================================================

(function () {
  'use strict'

  const TOKEN_KEY = 'gpt_admin_token'

  const $ = function (id) {
    return document.getElementById(id)
  }

  let watcherLoaded = false
  let watcherLoading = false
  let collectorRunning = false
  let eventActionRunning = false
  let transformActionRunning = false
  let registerDraftRunning = false
  let imageActionRunning = false
  let imageStoreRunning = false
  let imagePreviewRunning = false
  let watcherPreviewObjectUrl = ''
  let watcherFinalReviewContext = {
    item: null,
    selectedImage: null
  }

  let watcherHasMultiEditionDraft = false




  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  function safeUrl(value) {
    try {
      const url = new URL(
        String(value || ''),
        window.location.origin
      )

      if (
        url.protocol !== 'http:' &&
        url.protocol !== 'https:'
      ) {
        return ''
      }

      return url.href
    } catch (error) {
      return ''
    }
  }

  function setText(id, value) {
    const element = $(id)

    if (element) {
      element.textContent = String(
        value == null ? 0 : value
      )
    }
  }

  function setStatus(message, type) {
    const element = $('watcherStatus')
    if (!element) return

    element.textContent = message || ''
    element.className = 'admin-status'

    if (type) {
      element.classList.add(type)
    }
  }

  function setBusy(busy) {
    const button = $('refreshWatcher')
    if (!button) return

    button.disabled = busy
    button.textContent = busy
      ? '불러오는 중...'
      : '새로고침'
  }

  async function watcherApi(path, options) {
    const token =
      window.localStorage.getItem(TOKEN_KEY) || ''

    if (!token) {
      throw new Error(
        '관리자 토큰이 없습니다. 관리자 로그인을 다시 확인해 주세요.'
      )
    }

    const requestOptions = options || {}
    const headers = new Headers(
      requestOptions.headers || {}
    )

    headers.set('X-Admin-Token', token)

    if (
      requestOptions.body &&
      !headers.has('Content-Type')
    ) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await window.fetch(path, {
      ...requestOptions,
      headers
    })

    let data = {}

    try {
      data = await response.json()
    } catch (error) {
      data = {}
    }

    if (!response.ok || data.ok === false) {
      throw new Error(
        data.error ||
        data.message ||
        'WATCHER 요청에 실패했습니다. (' +
          response.status +
          ')'
      )
    }

    return data
  }

  async function runArcCollector() {
    const button = $('collectArcWatcher')

    if (!button || collectorRunning) return

    const confirmed = window.confirm(
      '아크시스템웍스아시아 공식 보도자료를 수집할까요?\n\n' +
      '이미지는 공개하거나 다운로드하지 않고 공식 URL 후보만 기록합니다.'
    )

    if (!confirmed) return

    collectorRunning = true
    button.disabled = true
    button.textContent = '수집 중...'

    setStatus(
      '아크시스템웍스아시아 보도자료를 확인하고 있습니다.',
      'info'
    )

    try {
      const data = await watcherApi(
        '/admin/api/watcher/collect/all',
        {
          method: 'POST'
        }
      )

      const result = data.result || {}

      watcherLoaded = false
      await loadWatcher(true)

      setStatus(
        '전체 수집 완료 — ' +
        '신규 ' +
        Number(result.created || 0) +
        '개, ' +
        '변경 ' +
        Number(result.updated || 0) +
        '개, ' +
        '기존 ' +
        Number(result.unchanged || 0) +
        '개, ' +
        '이미지 후보 ' +
        Number(result.imagesCreated || 0) +
        '개',
        'ok'
      )
    } catch (error) {
      setStatus(
        error && error.message
          ? error.message
          : '아크 수집에 실패했습니다.',
        'err'
      )
    } finally {
      collectorRunning = false
      button.disabled = false
      button.textContent = '아크 수집 실행'
    }
  }

  function permissionInfo(status) {
    const normalized = String(
      status || 'PENDING'
    ).toUpperCase()

    const labels = {
      PENDING: {
        label: '🟡 회신 대기',
        className: 'pending'
      },
      APPROVED: {
        label: '🟢 사용 허가',
        className: 'approved'
      },
      CONDITIONAL: {
        label: '🔵 조건부 허가',
        className: 'conditional'
      },
      DENIED: {
        label: '🔴 사용 불가',
        className: 'denied'
      },
      EXPIRED: {
        label: '⚪ 허가 만료',
        className: 'expired'
      }
    }

    return labels[normalized] || {
      label: normalized,
      className: 'pending'
    }
  }

  function reviewStatusLabel(status) {
    const labels = {
      DISCOVERED: '신규 발견',
      TRANSFORMED: '변환 완료',
      REVIEWING: '검수 중',
      APPROVED: '승인',
      UPLOADED: '업로드 완료',
      HOLD: '보류',
      IGNORED: '제외',
      ERROR: '오류'
    }

    return labels[status] || status || '상태 없음'
  }

  function booleanLabel(value) {
    return Number(value) === 1 ? '허용' : '차단'
  }

  function eventInfo(type) {
  const normalized = String(type || 'OTHER')
    .toUpperCase()

  const labels = {
    SOURCE_NEW: {
      label: '신규 보도자료',
      className: 'source-new'
    },
    SOURCE_CHANGED: {
      label: '보도자료 변경',
      className: 'source-changed'
    },
    IMAGE_NEW: {
      label: '신규 이미지',
      className: 'image-new'
    },
    PREORDER_OPEN: {
      label: '예약판매 시작',
      className: 'preorder'
    },
    PREORDER_ENDING: {
      label: '예약판매 종료 임박',
      className: 'preorder'
    },
    PREORDER_ENDED: {
      label: '예약판매 종료',
      className: 'preorder'
    },
    UPLOADED: {
      label: '업로드 완료',
      className: 'uploaded'
    },
    RELEASED: {
      label: '출시',
      className: 'released'
    },
    PERMISSION_CHANGED: {
      label: '이미지 정책 변경',
      className: 'permission'
    },
    ERROR: {
      label: '오류',
      className: 'error'
    }
  }

  return labels[normalized] || {
    label: normalized,
    className: 'other'
  }
}

function renderEvents(groups) {
  const container = $('watcherEventList')
  if (!container) return

  if (!Array.isArray(groups) || !groups.length) {
    container.innerHTML =
      '<div class="admin-empty">' +
        '표시할 WATCHER 이벤트가 없습니다.' +
      '</div>'

    return
  }

  let currentDate = ''
  let html = ''

  groups.forEach(function (group) {
    const eventDate =
      String(group.event_date || '날짜 미확인')

    const watchItemId =
      Number(group.watch_item_id || 0)

    const representativeEventId =
      Number(group.representative_event_id || 0)

    const eventCount =
      Number(group.event_count || 0)

    const unreadCount =
      Number(group.unread_count || 0)

    const sourceNewCount =
      Number(group.source_new_count || 0)

    const sourceChangedCount =
      Number(group.source_changed_count || 0)

    const imageNewCount =
      Number(group.image_new_count || 0)

    const errorCount =
      Number(group.error_count || 0)

    const isRead = unreadCount < 1
    const articleUrl = safeUrl(group.source_url)

    if (eventDate !== currentDate) {
      currentDate = eventDate

      html +=
        '<div class="watcher-event-date">' +
          escapeHtml(eventDate) +
        '</div>'
    }

    let badgeHtml = ''

    if (sourceNewCount > 0) {
      badgeHtml +=
        '<span class="watcher-badge watcher-event-source-new">' +
          '신규 보도자료 ' +
          escapeHtml(sourceNewCount) +
        '</span>'
    }

    if (sourceChangedCount > 0) {
      badgeHtml +=
        '<span class="watcher-badge watcher-event-source-changed">' +
          '보도자료 변경 ' +
          escapeHtml(sourceChangedCount) +
        '</span>'
    }

    if (imageNewCount > 0) {
      badgeHtml +=
        '<span class="watcher-badge watcher-event-image-new">' +
          '이미지 후보 ' +
          escapeHtml(imageNewCount) +
        '</span>'
    }

    if (errorCount > 0) {
      badgeHtml +=
        '<span class="watcher-badge watcher-event-error">' +
          '오류 ' +
          escapeHtml(errorCount) +
        '</span>'
    }

    const linkHtml = articleUrl
      ? '<a class="watcher-event-link" href="' +
          escapeHtml(articleUrl) +
          '" target="_blank" rel="noopener noreferrer">' +
          '공식 원문 ↗' +
        '</a>'
      : ''

    let readControl =

      '<span class="watcher-event-read-label">' +
        '읽음' +
      '</span>'

    if (!isRead) {
      if (
        Number.isInteger(watchItemId) &&
        watchItemId > 0
      ) {
        readControl =
          '<button type="button" ' +
            'class="btn btn-sm watcher-event-read" ' +
            'data-watcher-event-group-read="1" ' +
            'data-event-date="' +
              escapeHtml(eventDate) +
            '" ' +
            'data-watch-item-id="' +
              escapeHtml(watchItemId) +
            '">' +
            '그룹 읽음' +
          '</button>'
      } else if (
        Number.isInteger(representativeEventId) &&
        representativeEventId > 0
      ) {
        readControl =
          '<button type="button" ' +
            'class="btn btn-sm watcher-event-read" ' +
            'data-watcher-event-read="' +
              escapeHtml(representativeEventId) +
            '">' +
            '읽음' +
          '</button>'
      }
    }
    const reviewStatus = String(
      group.review_status || ''
    ).toUpperCase()

    const transformControl =
      Number.isInteger(watchItemId) &&
      watchItemId > 0
        ? (
          '<button type="button" ' +
            'class="btn btn-sm watcher-transform-open" ' +
            'data-watcher-transform-open="' +
              escapeHtml(watchItemId) +
            '">' +
                        (
              reviewStatus === 'TRANSFORMED'
                ? '초안 수정'
                : (
                  reviewStatus === 'APPROVED' ||
                  reviewStatus === 'UPLOADED'
                    ? '등록 확인'
                    : '초안 작성'
                )
            ) +

          '</button>'
        )
        : ''

    html +=
      '<article class="watcher-event-card' +
        (isRead ? ' is-read' : '') +
      '">' +
        '<div class="watcher-event-main">' +
          '<div class="watcher-event-top">' +
            badgeHtml +

            (group.source_name
              ? '<span class="watcher-event-source">' +
                  escapeHtml(group.source_name) +
                '</span>'
              : '') +

            (!isRead
              ? '<span class="watcher-event-unread">' +
                  'NEW' +
                '</span>'
              : '') +
          '</div>' +

          '<strong class="watcher-event-title">' +
            escapeHtml(group.title || '제목 없음') +
          '</strong>' +

          (group.latest_message
            ? '<p class="watcher-event-message">' +
                escapeHtml(group.latest_message) +
              '</p>'
            : '') +

          '<div class="watcher-event-meta">' +
            '<span>상세 이벤트 ' +
              escapeHtml(eventCount) +
              '개</span>' +

            '<span>읽지 않음 ' +
              escapeHtml(unreadCount) +
              '개</span>' +

            '<span>' +
              escapeHtml(group.latest_at || '-') +
            '</span>' +

            (group.review_status
              ? '<span>검수 상태: ' +
                  escapeHtml(
                    reviewStatusLabel(
                      group.review_status
                    )
                  ) +
                '</span>'
              : '') +

            linkHtml +
          '</div>' +
        '</div>' +

        '<div class="watcher-event-action">' +
          transformControl +
          readControl +
        '</div>' +
      '</article>'
  })

  container.innerHTML = html
}


async function readWatcherEvent(id) {
  if (eventActionRunning) return

  const eventId = Number(id)

  if (
    !Number.isInteger(eventId) ||
    eventId <= 0
  ) {
    return
  }

  eventActionRunning = true

  try {
    await watcherApi(
      '/admin/api/watcher/events/' +
        eventId +
        '/read',
      {
        method: 'POST'
      }
    )

    watcherLoaded = false
    await loadWatcher(true)

    setStatus(
      '이벤트를 읽음 처리했습니다.',
      'ok'
    )
  } catch (error) {
    setStatus(
      error && error.message
        ? error.message
        : '이벤트 읽음 처리에 실패했습니다.',
      'err'
    )
  } finally {
    eventActionRunning = false
  }
}
async function readWatcherEventGroup(
  eventDate,
  watchItemId
) {
  if (eventActionRunning) return

  const normalizedDate =
    String(eventDate || '').trim()

  const normalizedItemId =
    Number(watchItemId)

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalizedDate
    ) ||
    !Number.isInteger(normalizedItemId) ||
    normalizedItemId <= 0
  ) {
    setStatus(
      '이벤트 그룹 정보가 올바르지 않습니다.',
      'err'
    )

    return
  }

  eventActionRunning = true

  try {
    const data = await watcherApi(
      '/admin/api/watcher/events/group/read',
      {
        method: 'POST',
        body: JSON.stringify({
          eventDate: normalizedDate,
          watchItemId: normalizedItemId
        })
      }
    )

    watcherLoaded = false
    await loadWatcher(true)

    setStatus(
      '그룹의 상세 이벤트 ' +
        Number(data.changed || 0) +
        '개를 읽음 처리했습니다.',
      'ok'
    )
  } catch (error) {
    setStatus(
      error && error.message
        ? error.message
        : '이벤트 그룹 읽음 처리에 실패했습니다.',
      'err'
    )
  } finally {
    eventActionRunning = false
  }
}

async function readAllWatcherEvents() {
  const button = $('markAllWatcherEventsRead')

  if (!button || eventActionRunning) return

  const confirmed = window.confirm(
    '읽지 않은 WATCHER 이벤트를 모두 읽음 처리할까요?\n\n' +
    '기록은 삭제되지 않습니다.'
  )

  if (!confirmed) return

  eventActionRunning = true
  button.disabled = true
  button.textContent = '처리 중...'

  try {
    const data = await watcherApi(
      '/admin/api/watcher/events/read-all',
      {
        method: 'POST'
      }
    )

    watcherLoaded = false
    await loadWatcher(true)

    setStatus(
      '이벤트 ' +
        Number(data.changed || 0) +
        '개를 읽음 처리했습니다.',
      'ok'
    )
  } catch (error) {
    setStatus(
      error && error.message
        ? error.message
        : '이벤트 읽음 처리에 실패했습니다.',
      'err'
    )
  } finally {
    eventActionRunning = false
    button.disabled = false
    button.textContent = '모두 읽음'
  }
}

    function setTransformValue(id, value) {
    const element = $(id)

    if (element) {
      element.value =
        value == null ? '' : String(value)
    }
  }

    function setTransformStatus(message, type) {
    const element = $('watcherTransformStatus')
    if (!element) return

    element.textContent = message || ''
    element.className = 'admin-status'

    if (type) {
      element.classList.add(type)
    }
  }

  function setRegisterDraftButton(
    reviewStatus,
    linkedGameId
  ) {
    const button = $('registerWatcherDraft')
    if (!button) return

    const status = String(
      reviewStatus || ''
    ).toUpperCase()

    const gameId = Number(linkedGameId || 0)

    if (
      Number.isInteger(gameId) &&
      gameId > 0
    ) {
      button.disabled = true
      button.textContent =
        '비공개 등록 완료 #' + gameId
      return
    }

    if (
      status === 'TRANSFORMED' &&
      watcherHasMultiEditionDraft
    ) {
      button.disabled = false
      button.textContent =
        '멀티 에디션 비공개 등록'
      return
    }

    if (status === 'TRANSFORMED') {
      button.disabled = false
      button.textContent = '비공개 게임 등록'
      return
    }

    button.disabled = true
    button.textContent = '초안 저장 후 등록'
  }

  function closeWatcherTransform() {
    const card = $('watcherTransformCard')

    if (card) {
      card.hidden = true
    }

    setTransformValue(
      'watcherTransformItemId',
      ''
    )

    watcherHasMultiEditionDraft = false

    setTransformStatus('', '')
    setTransformImageStatus('', '')
    setRegisterDraftButton('', null)
    clearWatcherPrivatePreview(true)
    clearWatcherFinalReview()



    const imageList =
      $('watcherTransformImageList')

    if (imageList) {
      imageList.innerHTML =
        '<div class="admin-empty">' +
          '보도자료를 열면 공식 이미지 후보를 불러옵니다.' +
        '</div>'
    }

    const imageCount =
      $('watcherTransformImageCount')

    if (imageCount) {
      imageCount.textContent = '0개'
    }

    const selectedImage =
      $('watcherTransformSelectedImage')

    if (selectedImage) {
      selectedImage.hidden = true
    }
  }


  function parseTransformDraft(value) {
    if (!value) return {}

    if (
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      return value
    }

    try {
      const parsed = JSON.parse(String(value))

      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        return parsed
      }
    } catch (error) {
      return {}
    }

    return {}
  }

  function clearWatcherPrivatePreview(
    hidePanel
  ) {
    if (watcherPreviewObjectUrl) {
      window.URL.revokeObjectURL(
        watcherPreviewObjectUrl
      )

      watcherPreviewObjectUrl = ''
    }

    const panel =
      $('watcherTransformPrivatePreview')

    const frame =
      $('watcherTransformPreviewFrame')

    const image =
      $('watcherTransformPreviewImage')

    const info =
      $('watcherTransformPreviewInfo')

    const status =
      $('watcherTransformPreviewStatus')

    const button =
      $('loadWatcherPrivatePreview')

    if (image) {
      image.removeAttribute('src')
    }

    if (frame) {
      frame.hidden = true
    }

    if (info) {
      info.textContent =
        '저장된 대표 이미지를 선택해 주세요.'
    }

    if (status) {
      status.textContent = ''
      status.className = 'admin-status'
    }

    if (button) {
      button.disabled = true
      button.textContent =
        '관리자 미리보기 불러오기'

      button.removeAttribute(
        'data-watcher-preview-image-id'
      )
    }

    if (panel && hidePanel) {
      panel.hidden = true
    }
  }

  function configureWatcherPrivatePreview(
    selectedImage
  ) {
    clearWatcherPrivatePreview(false)

    const panel =
      $('watcherTransformPrivatePreview')

    const button =
      $('loadWatcherPrivatePreview')

    const info =
      $('watcherTransformPreviewInfo')

    if (!panel || !button) return

    const imageId = Number(
      selectedImage &&
      selectedImage.id
        ? selectedImage.id
        : 0
    )

    const stored = Boolean(
      selectedImage &&
      String(
        selectedImage.stored_image_url ||
        ''
      ).trim()
    )

    const available =
      Number.isInteger(imageId) &&
      imageId > 0 &&
      stored

    panel.hidden = !available

    if (!available) {
      return
    }

    button.disabled = false
    button.textContent =
      '관리자 미리보기 불러오기'

    button.setAttribute(
      'data-watcher-preview-image-id',
      String(imageId)
    )

    if (info) {
      info.textContent =
        '이미지 #' +
        imageId +
        ' · ' +
        imageTypeLabel(
          selectedImage.image_type
        ) +
        ' · 비공개 R2 저장 완료'
    }
  }

    function watcherTransformFieldValue(id) {
    const element = $(id)

    return element
      ? String(element.value || '').trim()
      : ''
  }


  function watcherPlatformOptions(selected) {
    const options = [
      ['switch2', 'Nintendo Switch 2'],
      ['switch', 'Nintendo Switch'],
      ['ps5', 'PlayStation 5'],
      ['ps4', 'PlayStation 4'],
      ['xbox', 'Xbox'],
      ['pc', 'Steam / PC'],
      ['etc', '기타']
    ]

    return options.map(function (option) {
      return (
        '<option value="' +
          escapeHtml(option[0]) +
          '"' +
          (
            option[0] === selected
              ? ' selected'
              : ''
          ) +
        '>' +
          escapeHtml(option[1]) +
        '</option>'
      )
    }).join('')
  }

  function getWatcherTransformPlatforms() {
    const container =
      $('watcherTransformPlatformRows')

    if (!container) return []

    const values = Array.from(
      container.querySelectorAll(
        '[data-watcher-transform-platform]'
      )
    ).map(function (select) {
      return String(select.value || '')
        .trim()
        .toLowerCase()
    }).filter(Boolean)

    return Array.from(new Set(values))
  }

  function setWatcherTransformPlatforms(values) {
    const container =
      $('watcherTransformPlatformRows')

    if (!container) return

    let platforms = Array.isArray(values)
      ? values.map(function (value) {
          return String(value || '')
            .trim()
            .toLowerCase()
        }).filter(Boolean)
      : []

    platforms = Array.from(new Set(platforms))

    if (!platforms.length) {
      platforms = ['switch']
    }

    container.innerHTML = platforms
      .map(function (platform, index) {
        return (
          '<div ' +
            'data-watcher-platform-row="1" ' +
            'style="display:flex;gap:8px;align-items:center"' +
          '>' +
            '<select ' +
              (
                index === 0
                  ? 'id="watcherTransformPlatform" '
                  : ''
              ) +
              'data-watcher-transform-platform="1" ' +
              'data-previous-platform="' +
                escapeHtml(platform) +
              '" ' +
              'style="flex:1"' +
            '>' +
              watcherPlatformOptions(platform) +
            '</select>' +
            '<button ' +
              'type="button" ' +
              'class="btn btn-sm" ' +
              'data-remove-watcher-platform="1"' +
              (
                platforms.length <= 1
                  ? ' disabled'
                  : ''
              ) +
            '>' +
              '삭제' +
            '</button>' +
          '</div>'
        )
      })
      .join('')

    syncWatcherVariantPlatforms()
  }

  function addWatcherTransformPlatform() {
    const current = getWatcherTransformPlatforms()

    const order = [
      'switch2',
      'switch',
      'ps5',
      'pc',
      'ps4',
      'xbox',
      'etc'
    ]

    const next = order.find(function (platform) {
      return !current.includes(platform)
    })

    if (!next) {
      setTransformStatus(
        '추가할 수 있는 플랫폼이 없습니다.',
        'err'
      )
      return
    }

    setWatcherTransformPlatforms(
      current.concat(next)
    )

    renderWatcherFinalReview()
  }


  function clePlatformEvidence(item) {
    const title = String(
      item && (
        item.raw_title ||
        item.title
      ) || ''
    ).trim()

    const rawText = String(
      item && item.raw_text || ''
    )

    const labeledLines = rawText
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim()
      })
      .filter(function (line) {
        return (
          /^(?:대응\s*기종|지원\s*기종|플랫폼|대응\s*플랫폼|출시\s*플랫폼|기종)\s*[:：]/i
            .test(line)
        )
      })
      .slice(0, 10)

    return [
      title
    ].concat(labeledLines).join('\n')
  }

  function detectClePlatforms(item, draft) {
    const sourceKey = String(
      item && item.source_key || ''
    ).toUpperCase()

    if (
      sourceKey !== 'CLOUDED_LEOPARD'
    ) {
      if (
        draft &&
        Array.isArray(draft.platforms) &&
        draft.platforms.length
      ) {
        return draft.platforms
      }

      return [
        draft && draft.platform
          ? draft.platform
          : 'switch'
      ]
    }

    const text = clePlatformEvidence(item)
      .replace(/[™®©]/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/[／]/g, '/')
      .replace(/\s+/g, ' ')
      .trim()

    const result = []

    if (
      /Nintendo\s*Switch\s*2|Switch\s*2|NSW2/i
        .test(text)
    ) {
      result.push('switch2')
    }

    const withoutSwitch2 = text.replace(
      /Nintendo\s*Switch\s*2|Switch\s*2|NSW2/gi,
      ' '
    )

    if (
      /Nintendo\s*Switch|\bNSW\b/i
        .test(withoutSwitch2)
    ) {
      result.push('switch')
    }

    if (/PlayStation\s*5|PS5/i.test(text)) {
      result.push('ps5')
    }

    if (/PlayStation\s*4|PS4/i.test(text)) {
      result.push('ps4')
    }

    if (/Xbox/i.test(text)) {
      result.push('xbox')
    }

    if (/Steam|\bPC\b/i.test(text)) {
      result.push('pc')
    }

    if (result.length) {
      return Array.from(new Set(result))
    }

    if (
      draft &&
      Array.isArray(draft.platforms) &&
      draft.platforms.length
    ) {
      return draft.platforms
    }

    return [
      draft && draft.platform
        ? draft.platform
        : 'switch'
    ]
  }


  function cleArticleText(item) {
    return String(
      item && item.raw_text || ''
    )
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
  }

  function cleSection(
    text,
    startPattern,
    endPattern
  ) {
    const startMatch =
      text.match(startPattern)

    if (!startMatch || startMatch.index == null) {
      return ''
    }

    const start =
      startMatch.index +
      startMatch[0].length

    const rest = text.slice(start)
    const endMatch = rest.match(endPattern)

    return (
      endMatch && endMatch.index != null
        ? rest.slice(0, endMatch.index)
        : rest
    ).trim()
  }

  function clePriceEntries(text) {
    const entries = []
    const pattern =
      /【([^】]{1,100})】\s*(?:\n\s*)?KRW\s*([0-9,]+)/gi

    let match

    while (
      (match = pattern.exec(text)) !== null
    ) {
      const label = String(match[1] || '')
        .replace(/\s+/g, ' ')
        .trim()

      const price = Number(
        String(match[2] || '')
          .replace(/,/g, '')
      )

      if (
        label &&
        Number.isInteger(price) &&
        price > 0
      ) {
        entries.push({
          label,
          normalized:
            label
              .toUpperCase()
              .replace(/\s+/g, ''),
          price
        })
      }
    }

    return entries
  }

  function cleFindPrice(entries, words) {
    const targets = words.map(
      function (word) {
        return String(word)
          .toUpperCase()
          .replace(/\s+/g, '')
      }
    )

    const entry = entries.find(
      function (candidate) {
        return targets.every(
          function (target) {
            return candidate.normalized
              .includes(target)
          }
        )
      }
    )

    return entry ? entry.price : null
  }

  function cleBoxName(item, text) {
    const source = [
      item && item.raw_title,
      item && item.title,
      text.slice(0, 3000)
    ].join('\n')

    const quoted = source.match(
      /[「『《【\[]([^「」『』《》【】\[\]\r\n]{1,100}?(?:BOX|박스))[^「」『』《》【】\[\]\r\n]*[」』》】\]]/i
    )

    if (quoted && quoted[1]) {
      return String(quoted[1])
        .replace(/^.*?the\s*2nd\s*/i, '')
        .replace(/^한정판\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim()
    }

    const simple = source.match(
      /([가-힣A-Za-z0-9 _-]{1,50}(?:BOX|박스))/i
    )

    return simple && simple[1]
      ? String(simple[1])
          .replace(/^.*?the\s*2nd\s*/i, '')
          .replace(/^한정판\s*/i, '')
          .replace(/\s+/g, ' ')
          .trim()
      : ''
  }

  function cleBoxContents(text) {
    const section = cleSection(
      text,
      /■\s*[^\n]*(?:BOX|박스)[^\n]*세트\s*내용[^\n]*/i,
      /■\s*(?:초회|사전|예약|클리어|상품\s*개요)/i
    )

    if (!section) return ''

    const parts = section.match(
      /[①②③④⑤⑥⑦⑧⑨⑩][\s\S]*?(?=[①②③④⑤⑥⑦⑧⑨⑩]|$)/g
    )

    if (!parts || !parts.length) {
      return section.slice(0, 10000)
    }

    return parts.map(function (part) {
      return part
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }).join('\n\n').slice(0, 10000)
  }

  function cleBonusInfo(text) {
    const section = cleSection(
      text,
      /■\s*(?:초회\s*구입\s*특전|사전\s*예약\s*특전)[^\n]*/i,
      /■\s*(?:클리어|키워드|캐릭터|상품\s*개요)/i
    )

    if (!section) {
      return {
        bonus: '',
        note: '',
        steamExcluded: false
      }
    }

    const bullet = section.match(
      /[・●]\s*([^\n]{1,300})/
    )

    const bonus = bullet && bullet[1]
      ? bullet[1].trim()
      : ''

    const notes = section
      .split('\n')
      .filter(function (line) {
        return /^\s*※/.test(line)
      })
      .map(function (line) {
        return line.trim()
      })
      .join('\n')

    return {
      bonus,
      note: notes,
      steamExcluded:
        /Steam\s*버전[^\n]{0,100}(?:제공되지|제외)/i
          .test(section)
    }
  }

  function cleLinkBonus(text) {
    const section = cleSection(
      text,
      /■\s*클리어\s*데이터\s*연동\s*특전[^\n]*/i,
      /■\s*(?:키워드|캐릭터|상품\s*개요)/i
    )

    if (!section) return ''

    const bullet = section.match(
      /[・●]\s*([^\n]{1,300})/
    )

    return bullet && bullet[1]
      ? '클리어 데이터 연동 특전: ' +
        bullet[1].trim()
      : ''
  }

  function suggestCleGenre(item, draft) {
    if (draft && draft.genre) {
      return draft.genre
    }

    const text = cleArticleText(item)

    const overview = cleSection(
      text,
      /■\s*[^\n]*상품\s*개요[^\n]*/i,
      /ABOUT\s+US|CONTACT|©/i
    )

    const match = overview.match(
      /(?:^|\n)\s*장르\s*[:：]?\s*([^\n]{1,100})/i
    )

    return match && match[1]
      ? match[1].trim()
      : ''
  }

  function suggestCleTrailer(item, draft) {
    if (draft && draft.trailerUrl) {
      return draft.trailerUrl
    }

    const text = cleArticleText(item)

    const match = text.match(
      /(?:WebCM|트레일러|Trailer)[\s\S]{0,300}?(https?:\/\/[^\s<>"']+)/i
    )

    return match && match[1]
      ? match[1].trim()
      : ''
  }

  function suggestCleVariants(
    item,
    draft,
    platforms
  ) {
    if (
      draft &&
      Array.isArray(draft.variants) &&
      draft.variants.length
    ) {
      return draft.variants
    }

    const targetPlatforms =
      Array.isArray(platforms)
        ? platforms
        : []

    const text = cleArticleText(item)
    const prices = clePriceEntries(text)
    const bonusInfo = cleBonusInfo(text)
    const linkBonus = cleLinkBonus(text)
    const boxContents = cleBoxContents(text)
    const boxName = cleBoxName(item, text)

    const packageStandardPrice =
      cleFindPrice(
        prices,
        ['패키지', '일반판']
      )

    const switch2Price =
      cleFindPrice(
        prices,
        ['SWITCH2', 'EDITION']
      )

    const boxPrice =
      cleFindPrice(
        prices,
        ['우로보로스', 'BOX']
      ) ||
      cleFindPrice(
        prices,
        ['한정판']
      )

    const digitalStandardPrice =
      cleFindPrice(
        prices,
        ['디지털', '일반판']
      )

    const deluxePrice =
      cleFindPrice(
        prices,
        ['디지털', '디럭스']
      )

    const nonPcPlatforms =
      targetPlatforms.filter(
        function (platform) {
          return platform !== 'pc'
        }
      )

    const normalConsolePlatforms =
      nonPcPlatforms.filter(
        function (platform) {
          return platform !== 'switch2'
        }
      )

    const pcPlatforms =
      targetPlatforms.includes('pc')
        ? ['pc']
        : []

    const switch2Platforms =
      targetPlatforms.includes('switch2')
        ? ['switch2']
        : []

    const variants = []

    const add = function (value) {
      if (
        !value.platforms ||
        !value.platforms.length
      ) {
        return
      }

      variants.push({
        variantCode: value.variantCode,
        variantName: value.variantName,
        variantKind: value.variantKind,
        packageType: value.packageType,
        platforms: value.platforms,
        contentsText:
          value.contentsText || '',
        candidatePrice:
          value.candidatePrice == null
            ? null
            : value.candidatePrice,
        preorderBonus:
          value.preorderBonus || '',
        preorderBonusNote:
          value.preorderBonusNote || ''
      })
    }

    const commonNote = [
      bonusInfo.note,
      linkBonus
    ].filter(Boolean).join('\n')

    add({
      variantCode: 'STANDARD',
      variantName: '일반판',
      variantKind: 'STANDARD',
      packageType:
        digitalStandardPrice
          ? 'BOTH'
          : 'PACKAGE',
      platforms:
        normalConsolePlatforms,
      candidatePrice:
        packageStandardPrice ||
        digitalStandardPrice,
      preorderBonus:
        bonusInfo.bonus,
      preorderBonusNote:
        commonNote
    })

    add({
      variantCode: 'SWITCH2_EDITION',
      variantName:
        'Nintendo Switch 2 Edition',
      variantKind: 'OTHER',
      packageType: 'BOTH',
      platforms: switch2Platforms,
      candidatePrice: switch2Price,
      preorderBonus:
        bonusInfo.bonus,
      preorderBonusNote:
        commonNote
    })

    add({
      variantCode: 'STEAM_STANDARD',
      variantName: 'Steam 일반판',
      variantKind: 'STANDARD',
      packageType: 'DIGITAL',
      platforms: pcPlatforms,
      candidatePrice:
        digitalStandardPrice ||
        packageStandardPrice,
      preorderBonus:
        bonusInfo.steamExcluded
          ? ''
          : bonusInfo.bonus,
      preorderBonusNote:
        bonusInfo.steamExcluded
          ? 'Steam 버전은 초회/예약 특전 제외'
          : commonNote
    })

    if (deluxePrice) {
      add({
        variantCode: 'DIGITAL_DELUXE',
        variantName:
          '디지털 디럭스 버전',
        variantKind: 'DELUXE',
        packageType: 'DIGITAL',
        platforms: nonPcPlatforms,
        candidatePrice: deluxePrice,
        preorderBonus:
          bonusInfo.bonus,
        preorderBonusNote:
          commonNote
      })

      add({
        variantCode: 'STEAM_DELUXE',
        variantName:
          'Steam 디지털 디럭스 버전',
        variantKind: 'DELUXE',
        packageType: 'DIGITAL',
        platforms: pcPlatforms,
        candidatePrice: deluxePrice,
        preorderBonus:
          bonusInfo.steamExcluded
            ? ''
            : bonusInfo.bonus,
        preorderBonusNote:
          bonusInfo.steamExcluded
            ? 'Steam 버전은 초회/예약 특전 제외'
            : commonNote
      })
    }

    if (boxName || boxPrice || boxContents) {
      add({
        variantCode: 'OROBOROS_BOX',
        variantName:
          boxName || '한정판 BOX',
        variantKind: 'OTHER',
        packageType: 'PACKAGE',
        platforms: nonPcPlatforms,
        contentsText: boxContents,
        candidatePrice: boxPrice,
        preorderBonus:
          bonusInfo.bonus,
        preorderBonusNote:
          commonNote
      })

      add({
        variantCode: 'STEAM_OROBOROS_BOX',
        variantName:
          'Steam ' +
          (boxName || '한정판 BOX'),
        variantKind: 'OTHER',
        packageType: 'PACKAGE',
        platforms: pcPlatforms,
        contentsText: boxContents,
        candidatePrice: boxPrice,
        preorderBonus:
          bonusInfo.steamExcluded
            ? ''
            : bonusInfo.bonus,
        preorderBonusNote:
          bonusInfo.steamExcluded
            ? 'Steam 제품 코드 카드 포함. Steam 버전은 초회/예약 특전 제외'
            : commonNote
      })
    }

    if (!variants.length) {
      add({
        variantCode: 'STANDARD',
        variantName: '일반판',
        variantKind: 'STANDARD',
        packageType: 'AUTO',
        platforms: targetPlatforms,
        candidatePrice: null,
        preorderBonus: '',
        preorderBonusNote: ''
      })
    }

    return variants
  }

  function suggestCleTitle(item, draft) {
    const existing = String(
      draft && draft.title || ''
    ).trim()

    const sourceKey = String(
      item && item.source_key || ''
    ).toUpperCase()

    if (
      sourceKey !== 'CLOUDED_LEOPARD' &&
      existing
    ) {
      return existing
    }

    const raw = String(
      item && (
        item.raw_title ||
        item.title
      ) || existing
    ).trim()

    const quoted = raw.match(
      /[『「《](.*?)[』」》]/
    )

    return quoted && quoted[1]
      ? quoted[1].trim()
      : existing || raw
  }

  function suggestCleReleaseDate(item, draft) {
    const existing = String(
      draft && draft.releaseDate || ''
    ).trim()

    if (existing) return existing

    if (
      String(item && item.source_key || '')
        .toUpperCase() !== 'CLOUDED_LEOPARD'
    ) {
      return ''
    }

    const text = String(
      item && item.raw_text || ''
    )

    const patterns = [
      /(?:발매|출시|판매\s*예정)[^\n]{0,100}?(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/i,
      /(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일[^\n]{0,80}?(?:발매|출시)/i,
      /(?:발매|출시)[^\n]{0,100}?(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/i
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)

      if (match) {
        return [
          match[1],
          match[2].padStart(2, '0'),
          match[3].padStart(2, '0')
        ].join('-')
      }
    }

    return ''
  }

  function watcherVariantKindOptions(selected) {
    const options = [
      ['STANDARD', '스탠다드'],
      ['DELUXE', '디럭스'],
      ['ULTIMATE', '얼티밋'],
      ['LIMITED', '한정판'],
      ['COLLECTORS', '컬렉터즈'],
      ['OTHER', '기타 / 직접 입력']
    ]

    return options.map(function (option) {
      return (
        '<option value="' +
          option[0] +
          '"' +
          (
            option[0] === selected
              ? ' selected'
              : ''
          ) +
        '>' +
          option[1] +
        '</option>'
      )
    }).join('')
  }

  function watcherPackageTypeOptions(selected) {
    const options = [
      ['AUTO', '플랫폼에 따라 자동'],
      ['PACKAGE', '패키지'],
      ['DIGITAL', '디지털'],
      ['BOTH', '패키지 + 디지털']
    ]

    return options.map(function (option) {
      return (
        '<option value="' +
          option[0] +
          '"' +
          (
            option[0] === selected
              ? ' selected'
              : ''
          ) +
        '>' +
          option[1] +
        '</option>'
      )
    }).join('')
  }

  function watcherVariantCode(value, fallbackIndex) {
    const normalized = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')

    return normalized ||
      ('VARIANT_' + String(fallbackIndex + 1))
  }

  function getWatcherTransformVariants() {
    const container =
      $('watcherTransformVariantList')

    if (!container) return []

    return Array.from(
      container.querySelectorAll(
        '[data-watcher-variant-card]'
      )
    ).map(function (card, index) {
      const field = function (name) {
        const element = card.querySelector(
          '[data-watcher-variant-field="' +
            name +
          '"]'
        )

        return element
          ? String(element.value || '').trim()
          : ''
      }

      const platforms = Array.from(
        card.querySelectorAll(
          '[data-watcher-variant-platform]:checked'
        )
      ).map(function (input) {
        return String(input.value || '')
          .trim()
          .toLowerCase()
      })

      const rawPrice = field('candidatePrice')

      return {
        variantCode: watcherVariantCode(
          field('variantCode'),
          index
        ),

        variantName: field('variantName'),

        variantKind:
          field('variantKind').toUpperCase(),

        packageType:
          field('packageType').toUpperCase(),

        platforms: Array.from(
          new Set(platforms)
        ),

        contentsText: field('contentsText'),

        candidatePrice:
          rawPrice === ''
            ? null
            : Number(rawPrice),

        preorderBonus:
          field('preorderBonus'),

        preorderBonusNote:
          field('preorderBonusNote'),

        displayOrder: index,

        isDefault:
          field('variantKind').toUpperCase() ===
          'STANDARD'
      }
    })
  }

  function renderWatcherTransformVariants(values) {
    const container =
      $('watcherTransformVariantList')

    if (!container) return

    const currentPlatforms =
      getWatcherTransformPlatforms()

    let variants = Array.isArray(values)
      ? values
      : []

    if (!variants.length) {
      variants = [{
        variantCode: 'STANDARD',
        variantName: '일반판',
        variantKind: 'STANDARD',
        packageType: 'AUTO',
        platforms: currentPlatforms,
        contentsText: '',
        candidatePrice: null,
        preorderBonus: '',
        preorderBonusNote: ''
      }]
    }

    container.innerHTML = variants.map(
      function (rawVariant, index) {
        const variant =
          rawVariant &&
          typeof rawVariant === 'object'
            ? rawVariant
            : {}

        const selectedPlatforms =
          Array.isArray(variant.platforms) &&
          variant.platforms.length
            ? variant.platforms.map(
                function (platform) {
                  return String(platform || '')
                    .trim()
                    .toLowerCase()
                }
              )
            : currentPlatforms

        const kind = String(
          variant.variantKind || 'STANDARD'
        ).toUpperCase()

        const packageType = String(
          variant.packageType || 'AUTO'
        ).toUpperCase()

        const code = watcherVariantCode(
          variant.variantCode || kind,
          index
        )

        const name = String(
          variant.variantName ||
          (
            kind === 'STANDARD'
              ? '일반판'
              : kind
          )
        )

        const platformChecks =
          currentPlatforms.map(
            function (platform) {
              return (
                '<label style="' +
                  'display:inline-flex;' +
                  'gap:5px;' +
                  'align-items:center;' +
                  'margin-right:12px;' +
                  'white-space:nowrap;' +
                  'min-height:28px' +
                '">' +
                  '<input ' +
                    'type="checkbox" ' +
                    'data-watcher-variant-platform="1" ' +
                    'style="' +
                      'width:18px;' +
                      'height:18px;' +
                      'min-width:18px;' +
                      'max-width:18px;' +
                      'flex:0 0 18px;' +
                      'margin:0' +
                    '" ' +
                    'value="' +
                      escapeHtml(platform) +
                    '"' +
                    (
                      selectedPlatforms.includes(platform)
                        ? ' checked'
                        : ''
                    ) +
                  ' />' +
                  '<span>' +
                    escapeHtml(
                      watcherPlatformLabel(platform)
                    ) +
                  '</span>' +
                '</label>'
              )
            }
          ).join('')

        return (
          '<article ' +
            'data-watcher-variant-card="1" ' +
            'style="' +
              'border:1px solid #d8dde6;' +
              'border-radius:10px;' +
              'padding:14px;' +
              'display:grid;' +
              'gap:12px' +
            '"' +
          '>' +
            '<div style="' +
              'display:flex;' +
              'justify-content:space-between;' +
              'gap:8px;' +
              'align-items:center' +
            '">' +
              '<strong>에디션 ' +
                escapeHtml(index + 1) +
              '</strong>' +

              '<div style="display:flex;gap:6px">' +
                '<button type="button" ' +
                  'class="btn btn-sm" ' +
                  'data-clone-watcher-variant="1">' +
                  '복제' +
                '</button>' +

                '<button type="button" ' +
                  'class="btn btn-sm" ' +
                  'data-remove-watcher-variant="1"' +
                  (
                    variants.length <= 1
                      ? ' disabled'
                      : ''
                  ) +
                '>' +
                  '삭제' +
                '</button>' +
              '</div>' +
            '</div>' +

            '<div class="watcher-transform-grid">' +
              '<label class="admin-field">' +
                '<span>에디션 종류</span>' +
                '<select ' +
                  'data-watcher-variant-field="variantKind">' +
                  watcherVariantKindOptions(kind) +
                '</select>' +
              '</label>' +

              '<label class="admin-field">' +
                '<span>표시명</span>' +
                '<input type="text" ' +
                  'data-watcher-variant-field="variantName" ' +
                  'value="' +
                    escapeHtml(name) +
                  '" placeholder="예: 우로보로스 BOX" />' +
              '</label>' +

              '<label class="admin-field">' +
                '<span>에디션 코드</span>' +
                '<input type="text" ' +
                  'data-watcher-variant-field="variantCode" ' +
                  'value="' +
                    escapeHtml(code) +
                  '" />' +
              '</label>' +

              '<label class="admin-field">' +
                '<span>상품 형태</span>' +
                '<select ' +
                  'data-watcher-variant-field="packageType">' +
                  watcherPackageTypeOptions(packageType) +
                '</select>' +
              '</label>' +

              '<label class="admin-field">' +
                '<span>가격 후보</span>' +
                '<input type="number" min="1" step="1" ' +
                  'data-watcher-variant-field="candidatePrice" ' +
                  'value="' +
                    escapeHtml(
                      variant.candidatePrice == null
                        ? ''
                        : variant.candidatePrice
                    ) +
                  '" />' +
              '</label>' +
            '</div>' +

            '<div class="admin-field">' +
              '<span>이 에디션 판매 플랫폼</span>' +
              '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
                platformChecks +
              '</div>' +
            '</div>' +

            '<label class="admin-field">' +
              '<span>구성품</span>' +
              '<textarea rows="4" ' +
                'data-watcher-variant-field="contentsText">' +
                escapeHtml(
                  variant.contentsText || ''
                ) +
              '</textarea>' +
            '</label>' +

            '<label class="admin-field">' +
              '<span>예약 특전</span>' +
              '<textarea rows="3" ' +
                'data-watcher-variant-field="preorderBonus">' +
                escapeHtml(
                  variant.preorderBonus || ''
                ) +
              '</textarea>' +
            '</label>' +

            '<label class="admin-field">' +
              '<span>특전 참고사항</span>' +
              '<textarea rows="3" ' +
                'data-watcher-variant-field="preorderBonusNote">' +
                escapeHtml(
                  variant.preorderBonusNote || ''
                ) +
              '</textarea>' +
            '</label>' +
          '</article>'
        )
      }
    ).join('')

    const first = variants[0] || {}

    setTransformValue(
      'watcherTransformEditionName',
      first.variantName || ''
    )
  }

  function setWatcherTransformVariants(
    values,
    fallback
  ) {
    let variants = Array.isArray(values)
      ? values
      : []

    if (!variants.length && fallback) {
      variants = [{
        variantCode: 'STANDARD',
        variantName:
          fallback.editionName || '일반판',
        variantKind: 'STANDARD',
        packageType: 'AUTO',
        platforms:
          getWatcherTransformPlatforms(),
        contentsText: '',
        candidatePrice:
          fallback.candidatePrice == null
            ? null
            : fallback.candidatePrice,
        preorderBonus:
          fallback.preorderBonus || '',
        preorderBonusNote:
          fallback.preorderBonusNote || ''
      }]
    }

    renderWatcherTransformVariants(variants)
  }

  function syncWatcherVariantPlatforms() {
    const container =
      $('watcherTransformVariantList')

    if (!container || !container.children.length) {
      return
    }

    renderWatcherTransformVariants(
      getWatcherTransformVariants()
    )
  }

  function addWatcherTransformVariant() {
    const variants =
      getWatcherTransformVariants()

    variants.push({
      variantCode:
        'VARIANT_' + String(variants.length + 1),
      variantName: '',
      variantKind: 'OTHER',
      packageType: 'AUTO',
      platforms:
        getWatcherTransformPlatforms(),
      contentsText: '',
      candidatePrice: null,
      preorderBonus: '',
      preorderBonusNote: ''
    })

    renderWatcherTransformVariants(variants)
  }

  function watcherPlatformLabel(value) {
    const labels = {
      switch2: 'Nintendo Switch 2',
      switch: 'Nintendo Switch',
      ps5: 'PlayStation 5',
      ps4: 'PlayStation 4',
      xbox: 'Xbox',
      pc: 'PC',
      etc: '기타'
    }

    return labels[value] || value || '플랫폼 미입력'
  }

  function watcherWon(value) {
    const price = Number(value)

    if (
      !Number.isInteger(price) ||
      price <= 0
    ) {
      return '미확정'
    }

    return (
      '₩' +
      price.toLocaleString('ko-KR')
    )
  }

  function clearWatcherFinalReview() {
    watcherFinalReviewContext = {
      item: null,
      selectedImage: null
    }

    const panel = $('watcherFinalReview')
    const image = $('watcherFinalImage')
    const placeholder =
      $('watcherFinalImagePlaceholder')

    if (panel) {
      panel.hidden = true
    }

    if (image) {
      image.hidden = true
      image.removeAttribute('src')
    }

    if (placeholder) {
      placeholder.hidden = false
    }
  }

  function renderWatcherFinalReview() {
    const panel = $('watcherFinalReview')
    if (!panel) return

    const item =
      watcherFinalReviewContext.item || {}

    const gameId = Number(
      item.linked_game_id || 0
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      panel.hidden = true
      return
    }

    panel.hidden = false

    const title =
      watcherTransformFieldValue(
        'watcherTransformTitle'
      )

    const platform =
      watcherTransformFieldValue(
        'watcherTransformPlatform'
      )

    const editionName =
      watcherTransformFieldValue(
        'watcherTransformEditionName'
      )

    const genre =
      watcherTransformFieldValue(
        'watcherTransformGenre'
      )

    const releaseDate =
      watcherTransformFieldValue(
        'watcherTransformReleaseDate'
      )

    const preorderStart =
      watcherTransformFieldValue(
        'watcherTransformPreorderStart'
      )

    const preorderEnd =
      watcherTransformFieldValue(
        'watcherTransformPreorderEnd'
      )

    const candidatePrice =
      watcherTransformFieldValue(
        'watcherTransformCandidatePrice'
      )

    const bonus =
      watcherTransformFieldValue(
        'watcherTransformBonus'
      )

    const bonusNote =
      watcherTransformFieldValue(
        'watcherTransformBonusNote'
      )

    const trailerUrl = safeUrl(
      watcherTransformFieldValue(
        'watcherTransformTrailer'
      )
    )

    const sourceUrl = safeUrl(
      item.source_url || ''
    )

    const sourceName = String(
      item.source_name || ''
    ).trim()

    const credit = String(
      item.required_credit || ''
    ).trim()

    const copyright = String(
      item.required_copyright || ''
    ).trim()

    const preorderPeriod =
      preorderStart && preorderEnd
        ? preorderStart + ' ~ ' + preorderEnd
        : (
          preorderStart
            ? preorderStart + '부터'
            : (
              preorderEnd
                ? preorderEnd + '까지'
                : '-'
            )
        )

    const setReviewText = function (
      id,
      value
    ) {
      const element = $(id)

      if (element) {
        element.textContent = value
      }
    }

    setReviewText(
      'watcherFinalTitle',
      title || '게임 제목 미입력'
    )

    setReviewText(
      'watcherFinalPlatform',
      watcherPlatformLabel(platform)
    )

    setReviewText(
      'watcherFinalGameId',
      '게임 #' + gameId + ' · DRAFT'
    )

    setReviewText(
      'watcherFinalEdition',
      editionName || '에디션 표시명 미입력'
    )

    setReviewText(
      'watcherFinalReleaseDate',
      releaseDate || '-'
    )

    setReviewText(
      'watcherFinalPreorderPeriod',
      preorderPeriod
    )

    setReviewText(
      'watcherFinalPrice',
      watcherWon(candidatePrice)
    )

    setReviewText(
      'watcherFinalGenre',
      genre || '-'
    )

    setReviewText(
      'watcherFinalBonus',
      bonus || '등록된 특전 정보가 없습니다.'
    )

    setReviewText(
      'watcherFinalBonusNote',
      bonusNote
    )

    setReviewText(
      'watcherFinalCredit',
      credit ||
        (
          sourceName
            ? '이미지 및 정보 출처: ' +
              sourceName
            : '출처 정보를 확인해 주세요.'
        )
    )

    setReviewText(
      'watcherFinalCopyright',
      copyright
    )

    const sourceLink =
      $('watcherFinalSourceLink')

    if (sourceLink) {
      sourceLink.hidden = !sourceUrl

      if (sourceUrl) {
        sourceLink.href = sourceUrl
      } else {
        sourceLink.removeAttribute('href')
      }
    }

    const trailerLink =
      $('watcherFinalTrailerLink')

    if (trailerLink) {
      trailerLink.hidden = !trailerUrl

      if (trailerUrl) {
        trailerLink.href = trailerUrl
      } else {
        trailerLink.removeAttribute('href')
      }
    }

    const reviewImage =
      $('watcherFinalImage')

    const placeholder =
      $('watcherFinalImagePlaceholder')

    if (
      reviewImage &&
      watcherPreviewObjectUrl
    ) {
      reviewImage.src =
        watcherPreviewObjectUrl

      reviewImage.alt =
        (title || '게임') +
        ' 대표 이미지 최종 검수'

      reviewImage.hidden = false

      if (placeholder) {
        placeholder.hidden = true
      }
    } else {
      if (reviewImage) {
        reviewImage.hidden = true
        reviewImage.removeAttribute('src')
      }

      if (placeholder) {
        placeholder.hidden = false
      }
    }
  }



  function setTransformImageStatus(
    message,
    type
  ) {
    const element =
      $('watcherTransformImageStatus')

    if (!element) return

    element.textContent = message || ''
    element.className = 'admin-status'

    if (type) {
      element.classList.add(type)
    }
  }

  function imageTypeLabel(value) {
    const type = String(
      value || ''
    ).toUpperCase()

    const labels = {
      PACKAGE: '패키지 이미지',
      LIMITED_EDITION: '한정판 이미지',
      PREORDER_BONUS: '예약 특전',
      FIRST_PRINT_BONUS: '초회 특전',
      STORE_BONUS: '판매처 특전',
      KEY_VISUAL: '키 비주얼',
      SCREENSHOT: '스크린샷',
      BANNER: '배너',
      UNKNOWN: '미분류'
    }

    return labels[type] || type || '미분류'
  }

  function imageTypeOptions(
    selectedType
  ) {
    const selected = String(
      selectedType || ''
    ).toUpperCase()

    const options = [
      {
        value: '',
        label: '이미지 유형 선택'
      },
      {
        value: 'PACKAGE',
        label: '패키지 이미지'
      },
      {
        value: 'LIMITED_EDITION',
        label: '한정판 이미지'
      },
      {
        value: 'PREORDER_BONUS',
        label: '예약 특전'
      },
      {
        value: 'FIRST_PRINT_BONUS',
        label: '초회 특전'
      },
      {
        value: 'STORE_BONUS',
        label: '판매처 특전'
      },
      {
        value: 'KEY_VISUAL',
        label: '키 비주얼'
      },
      {
        value: 'SCREENSHOT',
        label: '스크린샷'
      }
    ]

    return options
      .map(function (option) {
        return (
          '<option value="' +
            escapeHtml(option.value) +
            '"' +
            (
              option.value === selected
                ? ' selected'
                : ''
            ) +
          '>' +
            escapeHtml(option.label) +
          '</option>'
        )
      })
      .join('')
  }

  function renderTransformImages(
    images,
    item,
    policy
  ) {
    const container =
      $('watcherTransformImageList')

    const countElement =
      $('watcherTransformImageCount')

    const policyElement =
      $('watcherTransformImagePolicy')

    const selectedElement =
      $('watcherTransformSelectedImage')

    const selectedText =
      $('watcherTransformSelectedImageText')

    if (!container) return

    const list = Array.isArray(images)
      ? images
      : []

    if (countElement) {
      countElement.textContent =
        String(list.length) + '개'
    }

    const linkedGameId = Number(
      item && item.linked_game_id
        ? item.linked_game_id
        : 0
    )

    const policyStatus = String(
      policy && policy.permission_status
        ? policy.permission_status
        : (
          item &&
          item.source_permission_status
            ? item.source_permission_status
            : 'PENDING'
        )
    ).toUpperCase()

    const policyAllowed =
      policyStatus === 'APPROVED' ||
      policyStatus === 'CONDITIONAL'

    if (policyElement) {
      if (policyAllowed) {
        policyElement.innerHTML =
          '<strong>' +
            escapeHtml(
              policyStatus === 'CONDITIONAL'
                ? '🔵 조건부 이미지 사용 허가'
                : '🟢 이미지 사용 허가'
            ) +
          '</strong>' +
          '<p class="admin-hint">' +
            '출처 정책이 확인되었습니다. ' +
            '이미지 유형을 확인한 뒤 대표 후보를 선택할 수 있습니다.' +
          '</p>'
      } else {
        policyElement.innerHTML =
          '<strong>🟡 이미지 사용 허가 대기</strong>' +
          '<p class="admin-hint">' +
            '출처의 이미지 사용 정책이 승인되기 전에는 ' +
            '대표 이미지로 선택할 수 없습니다.' +
          '</p>'
      }
    }

    const selectedImage = list.find(
      function (image) {
        return (
          Number(
            image.selected_for_publish || 0
          ) === 1
        )
      }
    )


      watcherFinalReviewContext = {
      item: item || null,
      selectedImage: selectedImage || null
    }

    renderWatcherFinalReview()

    configureWatcherPrivatePreview(
      selectedImage || null
    )

    if (selectedElement) {
      selectedElement.hidden =
        !selectedImage
    }

    if (
      selectedText &&
      selectedImage
    ) {
          selectedText.textContent =
        '이미지 #' +
        Number(selectedImage.id || 0) +
        ' · ' +
        imageTypeLabel(
          selectedImage.image_type
        ) +
        ' · 개별 상태 ' +
        String(
          selectedImage.permission_status ||
          'PENDING'
        ) +
        (
          selectedImage.stored_image_url
            ? ' · 비공개 R2 저장 완료'
            : ' · R2 미저장'
        )



    }

    if (!list.length) {
      container.innerHTML =
        '<div class="admin-empty">' +
          '이 보도자료에서 수집된 이미지 후보가 없습니다.' +
        '</div>'

      setTransformImageStatus(
        '이미지 후보가 없습니다.',
        'info'
      )

      return
    }

    container.innerHTML = list
      .map(function (image, index) {
        const imageId = Number(
          image.id || 0
        )

        const sourceUrl = safeUrl(
          image.source_image_url
        )

        const selected =
          Number(
            image.selected_for_publish || 0
          ) === 1

        const stored = Boolean(
          String(
            image.stored_image_url || ''
          ).trim()
        )

        const permissionStatus = String(
          image.permission_status ||
          'PENDING'
        ).toUpperCase()

        const currentType = String(
          image.image_type || ''
        ).toUpperCase()

        const selectable =
          Number.isInteger(linkedGameId) &&
          linkedGameId > 0 &&
          policyAllowed &&
          Number.isInteger(imageId) &&
          imageId > 0

        const localStorageAllowed =
          Number(
            policy &&
            policy.local_storage_allowed != null
              ? policy.local_storage_allowed
              : (
                item &&
                item.local_storage_allowed != null
                  ? item.local_storage_allowed
                  : 0
              )
          ) === 1

        const storable =
          selected &&
          selectable &&
          permissionStatus === 'APPROVED' &&
          localStorageAllowed


        let hostName = '공식 이미지'

        if (sourceUrl) {
          try {
            hostName =
              new URL(sourceUrl).hostname
          } catch (error) {
            hostName = '공식 이미지'
          }
        }

        const sourceLink = sourceUrl
          ? (
            '<a ' +
              'class="watcher-item-link" ' +
              'href="' +
                escapeHtml(sourceUrl) +
              '" ' +
              'target="_blank" ' +
              'rel="noopener noreferrer">' +
              '공식 이미지 원본 확인 ↗' +
            '</a>'
          )
          : (
            '<span class="admin-hint">' +
              '이미지 URL 없음' +
            '</span>'
          )

        return (
          '<article class="watcher-transform-image-card' +
            (selected ? ' is-selected' : '') +
          '">' +

            '<div class="watcher-transform-image-head">' +
              '<strong>' +
                '후보 ' +
                escapeHtml(index + 1) +
              '</strong>' +

              (
                selected
                  ? (
                    '<span class="watcher-badge ' +
                      'watcher-permission-approved">' +
                      '대표 이미지 선택됨' +
                    '</span>'
                  )
                  : ''
              ) +
            '</div>' +

            '<div class="watcher-transform-image-meta">' +
              '<span>이미지 ID: ' +
                escapeHtml(imageId) +
              '</span>' +

              '<span>수집 유형: ' +
                escapeHtml(
                  imageTypeLabel(currentType)
                ) +
              '</span>' +

                            '<span>개별 상태: ' +
                escapeHtml(permissionStatus) +
              '</span>' +

              '<span>비공개 저장: ' +
                escapeHtml(
                  stored
                    ? 'R2 저장 완료'
                    : '미저장'
                ) +
              '</span>' +

              '<span>출처: ' +
                escapeHtml(hostName) +
              '</span>' +
            '</div>' +

            (
              image.alt_text
                ? (
                  '<p class="watcher-transform-image-alt">' +
                    escapeHtml(image.alt_text) +
                  '</p>'
                )
                : ''
            ) +

            sourceLink +

            '<label class="admin-field">' +
              '<span>사용할 이미지 유형</span>' +

              '<select ' +
                'data-watcher-image-type="' +
                  escapeHtml(imageId) +
                '"' +
                (selectable ? '' : ' disabled') +
              '>' +
                imageTypeOptions(currentType) +
              '</select>' +
            '</label>' +
            '<button ' +
              'type="button" ' +
              'class="btn btn-sm ' +
                'watcher-image-select" ' +
              'data-watcher-image-select="' +
                escapeHtml(imageId) +
              '"' +
              (selectable ? '' : ' disabled') +
            '>' +
              (
                selected
                  ? '대표 이미지 다시 선택'
                  : (
                    linkedGameId > 0
                      ? '대표 이미지 선택'
                      : '비공개 게임 등록 후 선택'
                  )
              ) +
            '</button>' +

            (
              selected
                ? (
                  '<button ' +
                    'type="button" ' +
                    'class="btn btn-sm" ' +
                    'data-watcher-image-store="' +
                      escapeHtml(imageId) +
                    '"' +
                    (storable ? '' : ' disabled') +
                  '>' +
                    (
                      stored
                        ? '비공개 R2에 다시 저장'
                        : '비공개 R2 저장'
                    ) +
                  '</button>'
                )
                : ''
            ) +
          '</article>'
        )
      })
      .join('')

    if (linkedGameId <= 0) {
      setTransformImageStatus(
        '비공개 게임 DRAFT를 등록한 뒤 대표 이미지를 선택할 수 있습니다.',
        'info'
      )
    } else if (!policyAllowed) {
      setTransformImageStatus(
        '출처의 이미지 사용 정책이 승인되지 않았습니다.',
        'err'
      )
        } else if (selectedImage) {
      const selectedStored = Boolean(
        String(
          selectedImage.stored_image_url ||
          ''
        ).trim()
      )

      setTransformImageStatus(
        selectedStored
          ? '대표 이미지가 비공개 R2에 저장되어 있습니다. 게임은 아직 공개되지 않았습니다.'
          : '대표 이미지 후보가 선택되어 있습니다. 비공개 R2 저장을 진행할 수 있습니다.',
        'ok'
      )

    } else {
      setTransformImageStatus(
        '공식 원본을 확인하고 이미지 유형을 선택해 주세요.',
        'info'
      )
    }
  }

  async function loadWatcherPrivatePreview() {
    if (imagePreviewRunning) return

    const button =
      $('loadWatcherPrivatePreview')

    const itemIdElement =
      $('watcherTransformItemId')

    const itemId = Number(
      itemIdElement
        ? itemIdElement.value
        : 0
    )

    const imageId = Number(
      button
        ? button.getAttribute(
          'data-watcher-preview-image-id'
        )
        : 0
    )

    if (
      !Number.isInteger(itemId) ||
      itemId <= 0 ||
      !Number.isInteger(imageId) ||
      imageId <= 0
    ) {
      const status =
        $('watcherTransformPreviewStatus')

      if (status) {
        status.textContent =
          '미리보기 이미지 정보가 올바르지 않습니다.'

        status.className =
          'admin-status err'
      }

      return
    }

    const token =
      window.localStorage.getItem(
        TOKEN_KEY
      ) || ''

    if (!token) {
      const status =
        $('watcherTransformPreviewStatus')

      if (status) {
        status.textContent =
          '관리자 토큰이 없습니다. 다시 로그인해 주세요.'

        status.className =
          'admin-status err'
      }

      return
    }

    const frame =
      $('watcherTransformPreviewFrame')

    const image =
      $('watcherTransformPreviewImage')

    const info =
      $('watcherTransformPreviewInfo')

    const status =
      $('watcherTransformPreviewStatus')

    imagePreviewRunning = true

    if (button) {
      button.disabled = true
      button.textContent =
        '미리보기 불러오는 중...'
    }

    if (status) {
      status.textContent =
        '비공개 R2 이미지를 불러오고 있습니다.'

      status.className =
        'admin-status info'
    }

    try {
      const response =
        await window.fetch(
          '/admin/api/watcher/items/' +
            itemId +
            '/images/' +
            imageId +
            '/preview',
          {
            method: 'GET',

            headers: {
              'X-Admin-Token': token
            },

            cache: 'no-store'
          }
        )

      if (!response.ok) {
        let data = {}

        try {
          data = await response.json()
        } catch (error) {
          data = {}
        }

        throw new Error(
          data.error ||
          data.message ||
          '이미지 미리보기 요청에 실패했습니다. (' +
            response.status +
          ')'
        )
      }

      const contentType = String(
        response.headers.get(
          'content-type'
        ) || ''
      )
        .split(';')[0]
        .trim()
        .toLowerCase()

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp'
      ]

      if (
        !allowedTypes.includes(
          contentType
        )
      ) {
        throw new Error(
          '허용되지 않은 미리보기 파일 형식입니다.'
        )
      }

      const blob =
        await response.blob()

      if (!blob.size) {
        throw new Error(
          '빈 이미지 파일이 반환되었습니다.'
        )
      }

      if (watcherPreviewObjectUrl) {
        window.URL.revokeObjectURL(
          watcherPreviewObjectUrl
        )
      }

      watcherPreviewObjectUrl =
        window.URL.createObjectURL(
          blob
        )

      if (image) {
        image.src =
          watcherPreviewObjectUrl

        image.alt =
          '게임 대표 이미지 #' +
          imageId +
          ' 비공개 미리보기'
      }

      if (frame) {
        frame.hidden = false
      }

      renderWatcherFinalReview()

      const sizeText =
        blob.size >= 1024 * 1024
          ? (
            blob.size /
            (1024 * 1024)
          ).toFixed(2) + 'MB'
          : (
            blob.size / 1024
          ).toFixed(1) + 'KB'

      if (info) {
        info.textContent =
          '이미지 #' +
          imageId +
          ' · ' +
          contentType +
          ' · ' +
          sizeText +
          ' · 관리자 전용 Blob 미리보기'
      }

      if (status) {
        status.textContent =
          '비공개 R2 대표 이미지를 불러왔습니다. 아직 공개되지 않았습니다.'

        status.className =
          'admin-status ok'
      }
    } catch (error) {
      if (frame) {
        frame.hidden = true
      }

      if (image) {
        image.removeAttribute('src')
      }

      if (status) {
        status.textContent =
          error && error.message
            ? error.message
            : '비공개 이미지 미리보기에 실패했습니다.'

        status.className =
          'admin-status err'
      }
    } finally {
      imagePreviewRunning = false

      if (button) {
        button.disabled = false
        button.textContent =
          '미리보기 다시 불러오기'
      }
    }
  }


  async function selectWatcherImage(
    imageIdValue
  ) {
    if (imageActionRunning) return

    const imageId = Number(
      imageIdValue
    )

    const itemIdElement =
      $('watcherTransformItemId')

    const itemId = Number(
      itemIdElement
        ? itemIdElement.value
        : 0
    )

    if (
      !Number.isInteger(itemId) ||
      itemId <= 0
    ) {
      setTransformImageStatus(
        '보도자료 항목 정보가 올바르지 않습니다.',
        'err'
      )

      return
    }

    if (
      !Number.isInteger(imageId) ||
      imageId <= 0
    ) {
      setTransformImageStatus(
        '이미지 후보 정보가 올바르지 않습니다.',
        'err'
      )

      return
    }

    const imageList =
      $('watcherTransformImageList')

    if (!imageList) return

    const typeSelect =
      imageList.querySelector(
        '[data-watcher-image-type="' +
          imageId +
        '"]'
      )

    const imageType = typeSelect
      ? String(
          typeSelect.value || ''
        )
          .trim()
          .toUpperCase()
      : ''

    if (!imageType) {
      setTransformImageStatus(
        '대표 이미지로 사용할 이미지 유형을 선택해 주세요.',
        'err'
      )

      if (
        typeSelect &&
        typeof typeSelect.focus === 'function'
      ) {
        typeSelect.focus()
      }

      return
    }

    const allowedTypes = [
      'PACKAGE',
      'LIMITED_EDITION',
      'PREORDER_BONUS',
      'FIRST_PRINT_BONUS',
      'STORE_BONUS',
      'KEY_VISUAL',
      'SCREENSHOT'
    ]

    if (!allowedTypes.includes(imageType)) {
      setTransformImageStatus(
        '선택할 수 없는 이미지 유형입니다.',
        'err'
      )

      return
    }

    const confirmed = window.confirm(
      '이미지 #' +
        imageId +
        '을(를) 대표 이미지 후보로 선택할까요?\n\n' +
        '이미지 유형: ' +
        imageTypeLabel(imageType) +
        '\n\n' +
        '이 단계에서는 이미지를 다운로드하거나 공개하지 않습니다.'
    )

    if (!confirmed) return

    const button =
      imageList.querySelector(
        '[data-watcher-image-select="' +
          imageId +
        '"]'
      )

    imageActionRunning = true

    if (button) {
      button.disabled = true
      button.textContent = '선택 중...'
    }

    setTransformImageStatus(
      '대표 이미지 후보를 저장하고 있습니다.',
      'info'
    )

    try {
      const data = await watcherApi(
        '/admin/api/watcher/items/' +
          itemId +
          '/images/' +
          imageId +
          '/select',
        {
          method: 'POST',
          body: JSON.stringify({
            imageType
          })
        }
      )

      await openWatcherTransform(itemId)

      setTransformImageStatus(
        '대표 이미지 후보 #' +
          Number(
            data.selectedImageId ||
            imageId
          ) +
          '을 선택했습니다. ' +
          '아직 다운로드하거나 공개하지 않았습니다.',
        'ok'
      )
    } catch (error) {
      setTransformImageStatus(
        error && error.message
          ? error.message
          : '대표 이미지 후보 선택에 실패했습니다.',
        'err'
      )

      if (button) {
        button.disabled = false
        button.textContent =
          '대표 이미지 선택'
      }
    } finally {
      imageActionRunning = false
    }
  }

  async function storeWatcherImage(
    imageIdValue
  ) {
    if (
      imageStoreRunning ||
      imageActionRunning
    ) {
      return
    }

    const imageId = Number(
      imageIdValue
    )

    const itemIdElement =
      $('watcherTransformItemId')

    const itemId = Number(
      itemIdElement
        ? itemIdElement.value
        : 0
    )

    if (
      !Number.isInteger(itemId) ||
      itemId <= 0
    ) {
      setTransformImageStatus(
        '보도자료 항목 정보가 올바르지 않습니다.',
        'err'
      )

      return
    }

    if (
      !Number.isInteger(imageId) ||
      imageId <= 0
    ) {
      setTransformImageStatus(
        '이미지 후보 정보가 올바르지 않습니다.',
        'err'
      )

      return
    }

    const imageList =
      $('watcherTransformImageList')

    if (!imageList) return

    const button =
      imageList.querySelector(
        '[data-watcher-image-store="' +
          imageId +
        '"]'
      )

    const confirmed = window.confirm(
      '선택된 대표 이미지 #' +
        imageId +
        '의 공식 원본을 비공개 R2에 저장할까요?\n\n' +
        '파일 형식과 용량, 이미지 권한을 서버에서 다시 검증합니다.\n' +
        '게임은 계속 DRAFT 상태이며 공개 이미지는 변경되지 않습니다.'
    )

    if (!confirmed) return

    imageStoreRunning = true

    if (button) {
      button.disabled = true
      button.textContent =
        '비공개 저장 중...'
    }

    setTransformImageStatus(
      '공식 이미지 원본을 확인하고 비공개 R2에 저장하고 있습니다.',
      'info'
    )

    try {
      const data = await watcherApi(
        '/admin/api/watcher/items/' +
          itemId +
          '/images/' +
          imageId +
          '/store',
        {
          method: 'POST'
        }
      )

      await openWatcherTransform(
        itemId
      )

      const rawSize = Number(
        data.size || 0
      )

      const sizeText =
        rawSize >= 1024 * 1024
          ? (
            rawSize /
            (1024 * 1024)
          ).toFixed(2) + 'MB'
          : rawSize >= 1024
            ? (
              rawSize / 1024
            ).toFixed(1) + 'KB'
            : String(rawSize) + 'B'

      setTransformImageStatus(
        (
          data.alreadyStored
            ? '이미 비공개 R2에 저장된 이미지입니다.'
            : '대표 이미지를 비공개 R2에 저장했습니다.'
        ) +
          ' 이미지 #' +
          imageId +
          ' · ' +
          String(
            data.contentType ||
            'image'
          ) +
          ' · ' +
          sizeText +
          ' · 게임은 계속 DRAFT 상태입니다.',
        'ok'
      )
    } catch (error) {
      setTransformImageStatus(
        error && error.message
          ? error.message
          : '비공개 R2 저장에 실패했습니다.',
        'err'
      )

      if (button) {
        button.disabled = false
        button.textContent =
          '비공개 R2 저장'
      }
    } finally {
      imageStoreRunning = false
    }
  }


  async function openWatcherTransform(itemId) {
    const id = Number(itemId)
    const card = $('watcherTransformCard')

    if (
      !card ||
      !Number.isInteger(id) ||
      id <= 0
    ) {
      setStatus(
        '보도자료 항목 정보가 올바르지 않습니다.',
        'err'
      )

      return
    }

    card.hidden = false

    setTransformStatus(
      '보도자료 상세 정보를 불러오는 중입니다.',
      'info'
    )

    card.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })

    try {
      const data = await watcherApi(
        '/admin/api/watcher/items/' + id
      )

        const item = data.item || {}

      const draft = parseTransformDraft(
        item.transformed_json
      )

      const images = Array.isArray(
        data.images
      )
        ? data.images
        : (
          Array.isArray(item.images)
            ? item.images
            : []
        )

      const imagePolicy =
        data.imagePolicy ||
        data.policy ||
        item.image_policy ||
        {}

      setRegisterDraftButton(
        item.review_status,
        item.linked_game_id
      )

      renderTransformImages(
        images,
        item,
        imagePolicy
      )


      setTransformValue(
        'watcherTransformItemId',
        id
      )


      setTransformValue(
        'watcherTransformTitle',
        suggestCleTitle(item, draft)
      )

      const suggestedPlatforms =
        detectClePlatforms(item, draft)

      setWatcherTransformPlatforms(
        suggestedPlatforms
      )

      const suggestedVariants =
        suggestCleVariants(
          item,
          draft,
          suggestedPlatforms
        )

      watcherHasMultiEditionDraft =
        suggestedVariants.length > 0

      setWatcherTransformVariants(
        suggestedVariants,
        {
          editionName:
            draft.editionName || '일반판',

          candidatePrice:
            draft.candidatePrice,

          preorderBonus:
            draft.preorderBonus,

          preorderBonusNote:
            draft.preorderBonusNote
        }
      )

      setTransformValue(
        'watcherTransformGenre',
        suggestCleGenre(item, draft)
      )

      setTransformValue(
        'watcherTransformReleaseDate',
        suggestCleReleaseDate(item, draft)
      )

      setTransformValue(
        'watcherTransformPreorderStart',
        draft.preorderStartDate || ''
      )

      setTransformValue(
        'watcherTransformPreorderEnd',
        draft.preorderEndDate || ''
      )

      setTransformValue(
        'watcherTransformCandidatePrice',
        draft.candidatePrice == null
          ? ''
          : draft.candidatePrice
      )

      setTransformValue(
        'watcherTransformBonus',
        draft.preorderBonus || ''
      )

      setTransformValue(
        'watcherTransformBonusNote',
        draft.preorderBonusNote || ''
      )

      setTransformValue(
        'watcherTransformTrailer',
        suggestCleTrailer(item, draft)
      )

      const sourceTitle =
        $('watcherTransformSourceTitle')

      if (sourceTitle) {
        sourceTitle.textContent =
          item.title || '공식 보도자료'
      }

      const sourceLink =
        $('watcherTransformSourceLink')

      const sourceUrl = safeUrl(
        item.source_url
      )

      if (sourceLink && sourceUrl) {
        sourceLink.href = sourceUrl
        sourceLink.hidden = false
      } else if (sourceLink) {
        sourceLink.removeAttribute('href')
        sourceLink.hidden = true
      }

      setTransformStatus(
        Object.keys(draft).length
          ? '저장된 초안을 불러왔습니다.'
          : '보도자료를 불러왔습니다. 게임 정보를 확인해 입력해 주세요.',
        'ok'
      )
    } catch (error) {
      setTransformStatus(
        error && error.message
          ? error.message
          : '보도자료를 불러오지 못했습니다.',
        'err'
      )
    }
  }

   async function saveWatcherTransform() {
    if (
      transformActionRunning ||
      registerDraftRunning
    ) {
      return
    }

    const itemIdElement =
      $('watcherTransformItemId')

    const itemId = Number(
      itemIdElement
        ? itemIdElement.value
        : 0
    )

    if (
      !Number.isInteger(itemId) ||
      itemId <= 0
    ) {
      setTransformStatus(
        '보도자료를 먼저 선택해 주세요.',
        'err'
      )

      return
    }

    const value = function (id) {
      const element = $(id)

      return element
        ? String(element.value || '').trim()
        : ''
    }

    const rawPrice = value(
      'watcherTransformCandidatePrice'
    )

    const platforms =
      getWatcherTransformPlatforms()

    const variants =
      getWatcherTransformVariants()

    const payload = {
      title: value(
        'watcherTransformTitle'
      ),

      platform: platforms[0] || '',
      platforms,

      editionName:
        variants[0]
          ? variants[0].variantName
          : value(
              'watcherTransformEditionName'
            ),

      variants,

      genre: value(
        'watcherTransformGenre'
      ),

      releaseDate: value(
        'watcherTransformReleaseDate'
      ),

      preorderStartDate: value(
        'watcherTransformPreorderStart'
      ),

      preorderEndDate: value(
        'watcherTransformPreorderEnd'
      ),

      candidatePrice:
        rawPrice === ''
          ? null
          : Number(rawPrice),

      preorderBonus: value(
        'watcherTransformBonus'
      ),

      preorderBonusNote: value(
        'watcherTransformBonusNote'
      ),

      trailerUrl: value(
        'watcherTransformTrailer'
      )
    }

    if (!payload.title) {
      setTransformStatus(
        '게임 제목을 입력해 주세요.',
        'err'
      )

      return
    }

    if (!payload.releaseDate) {
      setTransformStatus(
        '패키지 발매일을 입력해 주세요.',
        'err'
      )

      return
    }

    if (!variants.length) {
      setTransformStatus(
        '에디션을 하나 이상 추가해 주세요.',
        'err'
      )
      return
    }

    const invalidVariant = variants.find(
      function (variant) {
        return (
          !variant.variantName ||
          !variant.variantCode ||
          !variant.platforms.length ||
          (
            variant.candidatePrice !== null &&
            (
              !Number.isInteger(
                variant.candidatePrice
              ) ||
              variant.candidatePrice <= 0
            )
          )
        )
      }
    )

    if (invalidVariant) {
      setTransformStatus(
        '각 에디션의 표시명, 코드, 적용 플랫폼, 가격을 확인해 주세요.',
        'err'
      )
      return
    }

    const combinations = new Set()
    let duplicated = false

    variants.forEach(function (variant) {
      variant.platforms.forEach(
        function (platform) {
          const key =
            platform + ':' +
            variant.variantCode

          if (combinations.has(key)) {
            duplicated = true
          }

          combinations.add(key)
        }
      )
    })

    if (duplicated) {
      setTransformStatus(
        '같은 플랫폼에 동일한 에디션 코드를 중복 등록할 수 없습니다.',
        'err'
      )
      return
    }

    if (
      payload.candidatePrice !== null &&
      (
        !Number.isInteger(
          payload.candidatePrice
        ) ||
        payload.candidatePrice <= 0
      )
    ) {
      setTransformStatus(
        '가격 후보는 1원 이상의 정수로 입력해 주세요.',
        'err'
      )

      return
    }

    const button = $('saveWatcherTransform')

    transformActionRunning = true

    if (button) {
      button.disabled = true
      button.textContent = '저장 중...'
    }

    setTransformStatus(
      '게임 등록 초안을 저장하고 있습니다.',
      'info'
    )

    try {
      const data = await watcherApi(
        '/admin/api/watcher/items/' +
          itemId +
          '/transform',
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      )

      watcherLoaded = false
      await loadWatcher(true)

      watcherHasMultiEditionDraft = true

      setRegisterDraftButton(
        data.reviewStatus || 'TRANSFORMED',
        null
      )

      setTransformStatus(
        '초안 저장 완료 — 검수 상태가 ' +
          reviewStatusLabel(
            data.reviewStatus || 'TRANSFORMED'
          ) +
          '로 변경되었습니다.',
        'ok'
      )
    } catch (error) {
      setTransformStatus(
        error && error.message
          ? error.message
          : '게임 등록 초안 저장에 실패했습니다.',
        'err'
      )
    } finally {
      transformActionRunning = false

      if (button) {
        button.disabled = false
        button.textContent = '초안 저장'
      }
    }
  }

   async function registerWatcherDraft() {
    if (
      registerDraftRunning ||
      transformActionRunning
    ) {
      return
    }

    const itemIdElement =
      $('watcherTransformItemId')

    const itemId = Number(
      itemIdElement
        ? itemIdElement.value
        : 0
    )

    if (
      !Number.isInteger(itemId) ||
      itemId <= 0
    ) {
      setTransformStatus(
        '보도자료를 먼저 선택해 주세요.',
        'err'
      )

      return
    }

    const confirmed = window.confirm(
      '저장된 초안을 비공개 게임으로 등록할까요?\n\n' +
      '게임 1개와 선택한 플랫폼별 에디션을 V2 DRAFT로 등록합니다.\n' +
      '공개 사이트에는 표시되지 않으며 자동 공개도 하지 않습니다.'
    )

    if (!confirmed) return

    const button =
      $('registerWatcherDraft')

    registerDraftRunning = true

    if (button) {
      button.disabled = true
      button.textContent =
        '비공개 등록 중...'
    }

    setTransformStatus(
      '게임과 예약판매 정보를 비공개 DRAFT로 등록하고 있습니다.',
      'info'
    )

    try {
      const data = await watcherApi(
        '/admin/api/watcher/items/' +
          itemId +
          '/register-draft',
        {
          method: 'POST'
        }
      )


      watcherLoaded = false
      await loadWatcher(true)
      await openWatcherTransform(itemId)

      setRegisterDraftButton(
        'APPROVED',
        data.gameId
      )


      if (data.alreadyRegistered) {
        setTransformStatus(
          '이미 비공개 게임에 연결되어 있습니다. ' +
            '게임 ID: ' +
            Number(data.gameId || 0),
          'ok'
        )
      } else {
        setTransformStatus(
          '비공개 게임 등록 완료 — ' +
            '게임 ID: ' +
            Number(data.gameId || 0) +
            ', 에디션 ID: ' +
            Number(data.editionId || 0) +
            '. 아직 공개되지 않았습니다.',
          'ok'
        )
      }
    } catch (error) {
      setTransformStatus(
        error && error.message
          ? error.message
          : '비공개 게임 등록에 실패했습니다.',
        'err'
      )

      setRegisterDraftButton(
        'TRANSFORMED',
        null
      )
    } finally {
      registerDraftRunning = false
    }
  }


  function renderSummary(summary) {
    const data = summary || {}

    setText(
      'watcherEnabledSources',
      data.enabled_sources || 0
    )

    setText(
      'watcherDiscoveredItems',
      data.discovered_items || 0
    )

    setText(
      'watcherTransformedItems',
      data.transformed_items || 0
    )

    setText(
      'watcherReviewingItems',
      data.reviewing_items || 0
    )

    setText(
      'watcherPendingPermissions',
      data.pending_permissions || 0
    )

    setText(
      'watcherUnreadEvents',
      data.unread_events || 0
    )

    const badge = $('watcherTabBadge')

    const count =
      Number(data.discovered_items || 0) +
      Number(data.reviewing_items || 0) +
      Number(data.unread_events || 0)

    if (badge) {
      badge.textContent = String(count)
      badge.hidden = count < 1
    }
  }

  function renderSources(sources) {
    const container = $('watcherSourceList')
    if (!container) return

    if (!Array.isArray(sources) || !sources.length) {
      container.innerHTML =
        '<div class="admin-empty">' +
          '등록된 수집 출처가 없습니다.' +
        '</div>'

      return
    }

    container.innerHTML = sources
      .map(function (source) {
        const permission = permissionInfo(
          source.permission_status
        )

        const sourceUrl = safeUrl(
          source.list_url || source.base_url
        )

        const enabled =
          Number(source.enabled) === 1
            ? '<span class="watcher-badge watcher-badge-enabled">' +
                '수집 활성화' +
              '</span>'
            : '<span class="watcher-badge watcher-badge-disabled">' +
                '수집 중지' +
              '</span>'

        const errorHtml = source.last_error
          ? '<p class="watcher-source-error">' +
              '최근 오류: ' +
              escapeHtml(source.last_error) +
            '</p>'
          : ''

        const linkHtml = sourceUrl
          ? '<a class="watcher-source-link" href="' +
              escapeHtml(sourceUrl) +
              '" target="_blank" rel="noopener noreferrer">' +
              '공식 사이트 보기 ↗' +
            '</a>'
          : ''

        return (
          '<article class="watcher-source-card">' +
            '<div class="watcher-source-head">' +
              '<div>' +
                '<strong class="watcher-source-name">' +
                  escapeHtml(source.source_name) +
                '</strong>' +
                '<span class="watcher-source-key">' +
                  escapeHtml(source.source_key) +
                '</span>' +
              '</div>' +

              '<div class="watcher-source-badges">' +
                enabled +
                '<span class="watcher-badge watcher-permission-' +
                  escapeHtml(permission.className) +
                '">' +
                  escapeHtml(permission.label) +
                '</span>' +
              '</div>' +
            '</div>' +

            '<dl class="watcher-source-meta">' +
              '<div>' +
                '<dt>수집 방식</dt>' +
                '<dd>' +
                  escapeHtml(
                    String(
                      source.collection_mode || 'manual'
                    ).toUpperCase()
                  ) +
                '</dd>' +
              '</div>' +

              '<div>' +
                '<dt>확인 주기</dt>' +
                '<dd>' +
                  escapeHtml(
                    source.poll_interval_minutes
                      ? source.poll_interval_minutes + '분'
                      : '수동'
                  ) +
                '</dd>' +
              '</div>' +

              '<div>' +
                '<dt>자체 저장</dt>' +
                '<dd>' +
                  escapeHtml(
                    booleanLabel(
                      source.local_storage_allowed
                    )
                  ) +
                '</dd>' +
              '</div>' +

              '<div>' +
                '<dt>리사이즈</dt>' +
                '<dd>' +
                  escapeHtml(
                    booleanLabel(source.resize_allowed)
                  ) +
                '</dd>' +
              '</div>' +
            '</dl>' +

            (source.required_credit
              ? '<p class="watcher-credit">' +
                  '필수 출처: ' +
                  escapeHtml(source.required_credit) +
                '</p>'
              : '') +

            (source.permission_note
              ? '<p class="watcher-policy-note">' +
                  escapeHtml(source.permission_note) +
                '</p>'
              : '') +

            errorHtml +
            linkHtml +
          '</article>'
        )
      })
      .join('')
  }

  function renderItems(items) {
    const container = $('watcherItemList')
    if (!container) return

    if (!Array.isArray(items) || !items.length) {
      container.innerHTML =
        '<div class="admin-empty">' +
          '아직 발견된 보도자료가 없습니다.<br>' +
          '수집기를 실행하면 여기에 자동으로 표시됩니다.' +
        '</div>'

      return
    }

    container.innerHTML = items
      .map(function (item) {
        const articleUrl = safeUrl(item.source_url)

        const linkHtml = articleUrl
          ? '<a class="watcher-item-link" href="' +
              escapeHtml(articleUrl) +
              '" target="_blank" rel="noopener noreferrer">' +
              '공식 원문 보기 ↗' +
            '</a>'
          : ''

        const pendingImages = Number(
          item.pending_image_count || 0
        )

        return (
          '<article class="watcher-item-card">' +
            '<div class="watcher-item-main">' +
              '<div class="watcher-item-top">' +
                '<span class="watcher-badge">' +
                  escapeHtml(
                    item.source_name || item.source_key
                  ) +
                '</span>' +

                '<span class="watcher-badge watcher-review-status">' +
                  escapeHtml(
                    reviewStatusLabel(item.review_status)
                  ) +
                '</span>' +

                (pendingImages > 0
                  ? '<span class="watcher-badge watcher-permission-pending">' +
                      '이미지 ' +
                      escapeHtml(pendingImages) +
                      '개 허가 대기' +
                    '</span>'
                  : '') +
              '</div>' +

              '<strong class="watcher-item-title">' +
                escapeHtml(
                  item.title ||
                  item.raw_title ||
                  '제목 없음'
                ) +
              '</strong>' +

              '<div class="watcher-item-meta">' +
                '<span>발견: ' +
                  escapeHtml(item.first_seen_at || '-') +
                '</span>' +

                '<span>이미지 후보: ' +
                  escapeHtml(item.image_count || 0) +
                  '개</span>' +

                '<span>유형: ' +
                  escapeHtml(item.event_type || '-') +
                '</span>' +
              '</div>' +
            '</div>' +

            '<div class="watcher-item-action">' +
              linkHtml +
            '</div>' +
          '</article>'
        )
      })
      .join('')
  }

  async function loadWatcher(force) {
    if (watcherLoading) return
    if (watcherLoaded && !force) return

    watcherLoading = true
    setBusy(true)

    setStatus(
      'WATCHER 현황을 불러오는 중입니다.',
      'info'
    )

    try {
      const results = await Promise.all([
        watcherApi('/admin/api/watcher/summary'),
        watcherApi('/admin/api/watcher/sources'),
        watcherApi('/admin/api/watcher/items?limit=50'),
        watcherApi('/admin/api/watcher/events?limit=100')
      ])

      renderSummary(results[0].summary)
      renderSources(results[1].sources)
      renderItems(results[2].items)
      renderEvents(results[3].groups)

      watcherLoaded = true

      setStatus(
        'WATCHER 현황을 불러왔습니다.',
        'ok'
      )
    } catch (error) {
      const message =
        error && error.message
          ? error.message
          : 'WATCHER 현황을 불러오지 못했습니다.'

      setStatus(message, 'err')

      const sourceList = $('watcherSourceList')

      if (sourceList) {
        sourceList.innerHTML =
          '<div class="admin-empty">' +
            escapeHtml(message) +
          '</div>'
      }

      const itemList = $('watcherItemList')

      if (itemList) {
        itemList.innerHTML =
          '<div class="admin-empty">' +
            '수집 항목을 불러오지 못했습니다.' +
          '</div>'
      }
    } finally {
      watcherLoading = false
      setBusy(false)
    }
  }

  function isWatcherPanelActive() {
    const panel = document.querySelector(
      '[data-admin-panel="watcher"]'
    )

    return Boolean(
      panel &&
      panel.classList.contains('is-active') &&
      !panel.hidden
    )
  }

  function init() {
  const platformRowsForLabel =
    $('watcherTransformPlatformRows')

  if (platformRowsForLabel) {
    const platformField =
      platformRowsForLabel.closest(
        '.admin-field'
      )

    const platformLabel =
      platformField &&
      platformField.querySelector(
        ':scope > span'
      )

    if (platformLabel) {
      platformLabel.textContent =
        '게임 출시 플랫폼'
    }
  }

  ;[
    'watcherTransformCandidatePrice',
    'watcherTransformBonus',
    'watcherTransformBonusNote'
  ].forEach(function (id) {
    const element = $(id)

    const field =
      element &&
      element.closest('.admin-field')

    if (field) {
      field.hidden = true
    }
  })

  const refreshButton = $('refreshWatcher')
  const collectArcButton = $('collectArcWatcher')

  const markAllEventsButton =
    $('markAllWatcherEventsRead')

  const eventList = $('watcherEventList')

  const imageList =
    $('watcherTransformImageList')

  const privatePreviewButton =
    $('loadWatcherPrivatePreview')

  const saveTransformButton =
    $('saveWatcherTransform')

  const addPlatformButton =
    $('addWatcherTransformPlatform')

  const addVariantButton =
    $('addWatcherTransformVariant')

  const variantList =
    $('watcherTransformVariantList')

  const platformRows =
    $('watcherTransformPlatformRows')


  const registerDraftButton =
    $('registerWatcherDraft')

  const closeTransformButton =
    $('closeWatcherTransform')

  const cancelTransformButton =
    $('cancelWatcherTransform')

  const watcherTab = document.querySelector(
    '[data-admin-tab="watcher"]'
  )

  if (refreshButton) {
    refreshButton.addEventListener(
      'click',
      function () {
        loadWatcher(true)
      }
    )
  }

  if (collectArcButton) {
    collectArcButton.addEventListener(
      'click',
      runArcCollector
    )
  }

  if (markAllEventsButton) {
    markAllEventsButton.addEventListener(
      'click',
      readAllWatcherEvents
    )
  }

  if (addPlatformButton) {
    addPlatformButton.addEventListener(
      'click',
      addWatcherTransformPlatform
    )
  }

  if (addVariantButton) {
    addVariantButton.addEventListener(
      'click',
      addWatcherTransformVariant
    )
  }

  if (variantList) {
    variantList.addEventListener(
      'click',
      function (event) {
        const target = event.target

        if (!(target instanceof Element)) {
          return
        }

        const card = target.closest(
          '[data-watcher-variant-card]'
        )

        if (!card) return

        if (
          target.closest(
            '[data-clone-watcher-variant]'
          )
        ) {
          const cards = Array.from(
            variantList.querySelectorAll(
              '[data-watcher-variant-card]'
            )
          )

          const variants =
            getWatcherTransformVariants()

          const index = cards.indexOf(card)

          if (index >= 0 && variants[index]) {
            const copy = JSON.parse(
              JSON.stringify(variants[index])
            )

            copy.variantCode =
              copy.variantCode + '_COPY'

            copy.variantName =
              copy.variantName + ' 복사본'

            variants.splice(
              index + 1,
              0,
              copy
            )

            renderWatcherTransformVariants(
              variants
            )
          }

          return
        }

        if (
          target.closest(
            '[data-remove-watcher-variant]'
          )
        ) {
          const cards = Array.from(
            variantList.querySelectorAll(
              '[data-watcher-variant-card]'
            )
          )

          if (cards.length <= 1) return

          const variants =
            getWatcherTransformVariants()

          const index = cards.indexOf(card)

          if (index >= 0) {
            variants.splice(index, 1)
            renderWatcherTransformVariants(
              variants
            )
          }
        }
      }
    )
  }

  if (platformRows) {
    platformRows.addEventListener(
      'click',
      function (event) {
        const target = event.target

        if (!(target instanceof Element)) {
          return
        }

        const removeButton = target.closest(
          '[data-remove-watcher-platform]'
        )

        if (!removeButton) return

        const row = removeButton.closest(
          '[data-watcher-platform-row]'
        )

        if (row) {
          row.remove()

          setWatcherTransformPlatforms(
            getWatcherTransformPlatforms()
          )

          renderWatcherFinalReview()
        }
      }
    )

    platformRows.addEventListener(
      'change',
      function (event) {
        const target = event.target

        if (
          !(target instanceof Element) ||
          !target.matches(
            '[data-watcher-transform-platform]'
          )
        ) {
          return
        }

        const nextPlatform =
          String(target.value || '')
            .trim()
            .toLowerCase()

        const previousPlatform =
          String(
            target.getAttribute(
              'data-previous-platform'
            ) || ''
          )
            .trim()
            .toLowerCase()

        const rawPlatforms = Array.from(
          platformRows.querySelectorAll(
            '[data-watcher-transform-platform]'
          )
        ).map(function (select) {
          return String(select.value || '')
            .trim()
            .toLowerCase()
        })

        if (
          new Set(rawPlatforms).size !==
          rawPlatforms.length
        ) {
          target.value = previousPlatform

          setTransformStatus(
            '같은 플랫폼은 중복 선택할 수 없습니다.',
            'err'
          )

          return
        }

        const variants =
          getWatcherTransformVariants()

        variants.forEach(function (variant) {
          variant.platforms =
            variant.platforms.map(
              function (platform) {
                return (
                  platform === previousPlatform
                    ? nextPlatform
                    : platform
                )
              }
            )
        })

        target.setAttribute(
          'data-previous-platform',
          nextPlatform
        )

        renderWatcherTransformVariants(
          variants
        )

        setTransformStatus('', '')
        renderWatcherFinalReview()
      }
    )
  }

  if (saveTransformButton) {
    saveTransformButton.addEventListener(
      'click',
      saveWatcherTransform
    )
  }

  if (registerDraftButton) {
    registerDraftButton.addEventListener(
      'click',
      registerWatcherDraft
    )
  }

  if (imageList) {
    imageList.addEventListener(
      'click',
      function (event) {
        const target = event.target

        if (!(target instanceof Element)) {
          return
        }

        const storeButton =
          target.closest(
            '[data-watcher-image-store]'
          )

        if (
          storeButton &&
          imageList.contains(storeButton)
        ) {
          storeWatcherImage(
            storeButton.getAttribute(
              'data-watcher-image-store'
            )
          )

          return
        }

        const selectButton =
          target.closest(
            '[data-watcher-image-select]'
          )

        if (
          !selectButton ||
          !imageList.contains(selectButton)
        ) {
          return
        }

        selectWatcherImage(
          selectButton.getAttribute(
            'data-watcher-image-select'
          )
        )
      }
    )
  }

  if (privatePreviewButton) {
    privatePreviewButton.addEventListener(
      'click',
      loadWatcherPrivatePreview
    )
  }

       const finalReviewFieldIds = [
      'watcherTransformTitle',
      'watcherTransformPlatform',
      'watcherTransformEditionName',
      'watcherTransformGenre',
      'watcherTransformReleaseDate',
      'watcherTransformPreorderStart',
      'watcherTransformPreorderEnd',
      'watcherTransformCandidatePrice',
      'watcherTransformBonus',
      'watcherTransformBonusNote',
      'watcherTransformTrailer'
    ]

    finalReviewFieldIds.forEach(
      function (id) {
        const element = $(id)

        if (!element) return

        element.addEventListener(
          'input',
          renderWatcherFinalReview
        )

        element.addEventListener(
          'change',
          renderWatcherFinalReview
        )
      }
    )


  if (closeTransformButton) {
    closeTransformButton.addEventListener(
      'click',
      closeWatcherTransform
    )
  }

  if (cancelTransformButton) {
    cancelTransformButton.addEventListener(
      'click',
      closeWatcherTransform
    )
  }

  if (eventList) {
    eventList.addEventListener(
      'click',
      function (event) {
        const target = event.target

        if (!(target instanceof Element)) {
          return
        }
        const transformButton = target.closest(
          '[data-watcher-transform-open]'
        )

        if (
          transformButton &&
          eventList.contains(transformButton)
        ) {
          openWatcherTransform(
            transformButton.getAttribute(
              'data-watcher-transform-open'
            )
          )

          return
        }

        const groupButton = target.closest(
          '[data-watcher-event-group-read]'
        )

        if (
          groupButton &&
          eventList.contains(groupButton)
        ) {
          readWatcherEventGroup(
            groupButton.getAttribute(
              'data-event-date'
            ),
            groupButton.getAttribute(
              'data-watch-item-id'
            )
          )

          return
        }

        const eventButton = target.closest(
          '[data-watcher-event-read]'
        )

        if (
          eventButton &&
          eventList.contains(eventButton)
        ) {
          readWatcherEvent(
            eventButton.getAttribute(
              'data-watcher-event-read'
            )
          )
        }
      }
    )
  }


  if (watcherTab) {
    watcherTab.addEventListener(
      'click',
      function () {
        window.setTimeout(function () {
          if (isWatcherPanelActive()) {
            loadWatcher(false)
          }
        }, 0)
      }
    )
  }

  window.setTimeout(function () {
    if (isWatcherPanelActive()) {
      loadWatcher(false)
    }
  }, 100)
}

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      init
    )
  } else {
    init()
  }
})()
