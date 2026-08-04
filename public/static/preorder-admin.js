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
  let approving = false
  let publishing = false
  let bulkImageSaving = false
  let reviewPreparationSaving = false

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

  function parseClientReviewExceptions(
    value
  ) {
    if (!value) return {}

    if (typeof value === 'object') {
      return value || {}
    }

    try {
      const parsed = JSON.parse(value)

      return (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      )
        ? parsed
        : {}
    } catch (error) {
      return {}
    }
  }

  function reviewReasonLabel(reason) {
    const labels = {
      OFFICIAL_UNANNOUNCED:
        '공식 미발표',
      SELLER_SPECIFIC:
        '판매처별 상이',
      LATER_UPDATE:
        '추후 입력',
      NOT_APPLICABLE:
        '해당 없음',
      UNTIL_STOCK:
        '재고 소진 시 종료',
      NO_FIXED_END:
        '별도 종료일 없음'
    }

    return labels[reason] ||
      reason ||
      '사유 미입력'
  }

  function variantReviewState(variant) {
    const reasons = []

    const exceptions =
      parseClientReviewExceptions(
        variant.review_exceptions
      )

    const startException =
      exceptions.PREORDER_START_DATE

    const endException =
      exceptions.PREORDER_END_DATE

    const bonusException =
      exceptions.PREORDER_BONUS

    if (!variant.release_date) {
      reasons.push('출시일 미입력')
    }

    if (
      !variant.preorder_start_date &&
      !startException
    ) {
      reasons.push(
        '예약 시작일 또는 미입력 사유 필요'
      )
    }

    if (
      !variant.preorder_end_date &&
      !endException
    ) {
      reasons.push(
        '예약 종료일 또는 미입력 사유 필요'
      )
    }

    if (
      !String(
        variant.preorder_bonus || ''
      ).trim() &&
      !bonusException
    ) {
      reasons.push(
        '예약특전 또는 처리 사유 필요'
      )
    }

    const preorderStatus = String(
      variant.preorder_status || 'UNKNOWN'
    ).toUpperCase()

    if (
      preorderStatus === 'UNKNOWN' ||
      preorderStatus === 'CANCELLED'
    ) {
      reasons.push('예약판매 상태 확인 필요')
    }

    const sources =
      detail &&
      Array.isArray(
        detail.officialSources
      )
        ? detail.officialSources
        : []

    const source = sources.find(
      function (item) {
        return String(item.id) ===
          String(
            variant.official_source_id
          )
      }
    )

    if (
      !source ||
      !String(
        source.official_source_url || ''
      ).trim()
    ) {
      reasons.push('공식 출처 확인 필요')
    }

    const linkedImages =
      detail &&
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

    const representativeImages =
      linkedImages.filter(
        function (image) {
          return (
            image.display_role ===
            'REPRESENTATIVE'
          )
        }
      )

    if (
      linkedImages.length < 1 ||
      representativeImages.length !== 1
    ) {
      reasons.push('대표 이미지 확인 필요')
    }

    const invalidImage =
      linkedImages.some(
        function (image) {
          return (
            String(
              image.permission_status || ''
            ).toUpperCase() !==
              'APPROVED' ||
            !String(
              image.stored_url ||
              image.stored_image_url ||
              ''
            ).trim()
          )
        }
      )

    if (invalidImage) {
      reasons.push('이미지 승인·저장 확인 필요')
    }

    if (
      variant.price_status ===
        'CONFIRMED' &&
      Number(variant.confirmed_price) <= 0
    ) {
      reasons.push('확정 가격 확인 필요')
    }

    if (
      variant.price_status ===
        'CANDIDATE' &&
      Number(variant.candidate_price) <= 0
    ) {
      reasons.push('가격 후보 확인 필요')
    }

    return {
      ready: reasons.length === 0,
      reasons: reasons,
      startLabel:
        variant.preorder_start_date ||
        (
          startException
            ? reviewReasonLabel(
                startException.reason
              )
            : '확인 필요'
        ),
      endLabel:
        variant.preorder_end_date ||
        (
          endException
            ? reviewReasonLabel(
                endException.reason
              )
            : '확인 필요'
        )
    }
  }

  function variantReviewStatusHtml(
    variant
  ) {
    const state =
      variantReviewState(variant)

    if (state.ready) {
      return (
        '<div ' +
          'style="' +
            'margin-top:10px;' +
            'padding:9px 11px;' +
            'border-radius:10px;' +
            'background:rgba(34,197,94,.10);' +
            'color:#86efac;' +
            'font-size:12px' +
          '">' +
          '✓ 검토 준비 완료' +
        '</div>'
      )
    }

    return (
      '<div ' +
        'style="' +
          'margin-top:10px;' +
          'padding:9px 11px;' +
          'border-radius:10px;' +
          'background:rgba(245,158,11,.10);' +
          'color:#fbbf24;' +
          'font-size:12px' +
        '">' +
        '△ 확인 필요 · ' +
        escapeHtml(
          state.reasons.join(' · ')
        ) +
      '</div>'
    )
  }

  function commonExceptionReason(
    variants,
    field
  ) {
    const reasons = variants.map(
      function (variant) {
        const exceptions =
          parseClientReviewExceptions(
            variant.review_exceptions
          )

        return exceptions[field]
          ? exceptions[field].reason
          : ''
      }
    )

    if (
      reasons.length > 0 &&
      reasons.every(
        function (reason) {
          return (
            reason &&
            reason === reasons[0]
          )
        }
      )
    ) {
      return reasons[0]
    }

    return ''
  }

  function commonDateValue(
    variants,
    field
  ) {
    const values = variants.map(
      function (variant) {
        return String(
          variant[field] || ''
        )
      }
    )

    if (
      values.length > 0 &&
      values[0] &&
      values.every(
        function (value) {
          return value === values[0]
        }
      )
    ) {
      return values[0]
    }

    return ''
  }

  function toggleReviewDateFields() {
    const startResolution =
      fieldValue(
        'preorderV2ReviewStartResolution'
      )

    const endResolution =
      fieldValue(
        'preorderV2ReviewEndResolution'
      )

    const startDate =
      $('preorderV2ReviewStartDate')

    const endDate =
      $('preorderV2ReviewEndDate')

    if (startDate) {
      startDate.hidden =
        startResolution !== 'DATE'

      startDate.disabled =
        startResolution !== 'DATE'
    }

    if (endDate) {
      endDate.hidden =
        endResolution !== 'DATE'

      endDate.disabled =
        endResolution !== 'DATE'
    }
  }

  function renderReviewPreparation() {
    const panel =
      $('preorderV2ReviewPreparation')

    if (!panel) return

    const variants =
      detail &&
      Array.isArray(detail.variants)
        ? detail.variants.filter(
            function (variant) {
              return (
                String(
                  variant
                    .preorder_publish_status ||
                  'DRAFT'
                ).toUpperCase() ===
                  'DRAFT'
              )
            }
          )
        : []

    if (!variants.length) {
      panel.hidden = true
      return
    }

    panel.hidden = false

    const total = variants.length

    const releaseReady =
      variants.filter(
        function (variant) {
          return Boolean(
            variant.release_date
          )
        }
      ).length

    const imageReady =
      variants.filter(
        function (variant) {
          const state =
            variantReviewState(variant)

          return !state.reasons.some(
            function (reason) {
              return (
                reason.includes('이미지')
              )
            }
          )
        }
      ).length

    const startReady =
      variants.filter(
        function (variant) {
          const state =
            variantReviewState(variant)

          return (
            state.startLabel !==
            '확인 필요'
          )
        }
      ).length

    const endReady =
      variants.filter(
        function (variant) {
          const state =
            variantReviewState(variant)

          return (
            state.endLabel !==
            '확인 필요'
          )
        }
      ).length

    const statusReady =
      variants.filter(
        function (variant) {
          const status = String(
            variant.preorder_status ||
            'UNKNOWN'
          ).toUpperCase()

          return (
            status !== 'UNKNOWN' &&
            status !== 'CANCELLED'
          )
        }
      ).length

    const benefitReady =
      variants.filter(
        function (variant) {
          return Boolean(
            window.preorderBenefitWorkflow &&
            window.preorderBenefitWorkflow
              .benefitReady(variant)
          )
        }
      ).length

    const reviewReady =
      variants.filter(
        function (variant) {
          return variantReviewState(
            variant
          ).ready
        }
      ).length

    const setText = function (
      id,
      value
    ) {
      const element = $(id)

      if (element) {
        element.textContent = value
      }
    }

    setText(
      'preorderV2ReviewReleaseSummary',
      releaseReady + '/' + total
    )

    setText(
      'preorderV2ReviewImageSummary',
      imageReady + '/' + total
    )

    setText(
      'preorderV2ReviewStartSummary',
      startReady + '/' + total
    )

    setText(
      'preorderV2ReviewEndSummary',
      endReady + '/' + total
    )

    setText(
      'preorderV2ReviewStatusSummary',
      statusReady + '/' + total
    )

    setText(
      'preorderV2ReviewBenefitSummary',
      benefitReady + '/' + total
    )

    setText(
      'preorderV2ReviewReadySummary',
      reviewReady + '/' + total
    )

    const statuses =
      variants.map(
        function (variant) {
          return String(
            variant.preorder_status ||
            'UNKNOWN'
          ).toUpperCase()
        }
      )

    const commonStatus =
      statuses.length > 0 &&
      statuses.every(
        function (status) {
          return status === statuses[0]
        }
      )
        ? statuses[0]
        : ''

    setFieldValue(
      'preorderV2ReviewStatus',
      (
        commonStatus &&
        commonStatus !== 'UNKNOWN' &&
        commonStatus !== 'CANCELLED'
      )
        ? commonStatus
        : 'UPCOMING'
    )

    const commonStartDate =
      commonDateValue(
        variants,
        'preorder_start_date'
      )

    const commonEndDate =
      commonDateValue(
        variants,
        'preorder_end_date'
      )

    const commonStartReason =
      commonExceptionReason(
        variants,
        'PREORDER_START_DATE'
      )

    const commonEndReason =
      commonExceptionReason(
        variants,
        'PREORDER_END_DATE'
      )

    setFieldValue(
      'preorderV2ReviewStartResolution',
      commonStartDate
        ? 'DATE'
        : (
            commonStartReason ||
            'OFFICIAL_UNANNOUNCED'
          )
    )

    setFieldValue(
      'preorderV2ReviewEndResolution',
      commonEndDate
        ? 'DATE'
        : (
            commonEndReason ||
            'OFFICIAL_UNANNOUNCED'
          )
    )

    setFieldValue(
      'preorderV2ReviewStartDate',
      commonStartDate
    )

    setFieldValue(
      'preorderV2ReviewEndDate',
      commonEndDate
    )

    toggleReviewDateFields()

    const notice =
      $('preorderV2ReviewPreparationStatus')

    if (notice) {
      notice.textContent =
        reviewReady === total
          ? (
              '✓ 전체 에디션이 검토 준비를 완료했습니다. ' +
              '검토 승인 전 최종 내용을 확인해 주세요.'
            )
          : (
              '확인 필요 ' +
              (total - reviewReady) +
              '개 · 아래 공통 설정을 저장하면 일정과 상태를 한 번에 정리할 수 있습니다.'
            )

      notice.className =
        reviewReady === total
          ? 'admin-status ok'
          : 'admin-status info'
    }
  }

  async function saveReviewPreparation() {
    if (
      reviewPreparationSaving ||
      !detail ||
      !detail.game
    ) {
      return
    }

    const preorderStatus =
      fieldValue(
        'preorderV2ReviewStatus'
      )

    const startResolution =
      fieldValue(
        'preorderV2ReviewStartResolution'
      )

    const endResolution =
      fieldValue(
        'preorderV2ReviewEndResolution'
      )

    const startDate =
      fieldValue(
        'preorderV2ReviewStartDate'
      )

    const endDate =
      fieldValue(
        'preorderV2ReviewEndDate'
      )

    if (
      startResolution === 'DATE' &&
      !startDate
    ) {
      setStatus(
        '예약판매 시작일을 입력해 주세요.',
        'err'
      )
      return
    }

    if (
      endResolution === 'DATE' &&
      !endDate
    ) {
      setStatus(
        '예약판매 종료일을 입력해 주세요.',
        'err'
      )
      return
    }

    const variants =
      Array.isArray(detail.variants)
        ? detail.variants.filter(
            function (variant) {
              return String(
                variant
                  .preorder_publish_status ||
                'DRAFT'
              ).toUpperCase() ===
                'DRAFT'
            }
          )
        : []

    const confirmed = window.confirm(
      '검토 준비 공통 설정을 저장할까요?\n\n' +
      '대상: DRAFT 에디션 ' +
      variants.length +
      '개\n' +
      '예약판매 상태: ' +
      preorderStatus +
      '\n시작 일정: ' +
      (
        startResolution === 'DATE'
          ? startDate
          : reviewReasonLabel(
              startResolution
            )
      ) +
      '\n종료 일정: ' +
      (
        endResolution === 'DATE'
          ? endDate
          : reviewReasonLabel(
              endResolution
            )
      ) +
      '\n\n아직 검토 승인되거나 공개되지 않습니다.'
    )

    if (!confirmed) return

    reviewPreparationSaving = true

    const button =
      $('savePreorderV2ReviewPreparation')

    if (button) {
      button.disabled = true
      button.textContent =
        '전체 저장 중...'
    }

    setStatus(
      '검토 준비 공통 설정을 전체 DRAFT 에디션에 저장하고 있습니다.',
      'info'
    )

    try {
      const result = await api(
        '/admin/api/preorders/games/' +
          encodeURIComponent(
            detail.game.id
          ) +
          '/review-preparation/bulk',
        {
          method: 'POST',
          body: JSON.stringify({
            preorderStatus:
              preorderStatus,
            startResolution:
              startResolution,
            startDate:
              startDate,
            endResolution:
              endResolution,
            endDate:
              endDate
          })
        }
      )

      const gameId = detail.game.id

      await loadGameDetail(gameId)

      setStatus(
        '✓ 검토 준비 설정 저장 완료 · ' +
          result.updatedCount +
          '개 에디션 · 아직 승인·공개되지 않았습니다.',
        'ok'
      )
    } catch (error) {
      setStatus(
        error && error.message
          ? error.message
          : '검토 준비 설정 저장에 실패했습니다.',
        'err'
      )
    } finally {
      reviewPreparationSaving = false

      if (button) {
        button.disabled = false
        button.textContent =
          '전체 DRAFT에 공통 설정 저장'
      }
    }
  }

  function variantImageSummaryHtml(variant) {
    const linkedImages =
      detail &&
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

    if (!linkedImages.length) {
      return (
        '<div ' +
          'style="' +
            'margin-top:12px;' +
            'padding:10px 12px;' +
            'border-radius:10px;' +
            'background:rgba(245,158,11,.10);' +
            'color:#fbbf24;' +
            'font-size:13px' +
          '">' +
          '⚠ 이미지 미연결' +
        '</div>'
      )
    }

    const roleLabels = {
      REPRESENTATIVE: '대표',
      PACKAGE: '패키지',
      BONUS: '예약 특전',
      CONTENTS: '구성품',
      GALLERY: '갤러리'
    }

    const badges = linkedImages.map(
      function (image) {
        return (
          '<span ' +
            'title="' +
              escapeHtml(
                image.image_type || ''
              ) +
            '" ' +
            'style="' +
              'display:inline-flex;' +
              'align-items:center;' +
              'gap:4px;' +
              'padding:5px 8px;' +
              'border-radius:999px;' +
              'background:rgba(34,197,94,.12);' +
              'color:#86efac;' +
              'font-size:12px' +
            '">' +
            '✓ ' +
            escapeHtml(
              roleLabels[
                image.display_role
              ] ||
              image.display_role
            ) +
            ' #' +
            escapeHtml(image.image_id) +
          '</span>'
        )
      }
    ).join('')

    return (
      '<div ' +
        'style="' +
          'display:flex;' +
          'flex-wrap:wrap;' +
          'gap:6px;' +
          'margin-top:12px' +
        '">' +
        badges +
      '</div>'
    )
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

      const preorderPublishStatus =
        String(
          variant.preorder_publish_status ||
          'DRAFT'
        ).toUpperCase()

      const escapedVariantId =
        escapeHtml(variant.id)

      const reviewState =
        variantReviewState(variant)

      let actionButtons = ''

      if (
        preorderPublishStatus === 'DRAFT'
      ) {
        actionButtons =
          '<button ' +
            'type="button" ' +
            'class="btn btn-sm" ' +
            'data-preorder-v2-edit="' +
              escapedVariantId +
            '">' +
            '수정' +
          '</button>' +

          '<button ' +
            'type="button" ' +
            'class="btn btn-sm" ' +
            (
              reviewState.ready
                ? (
                    'data-preorder-v2-approve="' +
                      escapedVariantId +
                    '"'
                  )
                : (
                    'disabled title="' +
                      escapeHtml(
                        reviewState.reasons
                          .join(', ')
                      ) +
                    '"'
                  )
            ) +
          '>' +
            (
              reviewState.ready
                ? '검토 승인'
                : '확인 필요'
            ) +
          '</button>'
      } else if (
        preorderPublishStatus ===
        'APPROVED'
      ) {
        actionButtons =
          '<button ' +
            'type="button" ' +
            'class="btn btn-sm" ' +
            'disabled ' +
            'title="승인된 예약판매는 수정할 수 없습니다.">' +
            '수정 불가' +
          '</button>' +

          '<button ' +
            'type="button" ' +
            'class="btn btn-sm btn-primary" ' +
            'data-preorder-v2-publish="' +
              escapedVariantId +
            '">' +
            '게시' +
          '</button>'
      } else if (
        preorderPublishStatus ===
        'PUBLISHED'
      ) {
        actionButtons =
          '<button ' +
            'type="button" ' +
            'class="btn btn-sm" ' +
            'data-preorder-v2-confirmed-price="' +
              escapedVariantId +
            '">' +
            '확정가 수정' +
          '</button>' +

          '<button ' +
            'type="button" ' +
            'class="btn btn-sm" ' +
            'disabled>' +
            '게시 완료' +
          '</button>'
      } else {
        actionButtons =
          '<button ' +
            'type="button" ' +
            'class="btn btn-sm" ' +
            'disabled>' +
            '수정 불가' +
          '</button>'
      }




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

            actionButtons +

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
                preorderPublishStatus ===
                  'DRAFT'
                  ? '작성 중 · 비공개'
                  : preorderPublishStatus ===
                      'APPROVED'
                    ? '검토 승인 · 비공개'
                    : preorderPublishStatus ===
                        'PUBLISHED'
                      ? '공개 중'
                      : preorderPublishStatus
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
                  reviewState.startLabel +
                  ' ~ ' +
                  reviewState.endLabel
                ) +
              '</dd>' +
            '</div>' +
          '</dl>' +
          variantImageSummaryHtml(
            variant
          ) +
          (
            window.preorderBenefitWorkflow
              ? window.preorderBenefitWorkflow
                  .summaryHtml(variant)
              : ''
          ) +
          variantReviewStatusHtml(
            variant
          ) +
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
      renderBulkImageManager()
      renderReviewPreparation()

      if (
        window.preorderBenefitWorkflow
      ) {
        window.preorderBenefitWorkflow
          .render(
            detail,
            loadGameDetail
          )
      }

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
		  image.stored_image_url ||
		  image.stored_url ||
		  image.r2_object_key ||
		  ''
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

      renderBulkImageManager()
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

  function usableBulkImages() {
    return imageCandidates.filter(
      function (image) {
        return (
          String(
            image.permission_status || ''
          ).toUpperCase() ===
            'APPROVED' &&
          String(
            image.stored_image_url ||
            image.stored_url ||
            image.r2_object_key ||
            ''
          ).trim()
        )
      }
    )
  }

  function bulkImageOptionHtml(
    images,
    selectedId,
    emptyLabel
  ) {
    let html =
      '<option value="">' +
        escapeHtml(emptyLabel) +
      '</option>'

    images.forEach(function (image) {
      const selected =
        Number(image.id) ===
        Number(selectedId)

      html +=
        '<option value="' +
          escapeHtml(image.id) +
        '"' +
          (
            selected
              ? ' selected'
              : ''
          ) +
        '>' +
          '#' +
          escapeHtml(image.id) +
          ' · ' +
          escapeHtml(
            image.image_type ||
            '이미지'
          ) +
        '</option>'
    })

    return html
  }

  function updateBulkImagePreview() {
    const panel =
      $('preorderV2BulkImages')

    const status =
      $('preorderV2BulkImageStatus')

    const button =
      $('savePreorderV2BulkImages')

    if (!panel || !status || !button) {
      return
    }

    const representativeId = Number(
      fieldValue(
        'preorderV2BulkRepresentative'
      )
    )

    const contentsId = Number(
      fieldValue(
        'preorderV2BulkContents'
      )
    )

    const representativeTargets =
      panel.querySelectorAll(
        '[data-bulk-representative-target]:checked'
      ).length

    const contentsTargets =
      contentsId
        ? panel.querySelectorAll(
            '[data-bulk-contents-target]:checked'
          ).length
        : 0

    button.disabled =
      !representativeId ||
      representativeTargets < 1 ||
      bulkImageSaving

    if (!representativeId) {
      status.textContent =
        '공통 대표 이미지를 선택해 주세요.'
      status.className =
        'admin-status info'
      return
    }

    status.textContent =
      '적용 예정 · 대표 이미지 #' +
      representativeId +
      ' → ' +
      representativeTargets +
      '개 에디션' +
      (
        contentsId
          ? (
              ' · 구성품 이미지 #' +
              contentsId +
              ' → ' +
              contentsTargets +
              '개 에디션'
            )
          : ''
      )

    status.className =
      'admin-status info'
  }

  function renderBulkImageManager() {
    const panel =
      $('preorderV2BulkImages')

    if (!panel) return

    const variants =
      detail &&
      Array.isArray(detail.variants)
        ? detail.variants.filter(
            function (variant) {
              return (
                String(
                  variant
                    .preorder_publish_status ||
                  'DRAFT'
                ).toUpperCase() ===
                  'DRAFT' &&
                Number(
                  variant.preorder_id
                ) > 0
              )
            }
          )
        : []

    const images = usableBulkImages()

    if (!variants.length) {
      panel.innerHTML =
        '<div class="admin-empty">' +
          '일괄 적용할 DRAFT 에디션이 없습니다.' +
        '</div>'
      return
    }

    if (!images.length) {
      panel.innerHTML =
        '<div class="admin-empty">' +
          '승인되고 R2에 저장된 이미지 후보를 불러오는 중입니다.' +
        '</div>'
      return
    }

    const linkedImages =
      detail &&
      Array.isArray(detail.images)
        ? detail.images
        : []

    const existingRepresentative =
      linkedImages.find(
        function (image) {
          return (
            image.display_role ===
            'REPRESENTATIVE'
          )
        }
      )

    const existingContents =
      linkedImages.find(
        function (image) {
          return (
            image.display_role ===
            'CONTENTS'
          )
        }
      )

    const recommendedRepresentative =
      existingRepresentative ||
      images.find(
        function (image) {
          return (
            String(
              image.image_type || ''
            ).toUpperCase() ===
            'KEY_VISUAL'
          )
        }
      ) ||
      images[0]

    const recommendedContents =
      existingContents ||
      images.find(
        function (image) {
          return (
            String(
              image.image_type || ''
            ).toUpperCase() ===
            'LIMITED_EDITION'
          )
        }
      )

    let targetRows = ''

    variants.forEach(function (variant) {
      const currentImages =
        linkedImages.filter(
          function (image) {
            return String(
              image.preorder_id
            ) === String(
              variant.preorder_id
            )
          }
        )

      const hasRepresentative =
        currentImages.some(
          function (image) {
            return (
              image.display_role ===
              'REPRESENTATIVE'
            )
          }
        )

      const hasContents =
        currentImages.some(
          function (image) {
            return (
              image.display_role ===
              'CONTENTS'
            )
          }
        )

      const isContentsTarget =
        (
          variant.variant_kind ===
          'LIMITED'
        ) ||
        (
          variant.variant_kind ===
          'COLLECTORS'
        )

      targetRows +=
        '<div ' +
          'style="' +
            'display:grid;' +
            'grid-template-columns:minmax(180px,1fr) 120px 140px;' +
            'gap:12px;' +
            'align-items:center;' +
            'padding:10px 0;' +
            'border-top:1px solid rgba(148,163,184,.15)' +
          '">' +

          '<div>' +
            '<b>' +
              escapeHtml(
                platformLabel(
                  variant.platform
                )
              ) +
            '</b>' +
            '<div style="font-size:13px;color:#cbd5e1;margin-top:3px">' +
              escapeHtml(
                variant.variant_name
              ) +
            '</div>' +
            '<div style="font-size:11px;color:#94a3b8;margin-top:3px">' +
              (
                hasRepresentative
                  ? '현재 대표 이미지 연결됨'
                  : '현재 대표 이미지 없음'
              ) +
              (
                hasContents
                  ? ' · 구성품 연결됨'
                  : ''
              ) +
            '</div>' +
          '</div>' +

          '<label style="display:flex;gap:7px;align-items:center">' +
            '<input ' +
              'type="checkbox" ' +
              'data-bulk-representative-target ' +
              'value="' +
                escapeHtml(variant.id) +
              '" checked' +
            ' />' +
            '<span>대표 적용</span>' +
          '</label>' +

          '<label style="display:flex;gap:7px;align-items:center">' +
            '<input ' +
              'type="checkbox" ' +
              'data-bulk-contents-target ' +
              'value="' +
                escapeHtml(variant.id) +
              '"' +
              (
                isContentsTarget
                  ? ' checked'
                  : ''
              ) +
            ' />' +
            '<span>구성품 적용</span>' +
          '</label>' +
        '</div>'
    })

    panel.innerHTML =
      '<div ' +
        'style="' +
          'display:grid;' +
          'grid-template-columns:repeat(2,minmax(0,1fr));' +
          'gap:14px' +
        '">' +

        '<label class="admin-field">' +
          '<span>' +
            '전체 에디션 공통 대표 이미지 ' +
            '<span ' +
              'title="상품 목록과 상세 화면에서 가장 먼저 표시되는 이미지입니다."' +
            '>ⓘ</span>' +
          '</span>' +
          '<select id="preorderV2BulkRepresentative">' +
            bulkImageOptionHtml(
              images,
              recommendedRepresentative
                ? Number(
                    recommendedRepresentative
                      .image_id ||
                    recommendedRepresentative
                      .id ||
                    0
                  )
                : '',
              '대표 이미지 선택'
            ) +
          '</select>' +
        '</label>' +

        '<label class="admin-field">' +
          '<span>' +
            '선택 에디션 구성품 이미지 ' +
            '<span ' +
              'title="한정판 구성 전체를 보여주는 이미지입니다. 선택하지 않아도 됩니다."' +
            '>ⓘ</span>' +
          '</span>' +
          '<select id="preorderV2BulkContents">' +
            bulkImageOptionHtml(
              images,
              recommendedContents
                ? Number(
                    recommendedContents
                      .image_id ||
                    recommendedContents
                      .id ||
                    0
                  )
                : '',
              '사용하지 않음'
            ) +
          '</select>' +
        '</label>' +
      '</div>' +

      '<div ' +
        'style="' +
          'margin-top:14px;' +
          'padding:0 12px;' +
          'border:1px solid rgba(148,163,184,.18);' +
          'border-radius:12px' +
        '">' +
        targetRows +
      '</div>' +

      '<p ' +
        'id="preorderV2BulkImageStatus" ' +
        'class="admin-status info" ' +
        'aria-live="polite"' +
      '></p>' +

      '<div class="preorder-v2-actions">' +
        '<button ' +
          'id="savePreorderV2BulkImages" ' +
          'class="btn btn-primary" ' +
          'type="button"' +
        '>' +
          '선택한 이미지 전체 DRAFT 저장' +
        '</button>' +
      '</div>'

    panel.onchange =
      updateBulkImagePreview

    const button =
      $('savePreorderV2BulkImages')

    if (button) {
      button.onclick =
        saveBulkImages
    }

    updateBulkImagePreview()
  }

  async function saveBulkImages() {
    if (
      bulkImageSaving ||
      !detail ||
      !detail.game
    ) {
      return
    }

    const panel =
      $('preorderV2BulkImages')

    const button =
      $('savePreorderV2BulkImages')

    if (!panel || !button) return

    const representativeImageId =
      Number(
        fieldValue(
          'preorderV2BulkRepresentative'
        )
      )

    const contentsImageId =
      Number(
        fieldValue(
          'preorderV2BulkContents'
        )
      ) || null

    const representativeVariantIds =
      Array.from(
        panel.querySelectorAll(
          '[data-bulk-representative-target]:checked'
        )
      ).map(
        function (checkbox) {
          return Number(checkbox.value)
        }
      ).filter(Number.isInteger)

    const contentsVariantIds =
      contentsImageId
        ? Array.from(
            panel.querySelectorAll(
              '[data-bulk-contents-target]:checked'
            )
          ).map(
            function (checkbox) {
              return Number(checkbox.value)
            }
          ).filter(Number.isInteger)
        : []

    if (
      !Number.isInteger(
        representativeImageId
      ) ||
      representativeImageId <= 0 ||
      representativeVariantIds.length < 1
    ) {
      setStatus(
        '대표 이미지와 적용 대상 에디션을 확인해 주세요.',
        'err'
      )
      return
    }

    const confirmed = window.confirm(
      '이미지 일괄 연결을 저장할까요?\n\n' +
      '대표 이미지 #' +
      representativeImageId +
      ' → ' +
      representativeVariantIds.length +
      '개 에디션\n' +
      (
        contentsImageId
          ? (
              '구성품 이미지 #' +
              contentsImageId +
              ' → ' +
              contentsVariantIds.length +
              '개 에디션\n'
            )
          : '구성품 이미지 → 적용하지 않음\n'
      ) +
      '\nDRAFT 이미지 연결만 변경되며 공개되지 않습니다.'
    )

    if (!confirmed) return

    bulkImageSaving = true
    button.disabled = true
    button.textContent = '전체 저장 중...'

    setStatus(
      '선택한 에디션의 이미지 연결을 한 번에 저장하고 있습니다.',
      'info'
    )

    try {
      const result = await api(
        '/admin/api/preorders/games/' +
          encodeURIComponent(
            detail.game.id
          ) +
          '/images/bulk',
        {
          method: 'POST',
          body: JSON.stringify({
            representativeImageId:
              representativeImageId,
            contentsImageId:
              contentsImageId,
            representativeVariantIds:
              representativeVariantIds,
            contentsVariantIds:
              contentsVariantIds
          })
        }
      )

      const gameId = detail.game.id

      await loadGameDetail(gameId)

      setStatus(
        '✓ 이미지 일괄 저장 완료 · 대표 ' +
          result.representativeSaved +
          '개 · 구성품 ' +
          result.contentsSaved +
          '개 · 아직 공개되지 않았습니다.',
        'ok'
      )
    } catch (error) {
      setStatus(
        error && error.message
          ? error.message
          : '이미지 일괄 저장에 실패했습니다.',
        'err'
      )

      button.disabled = false
      button.textContent =
        '선택한 이미지 전체 DRAFT 저장'
    } finally {
      bulkImageSaving = false
    }
  }

  async function approveVariant(
    variantId,
    button
  ) {
    if (approving) return

    const gameId = Number(
      fieldValue('preorderV2Game')
    )

    const normalizedVariantId =
      Number(variantId)

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0 ||
      !Number.isInteger(
        normalizedVariantId
      ) ||
      normalizedVariantId <= 0
    ) {
      setStatus(
        '승인할 게임 또는 상품 에디션 정보가 올바르지 않습니다.',
        'err'
      )
      return
    }

    const variant =
      detail &&
      Array.isArray(detail.variants)
        ? detail.variants.find(
            function (item) {
              return String(item.id) ===
                String(normalizedVariantId)
            }
          )
        : null

    if (!variant) {
      setStatus(
        '승인할 상품 에디션을 찾지 못했습니다.',
        'err'
      )
      return
    }

    const publishStatus = String(
      variant.preorder_publish_status ||
      'DRAFT'
    ).toUpperCase()

    if (publishStatus !== 'DRAFT') {
      setStatus(
        'DRAFT 상태의 예약판매만 검토 승인할 수 있습니다.',
        'err'
      )
      return
    }

    const confirmed = window.confirm(
      (
        variant.variant_name ||
        '선택한 상품 에디션'
      ) +
      '을 검토 승인할까요?\n\n' +
      '승인 후에는 DRAFT 저장으로 내용을 수정할 수 없습니다.\n' +
      '아직 공개되지는 않습니다.'
    )

    if (!confirmed) return

    approving = true

    if (button) {
      button.disabled = true
      button.textContent = '승인 중...'
    }

    setStatus(
      '예약판매 정보를 검토 승인하고 있습니다.',
      'info'
    )

    try {
      const result = await api(
        '/admin/api/preorders/games/' +
          encodeURIComponent(gameId) +
          '/variants/' +
          encodeURIComponent(
            normalizedVariantId
          ) +
          '/approve',
        {
          method: 'POST'
        }
      )

      await loadGameDetail(gameId)

      setStatus(
        result.alreadyApproved
          ? '이미 검토 승인된 예약판매입니다.'
          : '예약판매 검토 승인이 완료되었습니다. 아직 공개 상태는 아닙니다.',
        'ok'
      )
    } catch (error) {
      setStatus(
        error && error.message
          ? error.message
          : '검토 승인에 실패했습니다.',
        'err'
      )

      if (button) {
        button.disabled = false
        button.textContent = '검토 승인'
      }
    } finally {
      approving = false
    }
  }


  async function publishVariant(
    variantId,
    button
  ) {
    if (publishing) return

    const gameId = Number(
      fieldValue('preorderV2Game')
    )

    const normalizedVariantId =
      Number(variantId)

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0 ||
      !Number.isInteger(
        normalizedVariantId
      ) ||
      normalizedVariantId <= 0
    ) {
      setStatus(
        '게시할 게임 또는 상품 에디션 정보가 올바르지 않습니다.',
        'err'
      )
      return
    }

    const variant =
      detail &&
      Array.isArray(detail.variants)
        ? detail.variants.find(
            function (item) {
              return String(item.id) ===
                String(normalizedVariantId)
            }
          )
        : null

    if (!variant) {
      setStatus(
        '게시할 상품 에디션을 찾지 못했습니다.',
        'err'
      )
      return
    }

    const publishStatus = String(
      variant.preorder_publish_status ||
      'DRAFT'
    ).toUpperCase()

    if (publishStatus !== 'APPROVED') {
      setStatus(
        publishStatus === 'PUBLISHED'
          ? '이미 게시된 예약판매입니다.'
          : '검토 승인된 예약판매만 게시할 수 있습니다.',
        publishStatus === 'PUBLISHED'
          ? 'info'
          : 'err'
      )
      return
    }

    const confirmed = window.confirm(
      (
        variant.variant_name ||
        '선택한 상품 에디션'
      ) +
      '을 공개 게시할까요?\n\n' +
      '게임, 상품 에디션, 예약판매 정보가 공개 상태로 전환됩니다.\n' +
      '게시 후에는 공개 사이트에서 즉시 노출될 수 있습니다.'
    )

    if (!confirmed) return

    publishing = true

    if (button) {
      button.disabled = true
      button.textContent = '게시 중...'
    }

    setStatus(
      '예약판매 정보를 공개 게시하고 있습니다.',
      'info'
    )

    try {
      const result = await api(
        '/admin/api/preorders/games/' +
          encodeURIComponent(gameId) +
          '/variants/' +
          encodeURIComponent(
            normalizedVariantId
          ) +
          '/publish',
        {
          method: 'POST'
        }
      )

      await loadGameDetail(gameId)

      setStatus(
        result.alreadyPublished
          ? '이미 게시된 예약판매입니다.'
          : '예약판매 공개 게시가 완료되었습니다.',
        'ok'
      )
    } catch (error) {
      setStatus(
        error && error.message
          ? error.message
          : '예약판매 게시에 실패했습니다.',
        'err'
      )

      if (button) {
        button.disabled = false
        button.textContent = '게시'
      }
    } finally {
      publishing = false
    }
  }


  async function updatePublishedConfirmedPrice(
    variantId
  ) {
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

    if (!variant) {
      setStatus(
        '예약판매 상품을 찾을 수 없습니다.',
        'err'
      )
      return
    }

    const currentPrice =
      Number(variant.confirmed_price) > 0
        ? Number(variant.confirmed_price)
        : Number(variant.candidate_price) > 0
          ? Number(variant.candidate_price)
          : ''

    const entered = window.prompt(
      variant.variant_name +
        ' 확정 가격을 입력하세요.\n' +
        '쉼표 없이 숫자만 입력합니다.',
      currentPrice
        ? String(currentPrice)
        : ''
    )

    if (entered === null) return

    const normalized = String(entered)
      .replace(/[,\s원]/g, '')

    const confirmedPrice = Number(normalized)

    if (
      !Number.isInteger(confirmedPrice) ||
      confirmedPrice <= 0
    ) {
      setStatus(
        '확정 가격은 1원 이상의 정수로 입력해 주세요.',
        'err'
      )
      return
    }

    if (
      !window.confirm(
        variant.variant_name +
          '의 공개 가격을 ' +
          confirmedPrice.toLocaleString('ko-KR') +
          '원으로 수정할까요?'
      )
    ) {
      return
    }

    try {
      const data = await api(
        '/admin/api/preorders/variants/' +
          encodeURIComponent(variantId) +
          '/confirmed-price',
        {
          method: 'PATCH',
          body: JSON.stringify({
            confirmedPrice: confirmedPrice
          })
        }
      )

      variant.confirmed_price =
        data.confirmedPrice
      variant.candidate_price = null
      variant.price_status = 'CONFIRMED'

      renderExisting()

      setStatus(
        data.message ||
          '확정 가격을 수정했습니다.',
        'ok'
      )
    } catch (error) {
      setStatus(error.message, 'err')
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

    const individualEditor =
      $('preorderV2IndividualEditor')

    if (individualEditor) {
      individualEditor.open = true
    }

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
        function () {
          const individualEditor =
            $('preorderV2IndividualEditor')

          if (individualEditor) {
            individualEditor.open = true
          }

          resetForm()
        }
      )
    }

    const reviewStartResolution =
      $('preorderV2ReviewStartResolution')

    const reviewEndResolution =
      $('preorderV2ReviewEndResolution')

    const saveReviewPreparationButton =
      $('savePreorderV2ReviewPreparation')

    if (reviewStartResolution) {
      reviewStartResolution.addEventListener(
        'change',
        toggleReviewDateFields
      )
    }

    if (reviewEndResolution) {
      reviewEndResolution.addEventListener(
        'change',
        toggleReviewDateFields
      )
    }

    if (saveReviewPreparationButton) {
      saveReviewPreparationButton
        .addEventListener(
          'click',
          saveReviewPreparation
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
          const publishButton =
            event.target.closest(
              '[data-preorder-v2-publish]'
            )

          if (publishButton) {
            publishVariant(
              publishButton.getAttribute(
                'data-preorder-v2-publish'
              ),
              publishButton
            )
            return
          }

          const approveButton =
            event.target.closest(
              '[data-preorder-v2-approve]'
            )

          if (approveButton) {
            approveVariant(
              approveButton.getAttribute(
                'data-preorder-v2-approve'
              ),
              approveButton
            )
            return
          }

          const priceButton =
            event.target.closest(
              '[data-preorder-v2-confirmed-price]'
            )

          if (priceButton) {
            updatePublishedConfirmedPrice(
              priceButton.getAttribute(
                'data-preorder-v2-confirmed-price'
              )
            )
            return
          }

          const editButton =
            event.target.closest(
              '[data-preorder-v2-edit]'
            )

          if (!editButton) return

          editVariant(
            editButton.getAttribute(
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
