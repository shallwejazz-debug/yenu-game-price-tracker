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
      const url = new URL(String(value || ''), window.location.origin)

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
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
      element.textContent = String(value == null ? 0 : value)
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
    button.textContent = busy ? '불러오는 중...' : '새로고침'
  }

  async function watcherApi(path) {
    const token = localStorage.getItem(TOKEN_KEY) || ''

    const response = await fetch(path, {
      method: 'GET',
      headers: {
        'X-Admin-Token': token
      }
    })

    let data

    try {
      data = await response.json()
    } catch (error) {
      throw new Error('WATCHER 응답을 읽을 수 없습니다.')
    }

    if (response.status === 401) {
      throw new Error('관리자 인증이 만료되었습니다.')
    }

    if (!response.ok || !data || data.ok === false) {
      throw new Error(
        data && (data.error || data.message)
          ? data.error || data.message
          : 'WATCHER 요청에 실패했습니다.'
      )
    }

    return data
  }

  function permissionInfo(status) {
    const normalized = String(status || 'PENDING').toUpperCase()

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

  function renderSummary(summary) {
    const data = summary || {}

    setText('watcherEnabledSources', data.enabled_sources || 0)
    setText('watcherDiscoveredItems', data.discovered_items || 0)
    setText('watcherTransformedItems', data.transformed_items || 0)
    setText('watcherReviewingItems', data.reviewing_items || 0)
    setText(
      'watcherPendingPermissions',
      data.pending_permissions || 0
    )
    setText('watcherUnreadEvents', data.unread_events || 0)

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
                    String(source.collection_mode || 'manual')
                      .toUpperCase()
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
                    booleanLabel(source.local_storage_allowed)
                  ) +
                '</dd>' +
              '</div>' +

              '<div>' +
                '<dt>리사이즈</dt>' +
                '<dd>' +
                  escapeHtml(booleanLabel(source.resize_allowed)) +
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
          '다음 단계에서 수집기를 연결하면 여기에 자동으로 표시됩니다.' +
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
                  escapeHtml(item.source_name || item.source_key) +
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
                escapeHtml(item.title || item.raw_title || '제목 없음') +
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
    setStatus('WATCHER 현황을 불러오는 중입니다.', 'info')

    try {
      const results = await Promise.all([
        watcherApi('/admin/api/watcher/summary'),
        watcherApi('/admin/api/watcher/sources'),
        watcherApi('/admin/api/watcher/items?limit=50')
      ])

      renderSummary(results[0].summary)
      renderSources(results[1].sources)
      renderItems(results[2].items)

      watcherLoaded = true
      setStatus('WATCHER 현황을 불러왔습니다.', 'ok')
    } catch (error) {
      setStatus(error.message, 'err')

      if ($('watcherSourceList')) {
        $('watcherSourceList').innerHTML =
          '<div class="admin-empty">' +
            escapeHtml(error.message) +
          '</div>'
      }

      if ($('watcherItemList')) {
        $('watcherItemList').innerHTML =
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
    const watcherTab = document.querySelector(
      '[data-admin-tab="watcher"]'
    )

    if (refreshButton) {
      refreshButton.addEventListener('click', function () {
        loadWatcher(true)
      })
    }

    if (watcherTab) {
      watcherTab.addEventListener('click', function () {
        window.setTimeout(function () {
          if (isWatcherPanelActive()) {
            loadWatcher(false)
          }
        }, 0)
      })
    }

    window.setTimeout(function () {
      if (isWatcherPanelActive()) {
        loadWatcher(false)
      }
    }, 100)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
