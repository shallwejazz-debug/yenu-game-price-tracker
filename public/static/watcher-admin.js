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

function renderEvents(events) {
  const container = $('watcherEventList')
  if (!container) return

  if (!Array.isArray(events) || !events.length) {
    container.innerHTML =
      '<div class="admin-empty">' +
        '표시할 WATCHER 이벤트가 없습니다.' +
      '</div>'

    return
  }

  container.innerHTML = events
    .map(function (event) {
      const info = eventInfo(event.event_type)
      const isRead = Number(event.is_read) === 1
      const articleUrl = safeUrl(event.source_url)

      const linkHtml = articleUrl
        ? '<a class="watcher-event-link" href="' +
            escapeHtml(articleUrl) +
            '" target="_blank" rel="noopener noreferrer">' +
            '공식 원문 ↗' +
          '</a>'
        : ''

      const readButton = !isRead
        ? '<button type="button" ' +
            'class="btn btn-sm watcher-event-read" ' +
            'data-watcher-event-read="' +
            escapeHtml(event.id) +
            '">' +
            '읽음' +
          '</button>'
        : '<span class="watcher-event-read-label">' +
            '읽음' +
          '</span>'

      return (
        '<article class="watcher-event-card' +
          (isRead ? ' is-read' : '') +
        '">' +
          '<div class="watcher-event-main">' +
            '<div class="watcher-event-top">' +
              '<span class="watcher-badge watcher-event-' +
                escapeHtml(info.className) +
              '">' +
                escapeHtml(info.label) +
              '</span>' +

              (event.source_name
                ? '<span class="watcher-event-source">' +
                    escapeHtml(event.source_name) +
                  '</span>'
                : '') +

              (!isRead
                ? '<span class="watcher-event-unread">' +
                    'NEW' +
                  '</span>'
                : '') +
            '</div>' +

            '<strong class="watcher-event-title">' +
              escapeHtml(event.title || '제목 없음') +
            '</strong>' +

            (event.message
              ? '<p class="watcher-event-message">' +
                  escapeHtml(event.message) +
                '</p>'
              : '') +

            '<div class="watcher-event-meta">' +
              '<span>' +
                escapeHtml(event.created_at || '-') +
              '</span>' +
              linkHtml +
            '</div>' +
          '</div>' +

          '<div class="watcher-event-action">' +
            readButton +
          '</div>' +
        '</article>'
      )
    })
    .join('')
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
      renderEvents(results[3].events)

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

  if (eventList) {
    eventList.addEventListener(
      'click',
      function (event) {
        const target = event.target

        if (!(target instanceof Element)) {
          return
        }

        const button = target.closest(
          '[data-watcher-event-read]'
        )

        if (!button || !eventList.contains(button)) {
          return
        }

        readWatcherEvent(
          button.getAttribute(
            'data-watcher-event-read'
          )
        )
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
