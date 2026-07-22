// ============================================================
// 사전예약 V2 관리자 화면
// public/static/preorder-admin.js
// ============================================================

(function () {
  'use strict'

  const TOKEN_KEY = 'gpt_admin_token'

  const $ = function (id) {
    return document.getElementById(id)
  }

  let loaded = false
  let loading = false
  let saving = false

  let games = []
  let detail = null
  let imageCandidates = []

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  function fieldValue(id) {
    const element = $(id)

    return element
      ? String(element.value || '').trim()
      : ''
  }

  function setFieldValue(id, value) {
    const element = $(id)
    if (!element) return

    element.value =
      value == null ? '' : String(value)
  }

  function setStatus(message, type) {
    const element = $('preorderV2Status')
    if (!element) return

    element.textContent = message || ''
    element.className = 'admin-status'

    if (type) {
      element.classList.add(type)
    }
  }

  async function api(path, options) {
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
      headers.set(
        'Content-Type',
        'application/json'
      )
    }

    const response = await window.fetch(
      path,
      {
        ...requestOptions,
        headers
      }
    )

    let data = {}

    try {
      data = await response.json()
    } catch (error) {
      data = {}
    }

    if (
      !response.ok ||
      data.ok === false
    ) {
      throw new Error(
        data.error ||
        '요청에 실패했습니다. (' +
          response.status +
          ')'
      )
    }

    return data
  }

  function platformLabel(platform) {
    const labels = {
      pc: 'PC',
      ps5: 'PlayStation 5',
      ps4: 'PlayStation 4',
      xbox: 'Xbox',
      switch: 'Nintendo Switch',
      switch2: 'Nintendo Switch 2',
      etc: '기타'
    }

    return labels[platform] ||
      platform ||
      '플랫폼 미입력'
  }

  function variantKindLabel(kind) {
    const labels = {
      STANDARD: '통상판',
      DELUXE: '디럭스',
      ULTIMATE: '얼티밋',
      LIMITED: '한정판',
      COLLECTORS: '컬렉터스',
      OTHER: '기타'
    }

    return labels[kind] || kind || '기타'
  }

  function won(value) {
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

  function renderGames() {
    const select = $('preorderV2Game')
    const badge = $('preorderV2TabBadge')

    if (!select) return

    const currentValue = select.value

    let html =
      '<option value="">' +
        '게임을 선택해 주세요.' +
      '</option>'

    games.forEach(function (game) {
      html +=
        '<option value="' +
          escapeHtml(game.id) +
        '">' +
          '#' +
          escapeHtml(game.id) +
          ' · ' +
          escapeHtml(game.title) +
          ' · 에디션 ' +
          escapeHtml(
            Number(game.variant_count || 0)
          ) +
        '</option>'
    })

    select.innerHTML = html

    if (
      currentValue &&
      games.some(function (game) {
        return String(game.id) ===
          String(currentValue)
      })
    ) {
      select.value = currentValue
    }

    if (badge) {
      badge.textContent = String(
        games.length
      )

      badge.hidden = games.length < 1
    }
  }

  async function loadGames(force) {
    if (loading) return

    if (loaded && !force) {
      return
    }

    loading = true

    const button = $('refreshPreorderV2')

    if (button) {
      button.disabled = true
      button.textContent = '불러오는 중...'
    }

    setStatus(
      '비공개 DRAFT 게임을 불러오고 있습니다.',
      'info'
    )

    try {
      const data = await api(
        '/admin/api/preorders/games'
      )

      games = Array.isArray(data.games)
        ? data.games
        : []

      loaded = true
      renderGames()

      setStatus(
        '사전예약 V2 대상 게임 ' +
          games.length +
          '개를 불러왔습니다.',
        'ok'
      )
    } catch (error) {
      setStatus(
        error && error.message
          ? error.message
          : '게임 목록을 불러오지 못했습니다.',
        'err'
      )
    } finally {
      loading = false

      if (button) {
        button.disabled = false
        button.textContent = '새로고침'
      }
    }
  }

  function renderSources() {
    const select =
      $('preorderV2OfficialSource')

    if (!select) return

    const sources =
      detail &&
      Array.isArray(
        detail.officialSources
      )
        ? detail.officialSources
        : []

    let html =
      '<option value="">' +
        '공식 출처를 선택해 주세요.' +
      '</option>'

    sources.forEach(function (source) {
      html +=
        '<option value="' +
          escapeHtml(source.id) +
        '">' +
          escapeHtml(source.source_name) +
          ' · ' +
          escapeHtml(source.source_title) +
        '</option>'
    })

    select.innerHTML = html

    if (sources.length === 1) {
      select.value = String(
        sources[0].id
      )
    }
  }

  function resetForm() {
    const form = $('preorderV2Form')

    if (form) {
      form.reset()
    }

    setFieldValue(
      'preorderV2Platform',
      'switch'
    )

    setFieldValue(
      'preorderV2VariantKind',
      'STANDARD'
    )

    setFieldValue(
      'preorderV2PackageType',
      'PACKAGE'
    )

    setFieldValue(
      'preorderV2VariantCode',
      'STANDARD'
    )

    setFieldValue(
      'preorderV2VariantName',
      '통상판'
    )

    setFieldValue(
      'preorderV2DisplayOrder',
      '0'
    )

    setFieldValue(
      'preorderV2PreorderStatus',
      'UNKNOWN'
    )

    setFieldValue(
      'preorderV2PriceStatus',
      'UNCONFIRMED'
    )

    if ($('preorderV2IsDefault')) {
      $('preorderV2IsDefault').checked =
        true
    }

    if (detail && detail.game) {
      setFieldValue(
        'preorderV2ReleaseDate',
        detail.game.release_date || ''
      )
    }

    renderSources()

    imageCandidates = []
    renderImageCandidates([])

    const sources =
      detail &&
      Array.isArray(
        detail.officialSources
      )
        ? detail.officialSources
        : []

    if (sources.length === 1) {
      loadImageCandidates(
        sources[0].id,
        []
      )
    }
  }

  function renderExisting() {
    const container =
      $('preorderV2Existing')

    const section =
      $('preorderV2ExistingSection')

    if (!container || !section) return

    const variants =
      detail &&
      Array.isArray(detail.variants)
        ? detail.variants
        : []

    if (!variants.length) {
      section.hidden = false
      container.innerHTML =
        '<div class="admin-empty">' +
          '아직 등록된 상품 에디션이 없습니다.' +
        '</div>'
      return
    }

    let html = ''

    variants.forEach(function (variant) {
      const price =
        variant.price_status ===
          'CONFIRMED'
          ? variant.confirmed_price
          : variant.candidate_price

      html +=
        '<article class="preorder-v2-card">' +
          '<div class="preorder-v2-card-head">' +
            '<div>' +
              '<span class="preorder-v2-platform">' +
                escapeHtml(
                  platformLabel(
                    variant.platform
                  )
                ) +
              '</span>' +
              '<h3>' +
                escapeHtml(
                  variant.variant_name
                ) +
              '</h3>' +
            '</div>' +
            '<button ' +
              'type="button" ' +
              'class="btn btn-sm" ' +
              'data-preorder-v2-edit="' +
                escapeHtml(variant.id) +
              '">' +
              '수정' +
            '</button>' +
          '</div>' +

          '<div class="preorder-v2-badges">' +
            '<span>' +
              escapeHtml(
                variantKindLabel(
                  variant.variant_kind
                )
              ) +
            '</span>' +
            '<span>' +
              escapeHtml(
                variant.package_type
              ) +
            '</span>' +
            '<span>' +
              escapeHtml(
                variant.preorder_publish_status ||
                'DRAFT'
              ) +
            '</span>' +
          '</div>' +

          '<dl class="preorder-v2-card-meta">' +
            '<div>' +
              '<dt>출시일</dt>' +
              '<dd>' +
                escapeHtml(
                  variant.release_date || '-'
                ) +
              '</dd>' +
            '</div>' +
            '<div>' +
              '<dt>공식 가격</dt>' +
              '<dd>' +
                escapeHtml(won(price)) +
              '</dd>' +
            '</div>' +
            '<div>' +
              '<dt>예약 기간</dt>' +
              '<dd>' +
                escapeHtml(
                  (
                    variant.preorder_start_date ||
                    '-'
                  ) +
                  ' ~ ' +
                  (
                    variant.preorder_end_date ||
                    '-'
                  )
                ) +
              '</dd>' +
            '</div>' +
          '</dl>' +
        '</article>'
    })

    section.hidden = false
    container.innerHTML = html
  }

  async function loadGameDetail(gameId) {
    const normalizedId = Number(gameId)

    if (
      !Number.isInteger(normalizedId) ||
      normalizedId <= 0
    ) {
      detail = null

      if ($('preorderV2Editor')) {
        $('preorderV2Editor').hidden =
          true
      }

      if (
        $('preorderV2ExistingSection')
      ) {
        $('preorderV2ExistingSection')
          .hidden = true
      }

      return
    }

    setStatus(
      '게임의 플랫폼과 상품 에디션을 불러오고 있습니다.',
      'info'
    )

    try {
      const data = await api(
        '/admin/api/preorders/games/' +
          normalizedId
      )

      detail = data

      if ($('preorderV2Editor')) {
        $('preorderV2Editor').hidden =
          false
      }

      if ($('preorderV2GameTitle')) {
        $('preorderV2GameTitle')
          .textContent =
          '#' +
          data.game.id +
          ' · ' +
          data.game.title
      }

      if ($('preorderV2GameMeta')) {
        $('preorderV2GameMeta')
          .textContent =
          '상태 ' +
          data.game.publish_status +
          ' · 플랫폼 ' +
          (
            Array.isArray(data.editions)
              ? data.editions.length
              : 0
          ) +
          '개 · 상품 에디션 ' +
          (
            Array.isArray(data.variants)
              ? data.variants.length
              : 0
          ) +
          '개'
      }

      resetForm()
      renderExisting()

      setStatus(
        '게임 정보를 불러왔습니다.',
        'ok'
      )
    } catch (error) {
      setStatus(
        error && error.message
          ? error.message
          : '게임 정보를 불러오지 못했습니다.',
        'err'
      )
    }
  }

  function renderImageCandidates(
    selectedImages
  ) {
    const container =
      $('preorderV2Images')

    if (!container) return

    const selectedMap = new Map()

    ;(
      Array.isArray(selectedImages)
        ? selectedImages
        : []
    ).forEach(function (image) {
      selectedMap.set(
        Number(image.image_id),
        image
      )
    })

    const usableImages =
      imageCandidates.filter(
        function (image) {
          return (
            String(
              image.permission_status || ''
            ) === 'APPROVED' &&
            String(
              image.r2_object_key || ''
            ).trim()
          )
        }
      )

    if (!usableImages.length) {
      container.innerHTML =
        '<div class="admin-empty">' +
          '승인 후 비공개 R2에 저장된 이미지가 없습니다.' +
        '</div>'
      return
    }

    let html = ''

    usableImages.forEach(
      function (image, index) {
        const selected =
          selectedMap.get(
            Number(image.id)
          )

        const role = selected
          ? selected.display_role
          : (
              index === 0
                ? 'REPRESENTATIVE'
                : 'GALLERY'
            )

        const order = selected
          ? Number(
              selected.display_order || 0
            )
          : index

        html +=
          '<div class="preorder-v2-image-row">' +
            '<label class="preorder-v2-image-check">' +
              '<input ' +
                'type="checkbox" ' +
                'data-preorder-image-check ' +
                'data-image-id="' +
                  escapeHtml(image.id) +
                '" ' +
                (
                  selected
                    ? 'checked '
                    : ''
                ) +
              '/>' +
              '<span>' +
                '이미지 #' +
                escapeHtml(image.id) +
              '</span>' +
            '</label>' +

            '<div class="preorder-v2-image-info">' +
              '<b>' +
                escapeHtml(
                  image.image_type ||
                  'UNCLASSIFIED'
                ) +
              '</b>' +
              '<small>' +
                escapeHtml(
                  image.width || '?'
                ) +
                ' × ' +
                escapeHtml(
                  image.height || '?'
                ) +
                ' · R2 저장 완료' +
              '</small>' +
            '</div>' +

            '<select data-preorder-image-role>' +
              optionHtml(
                'REPRESENTATIVE',
                '대표 이미지',
                role
              ) +
              optionHtml(
                'PACKAGE',
                '패키지 이미지',
                role
              ) +
              optionHtml(
                'BONUS',
                '예약 특전 이미지',
                role
              ) +
              optionHtml(
                'CONTENTS',
                '구성품 이미지',
                role
              ) +
              optionHtml(
                'GALLERY',
                '갤러리',
                role
              ) +
            '</select>' +

            '<input ' +
              'type="number" ' +
              'data-preorder-image-order ' +
              'value="' +
                escapeHtml(order) +
              '" ' +
              'step="1" ' +
              'aria-label="이미지 표시 순서" ' +
            '/>' +
          '</div>'
      }
    )

    container.innerHTML = html
  }

  function optionHtml(
    value,
    label,
    selectedValue
  ) {
    return (
      '<option value="' +
        escapeHtml(value) +
        '"' +
        (
          value === selectedValue
            ? ' selected'
            : ''
        ) +
      '>' +
        escapeHtml(label) +
      '</option>'
    )
  }

  async function loadImageCandidates(
    sourceId,
    selectedImages
  ) {
    const source =
      detail &&
      Array.isArray(
        detail.officialSources
      )
        ? detail.officialSources.find(
            function (item) {
              return String(item.id) ===
                String(sourceId)
            }
          )
        : null

    if (!source) {
      imageCandidates = []
      renderImageCandidates([])
      return
    }

    const container =
      $('preorderV2Images')

    if (container) {
      container.innerHTML =
        '<div class="admin-empty">' +
          '이미지 후보를 불러오는 중입니다.' +
        '</div>'
    }

    try {
      const data = await api(
        '/admin/api/watcher/items/' +
          source.watch_item_id
      )

      imageCandidates =
        Array.isArray(data.images)
          ? data.images
          : []

      renderImageCandidates(
        selectedImages
      )
    } catch (error) {
      imageCandidates = []

      if (container) {
        container.innerHTML =
          '<div class="admin-empty">' +
            escapeHtml(
              error && error.message
                ? error.message
                : '이미지를 불러오지 못했습니다.'
            ) +
          '</div>'
      }
    }
  }

  async function editVariant(variantId) {
    if (
      !detail ||
      !Array.isArray(detail.variants)
    ) {
      return
    }

    const variant = detail.variants.find(
      function (item) {
        return String(item.id) ===
          String(variantId)
      }
    )

    if (!variant) return

    setFieldValue(
      'preorderV2Platform',
      variant.platform
    )

    setFieldValue(
      'preorderV2PlatformEditionName',
      variant.platform_edition_name
    )

    setFieldValue(
      'preorderV2VariantKind',
      variant.variant_kind
    )

    setFieldValue(
      'preorderV2PackageType',
      variant.package_type
    )

    setFieldValue(
      'preorderV2VariantCode',
      variant.variant_code
    )

    setFieldValue(
      'preorderV2VariantName',
      variant.variant_name
    )

    setFieldValue(
      'preorderV2DisplayOrder',
      variant.variant_display_order
    )

    if ($('preorderV2IsDefault')) {
      $('preorderV2IsDefault').checked =
        Number(variant.is_default) === 1
    }

    setFieldValue(
      'preorderV2OfficialSource',
      variant.official_source_id
    )

    setFieldValue(
      'preorderV2ReleaseDate',
      variant.release_date
    )

    setFieldValue(
      'preorderV2StartDate',
      variant.preorder_start_date
    )

    setFieldValue(
      'preorderV2EndDate',
      variant.preorder_end_date
    )

    setFieldValue(
      'preorderV2PreorderStatus',
      variant.preorder_status
    )

    setFieldValue(
      'preorderV2PriceStatus',
      variant.price_status
    )

    setFieldValue(
      'preorderV2CandidatePrice',
      variant.candidate_price
    )

    setFieldValue(
      'preorderV2ConfirmedPrice',
      variant.confirmed_price
    )

    setFieldValue(
      'preorderV2Contents',
      variant.contents_text
    )

    setFieldValue(
      'preorderV2Bonus',
      variant.preorder_bonus
    )

    setFieldValue(
      'preorderV2BonusNote',
      variant.preorder_bonus_note
    )

    const selectedImages =
      Array.isArray(detail.images)
        ? detail.images.filter(
            function (image) {
              return String(
                image.preorder_id
              ) === String(
                variant.preorder_id
              )
            }
          )
        : []

    await loadImageCandidates(
      variant.official_source_id,
      selectedImages
    )

    if ($('preorderV2Editor')) {
      $('preorderV2Editor')
        .scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
    }
  }

  function collectImages() {
    const rows = document.querySelectorAll(
      '.preorder-v2-image-row'
    )

    const images = []

    rows.forEach(function (row) {
      const checkbox = row.querySelector(
        '[data-preorder-image-check]'
      )

      if (!checkbox || !checkbox.checked) {
        return
      }

      const role = row.querySelector(
        '[data-preorder-image-role]'
      )

      const order = row.querySelector(
        '[data-preorder-image-order]'
      )

      images.push({
        imageId: Number(
          checkbox.getAttribute(
            'data-image-id'
          )
        ),
        displayRole: role
          ? role.value
          : 'GALLERY',
        displayOrder: order
          ? Number(order.value || 0)
          : 0,
        altText:
          fieldValue(
            'preorderV2VariantName'
          ) + ' 이미지'
      })
    })

    return images
  }

  async function saveVariant(event) {
    event.preventDefault()

    if (saving || !detail || !detail.game) {
      return
    }

    const button = $('savePreorderV2')

    const body = {
      platform:
        fieldValue(
          'preorderV2Platform'
        ),

      platformEditionName:
        fieldValue(
          'preorderV2PlatformEditionName'
        ),

      variantCode:
        fieldValue(
          'preorderV2VariantCode'
        ),

      variantName:
        fieldValue(
          'preorderV2VariantName'
        ),

      variantKind:
        fieldValue(
          'preorderV2VariantKind'
        ),

      packageType:
        fieldValue(
          'preorderV2PackageType'
        ),

      isDefault:
        $('preorderV2IsDefault')
          ? $('preorderV2IsDefault').checked
          : false,

      displayOrder:
        fieldValue(
          'preorderV2DisplayOrder'
        ),

      officialSourceId:
        fieldValue(
          'preorderV2OfficialSource'
        ),

      releaseDate:
        fieldValue(
          'preorderV2ReleaseDate'
        ),

      preorderStartDate:
        fieldValue(
          'preorderV2StartDate'
        ),

      preorderEndDate:
        fieldValue(
          'preorderV2EndDate'
        ),

      preorderStatus:
        fieldValue(
          'preorderV2PreorderStatus'
        ),

      priceStatus:
        fieldValue(
          'preorderV2PriceStatus'
        ),

      candidatePrice:
        fieldValue(
          'preorderV2CandidatePrice'
        ),

      confirmedPrice:
        fieldValue(
          'preorderV2ConfirmedPrice'
        ),

      contentsText:
        fieldValue(
          'preorderV2Contents'
        ),

      preorderBonus:
        fieldValue(
          'preorderV2Bonus'
        ),

      preorderBonusNote:
        fieldValue(
          'preorderV2BonusNote'
        ),

      images: collectImages()
    }

    saving = true

    if (button) {
      button.disabled = true
      button.textContent = '저장 중...'
    }

    setStatus(
      '상품 에디션과 예약판매 DRAFT를 저장하고 있습니다.',
      'info'
    )

    try {
      const data = await api(
        '/admin/api/preorders/games/' +
          detail.game.id +
          '/variants',
        {
          method: 'POST',
          body: JSON.stringify(body)
        }
      )

      const savedVariantId =
        data.variant &&
        data.variant.id

      await loadGameDetail(
        detail.game.id
      )

      if (savedVariantId) {
        await editVariant(
          savedVariantId
        )
      }

      loaded = false
      await loadGames(true)

      setStatus(
        '플랫폼·상품 에디션·예약판매 DRAFT를 저장했습니다.',
        'ok'
      )
    } catch (error) {
      setStatus(
        error && error.message
          ? error.message
          : 'DRAFT 저장에 실패했습니다.',
        'err'
      )
    } finally {
      saving = false

      if (button) {
        button.disabled = false
        button.textContent = 'DRAFT 저장'
      }
    }
  }

  function applyKindDefaults() {
    const kind = fieldValue(
      'preorderV2VariantKind'
    )

    const defaults = {
      STANDARD: '통상판',
      DELUXE: '디럭스 에디션',
      ULTIMATE: '얼티밋 에디션',
      LIMITED: '한정판',
      COLLECTORS: '컬렉터스 에디션',
      OTHER: '기타 에디션'
    }

    setFieldValue(
      'preorderV2VariantCode',
      kind
    )

    setFieldValue(
      'preorderV2VariantName',
      defaults[kind] || kind
    )

    if ($('preorderV2IsDefault')) {
      $('preorderV2IsDefault').checked =
        kind === 'STANDARD'
    }
  }

  function init() {
    const tab = document.querySelector(
      '[data-admin-tab="preorder-v2"]'
    )

    if (tab) {
      tab.addEventListener(
        'click',
        function () {
          loadGames(false)
        }
      )
    }

    const refresh =
      $('refreshPreorderV2')

    if (refresh) {
      refresh.addEventListener(
        'click',
        function () {
          loadGames(true)
        }
      )
    }

    const gameSelect =
      $('preorderV2Game')

    if (gameSelect) {
      gameSelect.addEventListener(
        'change',
        function () {
          loadGameDetail(
            gameSelect.value
          )
        }
      )
    }

    const sourceSelect =
      $('preorderV2OfficialSource')

    if (sourceSelect) {
      sourceSelect.addEventListener(
        'change',
        function () {
          loadImageCandidates(
            sourceSelect.value,
            []
          )
        }
      )
    }

    const resetButton =
      $('resetPreorderV2Form')

    if (resetButton) {
      resetButton.addEventListener(
        'click',
        resetForm
      )
    }

    const form =
      $('preorderV2Form')

    if (form) {
      form.addEventListener(
        'submit',
        saveVariant
      )
    }

    const kindSelect =
      $('preorderV2VariantKind')

    if (kindSelect) {
      kindSelect.addEventListener(
        'change',
        applyKindDefaults
      )
    }

    const existing =
      $('preorderV2Existing')

    if (existing) {
      existing.addEventListener(
        'click',
        function (event) {
          const button =
            event.target.closest(
              '[data-preorder-v2-edit]'
            )

          if (!button) return

          editVariant(
            button.getAttribute(
              'data-preorder-v2-edit'
            )
          )
        }
      )
    }
  }

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init
    )
  } else {
    init()
  }
})()
