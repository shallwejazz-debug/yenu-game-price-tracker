(function () {
  'use strict'

  const TOKEN_KEY = 'gpt_admin_token'
  const imageCache = new Map()

  let detail = null
  let reloadDetail = null
  let publishing = false
  let currentGameId = 0
  let imagesReady = false

  const byId = function (id) {
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

  function status(message, type) {
    const element = byId('preorderV2Status')
    if (!element) return

    element.textContent = message || ''
    element.className = 'admin-status'

    if (type) element.classList.add(type)
  }

  function platformLabel(value) {
    const labels = {
      pc: 'PC/Steam',
      ps5: 'PlayStation 5',
      ps4: 'PlayStation 4',
      xbox: 'Xbox',
      switch: 'Nintendo Switch',
      switch2: 'Nintendo Switch 2',
      etc: '기타'
    }

    return labels[value] || value || '플랫폼 미입력'
  }

  function roleLabel(value) {
    const labels = {
      REPRESENTATIVE: '대표',
      PACKAGE: '패키지',
      BONUS: '예약 특전',
      CONTENTS: '구성품',
      GALLERY: '갤러리'
    }

    return labels[value] || value || '이미지'
  }

  function numericPrice(value) {
    if (
      value &&
      typeof value === 'object'
    ) {
      const objectCandidates = [
        value.value,
        value.amount,
        value.price,
        value.confirmed_price,
        value.confirmedPrice
      ]

      for (
        const candidate of
        objectCandidates
      ) {
        const nested = numericPrice(
          candidate
        )

        if (nested > 0) return nested
      }

      return 0
    }

    const normalized = String(
      value == null ? '' : value
    ).replace(/[^\d.-]/g, '')

    const price = Number(normalized)

    return (
      Number.isFinite(price) &&
      price > 0
    )
      ? Math.round(price)
      : 0
  }

  function variantPrice(variant) {
    const candidates = [
      variant.confirmed_price,
      variant.confirmedPrice,
      variant.candidate_price,
      variant.candidatePrice,
      variant.price,
      variant.original_price,
      variant.originalPrice
    ]

    for (const candidate of candidates) {
      const price = numericPrice(candidate)

      if (price > 0) return price
    }

    return 0
  }

  function won(value) {
    const price = numericPrice(value)

    return price > 0
      ? '₩' + price.toLocaleString('ko-KR')
      : '가격 미정'
  }

  function parseExceptions(value) {
    if (!value) return {}
    if (typeof value === 'object') return value

    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object'
        ? parsed
        : {}
    } catch (error) {
      return {}
    }
  }

  function exceptionReason(value) {
    if (
      value &&
      typeof value === 'object'
    ) {
      return String(
        value.reason ||
        value.code ||
        value.resolution ||
        value.type ||
        ''
      ).trim()
    }

    return String(
      value == null ? '' : value
    ).trim()
  }

  function reasonLabel(value) {
    const labels = {
      OFFICIAL_UNANNOUNCED: '공식 미발표',
      SELLER_SPECIFIC: '판매처별 상이',
      LATER_UPDATE: '추후 입력',
      NOT_APPLICABLE: '공식 미제공',
      OFFICIAL_NOT_PROVIDED: '공식 미제공',
      UNTIL_STOCK: '재고 소진 시 종료',
      NO_FIXED_END: '별도 종료일 없음'
    }

    const reason = exceptionReason(value)

    return (
      labels[reason] ||
      reason ||
      '공식 출처 확인'
    )
  }

  function periodLabel(variant) {
    const exceptions = parseExceptions(
      variant.review_exceptions
    )

    const start =
      variant.preorder_start_date ||
      reasonLabel(
        exceptions.PREORDER_START_DATE
      )

    const end =
      variant.preorder_end_date ||
      reasonLabel(
        exceptions.PREORDER_END_DATE
      )

    return start + ' ~ ' + end
  }

  function bonusLabel(variant) {
    const bonus = String(
      variant.preorder_bonus || ''
    ).trim()

    if (bonus) return bonus

    const exceptions = parseExceptions(
      variant.review_exceptions
    )

    return reasonLabel(
      exceptions.PREORDER_BONUS
    )
  }

  function linkedImages(variant) {
    const images =
      detail && Array.isArray(detail.images)
        ? detail.images
        : []

    return images.filter(function (image) {
      return String(image.preorder_id) ===
        String(variant.preorder_id)
    })
  }

  function clearImageCache() {
    imageCache.forEach(function (entry) {
      if (entry && entry.url) {
        window.URL.revokeObjectURL(entry.url)
      }
    })

    imageCache.clear()
  }

  async function request(path, options) {
    const token =
      window.localStorage.getItem(TOKEN_KEY) || ''

    if (!token) {
      throw new Error(
        '관리자 토큰이 없습니다. 다시 로그인해 주세요.'
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

    return window.fetch(path, {
      ...requestOptions,
      headers,
      cache: 'no-store'
    })
  }

  async function loadImage(image) {
    const imageId = Number(image.image_id)
    const gameId = Number(detail.game.id)

    if (
      !Number.isInteger(imageId) ||
      imageId <= 0
    ) {
      throw new Error('이미지 ID가 올바르지 않습니다.')
    }

    const cached = imageCache.get(imageId)

    if (cached && cached.url) return cached

    if (cached && cached.promise) {
      return cached.promise
    }

    const promise = (async function () {
      const response = await request(
        '/admin/api/preorders/games/' +
          encodeURIComponent(gameId) +
          '/images/' +
          encodeURIComponent(imageId) +
          '/preview'
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
          '이미지 #' + imageId +
          ' 미리보기에 실패했습니다.'
        )
      }

      const blob = await response.blob()

      if (!blob.size) {
        throw new Error(
          '이미지 #' + imageId +
          '가 빈 파일입니다.'
        )
      }

      const url = window.URL.createObjectURL(blob)

      const entry = {
        url,
        size: blob.size,
        type: blob.type || 'image',
        imageId
      }

      imageCache.set(imageId, entry)
      return entry
    })()

    imageCache.set(imageId, { promise })

    try {
      return await promise
    } catch (error) {
      imageCache.delete(imageId)
      throw error
    }
  }

  function ensureModal() {
    let modal = byId('preorderPublishImageModal')

    if (modal) return modal

    modal = document.createElement('div')
    modal.id = 'preorderPublishImageModal'
    modal.className = 'preorder-publish-modal'
    modal.hidden = true

    modal.innerHTML =
      '<div class="preorder-publish-modal-card" ' +
        'role="dialog" aria-modal="true" ' +
        'aria-labelledby="preorderPublishModalTitle">' +
        '<div class="preorder-publish-modal-head">' +
          '<div>' +
            '<strong id="preorderPublishModalTitle">' +
              '이미지 미리보기' +
            '</strong>' +
            '<p id="preorderPublishModalMeta"></p>' +
          '</div>' +
          '<button type="button" ' +
            'id="closePreorderPublishModal" ' +
            'aria-label="닫기">×</button>' +
        '</div>' +
        '<div class="preorder-publish-modal-body">' +
          '<img id="preorderPublishModalImage" alt="" />' +
        '</div>' +
        '<div class="preorder-publish-modal-actions">' +
          '<button type="button" class="btn" ' +
            'id="openPreorderPublishImageTab">' +
            '새 탭에서 보기' +
          '</button>' +
          '<button type="button" class="btn btn-primary" ' +
            'id="closePreorderPublishModalBottom">' +
            '닫기' +
          '</button>' +
        '</div>' +
      '</div>'

    document.body.appendChild(modal)

    const close = function () {
      modal.hidden = true
      document.body.classList.remove(
        'preorder-publish-modal-open'
      )
    }

    byId('closePreorderPublishModal').onclick = close
    byId('closePreorderPublishModalBottom').onclick = close

    modal.addEventListener('click', function (event) {
      if (event.target === modal) close()
    })

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !modal.hidden) {
        close()
      }
    })

    return modal
  }

  async function openImage(image) {
    const modal = ensureModal()
    const modalImage =
      byId('preorderPublishModalImage')
    const meta = byId('preorderPublishModalMeta')
    const openTab =
      byId('openPreorderPublishImageTab')

    try {
      const entry = await loadImage(image)
      const role = roleLabel(image.display_role)
      const sizeText =
        entry.size >= 1024 * 1024
          ? (entry.size / (1024 * 1024))
              .toFixed(2) + ' MB'
          : (entry.size / 1024)
              .toFixed(1) + ' KB'

      modalImage.src = entry.url
      modalImage.alt =
        role + ' 이미지 #' + entry.imageId

      meta.textContent =
        role + ' #' + entry.imageId +
        ' · ' + entry.type +
        ' · ' + sizeText +
        (
          image.width && image.height
            ? ' · ' + image.width +
              ' × ' + image.height
            : ''
        )

      openTab.onclick = function () {
        window.open(
          entry.url,
          '_blank',
          'noopener,noreferrer'
        )
      }

      modal.hidden = false
      document.body.classList.add(
        'preorder-publish-modal-open'
      )
    } catch (error) {
      status(
        error.message ||
          '이미지 미리보기에 실패했습니다.',
        'err'
      )
    }
  }

  function imageHtml(image) {
    return (
      '<button type="button" ' +
        'class="preorder-publish-image" ' +
        'data-publish-preview-image="' +
          escapeHtml(image.image_id) +
        '" title="클릭하여 크게 보기">' +
        '<span class="preorder-publish-image-frame">' +
          '<img data-publish-thumbnail="' +
            escapeHtml(image.image_id) +
          '" alt="' +
            escapeHtml(
              roleLabel(image.display_role) +
              ' 이미지 #' + image.image_id
            ) +
          '" loading="lazy" />' +
          '<span data-publish-thumbnail-state="' +
            escapeHtml(image.image_id) +
          '">불러오는 중…</span>' +
        '</span>' +
        '<b>' +
          escapeHtml(roleLabel(image.display_role)) +
          ' #' + escapeHtml(image.image_id) +
        '</b>' +
      '</button>'
    )
  }

  function cardHtml(variant) {
    const images = linkedImages(variant)

    return (
      '<article class="preorder-publish-card">' +
        '<div class="preorder-publish-card-head">' +
          '<div>' +
            '<span>' +
              escapeHtml(
                platformLabel(variant.platform)
              ) +
            '</span>' +
            '<h4>' +
              escapeHtml(variant.variant_name) +
            '</h4>' +
          '</div>' +
          '<strong>' +
            escapeHtml(
              won(variantPrice(variant))
            ) +
          '</strong>' +
        '</div>' +

        '<div class="preorder-publish-images">' +
          images.map(imageHtml).join('') +
        '</div>' +

        '<dl class="preorder-publish-meta">' +
          '<div><dt>출시일</dt><dd>' +
            escapeHtml(variant.release_date || '-') +
          '</dd></div>' +
          '<div><dt>예약 기간</dt><dd>' +
            escapeHtml(periodLabel(variant)) +
          '</dd></div>' +
          '<div><dt>예약 특전</dt><dd>' +
            escapeHtml(bonusLabel(variant)) +
          '</dd></div>' +
          '<div><dt>형태</dt><dd>' +
            escapeHtml(
              (variant.variant_kind || '-') +
              ' · ' +
              (variant.package_type || '-')
            ) +
          '</dd></div>' +
        '</dl>' +

        '<p class="preorder-publish-card-state">' +
          '✓ 검토 승인 완료 · 비공개' +
        '</p>' +
      '</article>'
    )
  }

  function lockApprovedEditing() {
    const lockIds = [
      'preorderV2BulkImages',
      'preorderV2ReviewPreparation',
      'preorderV2BenefitSection',
      'preorderV2IndividualEditor'
    ]

    lockIds.forEach(function (id) {
      const element = byId(id)

      if (element) {
        const lockTarget =
          element.closest(
            '.preorder-v2-section'
          ) || element

        lockTarget.hidden = true
        lockTarget.setAttribute(
          'data-approved-locked',
          'true'
        )
      }
    })

    const individualEditor =
      byId('preorderV2IndividualEditor')

    if (individualEditor) {
      const summary =
        individualEditor.querySelector(
          'summary'
        )

      if (summary) {
        summary.textContent =
          '승인 완료 · 에디션 편집 잠금'
      }

      individualEditor.hidden = true
    }

    document
      .querySelectorAll(
        '[data-preorder-v2-edit], ' +
        '[data-preorder-v2-publish], ' +
        '[data-preorder-v2-approve]'
      )
      .forEach(function (button) {
        button.disabled = true
        button.removeAttribute(
          'data-preorder-v2-publish'
        )
      })

    const meta = byId('preorderV2GameMeta')

    if (meta && detail && detail.game) {
      const platforms = new Set(
        detail.variants.map(function (variant) {
          return variant.platform
        })
      )

      meta.textContent =
        '검토 승인 완료 · 비공개 · 플랫폼 ' +
        platforms.size +
        '개 · 상품 에디션 ' +
        detail.variants.length +
        '개'
    }
  }

  async function hydrateThumbnails(images) {
    imagesReady = false

    const unique = Array.from(
      new Map(
        images.map(function (image) {
          return [Number(image.image_id), image]
        })
      ).values()
    )

    const results = await Promise.allSettled(
      unique.map(async function (image) {
        const entry = await loadImage(image)
        const imageId = Number(image.image_id)

        document
          .querySelectorAll(
            '[data-publish-thumbnail="' +
              imageId + '"]'
          )
          .forEach(function (element) {
            element.src = entry.url
          })

        document
          .querySelectorAll(
            '[data-publish-thumbnail-state="' +
              imageId + '"]'
          )
          .forEach(function (element) {
            element.hidden = true
          })

        return entry
      })
    )

    const failures = results.filter(function (result) {
      return result.status === 'rejected'
    })

    imagesReady =
      unique.length > 0 &&
      failures.length === 0

    const button = byId('publishAllPreorderV2')

    if (button) {
      button.disabled = !imagesReady || publishing
    }

    const imageStatus =
      byId('preorderPublishImageStatus')

    if (imageStatus) {
      imageStatus.textContent = imagesReady
        ? '✓ 연결 이미지 ' + unique.length +
          '개를 비공개 R2에서 확인했습니다.'
        : '이미지 ' + failures.length +
          '개를 불러오지 못했습니다. 전체 공개가 잠겼습니다.'

      imageStatus.className =
        'admin-status ' +
        (imagesReady ? 'ok' : 'err')
    }
  }

  async function publishAll() {
    if (
      publishing ||
      !imagesReady ||
      !detail ||
      !detail.game
    ) {
      return
    }

    const variants = detail.variants || []
    const gameTitle = String(
      detail.game.title || ''
    )

    const typed = window.prompt(
      '전체 공개 최종 확인\n\n' +
      '게임: ' + gameTitle + '\n' +
      '대상: ' + variants.length +
      '개 에디션\n\n' +
      '확인하려면 게임명을 정확히 입력하세요.'
    )

    if (typed === null) return

    if (typed.trim() !== gameTitle) {
      status(
        '게임명이 일치하지 않아 전체 공개를 취소했습니다.',
        'err'
      )
      return
    }

    const confirmed = window.confirm(
      '정말 전체 공개할까요?\n\n' +
      '게임: ' + gameTitle + '\n' +
      '대상: ' + variants.length +
      '개 에디션\n\n' +
      '모든 항목을 서버에서 다시 검증하며, ' +
      '한 항목이라도 실패하면 공개를 중단합니다.'
    )

    if (!confirmed) return

    publishing = true

    const button = byId('publishAllPreorderV2')

    if (button) {
      button.disabled = true
      button.textContent = '전체 공개 처리 중…'
    }

    status(
      '전체 에디션을 다시 검증하고 공개하고 있습니다. 새로고침하지 마세요.',
      'info'
    )

    try {
      const response = await request(
        '/admin/api/preorders/games/' +
          encodeURIComponent(detail.game.id) +
          '/publish/bulk',
        {
          method: 'POST',
          body: JSON.stringify({
            expected_count: variants.length,
            confirmation_title: gameTitle
          })
        }
      )

      let data = {}

      try {
        data = await response.json()
      } catch (error) {
        data = {}
      }

      if (!response.ok || data.ok === false) {
        const blocked = Array.isArray(data.blocked)
          ? data.blocked.map(function (item) {
              return (
                item.variant_name + ': ' +
                (
                  Array.isArray(item.reasons)
                    ? item.reasons.join(', ')
                    : '확인 필요'
                )
              )
            }).join('\n')
          : ''

        throw new Error(
          (data.error || '전체 공개에 실패했습니다.') +
          (blocked ? '\n' + blocked : '')
        )
      }

      status(
        '✓ 전체 공개 완료 · ' +
        Number(data.published_count || 0) +
        '개 에디션 · 공개 시각 ' +
        String(data.published_at || ''),
        'ok'
      )

      if (typeof reloadDetail === 'function') {
        await reloadDetail(detail.game.id)
      }
    } catch (error) {
      status(
        error.message ||
          '전체 공개에 실패했습니다.',
        'err'
      )

      if (button) {
        button.disabled = !imagesReady
        button.textContent = '전체 공개'
      }
    } finally {
      publishing = false
    }
  }

  function ensureSection() {
    let section =
      byId('preorderV2PublishPreviewSection')

    if (section) return section

    const reviewSection =
      byId('preorderV2BulkReviewSection')

    if (!reviewSection) return null

    section = document.createElement('section')
    section.id = 'preorderV2PublishPreviewSection'
    section.className =
      'preorder-v2-section preorder-publish-section'
    section.hidden = true

    reviewSection.insertAdjacentElement(
      'afterend',
      section
    )

    section.addEventListener(
      'click',
      function (event) {
        const target =
          event.target instanceof Element
            ? event.target.closest(
                '[data-publish-preview-image]'
              )
            : null

        if (!target) return

        const imageId = Number(
          target.getAttribute(
            'data-publish-preview-image'
          )
        )

        const image = detail.images.find(
          function (item) {
            return Number(item.image_id) ===
              imageId
          }
        )

        if (image) openImage(image)
      }
    )

    return section
  }

  function render(nextDetail, reload) {
    detail = nextDetail || null
    reloadDetail =
      typeof reload === 'function'
        ? reload
        : null

    const section = ensureSection()

    if (
      !section ||
      !detail ||
      !detail.game ||
      !Array.isArray(detail.variants)
    ) {
      if (section) section.hidden = true
      return
    }

    const gameId = Number(detail.game.id)

    if (currentGameId !== gameId) {
      clearImageCache()
      currentGameId = gameId
    }

    const variants = detail.variants
    const total = variants.length

    const approved = variants.filter(
      function (variant) {
        return String(
          variant.preorder_publish_status || ''
        ).toUpperCase() === 'APPROVED'
      }
    )

    const published = variants.filter(
      function (variant) {
        return String(
          variant.preorder_publish_status || ''
        ).toUpperCase() === 'PUBLISHED'
      }
    )

    const allApproved =
      total > 0 && approved.length === total

    const allPublished =
      total > 0 && published.length === total

    if (!allApproved && !allPublished) {
      section.hidden = true
      return
    }

    lockApprovedEditing()
    section.hidden = false

    if (allPublished) {
      section.innerHTML =
        '<div class="preorder-publish-complete">' +
          '<strong>7단계 · 전체 공개 완료</strong>' +
          '<p>전체 ' + total +
          '개 에디션이 사용자 사이트에 공개되었습니다.</p>' +
        '</div>' +
        '<div class="preorder-publish-grid">' +
          variants.map(cardHtml).join('') +
        '</div>'

      return
    }

    const images = Array.isArray(detail.images)
      ? detail.images
      : []

    section.innerHTML =
      '<div class="admin-section-head">' +
        '<div>' +
          '<h3>👁 6단계 · 실제 화면 최종 미리보기</h3>' +
          '<p class="admin-hint">' +
            '사용자에게 공개될 가격·출시일·예약 기간·특전·이미지를 확인합니다.' +
          '</p>' +
        '</div>' +
        '<span class="preorder-publish-private">' +
          '검토 승인 완료 · 비공개' +
        '</span>' +
      '</div>' +

      '<div class="preorder-publish-summary">' +
        '<span>게임 <b>' +
          escapeHtml(detail.game.title) +
        '</b></span>' +
        '<span>공개 대상 <b>' +
          total + '개</b></span>' +
        '<span>플랫폼 <b>' +
          new Set(
            variants.map(function (variant) {
              return variant.platform
            })
          ).size +
          '개</b></span>' +
      '</div>' +

      '<div class="preorder-publish-grid">' +
        variants.map(cardHtml).join('') +
      '</div>' +

      '<p id="preorderPublishImageStatus" ' +
        'class="admin-status info">' +
        '비공개 R2 이미지를 확인하고 있습니다.' +
      '</p>' +

      '<div class="preorder-publish-actions">' +
        '<div>' +
          '<b>7단계 · 전체 공개</b>' +
          '<p>서버가 전체 항목과 R2 이미지를 다시 검증한 후 한 번에 공개합니다.</p>' +
        '</div>' +
        '<button type="button" ' +
          'id="publishAllPreorderV2" ' +
          'class="btn btn-primary" disabled>' +
          '이미지 확인 중…' +
        '</button>' +
      '</div>'

    const publishButton =
      byId('publishAllPreorderV2')

    if (publishButton) {
      publishButton.onclick = publishAll
      publishButton.textContent = '전체 공개'
    }

    hydrateThumbnails(images)
  }

  function install() {
    const workflow =
      window.preorderBenefitWorkflow

    if (!workflow || workflow.__publishWrapped) {
      return
    }

    const originalRender = workflow.render

    workflow.render = function (
      nextDetail,
      reload
    ) {
      originalRender(nextDetail, reload)
      render(nextDetail, reload)
    }

    workflow.__publishWrapped = true
  }

  install()

  window.addEventListener(
    'beforeunload',
    clearImageCache
  )
})()