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
        '/admin/api/watcher/collect/arc-system-works',
        {
          method: 'POST'
        }
      )

      const result = data.result || {}

      watcherLoaded = false
      await loadWatcher(true)

      setStatus(
        '아크 수집 완료 — ' +
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

    setTransformStatus('', '')
    setTransformImageStatus('', '')
    setRegisterDraftButton('', null)
    clearWatcherPrivatePreview(true)


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
    const privatePreviewButton =
    $('loadWatcherPrivatePreview')


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
        draft.title || item.title || ''
      )

      setTransformValue(
        'watcherTransformPlatform',
        draft.platform || 'switch'
      )

      setTransformValue(
        'watcherTransformEditionName',
        draft.editionName || ''
      )

      setTransformValue(
        'watcherTransformGenre',
        draft.genre || ''
      )

      setTransformValue(
        'watcherTransformReleaseDate',
        draft.releaseDate || ''
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
        draft.trailerUrl || ''
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

    const payload = {
      title: value(
        'watcherTransformTitle'
      ),

      platform: value(
        'watcherTransformPlatform'
      ),

      editionName: value(
        'watcherTransformEditionName'
      ),

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
      'games와 editions에 DRAFT 상태로 저장됩니다.\n' +
      '공개 사이트에는 표시되지 않으며 이미지도 등록하지 않습니다.'
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
  const refreshButton = $('refreshWatcher')
  const collectArcButton = $('collectArcWatcher')

  const markAllEventsButton =
    $('markAllWatcherEventsRead')

  const eventList = $('watcherEventList')

  const imageList =
    $('watcherTransformImageList')

  const saveTransformButton =
    $('saveWatcherTransform')


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
