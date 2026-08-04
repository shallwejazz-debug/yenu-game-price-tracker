// ============================================================
// 사전예약 V2 범용 예약특전 규칙 UI
// public/static/preorder-benefit-workflow.js
// ============================================================

(function () {
  'use strict'

  const TOKEN_KEY = 'gpt_admin_token'

  let detail = null
  let gameId = null
  let reloadDetail = null
  let rules = []
  let nextRuleId = 1
  let saving = false

  function byId(id) {
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

  function parseExceptions(value) {
    if (!value) return {}

    if (
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      return value
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

    return labels[value] ||
      value ||
      '플랫폼 미입력'
  }

  function packageLabel(value) {
    const labels = {
      PACKAGE: '패키지',
      DIGITAL: '다운로드',
      BOTH: '패키지·다운로드 공통'
    }

    return labels[value] ||
      value ||
      '형태 미입력'
  }

  function modeLabel(value) {
    const labels = {
      PROVIDE: '특전 제공',
      OFFICIAL_NOT_PROVIDED:
        '공식 미제공',
      NOT_APPLICABLE: '해당 없음',
      OFFICIAL_UNANNOUNCED:
        '공식 미발표',
      SELLER_SPECIFIC:
        '판매처별 상이',
      LATER_UPDATE: '추후 입력'
    }

    return labels[value] ||
      value ||
      '미처리'
  }

  function draftVariants() {
    return detail &&
      Array.isArray(detail.variants)
      ? detail.variants.filter(
          function (variant) {
            return (
              Number(
                variant.preorder_id
              ) > 0 &&
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
  }

  function createRule(
    targetIds,
    mode,
    bonus,
    note
  ) {
    return {
      id: nextRuleId++,
      mode: mode || 'PROVIDE',
      bonus: bonus || '',
      note: note || '',
      targetIds: new Set(
        targetIds || []
      )
    }
  }

  function initializeRules() {
    const grouped = new Map()
    const unresolved = []

    draftVariants().forEach(
      function (variant) {
        const bonus = String(
          variant.preorder_bonus || ''
        ).trim()

        const note = String(
          variant.preorder_bonus_note || ''
        ).trim()

        const exception =
          parseExceptions(
            variant.review_exceptions
          ).PREORDER_BONUS

        let mode = ''
        let effectiveNote = note

        if (bonus) {
          mode = 'PROVIDE'
        } else if (
          exception &&
          exception.reason
        ) {
          mode = String(
            exception.reason
          ).toUpperCase()

          effectiveNote = String(
            exception.note ||
            note ||
            ''
          ).trim()
        }

        if (!mode) {
          unresolved.push(
            Number(variant.id)
          )
          return
        }

        const key = [
          mode,
          bonus,
          effectiveNote
        ].join('\n')

        if (!grouped.has(key)) {
          grouped.set(
            key,
            createRule(
              [],
              mode,
              bonus,
              effectiveNote
            )
          )
        }

        grouped.get(key)
          .targetIds.add(
            Number(variant.id)
          )
      }
    )

    rules = Array.from(
      grouped.values()
    )

    if (unresolved.length) {
      rules.push(
        createRule(
          unresolved,
          'PROVIDE',
          '',
          ''
        )
      )
    }

    if (
      !rules.length &&
      draftVariants().length
    ) {
      rules.push(
        createRule(
          draftVariants().map(
            function (variant) {
              return Number(variant.id)
            }
          ),
          'PROVIDE',
          '',
          ''
        )
      )
    }
  }

  function coverage() {
    const counts = new Map()

    draftVariants().forEach(
      function (variant) {
        counts.set(
          Number(variant.id),
          0
        )
      }
    )

    rules.forEach(function (rule) {
      rule.targetIds.forEach(
        function (id) {
          if (counts.has(Number(id))) {
            counts.set(
              Number(id),
              counts.get(Number(id)) + 1
            )
          }
        }
      )
    })

    const unresolved = []
    const duplicate = []

    counts.forEach(
      function (count, id) {
        if (count === 0) {
          unresolved.push(id)
        }

        if (count > 1) {
          duplicate.push(id)
        }
      }
    )

    return {
      unresolved,
      duplicate,
      complete:
        counts.size > 0 &&
        unresolved.length === 0 &&
        duplicate.length === 0
    }
  }

  function optionHtml(
    value,
    label,
    selected
  ) {
    return (
      '<option value="' +
        escapeHtml(value) +
      '"' +
        (
          value === selected
            ? ' selected'
            : ''
        ) +
      '>' +
        escapeHtml(label) +
      '</option>'
    )
  }

  function platformButtons(rule) {
    const platforms = []

    draftVariants().forEach(
      function (variant) {
        if (
          !platforms.includes(
            variant.platform
          )
        ) {
          platforms.push(
            variant.platform
          )
        }
      }
    )

    return platforms.map(
      function (platform) {
        const ids =
          draftVariants()
            .filter(
              function (variant) {
                return (
                  variant.platform ===
                  platform
                )
              }
            )
            .map(
              function (variant) {
                return Number(variant.id)
              }
            )

        const selected =
          ids.length > 0 &&
          ids.every(
            function (id) {
              return rule.targetIds.has(id)
            }
          )

        return (
          '<button ' +
            'type="button" ' +
            'class="btn btn-sm' +
              (
                selected
                  ? ' is-selected'
                  : ''
              ) +
            '" ' +
            'data-benefit-platform="' +
              escapeHtml(platform) +
            '">' +
            escapeHtml(
              platformLabel(platform)
            ) +
          '</button>'
        )
      }
    ).join('')
  }

  function targetRows(rule) {
    return draftVariants().map(
      function (variant) {
        const selected =
          rule.targetIds.has(
            Number(variant.id)
          )

        return (
          '<label class="preorder-benefit-target">' +
            '<input ' +
              'type="checkbox" ' +
              'data-benefit-target="' +
                escapeHtml(variant.id) +
              '"' +
              (
                selected
                  ? ' checked'
                  : ''
              ) +
            ' />' +

            '<span>' +
              '<b>' +
                escapeHtml(
                  platformLabel(
                    variant.platform
                  )
                ) +
              '</b>' +

              '<small>' +
                escapeHtml(
                  variant.variant_name
                ) +
                ' · ' +
                escapeHtml(
                  packageLabel(
                    variant.package_type
                  )
                ) +
              '</small>' +
            '</span>' +
          '</label>'
        )
      }
    ).join('')
  }

  function ruleHtml(rule, index) {
    const provides =
      rule.mode === 'PROVIDE'

    return (
      '<article ' +
        'class="preorder-benefit-rule" ' +
        'data-benefit-rule="' +
          rule.id +
        '">' +

        '<div class="preorder-benefit-rule-head">' +
          '<div>' +
            '<strong>' +
              '예약특전 규칙 ' +
              (index + 1) +
            '</strong>' +

            '<span>' +
              rule.targetIds.size +
              '개 에디션 대상' +
            '</span>' +
          '</div>' +

          (
            rules.length > 1
              ? (
                  '<button ' +
                    'type="button" ' +
                    'class="btn btn-sm" ' +
                    'data-benefit-remove' +
                  '>규칙 삭제</button>'
                )
              : ''
          ) +
        '</div>' +

        '<div class="' +
          'preorder-v2-grid ' +
          'preorder-v2-grid-2' +
        '">' +

          '<label class="admin-field">' +
            '<span>' +
              '처리 방식 ' +
              '<button ' +
                'type="button" ' +
                'class="yenu-tip" ' +
                'data-tip="특전을 제공하거나 제공되지 않는 이유를 기록합니다." ' +
                'aria-label="처리 방식 도움말"' +
              '>ⓘ</button>' +
            '</span>' +

            '<select data-benefit-mode>' +
              optionHtml(
                'PROVIDE',
                '특전 제공',
                rule.mode
              ) +
              optionHtml(
                'OFFICIAL_NOT_PROVIDED',
                '공식 미제공',
                rule.mode
              ) +
              optionHtml(
                'NOT_APPLICABLE',
                '해당 없음',
                rule.mode
              ) +
              optionHtml(
                'OFFICIAL_UNANNOUNCED',
                '공식 미발표',
                rule.mode
              ) +
              optionHtml(
                'SELLER_SPECIFIC',
                '판매처별 상이',
                rule.mode
              ) +
              optionHtml(
                'LATER_UPDATE',
                '추후 입력',
                rule.mode
              ) +
            '</select>' +
          '</label>' +

          '<label class="admin-field">' +
            '<span>특전 참고사항</span>' +

            '<textarea ' +
              'data-benefit-note ' +
              'rows="3" ' +
              'placeholder="수량 한정, 플랫폼 미제공 등"' +
            '>' +
              escapeHtml(rule.note) +
            '</textarea>' +
          '</label>' +
        '</div>' +

        (
          provides
            ? (
                '<label class="admin-field">' +
                  '<span>' +
                    '예약특전 내용 ' +
                    '<button ' +
                      'type="button" ' +
                      'class="yenu-tip" ' +
                      'data-tip="특전이 여러 개면 줄바꿈하여 하나의 특전 묶음으로 입력할 수 있습니다." ' +
                      'aria-label="특전 내용 도움말"' +
                    '>ⓘ</button>' +
                  '</span>' +

                  '<textarea ' +
                    'data-benefit-bonus ' +
                    'rows="3" ' +
                    'placeholder="예: 아트북&#10;DLC 다운로드 코드"' +
                  '>' +
                    escapeHtml(rule.bonus) +
                  '</textarea>' +
                '</label>'
              )
            : (
                '<div class="admin-notice">' +
                  '<b>' +
                    escapeHtml(
                      modeLabel(rule.mode)
                    ) +
                  '</b>' +
                  ' 상태로 저장됩니다. ' +
                  '특전 내용은 비우고 처리 사유를 기록합니다.' +
                '</div>'
              )
        ) +

        '<div class="preorder-benefit-quick">' +
          '<span>플랫폼 빠른 선택</span>' +

          '<div>' +
            '<button ' +
              'type="button" ' +
              'class="btn btn-sm" ' +
              'data-benefit-all' +
            '>전체</button>' +

            '<button ' +
              'type="button" ' +
              'class="btn btn-sm" ' +
              'data-benefit-none' +
            '>선택 해제</button>' +

            platformButtons(rule) +
          '</div>' +
        '</div>' +

        '<details class="admin-details">' +
          '<summary>' +
            '에디션별 적용 대상 확인·수정' +
          '</summary>' +

          '<div class="admin-details-body">' +
            '<div class="' +
              'preorder-benefit-targets' +
            '">' +
              targetRows(rule) +
            '</div>' +
          '</div>' +
        '</details>' +
      '</article>'
    )
  }

  function renderRules() {
    const section =
      byId('preorderV2BenefitSection')

    const container =
      byId('preorderV2BenefitRules')

    if (!section || !container) {
      return
    }

    if (!draftVariants().length) {
      section.hidden = true
      return
    }

    section.hidden = false

    const state = coverage()

    container.innerHTML =
      rules.map(ruleHtml).join('') +

      '<div class="preorder-benefit-footer">' +
        '<button ' +
          'id="addPreorderV2BenefitRule" ' +
          'type="button" ' +
          'class="btn"' +
        '>+ 미처리 대상에 규칙 추가</button>' +

        '<p ' +
          'class="admin-status ' +
            (
              state.complete
                ? 'ok'
                : 'info'
            ) +
          '"' +
        '>' +
          (
            state.complete
              ? (
                  '✓ 전체 ' +
                  draftVariants().length +
                  '개 에디션의 처리 방식이 지정되었습니다.'
                )
              : (
                  '미처리 ' +
                  state.unresolved.length +
                  '개 · 중복 지정 ' +
                  state.duplicate.length +
                  '개'
                )
          ) +
        '</p>' +

        '<button ' +
          'id="savePreorderV2BenefitRules" ' +
          'type="button" ' +
          'class="btn btn-primary"' +
          (
            state.complete && !saving
              ? ''
              : ' disabled'
          ) +
        '>' +
          (
            saving
              ? '전체 저장 중...'
              : '예약특전 전체 작성 중 상태로 저장'
          ) +
        '</button>' +
      '</div>'

    bindEvents()
  }

  function ruleFor(element) {
    const card = element.closest(
      '[data-benefit-rule]'
    )

    if (!card) return null

    const id = Number(
      card.getAttribute(
        'data-benefit-rule'
      )
    )

    return rules.find(
      function (rule) {
        return rule.id === id
      }
    ) || null
  }

  function bindEvents() {
    const container =
      byId('preorderV2BenefitRules')

    if (!container) return

    container.oninput =
      function (event) {
        const target = event.target
        const rule = ruleFor(target)

        if (!rule) return

        if (
          target.matches(
            '[data-benefit-bonus]'
          )
        ) {
          rule.bonus = target.value
        }

        if (
          target.matches(
            '[data-benefit-note]'
          )
        ) {
          rule.note = target.value
        }
      }

    container.onchange =
      function (event) {
        const target = event.target
        const rule = ruleFor(target)

        if (!rule) return

        if (
          target.matches(
            '[data-benefit-mode]'
          )
        ) {
          rule.mode = target.value
          renderRules()
          return
        }

        if (
          target.matches(
            '[data-benefit-target]'
          )
        ) {
          const id = Number(
            target.getAttribute(
              'data-benefit-target'
            )
          )

          if (target.checked) {
            rule.targetIds.add(id)
          } else {
            rule.targetIds.delete(id)
          }

          renderRules()
        }
      }

    container.onclick =
      function (event) {
        const button =
          event.target.closest('button')

        if (!button) return

        if (
          button.id ===
          'savePreorderV2BenefitRules'
        ) {
          saveRules()
          return
        }

        if (
          button.id ===
          'addPreorderV2BenefitRule'
        ) {
          const used = new Set()

          rules.forEach(function (rule) {
            rule.targetIds.forEach(
              function (id) {
                used.add(id)
              }
            )
          })

          const unused =
            draftVariants()
              .map(function (variant) {
                return Number(variant.id)
              })
              .filter(function (id) {
                return !used.has(id)
              })

          rules.push(
            createRule(
              unused,
              'NOT_APPLICABLE',
              '',
              ''
            )
          )

          renderRules()
          return
        }

        const rule = ruleFor(button)
        if (!rule) return

        if (
          button.hasAttribute(
            'data-benefit-remove'
          )
        ) {
          rules = rules.filter(
            function (item) {
              return item.id !== rule.id
            }
          )

          renderRules()
          return
        }

        if (
          button.hasAttribute(
            'data-benefit-all'
          )
        ) {
          rule.targetIds = new Set(
            draftVariants().map(
              function (variant) {
                return Number(variant.id)
              }
            )
          )

          renderRules()
          return
        }

        if (
          button.hasAttribute(
            'data-benefit-none'
          )
        ) {
          rule.targetIds.clear()
          renderRules()
          return
        }

        if (
          button.hasAttribute(
            'data-benefit-platform'
          )
        ) {
          const platform =
            button.getAttribute(
              'data-benefit-platform'
            )

          const ids =
            draftVariants()
              .filter(
                function (variant) {
                  return (
                    variant.platform ===
                    platform
                  )
                }
              )
              .map(
                function (variant) {
                  return Number(variant.id)
                }
              )

          const selected =
            ids.every(function (id) {
              return rule.targetIds.has(id)
            })

          ids.forEach(function (id) {
            if (selected) {
              rule.targetIds.delete(id)
            } else {
              rule.targetIds.add(id)
            }
          })

          renderRules()
        }
      }
  }

  async function request(
    path,
    options
  ) {
    const token =
      window.localStorage.getItem(
        TOKEN_KEY
      ) || ''

    if (!token) {
      throw new Error(
        '관리자 토큰이 없습니다.'
      )
    }

    const response =
      await window.fetch(
        path,
        {
          ...options,
          headers: {
            'X-Admin-Token': token,
            'Content-Type':
              'application/json'
          }
        }
      )

    const data =
      await response.json()
        .catch(function () {
          return {}
        })

    if (
      !response.ok ||
      data.ok === false
    ) {
      throw new Error(
        data.error ||
        '요청에 실패했습니다.'
      )
    }

    return data
  }

  function setStatus(message, type) {
    const element =
      byId('preorderV2Status')

    if (!element) return

    element.textContent = message
    element.className =
      'admin-status ' + (type || '')
  }

  async function saveRules() {
    if (saving || !detail?.game) {
      return
    }

    const state = coverage()

    if (!state.complete) {
      setStatus(
        '미처리 또는 중복 지정 에디션을 확인해 주세요.',
        'err'
      )
      return
    }

    const invalid =
      rules.find(
        function (rule) {
          return (
            rule.mode === 'PROVIDE' &&
            !String(
              rule.bonus || ''
            ).trim()
          )
        }
      )

    if (invalid) {
      setStatus(
        '특전 제공 규칙에는 특전 내용을 입력해 주세요.',
        'err'
      )
      return
    }

    const assignments = []

    rules.forEach(function (rule) {
      rule.targetIds.forEach(
        function (variantId) {
          assignments.push({
            variantId,
            mode: rule.mode,
            bonus:
              rule.mode === 'PROVIDE'
                ? String(
                    rule.bonus || ''
                  ).trim()
                : '',
            note:
              String(
                rule.note || ''
              ).trim()
          })
        }
      )
    })

    const summary =
      rules.map(
        function (rule, index) {
          return (
            '규칙 ' +
            (index + 1) +
            ': ' +
            modeLabel(rule.mode) +
            ' · ' +
            rule.targetIds.size +
            '개'
          )
        }
      ).join('\n')

    if (
      !window.confirm(
        '예약특전 규칙을 저장할까요?\n\n' +
        summary +
        '\n\n작성 중 데이터만 변경되며 승인·공개되지 않습니다.'
      )
    ) {
      return
    }

    saving = true
    renderRules()

    setStatus(
      '예약특전 규칙을 저장하고 있습니다.',
      'info'
    )

    try {
      const result = await request(
        '/admin/api/preorders/games/' +
          encodeURIComponent(
            detail.game.id
          ) +
          '/benefits/bulk',
        {
          method: 'POST',
          body: JSON.stringify({
            assignments
          })
        }
      )

      const savedGameId =
        detail.game.id

      gameId = null
      rules = []

      if (
        typeof reloadDetail ===
        'function'
      ) {
        await reloadDetail(
          savedGameId
        )
      }

      setStatus(
        '✓ 예약특전 저장 완료 · 제공 ' +
          result.providedCount +
          '개 · 사유 처리 ' +
          result.exceptionCount +
          '개 · 아직 공개되지 않았습니다.',
        'ok'
      )
    } catch (error) {
      setStatus(
        error.message ||
        '예약특전 저장에 실패했습니다.',
        'err'
      )
    } finally {
      saving = false
      renderRules()
    }
  }

  function benefitReady(variant) {
    const bonus = String(
      variant.preorder_bonus || ''
    ).trim()

    const exception =
      parseExceptions(
        variant.review_exceptions
      ).PREORDER_BONUS

    return Boolean(
      bonus ||
      (
        exception &&
        exception.reason
      )
    )
  }

  function summaryHtml(variant) {
    const bonus = String(
      variant.preorder_bonus || ''
    ).trim()

    if (bonus) {
      return (
        '<div class="' +
          'preorder-benefit-badge ' +
          'is-provided' +
        '">' +
          '✓ 예약특전 · ' +
          escapeHtml(bonus) +
        '</div>'
      )
    }

    const exception =
      parseExceptions(
        variant.review_exceptions
      ).PREORDER_BONUS

    if (
      exception &&
      exception.reason
    ) {
      return (
        '<div class="' +
          'preorder-benefit-badge ' +
          'is-exception' +
        '">' +
          '－ 예약특전 · ' +
          escapeHtml(
            modeLabel(
              String(
                exception.reason
              ).toUpperCase()
            )
          ) +
          (
            exception.note
              ? (
                  ' · ' +
                  escapeHtml(
                    exception.note
                  )
                )
              : ''
          ) +
        '</div>'
      )
    }

    return (
      '<div class="' +
        'preorder-benefit-badge ' +
        'is-missing' +
      '">' +
        '△ 예약특전 처리 필요' +
      '</div>'
    )
  }


  function renderStepper() {
    const container =
      byId('preorderV2Workflow')

    if (!container || !detail) {
      return
    }

    const variants =
      Array.isArray(detail.variants)
        ? detail.variants
        : []

    if (!variants.length) {
      container.hidden = true
      return
    }

    container.hidden = false

    const total = variants.length

    const sourceReady =
      Array.isArray(
        detail.officialSources
      ) &&
      detail.officialSources.length > 0 &&
      variants.every(
        function (variant) {
          return Boolean(
            variant.release_date &&
            variant.official_source_id
          )
        }
      )

    const imageReady =
      variants.every(
        function (variant) {
          const images =
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

          return images.some(
            function (image) {
              return (
                image.display_role ===
                'REPRESENTATIVE'
              )
            }
          )
        }
      )

    const editionReady =
      variants.every(
        function (variant) {
          return Boolean(
            variant.id &&
            variant.preorder_id &&
            variant.variant_name
          )
        }
      )

    const preparationReady =
      variants.every(
        function (variant) {
          const exceptions =
            parseExceptions(
              variant.review_exceptions
            )

          const status = String(
            variant.preorder_status ||
            'UNKNOWN'
          ).toUpperCase()

          return Boolean(
            (
              variant.preorder_start_date ||
              exceptions
                .PREORDER_START_DATE
            ) &&
            (
              variant.preorder_end_date ||
              exceptions
                .PREORDER_END_DATE
            ) &&
            status !== 'UNKNOWN' &&
            status !== 'CANCELLED' &&
            benefitReady(variant)
          )
        }
      )

    const approvedCount =
      variants.filter(
        function (variant) {
          return (
            String(
              variant
                .preorder_publish_status ||
              ''
            ).toUpperCase() ===
            'APPROVED'
          )
        }
      ).length

    const publishedCount =
      variants.filter(
        function (variant) {
          return (
            String(
              variant
                .preorder_publish_status ||
              ''
            ).toUpperCase() ===
            'PUBLISHED'
          )
        }
      ).length

    const allApproved =
      total > 0 &&
      approvedCount === total

    const allPublished =
      total > 0 &&
      publishedCount === total

    let current = 1
    let currentText =
      '공식 정보와 출처를 확인하세요.'

    if (sourceReady) {
      current = 2
      currentText =
        '사용할 이미지를 준비하고 연결하세요.'
    }

    if (
      sourceReady &&
      imageReady
    ) {
      current = 3
      currentText =
        '플랫폼별 에디션 초안을 확인하세요.'
    }

    if (
      sourceReady &&
      imageReady &&
      editionReady
    ) {
      current = 4
      currentText =
        '일정과 예약특전을 정리하세요.'
    }

    if (preparationReady) {
      current = 5
      currentText =
        '전체 내용을 확인한 뒤 검토 승인하세요.'
    }

    if (allApproved) {
      current = 6
      currentText =
        '공개 전에 사용자 화면을 최종 확인하세요.'
    }

    if (allPublished) {
      current = 7
      currentText =
        '전체 에디션이 공개되었습니다.'
    }

    const labels = [
      '공식 정보',
      '이미지 준비',
      '에디션 초안',
      '일정·특전',
      '검토 승인',
      '최종 미리보기',
      '공개'
    ]

    const complete = [
      sourceReady,
      imageReady,
      editionReady,
      preparationReady,
      allApproved,
      allPublished,
      allPublished
    ]

    const steps =
      labels.map(
        function (label, index) {
          const number = index + 1

          let className =
            'preorder-workflow-step'

          if (complete[index]) {
            className += ' is-complete'
          }

          if (number === current) {
            className += ' is-current'
          }

          return (
            '<li class="' +
              className +
            '">' +
              '<span>' +
                (
                  complete[index]
                    ? '✓'
                    : number
                ) +
              '</span>' +
              '<b>' +
                escapeHtml(label) +
              '</b>' +
            '</li>'
          )
        }
      ).join('')

    container.innerHTML =
      '<div class="preorder-workflow-head">' +
        '<div>' +
          '<strong>' +
            '사전예약 등록 진행 단계' +
          '</strong>' +

          '<p>' +
            '현재 ' +
            current +
            '단계 · ' +
            escapeHtml(currentText) +
          '</p>' +
        '</div>' +

        '<span class="' +
          'preorder-workflow-private' +
        '">' +
          (
            allPublished
              ? '공개 완료'
              : '작성 중 · 비공개'
          ) +

          '<button ' +
            'type="button" ' +
            'class="yenu-tip" ' +
            'data-tip="작성 중 상태에서는 저장해도 사용자 사이트에 공개되지 않습니다. 검토 승인 후 별도의 공개 단계가 필요합니다." ' +
            'aria-label="작성 중 상태 도움말"' +
          '>ⓘ</button>' +
        '</span>' +
      '</div>' +

      '<ol class="' +
        'preorder-workflow-list' +
      '">' +
        steps +
      '</ol>'
  }

  function render(nextDetail, reload) {
    detail = nextDetail || null
    reloadDetail =
      typeof reload === 'function'
        ? reload
        : null

    const nextGameId =
      detail?.game
        ? Number(detail.game.id)
        : null

    if (nextGameId !== gameId) {
      gameId = nextGameId
      rules = []
      nextRuleId = 1

      if (gameId) {
        initializeRules()
      }
    }

    renderStepper()
    renderRules()
  }

  window.preorderBenefitWorkflow = {
    render,
    benefitReady,
    summaryHtml
  }
})()
