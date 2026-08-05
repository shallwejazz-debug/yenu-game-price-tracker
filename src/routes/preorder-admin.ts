// ============================================================
// 사전예약 V2 관리자 API
//
// GET  /admin/api/preorders/games
// GET  /admin/api/preorders/games/:gameId
// POST /admin/api/preorders/games/:gameId/variants
//
// 기존 Legacy 가격 수집 및 naver.ts와 분리하여 운영
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'

const preorderAdmin = new Hono<{
  Bindings: Bindings
}>()

const ALLOWED_PLATFORMS = new Set([
  'pc',
  'ps5',
  'ps4',
  'xbox',
  'switch',
  'switch2',
  'etc',
])

const ALLOWED_VARIANT_KINDS = new Set([
  'STANDARD',
  'DELUXE',
  'ULTIMATE',
  'LIMITED',
  'COLLECTORS',
  'OTHER',
])

const ALLOWED_PACKAGE_TYPES = new Set([
  'PACKAGE',
  'DIGITAL',
  'BOTH',
])

const ALLOWED_PREORDER_STATUSES = new Set([
  'UNKNOWN',
  'UPCOMING',
  'OPEN',
  'CLOSED',
  'CANCELLED',
])

const ALLOWED_PRICE_STATUSES = new Set([
  'UNCONFIRMED',
  'CANDIDATE',
  'CONFIRMED',
])

const ALLOWED_IMAGE_ROLES = new Set([
  'REPRESENTATIVE',
  'PACKAGE',
  'BONUS',
  'CONTENTS',
  'GALLERY',
])

function text(
  value: unknown,
  maxLength = 1000
): string {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength)
}

function nullableText(
  value: unknown,
  maxLength = 5000
): string | null {
  const normalized = text(value, maxLength)
  return normalized || null
}

function positiveInteger(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const number = Number(value)

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    return null
  }

  return number
}

function integerOrZero(
  value: unknown
): number {
  const number = Number(value)

  if (!Number.isInteger(number)) {
    return 0
  }

  return number
}

function isValidDate(
  value: string
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const [
    year,
    month,
    day,
  ] = value.split('-').map(Number)

  const date = new Date(
    Date.UTC(year, month - 1, day)
  )

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function nullableDate(
  value: unknown
): string | null {
  const normalized = text(value, 10)

  if (!normalized) {
    return null
  }

  return isValidDate(normalized)
    ? normalized
    : null
}

function normalizedVariantCode(
  value: unknown
): string {
  return text(value, 40)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

type ReviewExceptionValue = {
  reason: string
  note?: string
}

type ReviewExceptions = Record<
  string,
  ReviewExceptionValue
>

const ALLOWED_REVIEW_EXCEPTION_REASONS =
  new Set([
    'OFFICIAL_UNANNOUNCED',
    'SELLER_SPECIFIC',
    'LATER_UPDATE',
    'NOT_APPLICABLE',
    'UNTIL_STOCK',
    'NO_FIXED_END',
    'OFFICIAL_NOT_PROVIDED',
  ])

function parseReviewExceptions(
  value: unknown
): ReviewExceptions {
  if (!value) {
    return {}
  }

  let parsed: unknown = value

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return {}
    }
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    return {}
  }

  const result: ReviewExceptions = {}

  for (
    const [field, rawValue] of
    Object.entries(
      parsed as Record<string, unknown>
    )
  ) {
    if (
      !rawValue ||
      typeof rawValue !== 'object' ||
      Array.isArray(rawValue)
    ) {
      continue
    }

    const object =
      rawValue as Record<string, unknown>

    const reason = text(
      object.reason,
      50
    ).toUpperCase()

    if (
      !ALLOWED_REVIEW_EXCEPTION_REASONS
        .has(reason)
    ) {
      continue
    }

    const note = text(
      object.note,
      500
    )

    result[field] = {
      reason,
      ...(note ? { note } : {}),
    }
  }

  return result
}

function hasReviewException(
  exceptions: ReviewExceptions,
  field: string
): boolean {
  const target = exceptions[field]

  return Boolean(
    target &&
    ALLOWED_REVIEW_EXCEPTION_REASONS
      .has(target.reason)
  )
}

function jsonError(
  c: any,
  error: string,
  status: 400 | 401 | 404 | 409 | 500 | 503
) {
  return c.json(
    {
      ok: false,
      error,
    },
    status
  )
}


// ------------------------------------------------------------
// 관리자 인증
// ------------------------------------------------------------

preorderAdmin.use('*', async (c, next) => {
  const expectedToken = text(
    c.env.ADMIN_TOKEN,
    500
  )

  const receivedToken = text(
    c.req.header('X-Admin-Token'),
    500
  )

  if (!expectedToken) {
    return jsonError(
      c,
      'ADMIN_TOKEN is not configured',
      503
    )
  }

  if (
    !receivedToken ||
    receivedToken !== expectedToken
  ) {
    return jsonError(
      c,
      'unauthorized',
      401
    )
  }

  await next()
})


// ------------------------------------------------------------
// 사전예약 V2 대상 게임 목록
//
// WATCHER에서 생성한 DRAFT 게임을 우선 표시
// 기존 PUBLISHED 게임은 자동으로 V2 대상이 되지 않음
// ------------------------------------------------------------

preorderAdmin.get('/games', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT
      g.id,
      g.title,
      g.image_url,
      g.release_date,
      g.genre,
      g.publish_status,
      g.created_at,

      (
        SELECT GROUP_CONCAT(e.platform)
        FROM editions e
        WHERE e.game_id = g.id
      ) AS platforms,

      (
        SELECT COUNT(*)
        FROM editions e
        INNER JOIN product_variants pv
          ON pv.edition_id = e.id
        WHERE e.game_id = g.id
      ) AS variant_count,

      (
        SELECT COUNT(*)
        FROM editions e
        INNER JOIN product_variants pv
          ON pv.edition_id = e.id
        INNER JOIN variant_preorders vp
          ON vp.variant_id = pv.id
        WHERE
          e.game_id = g.id
          AND vp.publish_status = 'DRAFT'
      ) AS draft_preorder_count

    FROM games g

    WHERE
      g.publish_status = 'DRAFT'
      OR EXISTS (
        SELECT 1
        FROM editions pe
        INNER JOIN product_variants ppv
          ON ppv.edition_id = pe.id
        INNER JOIN variant_preorders pvp
          ON pvp.variant_id = ppv.id
        WHERE
          pe.game_id = g.id
          AND pvp.publish_status IN (
            'APPROVED',
            'PUBLISHED'
          )
      )

    ORDER BY
      g.created_at DESC,
      g.id DESC
  `).all()

  return c.json({
    ok: true,
    games: results ?? [],
  })
})


// ------------------------------------------------------------
// 게임 한 건의 플랫폼·상품 에디션·예약판매·이미지 조회
// ------------------------------------------------------------

preorderAdmin.get(
  '/games/:gameId',
  async (c) => {
    const gameId = Number(
      c.req.param('gameId')
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      return jsonError(
        c,
        'invalid game id',
        400
      )
    }

    const game = await c.env.DB.prepare(`
      SELECT
        id,
        title,
        image_url,
        release_date,
        original_price,
        genre,
        publish_status,
        created_at,
        published_at

      FROM games

      WHERE id = ?

      LIMIT 1
    `)
      .bind(gameId)
      .first()

    if (!game) {
      return jsonError(
        c,
        'game not found',
        404
      )
    }

    const [
      editionsResult,
      sourcesResult,
      variantsResult,
      imagesResult,
    ] = await Promise.all([
      c.env.DB.prepare(`
        SELECT
          id,
          game_id,
          platform,
          edition_name,
          search_query,
          keywords,
          NULL AS exclude_keywords,
          steam_appid,
          created_at

        FROM editions

        WHERE game_id = ?

        ORDER BY
          CASE platform
            WHEN 'ps5' THEN 1
            WHEN 'switch' THEN 2
            WHEN 'switch2' THEN 3
            WHEN 'xbox' THEN 4
            WHEN 'ps4' THEN 5
            WHEN 'pc' THEN 6
            ELSE 7
          END,
          id ASC
      `)
        .bind(gameId)
        .all(),

      c.env.DB.prepare(`
        SELECT
          gos.id,
          gos.game_id,
          gos.watch_item_id,
          gos.source_id,
          gos.source_title,
          gos.official_source_url,
          gos.trailer_url,
          gos.source_credit,
          gos.required_copyright,
          gos.permission_status_snapshot,
          gos.created_at,

          ws.source_key,
          ws.source_name

        FROM game_official_sources gos

        INNER JOIN watch_sources ws
          ON ws.id = gos.source_id

        WHERE gos.game_id = ?

        ORDER BY
          gos.created_at DESC,
          gos.id DESC
      `)
        .bind(gameId)
        .all(),

      c.env.DB.prepare(`
        SELECT
          pv.id,
          pv.edition_id,
          e.platform,
          e.edition_name AS platform_edition_name,

          pv.variant_code,
          pv.variant_name,
          pv.variant_kind,
          pv.package_type,
          pv.is_default,
          pv.display_order AS variant_display_order,
          pv.publish_status AS variant_publish_status,

          vp.id AS preorder_id,
          vp.official_source_id,
          vp.release_date,
          vp.preorder_start_date,
          vp.preorder_end_date,
          vp.review_exceptions,
          vp.preorder_status,
          vp.preorder_bonus,
          vp.preorder_bonus_note,
          vp.contents_text,
          vp.candidate_price,
          vp.confirmed_price,
          vp.price_status,
          vp.publish_status AS preorder_publish_status,
          vp.display_order AS preorder_display_order,
          vp.approved_at,
          vp.published_at

        FROM product_variants pv

        INNER JOIN editions e
          ON e.id = pv.edition_id

        LEFT JOIN variant_preorders vp
          ON vp.variant_id = pv.id

        WHERE e.game_id = ?

        ORDER BY
          CASE e.platform
            WHEN 'ps5' THEN 1
            WHEN 'switch' THEN 2
            WHEN 'switch2' THEN 3
            WHEN 'xbox' THEN 4
            WHEN 'ps4' THEN 5
            WHEN 'pc' THEN 6
            ELSE 7
          END,
          pv.display_order ASC,
          pv.id ASC,
          vp.display_order ASC,
          vp.id ASC
      `)
        .bind(gameId)
        .all(),

      c.env.DB.prepare(`
        SELECT
          vpi.id,
          vpi.preorder_id,
          vpi.image_id,
          vpi.display_role,
          vpi.display_order,
          vpi.alt_text,

	wii.watch_item_id,
	wii.source_image_url AS source_url,
	wii.stored_image_url AS stored_url,
	NULL AS r2_object_key,
	NULL AS content_type,
	wii.width,
	wii.height,
	wii.image_type,
	wii.title AS image_title,
	wii.alt_text AS image_alt_text,
	wii.description AS image_description,
	wii.permission_status,
	wii.selected_for_publish,
	wii.display_order AS image_display_order,
	wii.source_credit,
	wii.source_article_url

        FROM variant_preorder_images vpi

        INNER JOIN variant_preorders vp
          ON vp.id = vpi.preorder_id

        INNER JOIN product_variants pv
          ON pv.id = vp.variant_id

        INNER JOIN editions e
          ON e.id = pv.edition_id

        INNER JOIN watch_item_images wii
          ON wii.id = vpi.image_id

        WHERE e.game_id = ?

        ORDER BY
          vpi.preorder_id ASC,
          CASE vpi.display_role
            WHEN 'REPRESENTATIVE' THEN 1
            WHEN 'PACKAGE' THEN 2
            WHEN 'BONUS' THEN 3
            WHEN 'CONTENTS' THEN 4
            ELSE 5
          END,
          vpi.display_order ASC,
          vpi.id ASC
      `)
        .bind(gameId)
        .all(),
    ])

    return c.json({
      ok: true,
      game,
      editions:
        editionsResult.results ?? [],
      officialSources:
        sourcesResult.results ?? [],
      variants:
        variantsResult.results ?? [],
      images:
        imagesResult.results ?? [],
    })
  }
)


// ------------------------------------------------------------
// 플랫폼 + 상품 에디션 + 예약판매 DRAFT 저장
//
// 한 요청은 상품 에디션 한 개를 저장함.
// 프론트엔드는 여러 에디션을 순서대로 저장할 수 있음.
// 동일 요청을 다시 보내도 중복 생성되지 않도록 upsert 처리.
// ------------------------------------------------------------

preorderAdmin.post(
  '/games/:gameId/variants',
  async (c) => {
    const gameId = Number(
      c.req.param('gameId')
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      return jsonError(
        c,
        'invalid game id',
        400
      )
    }

    const body = await c.req
      .json<Record<string, unknown>>()
      .catch(() => null)

    if (!body) {
      return jsonError(
        c,
        'invalid JSON body',
        400
      )
    }

    const platform = text(
      body.platform,
      20
    ).toLowerCase()

    const platformEditionName = text(
      body.platformEditionName,
      100
    )

    const variantCode = normalizedVariantCode(
      body.variantCode
    )

    const variantName = text(
      body.variantName,
      100
    )

    const variantKind = text(
      body.variantKind,
      30
    ).toUpperCase()

    const packageType = text(
      body.packageType,
      20
    ).toUpperCase()

    const isDefault =
      body.isDefault === true ||
      body.isDefault === 1 ||
      body.isDefault === '1'
        ? 1
        : 0

    const displayOrder = integerOrZero(
      body.displayOrder
    )

    const officialSourceId =
      positiveInteger(
        body.officialSourceId
      )

    const releaseDate = text(
      body.releaseDate,
      10
    )

    const preorderStartDate =
      nullableDate(
        body.preorderStartDate
      )

    const preorderEndDate =
      nullableDate(
        body.preorderEndDate
      )

    const preorderStatus = text(
      body.preorderStatus || 'UNKNOWN',
      30
    ).toUpperCase()

    const preorderBonus = nullableText(
      body.preorderBonus,
      5000
    )

    const preorderBonusNote = nullableText(
      body.preorderBonusNote,
      5000
    )

    const contentsText = nullableText(
      body.contentsText,
      10000
    )

    const candidatePrice =
      positiveInteger(
        body.candidatePrice
      )

    const confirmedPrice =
      positiveInteger(
        body.confirmedPrice
      )

    const priceStatus = text(
      body.priceStatus || 'UNCONFIRMED',
      30
    ).toUpperCase()

    if (!ALLOWED_PLATFORMS.has(platform)) {
      return jsonError(
        c,
        '지원하지 않는 플랫폼입니다.',
        400
      )
    }

    if (!variantCode) {
      return jsonError(
        c,
        '에디션 코드를 입력해 주세요.',
        400
      )
    }

    if (!variantName) {
      return jsonError(
        c,
        '에디션 이름을 입력해 주세요.',
        400
      )
    }

    if (
      !ALLOWED_VARIANT_KINDS.has(
        variantKind
      )
    ) {
      return jsonError(
        c,
        '지원하지 않는 에디션 종류입니다.',
        400
      )
    }

    if (
      !ALLOWED_PACKAGE_TYPES.has(
        packageType
      )
    ) {
      return jsonError(
        c,
        '지원하지 않는 상품 형태입니다.',
        400
      )
    }

    if (!officialSourceId) {
      return jsonError(
        c,
        '공식 출처를 선택해 주세요.',
        400
      )
    }

    if (!isValidDate(releaseDate)) {
      return jsonError(
        c,
        '올바른 출시일을 입력해 주세요.',
        400
      )
    }

    if (
      text(body.preorderStartDate, 20) &&
      !preorderStartDate
    ) {
      return jsonError(
        c,
        '예약판매 시작일이 올바르지 않습니다.',
        400
      )
    }

    if (
      text(body.preorderEndDate, 20) &&
      !preorderEndDate
    ) {
      return jsonError(
        c,
        '예약판매 종료일이 올바르지 않습니다.',
        400
      )
    }

    if (
      preorderStartDate &&
      preorderEndDate &&
      preorderStartDate > preorderEndDate
    ) {
      return jsonError(
        c,
        '예약판매 종료일은 시작일보다 빠를 수 없습니다.',
        400
      )
    }

    if (
      !ALLOWED_PREORDER_STATUSES.has(
        preorderStatus
      )
    ) {
      return jsonError(
        c,
        '지원하지 않는 예약판매 상태입니다.',
        400
      )
    }

    if (
      !ALLOWED_PRICE_STATUSES.has(
        priceStatus
      )
    ) {
      return jsonError(
        c,
        '지원하지 않는 가격 상태입니다.',
        400
      )
    }

    if (
      priceStatus === 'CANDIDATE' &&
      !candidatePrice
    ) {
      return jsonError(
        c,
        '가격 후보를 입력해 주세요.',
        400
      )
    }

    if (
      priceStatus === 'CONFIRMED' &&
      !confirmedPrice
    ) {
      return jsonError(
        c,
        '확정 가격을 입력해 주세요.',
        400
      )
    }

    const game = await c.env.DB.prepare(`
      SELECT
        id,
        title,
        publish_status

      FROM games

      WHERE id = ?

      LIMIT 1
    `)
      .bind(gameId)
      .first<{
        id: number
        title: string
        publish_status: string
      }>()

    if (!game) {
      return jsonError(
        c,
        '게임을 찾을 수 없습니다.',
        404
      )
    }

    if (game.publish_status !== 'DRAFT') {
      return jsonError(
        c,
        'DRAFT 게임만 사전예약 V2에서 수정할 수 있습니다.',
        409
      )
    }

    const officialSource =
      await c.env.DB.prepare(`
        SELECT
          id,
          watch_item_id,
          permission_status_snapshot

        FROM game_official_sources

        WHERE
          id = ?
          AND game_id = ?

        LIMIT 1
      `)
        .bind(
          officialSourceId,
          gameId
        )
        .first<{
          id: number
          watch_item_id: number
          permission_status_snapshot: string
        }>()

    if (!officialSource) {
      return jsonError(
        c,
        '선택한 공식 출처가 이 게임에 연결되어 있지 않습니다.',
        409
      )
    }

    const preflightLockedPreorder =
      await c.env.DB.prepare(`
        SELECT
          vp.id,
          vp.publish_status

        FROM editions e

        INNER JOIN product_variants pv
          ON pv.edition_id = e.id

        INNER JOIN variant_preorders vp
          ON vp.variant_id = pv.id

        WHERE
          e.game_id = ?
          AND e.platform = ?
          AND pv.variant_code = ?
          AND vp.publish_status <> 'DRAFT'

        LIMIT 1
      `)
        .bind(
          gameId,
          platform,
          variantCode
        )
        .first<{
          id: number
          publish_status: string
        }>()

    if (preflightLockedPreorder) {
      return jsonError(
        c,
        '검토 승인된 예약판매는 DRAFT 저장으로 수정할 수 없습니다.',
        409
      )
    }


    const edition = await c.env.DB.prepare(`
      INSERT INTO editions (
        game_id,
        platform,
        edition_name
      )

      VALUES (?, ?, ?)

      ON CONFLICT (
        game_id,
        platform
      )

      DO UPDATE SET
        edition_name = COALESCE(
          NULLIF(excluded.edition_name, ''),
          editions.edition_name
        )

      RETURNING
        id,
        game_id,
        platform,
        edition_name
    `)
      .bind(
        gameId,
        platform,
        platformEditionName || null
      )
      .first<{
        id: number
        game_id: number
        platform: string
        edition_name: string | null
      }>()

    if (!edition) {
      return jsonError(
        c,
        '플랫폼판을 저장하지 못했습니다.',
        500
      )
    }

    const existingVariant =
      await c.env.DB.prepare(`
        SELECT
          id,
          publish_status

        FROM product_variants

        WHERE
          edition_id = ?
          AND variant_code = ?

        LIMIT 1
      `)
        .bind(
          edition.id,
          variantCode
        )
        .first<{
          id: number
          publish_status: string
        }>()

    if (
      existingVariant &&
      existingVariant.publish_status !== 'DRAFT'
    ) {
      return jsonError(
        c,
        'DRAFT 상태의 상품 에디션만 수정할 수 있습니다.',
        409
      )
    }

    if (existingVariant) {
      const lockedPreorder =
        await c.env.DB.prepare(`
          SELECT
            id,
            publish_status

          FROM variant_preorders

          WHERE
            variant_id = ?
            AND publish_status <> 'DRAFT'

          LIMIT 1
        `)
          .bind(existingVariant.id)
          .first<{
            id: number
            publish_status: string
          }>()

      if (lockedPreorder) {
        return jsonError(
          c,
          '검토 승인된 예약판매는 DRAFT 저장으로 수정할 수 없습니다.',
          409
        )
      }
    }


    if (isDefault === 1) {
      await c.env.DB.prepare(`
        UPDATE product_variants

        SET
          is_default = 0,
          updated_at = CURRENT_TIMESTAMP

        WHERE
          edition_id = ?
          AND variant_code <> ?
      `)
        .bind(
          edition.id,
          variantCode
        )
        .run()
    }

    const variant =
      await c.env.DB.prepare(`
        INSERT INTO product_variants (
          edition_id,
          variant_code,
          variant_name,
          variant_kind,
          package_type,
          is_default,
          display_order,
          publish_status
        )

        VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT')

        ON CONFLICT (
          edition_id,
          variant_code
        )

        DO UPDATE SET
          variant_name =
            excluded.variant_name,

          variant_kind =
            excluded.variant_kind,

          package_type =
            excluded.package_type,

          is_default =
            excluded.is_default,

          display_order =
            excluded.display_order,

          updated_at =
            CURRENT_TIMESTAMP

        RETURNING
          id,
          edition_id,
          variant_code,
          variant_name,
          variant_kind,
          package_type,
          is_default,
          display_order,
          publish_status
      `)
        .bind(
          edition.id,
          variantCode,
          variantName,
          variantKind,
          packageType,
          isDefault,
          displayOrder
        )
        .first<{
          id: number
          edition_id: number
          variant_code: string
          variant_name: string
          variant_kind: string
          package_type: string
          is_default: number
          display_order: number
          publish_status: string
        }>()

    if (!variant) {
      return jsonError(
        c,
        '상품 에디션을 저장하지 못했습니다.',
        500
      )
    }

    const preorder =
      await c.env.DB.prepare(`
        INSERT INTO variant_preorders (
          variant_id,
          official_source_id,
          release_date,
          preorder_start_date,
          preorder_end_date,
          preorder_status,
          preorder_bonus,
          preorder_bonus_note,
          contents_text,
          candidate_price,
          confirmed_price,
          price_status,
          publish_status,
          display_order
        )

        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          'DRAFT', ?
        )

        ON CONFLICT (
          variant_id,
          official_source_id
        )

        DO UPDATE SET
          release_date =
            excluded.release_date,

          preorder_start_date =
            excluded.preorder_start_date,

          preorder_end_date =
            excluded.preorder_end_date,

          preorder_status =
            excluded.preorder_status,

          preorder_bonus =
            excluded.preorder_bonus,

          preorder_bonus_note =
            excluded.preorder_bonus_note,

          contents_text =
            excluded.contents_text,

          candidate_price =
            excluded.candidate_price,

          confirmed_price =
            excluded.confirmed_price,

          price_status =
            excluded.price_status,

          display_order =
            excluded.display_order,

          updated_at =
            CURRENT_TIMESTAMP

        RETURNING
          id,
          variant_id,
          official_source_id,
          publish_status
      `)
        .bind(
          variant.id,
          officialSourceId,
          releaseDate,
          preorderStartDate,
          preorderEndDate,
          preorderStatus,
          preorderBonus,
          preorderBonusNote,
          contentsText,
          candidatePrice,
          confirmedPrice,
          priceStatus,
          displayOrder
        )
        .first<{
          id: number
          variant_id: number
          official_source_id: number
          publish_status: string
        }>()

    if (!preorder) {
      return jsonError(
        c,
        '예약판매 DRAFT를 저장하지 못했습니다.',
        500
      )
    }

    const rawImages = Array.isArray(
      body.images
    )
      ? body.images
      : null

    if (rawImages) {
      const normalizedImages: Array<{
        imageId: number
        displayRole: string
        displayOrder: number
        altText: string | null
      }> = []

      let representativeCount = 0

      for (const rawImage of rawImages) {
        if (
          !rawImage ||
          typeof rawImage !== 'object'
        ) {
          return jsonError(
            c,
            '이미지 연결 정보가 올바르지 않습니다.',
            400
          )
        }

        const imageObject =
          rawImage as Record<string, unknown>

        const imageId =
          positiveInteger(
            imageObject.imageId
          )

        const displayRole = text(
          imageObject.displayRole,
          30
        ).toUpperCase()

        const imageDisplayOrder =
          integerOrZero(
            imageObject.displayOrder
          )

        const altText = nullableText(
          imageObject.altText,
          300
        )

        if (!imageId) {
          return jsonError(
            c,
            '올바르지 않은 이미지 ID입니다.',
            400
          )
        }

        if (
          !ALLOWED_IMAGE_ROLES.has(
            displayRole
          )
        ) {
          return jsonError(
            c,
            '지원하지 않는 이미지 역할입니다.',
            400
          )
        }

        if (
          displayRole ===
          'REPRESENTATIVE'
        ) {
          representativeCount += 1
        }

        normalizedImages.push({
          imageId,
          displayRole,
          displayOrder:
            imageDisplayOrder,
          altText,
        })
      }

      if (representativeCount > 1) {
        return jsonError(
          c,
          '대표 이미지는 에디션별로 한 장만 선택할 수 있습니다.',
          400
        )
      }

      const uniqueImageIds = Array.from(
        new Set(
          normalizedImages.map(
            (image) => image.imageId
          )
        )
      )

      if (uniqueImageIds.length > 0) {
        const placeholders =
          uniqueImageIds
            .map(() => '?')
            .join(', ')

        const { results: allowedImages } =
          await c.env.DB.prepare(`
            SELECT id

            FROM watch_item_images

            WHERE
              watch_item_id = ?
		AND permission_status = 'APPROVED'
		AND stored_image_url IS NOT NULL
		AND TRIM(stored_image_url) <> ''
		AND id IN (${placeholders})

          `)
            .bind(
              officialSource.watch_item_id,
              ...uniqueImageIds
            )
            .all<{ id: number }>()

        const allowedIds = new Set(
          (allowedImages ?? []).map(
            (image) => Number(image.id)
          )
        )

        const invalidImage =
          uniqueImageIds.find(
            (imageId) =>
              !allowedIds.has(imageId)
          )

        if (invalidImage) {
          return jsonError(
            c,
            '승인되지 않았거나 R2에 저장되지 않은 이미지가 포함되어 있습니다.',
            409
          )
        }
      }

      const imageStatements = [
        c.env.DB.prepare(`
          DELETE FROM variant_preorder_images
          WHERE preorder_id = ?
        `).bind(preorder.id),
      ]

      for (
        const image of normalizedImages
      ) {
        imageStatements.push(
          c.env.DB.prepare(`
            INSERT INTO variant_preorder_images (
              preorder_id,
              image_id,
              display_role,
              display_order,
              alt_text
            )

            VALUES (?, ?, ?, ?, ?)
          `).bind(
            preorder.id,
            image.imageId,
            image.displayRole,
            image.displayOrder,
            image.altText
          )
        )
      }

      await c.env.DB.batch(
        imageStatements
      )
    }

    return c.json({
      ok: true,
      game: {
        id: game.id,
        title: game.title,
      },
      edition,
      variant,
      preorder,
    })
  }
)


// ------------------------------------------------------------
// DRAFT 에디션 이미지 일괄 연결
//
// 대표 이미지는 선택한 모든 DRAFT 에디션에 적용한다.
// 구성품 이미지는 선택한 DRAFT 에디션에만 적용한다.
// 다른 역할의 기존 이미지는 유지한다.
// 검토 승인·게시 상태는 변경하지 않는다.
// ------------------------------------------------------------

preorderAdmin.post(
  '/games/:gameId/images/bulk',
  async (c) => {
    const gameId = Number(
      c.req.param('gameId')
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      return jsonError(
        c,
        '게임 정보가 올바르지 않습니다.',
        400
      )
    }

    const body = await c.req
      .json<Record<string, unknown>>()
      .catch(() => null)

    if (!body) {
      return jsonError(
        c,
        'invalid JSON body',
        400
      )
    }

    const representativeImageId =
      positiveInteger(
        body.representativeImageId
      )

    const contentsImageId =
      positiveInteger(
        body.contentsImageId
      )

    const normalizeIds = (
      value: unknown
    ): number[] => {
      if (!Array.isArray(value)) {
        return []
      }

      return Array.from(
        new Set(
          value
            .map(Number)
            .filter(
              (id) =>
                Number.isInteger(id) &&
                id > 0
            )
        )
      )
    }

    const representativeVariantIds =
      normalizeIds(
        body.representativeVariantIds
      )

    const contentsVariantIds =
      normalizeIds(
        body.contentsVariantIds
      )

    if (
      !representativeImageId ||
      representativeVariantIds.length < 1
    ) {
      return jsonError(
        c,
        '대표 이미지와 적용 대상 에디션을 선택해 주세요.',
        400
      )
    }

    if (
      contentsVariantIds.length > 0 &&
      !contentsImageId
    ) {
      return jsonError(
        c,
        '구성품 이미지를 선택해 주세요.',
        400
      )
    }

    if (
      contentsImageId &&
      contentsImageId ===
        representativeImageId
    ) {
      return jsonError(
        c,
        '대표 이미지와 구성품 이미지는 서로 달라야 합니다.',
        400
      )
    }

    const game = await c.env.DB.prepare(`
      SELECT
        id,
        title,
        publish_status

      FROM games

      WHERE id = ?

      LIMIT 1
    `)
      .bind(gameId)
      .first<{
        id: number
        title: string
        publish_status: string
      }>()

    if (!game) {
      return jsonError(
        c,
        '게임을 찾을 수 없습니다.',
        404
      )
    }

    if (game.publish_status !== 'DRAFT') {
      return jsonError(
        c,
        '비공개 DRAFT 게임에서만 이미지 일괄 저장을 사용할 수 있습니다.',
        409
      )
    }

    const { results: rows } =
      await c.env.DB.prepare(`
        SELECT
          pv.id AS variant_id,
          pv.variant_name,
          pv.publish_status
            AS variant_publish_status,

          vp.id AS preorder_id,
          vp.publish_status
            AS preorder_publish_status,

          gos.watch_item_id

        FROM product_variants pv

        INNER JOIN editions e
          ON e.id = pv.edition_id

        INNER JOIN variant_preorders vp
          ON vp.variant_id = pv.id

        INNER JOIN game_official_sources gos
          ON gos.id = vp.official_source_id

        WHERE e.game_id = ?

        ORDER BY
          pv.display_order ASC,
          pv.id ASC
      `)
        .bind(gameId)
        .all<{
          variant_id: number
          variant_name: string
          variant_publish_status: string
          preorder_id: number
          preorder_publish_status: string
          watch_item_id: number
        }>()

    const variantMap = new Map(
      (rows ?? []).map(
        (row) => [
          Number(row.variant_id),
          row,
        ]
      )
    )

    const allRequestedIds =
      Array.from(
        new Set([
          ...representativeVariantIds,
          ...contentsVariantIds,
        ])
      )

    for (const variantId of allRequestedIds) {
      const target = variantMap.get(
        variantId
      )

      if (!target) {
        return jsonError(
          c,
          '선택한 에디션이 이 게임에 속하지 않습니다.',
          409
        )
      }

      if (
        target.variant_publish_status !==
          'DRAFT' ||
        target.preorder_publish_status !==
          'DRAFT'
      ) {
        return jsonError(
          c,
          'DRAFT 상태의 에디션만 일괄 수정할 수 있습니다.',
          409
        )
      }
    }

    const imageIds = [
      representativeImageId,
      contentsImageId,
    ].filter(
      (imageId): imageId is number =>
        Number.isInteger(imageId) &&
        imageId > 0
    )

    const imageMap = new Map<
      number,
      {
        id: number
        watch_item_id: number
      }
    >()

    for (const imageId of imageIds) {
      const image =
        await c.env.DB.prepare(`
          SELECT
            id,
            watch_item_id

          FROM watch_item_images

          WHERE
            id = ?
            AND permission_status =
              'APPROVED'
            AND stored_image_url
              IS NOT NULL
            AND TRIM(stored_image_url)
              <> ''

          LIMIT 1
        `)
          .bind(imageId)
          .first<{
            id: number
            watch_item_id: number
          }>()

      if (!image) {
        return jsonError(
          c,
          '승인되지 않았거나 R2에 저장되지 않은 이미지가 포함되어 있습니다.',
          409
        )
      }

      imageMap.set(imageId, image)
    }

    for (
      const variantId of
      representativeVariantIds
    ) {
      const target =
        variantMap.get(variantId)!

      const image =
        imageMap.get(
          representativeImageId
        )!

      if (
        Number(image.watch_item_id) !==
        Number(target.watch_item_id)
      ) {
        return jsonError(
          c,
          '대표 이미지와 에디션의 공식 출처가 일치하지 않습니다.',
          409
        )
      }
    }

    if (contentsImageId) {
      for (
        const variantId of
        contentsVariantIds
      ) {
        const target =
          variantMap.get(variantId)!

        const image =
          imageMap.get(
            contentsImageId
          )!

        if (
          Number(image.watch_item_id) !==
          Number(target.watch_item_id)
        ) {
          return jsonError(
            c,
            '구성품 이미지와 에디션의 공식 출처가 일치하지 않습니다.',
            409
          )
        }
      }
    }

    const statements = []

    for (
      const variantId of
      representativeVariantIds
    ) {
      const target =
        variantMap.get(variantId)!

      statements.push(
        c.env.DB.prepare(`
          DELETE FROM variant_preorder_images

          WHERE
            preorder_id = ?
            AND (
              display_role =
                'REPRESENTATIVE'
              OR image_id = ?
            )
        `).bind(
          target.preorder_id,
          representativeImageId
        )
      )

      statements.push(
        c.env.DB.prepare(`
          INSERT INTO variant_preorder_images (
            preorder_id,
            image_id,
            display_role,
            display_order,
            alt_text
          )

          VALUES (
            ?, ?, 'REPRESENTATIVE', 0, ?
          )
        `).bind(
          target.preorder_id,
          representativeImageId,
          `${target.variant_name} 대표 이미지`
        )
      )
    }

    if (contentsImageId) {
      const draftRows =
        (rows ?? []).filter(
          (row) =>
            row.variant_publish_status ===
              'DRAFT' &&
            row.preorder_publish_status ===
              'DRAFT'
        )

      for (const target of draftRows) {
        statements.push(
          c.env.DB.prepare(`
            DELETE FROM variant_preorder_images

            WHERE
              preorder_id = ?
              AND image_id = ?
          `).bind(
            target.preorder_id,
            contentsImageId
          )
        )
      }

      for (
        const variantId of
        contentsVariantIds
      ) {
        const target =
          variantMap.get(variantId)!

        statements.push(
          c.env.DB.prepare(`
            INSERT INTO variant_preorder_images (
              preorder_id,
              image_id,
              display_role,
              display_order,
              alt_text
            )

            VALUES (
              ?, ?, 'CONTENTS', 1, ?
            )
          `).bind(
            target.preorder_id,
            contentsImageId,
            `${target.variant_name} 구성품 이미지`
          )
        )
      }
    }

    if (statements.length < 1) {
      return jsonError(
        c,
        '저장할 이미지 연결이 없습니다.',
        400
      )
    }

    await c.env.DB.batch(statements)

    return c.json({
      ok: true,
      gameId,
      representativeImageId,
      contentsImageId:
        contentsImageId ?? null,
      representativeSaved:
        representativeVariantIds.length,
      contentsSaved:
        contentsImageId
          ? contentsVariantIds.length
          : 0,
      publishStatusChanged: false,
    })
  }
)

// ------------------------------------------------------------
// 검토 준비 일정·상태 일괄 저장
//
// 모든 DRAFT 에디션에 같은 예약판매 상태와 일정 또는
// 공식 미발표 등의 예외 사유를 적용한다.
// 이미지, 가격, 승인, 공개 상태는 변경하지 않는다.
// ------------------------------------------------------------

preorderAdmin.post(
  '/games/:gameId/review-preparation/bulk',
  async (c) => {
    const gameId = Number(
      c.req.param('gameId')
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      return jsonError(
        c,
        '게임 정보가 올바르지 않습니다.',
        400
      )
    }

    const body = await c.req
      .json<Record<string, unknown>>()
      .catch(() => null)

    if (!body) {
      return jsonError(
        c,
        'invalid JSON body',
        400
      )
    }

    const preorderStatus = text(
      body.preorderStatus,
      30
    ).toUpperCase()

    const startResolution = text(
      body.startResolution,
      50
    ).toUpperCase()

    const endResolution = text(
      body.endResolution,
      50
    ).toUpperCase()

    const rawStartDate = text(
      body.startDate,
      10
    )

    const rawEndDate = text(
      body.endDate,
      10
    )

    if (
      !ALLOWED_PREORDER_STATUSES.has(
        preorderStatus
      ) ||
      preorderStatus === 'UNKNOWN' ||
      preorderStatus === 'CANCELLED'
    ) {
      return jsonError(
        c,
        '예약판매 상태를 예정·진행 중·종료 중에서 선택해 주세요.',
        400
      )
    }

    const startUsesDate =
      startResolution === 'DATE'

    const endUsesDate =
      endResolution === 'DATE'

    if (
      !startUsesDate &&
      !ALLOWED_REVIEW_EXCEPTION_REASONS
        .has(startResolution)
    ) {
      return jsonError(
        c,
        '예약판매 시작일 또는 미입력 사유를 선택해 주세요.',
        400
      )
    }

    if (
      !endUsesDate &&
      !ALLOWED_REVIEW_EXCEPTION_REASONS
        .has(endResolution)
    ) {
      return jsonError(
        c,
        '예약판매 종료일 또는 미입력 사유를 선택해 주세요.',
        400
      )
    }

    const startDate =
      startUsesDate
        ? nullableDate(rawStartDate)
        : null

    const endDate =
      endUsesDate
        ? nullableDate(rawEndDate)
        : null

    if (
      startUsesDate &&
      !startDate
    ) {
      return jsonError(
        c,
        '올바른 예약판매 시작일을 입력해 주세요.',
        400
      )
    }

    if (
      endUsesDate &&
      !endDate
    ) {
      return jsonError(
        c,
        '올바른 예약판매 종료일을 입력해 주세요.',
        400
      )
    }

    if (
      startDate &&
      endDate &&
      startDate > endDate
    ) {
      return jsonError(
        c,
        '예약판매 종료일은 시작일보다 빠를 수 없습니다.',
        400
      )
    }

    const game = await c.env.DB.prepare(`
      SELECT
        id,
        title,
        publish_status

      FROM games

      WHERE id = ?

      LIMIT 1
    `)
      .bind(gameId)
      .first<{
        id: number
        title: string
        publish_status: string
      }>()

    if (!game) {
      return jsonError(
        c,
        '게임을 찾을 수 없습니다.',
        404
      )
    }

    if (game.publish_status !== 'DRAFT') {
      return jsonError(
        c,
        '비공개 DRAFT 게임에서만 검토 준비 정보를 수정할 수 있습니다.',
        409
      )
    }

    const { results: targets } =
      await c.env.DB.prepare(`
        SELECT
          vp.id AS preorder_id,
          vp.review_exceptions,

          pv.id AS variant_id,
          pv.variant_name,
          pv.publish_status
            AS variant_publish_status,

          vp.publish_status
            AS preorder_publish_status

        FROM variant_preorders vp

        INNER JOIN product_variants pv
          ON pv.id = vp.variant_id

        INNER JOIN editions e
          ON e.id = pv.edition_id

        WHERE
          e.game_id = ?
          AND pv.publish_status = 'DRAFT'
          AND vp.publish_status = 'DRAFT'

        ORDER BY
          pv.display_order ASC,
          pv.id ASC
      `)
        .bind(gameId)
        .all<{
          preorder_id: number
          review_exceptions: string | null
          variant_id: number
          variant_name: string
          variant_publish_status: string
          preorder_publish_status: string
        }>()

    if (!targets || targets.length < 1) {
      return jsonError(
        c,
        '일괄 저장할 DRAFT 에디션이 없습니다.',
        404
      )
    }

    const statements = []

    for (const target of targets) {
      const exceptions =
        parseReviewExceptions(
          target.review_exceptions
        )

      if (startUsesDate) {
        delete exceptions
          .PREORDER_START_DATE
      } else {
        exceptions.PREORDER_START_DATE = {
          reason: startResolution,
        }
      }

      if (endUsesDate) {
        delete exceptions
          .PREORDER_END_DATE
      } else {
        exceptions.PREORDER_END_DATE = {
          reason: endResolution,
        }
      }

      statements.push(
        c.env.DB.prepare(`
          UPDATE variant_preorders

          SET
            preorder_start_date = ?,
            preorder_end_date = ?,
            preorder_status = ?,
            review_exceptions = ?,
            updated_at = CURRENT_TIMESTAMP

          WHERE
            id = ?
            AND publish_status = 'DRAFT'
        `).bind(
          startDate,
          endDate,
          preorderStatus,
          JSON.stringify(exceptions),
          target.preorder_id
        )
      )
    }

    const results =
      await c.env.DB.batch(
        statements
      )

    const updatedCount =
      results.reduce(
        (sum, result) =>
          sum +
          Number(
            result.meta.changes || 0
          ),
        0
      )

    if (
      updatedCount !== targets.length
    ) {
      return jsonError(
        c,
        '일부 에디션의 검토 준비 정보를 저장하지 못했습니다.',
        500
      )
    }

    return c.json({
      ok: true,
      gameId,
      preorderStatus,
      startResolution,
      startDate,
      endResolution,
      endDate,
      updatedCount,
      publishStatusChanged: false,
    })
  }
)

// ------------------------------------------------------------
// 범용 예약특전 규칙 일괄 저장
//
// 모든 DRAFT 에디션을 정확히 한 번씩 처리한다.
// 승인·공개·이미지·가격 상태는 변경하지 않는다.
// ------------------------------------------------------------

preorderAdmin.post(
  '/games/:gameId/benefits/bulk',
  async (c) => {
    const gameId = Number(
      c.req.param('gameId')
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      return jsonError(
        c,
        '게임 정보가 올바르지 않습니다.',
        400
      )
    }

    const body = await c.req
      .json<Record<string, unknown>>()
      .catch(() => null)

    if (
      !body ||
      !Array.isArray(body.assignments)
    ) {
      return jsonError(
        c,
        '예약특전 적용 규칙이 올바르지 않습니다.',
        400
      )
    }

    const allowedModes = new Set([
      'PROVIDE',
      'OFFICIAL_NOT_PROVIDED',
      'NOT_APPLICABLE',
      'OFFICIAL_UNANNOUNCED',
      'SELLER_SPECIFIC',
      'LATER_UPDATE',
    ])

    type Assignment = {
      mode: string
      bonus: string | null
      note: string | null
    }

    const assignments =
      new Map<number, Assignment>()

    for (
      const raw of
      body.assignments
    ) {
      if (
        !raw ||
        typeof raw !== 'object' ||
        Array.isArray(raw)
      ) {
        return jsonError(
          c,
          '예약특전 적용 항목이 올바르지 않습니다.',
          400
        )
      }

      const item =
        raw as Record<string, unknown>

      const variantId =
        positiveInteger(item.variantId)

      const mode = text(
        item.mode,
        50
      ).toUpperCase()

      const bonus = nullableText(
        item.bonus,
        5000
      )

      const note = nullableText(
        item.note,
        5000
      )

      if (!variantId) {
        return jsonError(
          c,
          '예약특전 대상 에디션이 올바르지 않습니다.',
          400
        )
      }

      if (!allowedModes.has(mode)) {
        return jsonError(
          c,
          '지원하지 않는 예약특전 처리 방식입니다.',
          400
        )
      }

      if (
        mode === 'PROVIDE' &&
        !bonus
      ) {
        return jsonError(
          c,
          '특전 제공 규칙에는 특전 내용을 입력해 주세요.',
          400
        )
      }

      if (assignments.has(variantId)) {
        return jsonError(
          c,
          '같은 에디션이 여러 규칙에 중복 지정되었습니다.',
          409
        )
      }

      assignments.set(
        variantId,
        {
          mode,
          bonus:
            mode === 'PROVIDE'
              ? bonus
              : null,
          note,
        }
      )
    }

    const game =
      await c.env.DB.prepare(`
        SELECT
          id,
          publish_status

        FROM games

        WHERE id = ?

        LIMIT 1
      `)
        .bind(gameId)
        .first<{
          id: number
          publish_status: string
        }>()

    if (!game) {
      return jsonError(
        c,
        '게임을 찾을 수 없습니다.',
        404
      )
    }

    if (game.publish_status !== 'DRAFT') {
      return jsonError(
        c,
        '작성 중인 비공개 게임에서만 사용할 수 있습니다.',
        409
      )
    }

    const { results: targets } =
      await c.env.DB.prepare(`
        SELECT
          pv.id AS variant_id,
          vp.id AS preorder_id,
          vp.review_exceptions

        FROM product_variants pv

        INNER JOIN editions e
          ON e.id = pv.edition_id

        INNER JOIN variant_preorders vp
          ON vp.variant_id = pv.id

        WHERE
          e.game_id = ?
          AND pv.publish_status = 'DRAFT'
          AND vp.publish_status = 'DRAFT'

        ORDER BY
          pv.display_order,
          pv.id
      `)
        .bind(gameId)
        .all<{
          variant_id: number
          preorder_id: number
          review_exceptions:
            string | null
        }>()

    if (!targets?.length) {
      return jsonError(
        c,
        '저장할 작성 중 에디션이 없습니다.',
        404
      )
    }

    if (
      assignments.size !==
      targets.length
    ) {
      return jsonError(
        c,
        '모든 작성 중 에디션의 예약특전 처리 방식을 지정해 주세요.',
        409
      )
    }

    const targetIds = new Set(
      targets.map(
        (target) =>
          Number(target.variant_id)
      )
    )

    for (
      const variantId of
      assignments.keys()
    ) {
      if (!targetIds.has(variantId)) {
        return jsonError(
          c,
          '다른 게임 또는 수정할 수 없는 에디션이 포함되어 있습니다.',
          409
        )
      }
    }

    const statements = []
    let providedCount = 0
    let exceptionCount = 0

    for (const target of targets) {
      const assignment =
        assignments.get(
          Number(target.variant_id)
        )!

      const exceptions =
        parseReviewExceptions(
          target.review_exceptions
        )

      if (
        assignment.mode ===
        'PROVIDE'
      ) {
        delete exceptions.PREORDER_BONUS
        providedCount += 1
      } else {
        exceptions.PREORDER_BONUS = {
          reason: assignment.mode,
          ...(assignment.note
            ? { note: assignment.note }
            : {}),
        }

        exceptionCount += 1
      }

      statements.push(
        c.env.DB.prepare(`
          UPDATE variant_preorders

          SET
            preorder_bonus = ?,
            preorder_bonus_note = ?,
            review_exceptions = ?,
            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            id = ?
            AND publish_status = 'DRAFT'
        `).bind(
          assignment.bonus,
          assignment.note,
          JSON.stringify(exceptions),
          target.preorder_id
        )
      )
    }

    const results =
      await c.env.DB.batch(statements)

    const updatedCount =
      results.reduce(
        (sum, result) =>
          sum +
          Number(
            result.meta.changes || 0
          ),
        0
      )

    if (
      updatedCount !== targets.length
    ) {
      return jsonError(
        c,
        '일부 에디션의 예약특전을 저장하지 못했습니다.',
        500
      )
    }

    return c.json({
      ok: true,
      gameId,
      updatedCount,
      providedCount,
      exceptionCount,
      publishStatusChanged: false,
    })
  }
)

// ------------------------------------------------------------
// 전체 DRAFT 에디션 일괄 검토 승인
//
// 1. 게임에 연결된 모든 예약판매를 먼저 조회한다.
// 2. 모든 DRAFT 항목의 필수 조건을 검증한다.
// 3. 한 항목이라도 실패하면 아무것도 승인하지 않는다.
// 4. 전체 검증 통과 후 D1 batch로 DRAFT → APPROVED 처리한다.
// 5. 게임·상품 에디션·공개 상태는 변경하지 않는다.
// ------------------------------------------------------------

preorderAdmin.post(
  '/games/:gameId/approve/bulk',
  async (c) => {
    const gameId = Number(
      c.req.param('gameId')
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      return jsonError(
        c,
        '게임 정보가 올바르지 않습니다.',
        400
      )
    }

    const game =
      await c.env.DB.prepare(`
        SELECT
          id,
          title,
          publish_status

        FROM games

        WHERE id = ?

        LIMIT 1
      `)
        .bind(gameId)
        .first<{
          id: number
          title: string
          publish_status: string
        }>()

    if (!game) {
      return jsonError(
        c,
        '게임을 찾을 수 없습니다.',
        404
      )
    }

    if (game.publish_status !== 'DRAFT') {
      return jsonError(
        c,
        '작성 중인 비공개 게임만 일괄 검토 승인할 수 있습니다.',
        409
      )
    }

    const { results: targets } =
      await c.env.DB.prepare(`
        SELECT
          e.platform,

          pv.id AS variant_id,
          pv.variant_name,
          pv.variant_kind,
          pv.package_type,
          pv.publish_status
            AS variant_publish_status,

          vp.id AS preorder_id,
          vp.release_date,
          vp.preorder_start_date,
          vp.preorder_end_date,
          vp.review_exceptions,
          vp.preorder_status,
          vp.preorder_bonus,
          vp.preorder_bonus_note,
          vp.candidate_price,
          vp.confirmed_price,
          vp.price_status,
          vp.publish_status
            AS preorder_publish_status,

          gos.id AS official_source_id,
          gos.official_source_url,

          (
            SELECT COUNT(*)

            FROM variant_preorder_images vpi

            WHERE
              vpi.preorder_id = vp.id
          ) AS image_count,

          (
            SELECT COUNT(*)

            FROM variant_preorder_images vpi

            WHERE
              vpi.preorder_id = vp.id
              AND vpi.display_role =
                'REPRESENTATIVE'
          ) AS representative_count,

          (
            SELECT COUNT(*)

            FROM variant_preorder_images vpi

            INNER JOIN watch_item_images wii
              ON wii.id = vpi.image_id

            WHERE
              vpi.preorder_id = vp.id
              AND wii.permission_status =
                'APPROVED'
              AND wii.stored_image_url
                IS NOT NULL
              AND TRIM(
                wii.stored_image_url
              ) <> ''
          ) AS valid_image_count

        FROM variant_preorders vp

        INNER JOIN product_variants pv
          ON pv.id = vp.variant_id

        INNER JOIN editions e
          ON e.id = pv.edition_id

        INNER JOIN game_official_sources gos
          ON gos.id =
            vp.official_source_id

        WHERE e.game_id = ?

        ORDER BY
          CASE e.platform
            WHEN 'ps5' THEN 1
            WHEN 'switch' THEN 2
            WHEN 'switch2' THEN 3
            WHEN 'xbox' THEN 4
            WHEN 'ps4' THEN 5
            WHEN 'pc' THEN 6
            ELSE 7
          END,
          pv.display_order ASC,
          pv.id ASC
      `)
        .bind(gameId)
        .all<any>()

    if (!targets || targets.length < 1) {
      return jsonError(
        c,
        '검토 승인할 예약판매 에디션이 없습니다.',
        404
      )
    }

    const invalidStatus =
      targets.find(
        (target) => {
          const status = String(
            target.preorder_publish_status ||
            ''
          ).toUpperCase()

          return (
            status !== 'DRAFT' &&
            status !== 'APPROVED'
          )
        }
      )

    if (invalidStatus) {
      return jsonError(
        c,
        '작성 중 또는 검토 승인 상태가 아닌 에디션이 포함되어 있습니다.',
        409
      )
    }

    const draftTargets =
      targets.filter(
        (target) =>
          String(
            target.preorder_publish_status ||
            ''
          ).toUpperCase() ===
          'DRAFT'
      )

    if (draftTargets.length < 1) {
      return c.json({
        ok: true,
        alreadyApproved: true,
        gameId,
        totalCount: targets.length,
        approvedCount: 0,
        alreadyApprovedCount:
          targets.length,
        publishStatusChanged: false,
      })
    }

    const failures: Array<{
      variantId: number
      variantName: string
      reason: string
    }> = []

    let exceptionVariantCount = 0

    for (const target of draftTargets) {
      const reasons: string[] = []

      const exceptions =
        parseReviewExceptions(
          target.review_exceptions
        )

      const exceptionKeys =
        Object.keys(exceptions)

      if (exceptionKeys.length > 0) {
        exceptionVariantCount += 1
      }

      if (
        target.variant_publish_status !==
        'DRAFT'
      ) {
        reasons.push(
          '상품 에디션이 작성 중 상태가 아님'
        )
      }

      if (
        !isValidDate(
          text(target.release_date, 10)
        )
      ) {
        reasons.push(
          '출시일 확인 필요'
        )
      }

      if (
        !target.preorder_start_date &&
        !hasReviewException(
          exceptions,
          'PREORDER_START_DATE'
        )
      ) {
        reasons.push(
          '예약 시작일 또는 미입력 사유 필요'
        )
      }

      if (
        !target.preorder_end_date &&
        !hasReviewException(
          exceptions,
          'PREORDER_END_DATE'
        )
      ) {
        reasons.push(
          '예약 종료일 또는 미입력 사유 필요'
        )
      }

      const startDate = text(
        target.preorder_start_date,
        10
      )

      const endDate = text(
        target.preorder_end_date,
        10
      )

      if (
        startDate &&
        !isValidDate(startDate)
      ) {
        reasons.push(
          '예약 시작일 형식 확인 필요'
        )
      }

      if (
        endDate &&
        !isValidDate(endDate)
      ) {
        reasons.push(
          '예약 종료일 형식 확인 필요'
        )
      }

      if (
        startDate &&
        endDate &&
        startDate > endDate
      ) {
        reasons.push(
          '예약 종료일이 시작일보다 빠름'
        )
      }

      const preorderStatus = String(
        target.preorder_status ||
        'UNKNOWN'
      ).toUpperCase()

      if (
        preorderStatus === 'UNKNOWN' ||
        preorderStatus === 'CANCELLED'
      ) {
        reasons.push(
          '예약판매 상태 확인 필요'
        )
      }

      if (
        !text(target.preorder_bonus) &&
        !hasReviewException(
          exceptions,
          'PREORDER_BONUS'
        )
      ) {
        reasons.push(
          '예약특전 또는 처리 사유 필요'
        )
      }

      if (
        !target.official_source_id ||
        !text(
          target.official_source_url
        )
      ) {
        reasons.push(
          '공식 출처 확인 필요'
        )
      }

      const imageCount = Number(
        target.image_count || 0
      )

      const representativeCount =
        Number(
          target.representative_count ||
          0
        )

      const validImageCount =
        Number(
          target.valid_image_count || 0
        )

      if (imageCount < 1) {
        reasons.push(
          '에디션 이미지 필요'
        )
      }

      if (
        representativeCount !== 1
      ) {
        reasons.push(
          '대표 이미지는 정확히 한 장 필요'
        )
      }

      if (
        validImageCount !==
        imageCount
      ) {
        reasons.push(
          '이미지 승인·R2 저장 확인 필요'
        )
      }

      const priceStatus = String(
        target.price_status ||
        'UNCONFIRMED'
      ).toUpperCase()

      if (
        !ALLOWED_PRICE_STATUSES.has(
          priceStatus
        )
      ) {
        reasons.push(
          '가격 상태 확인 필요'
        )
      }

      if (
        priceStatus === 'CONFIRMED' &&
        (
          !Number.isInteger(
            Number(
              target.confirmed_price
            )
          ) ||
          Number(
            target.confirmed_price
          ) <= 0
        )
      ) {
        reasons.push(
          '확정 가격 확인 필요'
        )
      }

      if (
        priceStatus === 'CANDIDATE' &&
        (
          !Number.isInteger(
            Number(
              target.candidate_price
            )
          ) ||
          Number(
            target.candidate_price
          ) <= 0
        )
      ) {
        reasons.push(
          '가격 후보 확인 필요'
        )
      }

      if (reasons.length > 0) {
        failures.push({
          variantId:
            Number(target.variant_id),

          variantName:
            text(
              target.variant_name,
              100
            ) || '이름 없는 에디션',

          reason:
            reasons.join(' · '),
        })
      }
    }

    if (failures.length > 0) {
      const preview =
        failures
          .slice(0, 5)
          .map(
            (failure) =>
              `${failure.variantName}: ${failure.reason}`
          )
          .join('\n')

      return c.json(
        {
          ok: false,
          error:
            '전체 검토 승인 조건을 충족하지 못했습니다.\n' +
            preview +
            (
              failures.length > 5
                ? `\n외 ${failures.length - 5}개`
                : ''
            ),
          failures,
          approvedCount: 0,
          publishStatusChanged: false,
        },
        409
      )
    }

    const statements =
      draftTargets.map(
        (target) =>
          c.env.DB.prepare(`
            UPDATE variant_preorders

            SET
              publish_status =
                'APPROVED',
              approved_at =
                CURRENT_TIMESTAMP,
              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              id = ?
              AND publish_status =
                'DRAFT'
          `).bind(
            target.preorder_id
          )
      )

    const results =
      await c.env.DB.batch(
        statements
      )

    const approvedCount =
      results.reduce(
        (sum, result) =>
          sum +
          Number(
            result.meta.changes || 0
          ),
        0
      )

    if (
      approvedCount !==
      draftTargets.length
    ) {
      return jsonError(
        c,
        '전체 검토 승인 결과를 확인할 수 없습니다.',
        500
      )
    }

    return c.json({
      ok: true,
      alreadyApproved: false,
      gameId,
      totalCount: targets.length,
      approvedCount,
      alreadyApprovedCount:
        targets.length -
        draftTargets.length,
      exceptionVariantCount,
      publishStatusChanged: false,
      gamePublishStatus:
        game.publish_status,
    })
  }
)

// ------------------------------------------------------------
// 상품 에디션 예약판매 검토 승인
//
// DRAFT → APPROVED
// 게임과 상품 에디션은 계속 비공개 상태로 유지한다.
// ------------------------------------------------------------

preorderAdmin.post(
  '/games/:gameId/variants/:variantId/approve',
  async (c) => {
    const gameId = Number(
      c.req.param('gameId')
    )

    const variantId = Number(
      c.req.param('variantId')
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0 ||
      !Number.isInteger(variantId) ||
      variantId <= 0
    ) {
      return jsonError(
        c,
        '게임 또는 상품 에디션 정보가 올바르지 않습니다.',
        400
      )
    }

    const target = await c.env.DB.prepare(`
      SELECT
        g.id AS game_id,
        g.title AS game_title,
        g.publish_status AS game_publish_status,

        pv.id AS variant_id,
        pv.variant_name,
        pv.publish_status AS variant_publish_status,

        vp.id AS preorder_id,
        vp.release_date,
        vp.preorder_start_date,
        vp.preorder_end_date,
        vp.review_exceptions,
        vp.preorder_status,
        vp.preorder_bonus,
        vp.preorder_bonus_note,
        vp.candidate_price,
        vp.confirmed_price,
        vp.price_status,
        vp.publish_status AS preorder_publish_status,

        gos.id AS official_source_id,
        gos.official_source_url,

        (
          SELECT COUNT(*)
          FROM variant_preorder_images vpi
          WHERE vpi.preorder_id = vp.id
        ) AS image_count,

        (
          SELECT COUNT(*)
          FROM variant_preorder_images vpi
          WHERE
            vpi.preorder_id = vp.id
            AND vpi.display_role = 'REPRESENTATIVE'
        ) AS representative_count,

        (
          SELECT COUNT(*)
          FROM variant_preorder_images vpi

          INNER JOIN watch_item_images wii
            ON wii.id = vpi.image_id

          WHERE
            vpi.preorder_id = vp.id
            AND wii.permission_status = 'APPROVED'
            AND wii.stored_image_url IS NOT NULL
            AND TRIM(wii.stored_image_url) <> ''
        ) AS valid_image_count

      FROM variant_preorders vp

      INNER JOIN product_variants pv
        ON pv.id = vp.variant_id

      INNER JOIN editions e
        ON e.id = pv.edition_id

      INNER JOIN games g
        ON g.id = e.game_id

      INNER JOIN game_official_sources gos
        ON gos.id = vp.official_source_id

      WHERE
        g.id = ?
        AND pv.id = ?

      LIMIT 1
    `)
      .bind(
        gameId,
        variantId
      )
      .first<any>()

    if (!target) {
      return jsonError(
        c,
        '검토할 상품 에디션을 찾을 수 없습니다.',
        404
      )
    }

    if (
      target.preorder_publish_status ===
      'APPROVED'
    ) {
      return c.json({
        ok: true,
        alreadyApproved: true,
        gameId,
        variantId,
        preorderId: target.preorder_id,
        publishStatus: 'APPROVED',
      })
    }

    if (
      target.preorder_publish_status !==
      'DRAFT'
    ) {
      return jsonError(
        c,
        'DRAFT 상태의 예약판매만 검토 승인할 수 있습니다.',
        409
      )
    }

    if (
      target.game_publish_status !== 'DRAFT' ||
      target.variant_publish_status !== 'DRAFT'
    ) {
      return jsonError(
        c,
        '비공개 DRAFT 게임과 상품 에디션만 검토 승인할 수 있습니다.',
        409
      )
    }

    if (!target.release_date) {
      return jsonError(
        c,
        '출시일을 입력해 주세요.',
        409
      )
    }

    const reviewExceptions =
      parseReviewExceptions(
        target.review_exceptions
      )

    if (
      !target.preorder_start_date &&
      !hasReviewException(
        reviewExceptions,
        'PREORDER_START_DATE'
      )
    ) {
      return jsonError(
        c,
        '예약판매 시작일 또는 공식 미발표 등의 사유를 입력해 주세요.',
        409
      )
    }

    if (
      !target.preorder_end_date &&
      !hasReviewException(
        reviewExceptions,
        'PREORDER_END_DATE'
      )
    ) {
      return jsonError(
        c,
        '예약판매 종료일 또는 종료일 없음 등의 사유를 입력해 주세요.',
        409
      )
    }

    if (
      !text(target.preorder_bonus) &&
      !hasReviewException(
        reviewExceptions,
        'PREORDER_BONUS'
      )
    ) {
      return jsonError(
        c,
        '예약특전 또는 공식 미제공·해당 없음 등의 처리 사유를 입력해 주세요.',
        409
      )
    }

    if (
      !target.preorder_status ||
      target.preorder_status === 'UNKNOWN'
    ) {
      return jsonError(
        c,
        '예약판매 상태를 확인해 주세요.',
        409
      )
    }

    if (
      !target.official_source_id ||
      !text(target.official_source_url)
    ) {
      return jsonError(
        c,
        '공식 출처 URL을 확인해 주세요.',
        409
      )
    }

    const imageCount = Number(
      target.image_count || 0
    )

    const representativeCount = Number(
      target.representative_count || 0
    )

    const validImageCount = Number(
      target.valid_image_count || 0
    )

    if (imageCount < 1) {
      return jsonError(
        c,
        '승인된 에디션 이미지를 하나 이상 연결해 주세요.',
        409
      )
    }

    if (representativeCount !== 1) {
      return jsonError(
        c,
        '대표 이미지를 정확히 하나 연결해 주세요.',
        409
      )
    }

    if (validImageCount !== imageCount) {
      return jsonError(
        c,
        '승인되지 않았거나 R2에 저장되지 않은 이미지가 포함되어 있습니다.',
        409
      )
    }

    if (
      target.price_status === 'CONFIRMED' &&
      (
        !Number.isInteger(
          Number(target.confirmed_price)
        ) ||
        Number(target.confirmed_price) <= 0
      )
    ) {
      return jsonError(
        c,
        '확정 가격을 확인해 주세요.',
        409
      )
    }

    if (
      target.price_status === 'CANDIDATE' &&
      (
        !Number.isInteger(
          Number(target.candidate_price)
        ) ||
        Number(target.candidate_price) <= 0
      )
    ) {
      return jsonError(
        c,
        '후보 가격을 확인해 주세요.',
        409
      )
    }

    await c.env.DB.prepare(`
      UPDATE variant_preorders

      SET
        publish_status = 'APPROVED',
        approved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP

      WHERE
        id = ?
        AND publish_status = 'DRAFT'
    `)
      .bind(target.preorder_id)
      .run()

    return c.json({
      ok: true,
      alreadyApproved: false,
      gameId,
      variantId,
      preorderId: target.preorder_id,
      publishStatus: 'APPROVED',
      approvedAt: new Date().toISOString(),
    })
  }
)

// ------------------------------------------------------------
// 예약판매 V2 공개
// game: DRAFT → PUBLISHED
// variant: DRAFT → ACTIVE
// preorder: APPROVED → PUBLISHED
// ------------------------------------------------------------

preorderAdmin.post(
  '/games/:gameId/variants/:variantId/publish',
  async (c) => {
    const gameId = Number(c.req.param('gameId'))
    const variantId = Number(c.req.param('variantId'))

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0 ||
      !Number.isInteger(variantId) ||
      variantId <= 0
    ) {
      return jsonError(
        c,
        '게임 ID와 상품 에디션 ID를 확인해 주세요.',
        400
      )
    }

    try {
      const target = await c.env.DB.prepare(`
        SELECT
          g.id AS game_id,
          g.publish_status
            AS game_publish_status,

          pv.id AS variant_id,
          pv.publish_status
            AS variant_publish_status,

          vp.id AS preorder_id,
          vp.release_date,
          vp.preorder_start_date,
          vp.preorder_end_date,
          vp.review_exceptions,
          vp.preorder_status,
          vp.price_status,
          vp.candidate_price,
          vp.confirmed_price,
          vp.publish_status
            AS preorder_publish_status,

          gos.id AS official_source_id,
          gos.watch_item_id,
          gos.official_source_url,
          gos.permission_status_snapshot,

          sip.permission_status
            AS source_permission_status,
          sip.local_storage_allowed,

          (
            SELECT COUNT(*)
            FROM variant_preorder_images vpi
            WHERE vpi.preorder_id = vp.id
          ) AS image_count,

          (
            SELECT COUNT(*)
            FROM variant_preorder_images vpi
            WHERE
              vpi.preorder_id = vp.id
              AND vpi.display_role =
                'REPRESENTATIVE'
          ) AS representative_count,

          (
            SELECT COUNT(*)

            FROM variant_preorder_images vpi

            INNER JOIN watch_item_images wii
              ON wii.id = vpi.image_id

            WHERE
              vpi.preorder_id = vp.id
              AND wii.watch_item_id =
                gos.watch_item_id
              AND wii.permission_status =
                'APPROVED'
              AND wii.stored_image_url
                IS NOT NULL
              AND TRIM(
                wii.stored_image_url
              ) <> ''
              AND wii.image_hash
                IS NOT NULL
              AND TRIM(
                wii.image_hash
              ) <> ''
          ) AS valid_image_count

        FROM variant_preorders vp

        INNER JOIN product_variants pv
          ON pv.id = vp.variant_id

        INNER JOIN editions e
          ON e.id = pv.edition_id

        INNER JOIN games g
          ON g.id = e.game_id

        INNER JOIN game_official_sources gos
          ON gos.id = vp.official_source_id

        LEFT JOIN source_image_policies sip
          ON sip.source_id = gos.source_id

        WHERE
          g.id = ?
          AND pv.id = ?

        LIMIT 1
      `)
        .bind(gameId, variantId)
        .first<{
          game_id: number
          game_publish_status: string
          variant_id: number
          variant_publish_status: string
          preorder_id: number
          release_date: string
          preorder_start_date: string | null
          preorder_end_date: string | null
          preorder_status: string
          price_status: string
          candidate_price: number | null
          confirmed_price: number | null
          preorder_publish_status: string
          official_source_id: number
          watch_item_id: number
          official_source_url: string
          permission_status_snapshot: string
          source_permission_status: string | null
          local_storage_allowed: number | null
          image_count: number
          representative_count: number
          valid_image_count: number
        }>()

      if (!target) {
        return jsonError(
          c,
          '공개할 예약판매 정보를 찾지 못했습니다.',
          404
        )
      }

      if (
        target.game_publish_status ===
          'PUBLISHED' &&
        target.variant_publish_status ===
          'ACTIVE' &&
        target.preorder_publish_status ===
          'PUBLISHED'
      ) {
        return c.json({
          ok: true,
          alreadyPublished: true,
          gameId,
          variantId,
          preorderId: target.preorder_id,
          publishStatus: 'PUBLISHED',
        })
      }

      if (
        target.game_publish_status !==
          'DRAFT' &&
        target.game_publish_status !==
          'PUBLISHED'
      ) {
        return jsonError(
          c,
          '공개할 수 없는 게임 상태입니다.',
          409
        )
      }

      if (
        target.variant_publish_status !==
        'DRAFT'
      ) {
        return jsonError(
          c,
          'DRAFT 상태의 상품 에디션만 공개할 수 있습니다.',
          409
        )
      }

      if (
        target.preorder_publish_status !==
        'APPROVED'
      ) {
        return jsonError(
          c,
          '검토 승인된 예약판매만 공개할 수 있습니다.',
          409
        )
      }

      const releaseDate =
        text(target.release_date, 10)

      const preorderStartDate =
        text(target.preorder_start_date, 10)

      const preorderEndDate =
        text(target.preorder_end_date, 10)

      if (!isValidDate(releaseDate)) {
        return jsonError(
          c,
          '출시일을 확인해 주세요.',
          409
        )
      }

      if (
        preorderStartDate &&
        !isValidDate(preorderStartDate)
      ) {
        return jsonError(
          c,
          '예약판매 시작일을 확인해 주세요.',
          409
        )
      }

      if (
        preorderEndDate &&
        !isValidDate(preorderEndDate)
      ) {
        return jsonError(
          c,
          '예약판매 종료일을 확인해 주세요.',
          409
        )
      }

      if (
        preorderStartDate &&
        preorderEndDate &&
        preorderStartDate >
          preorderEndDate
      ) {
        return jsonError(
          c,
          '예약판매 기간을 확인해 주세요.',
          409
        )
      }

      if (
        target.preorder_status ===
          'UNKNOWN' ||
        target.preorder_status ===
          'CANCELLED'
      ) {
        return jsonError(
          c,
          '예약판매 진행 상태를 확인해 주세요.',
          409
        )
      }

      if (
        !text(target.official_source_url)
      ) {
        return jsonError(
          c,
          '공식 출처 URL을 확인해 주세요.',
          409
        )
      }

      const sourceSnapshot =
        String(
          target.permission_status_snapshot ||
          'PENDING'
        ).toUpperCase()

      if (
        sourceSnapshot !== 'APPROVED' &&
        sourceSnapshot !== 'CONDITIONAL'
      ) {
        return jsonError(
          c,
          '게임에 연결된 출처 권한을 확인해 주세요.',
          409
        )
      }

      const sourcePermissionStatus =
        String(
          target.source_permission_status ||
          'PENDING'
        ).toUpperCase()

      if (
        sourcePermissionStatus !==
          'APPROVED' &&
        sourcePermissionStatus !==
          'CONDITIONAL'
      ) {
        return jsonError(
          c,
          '현재 출처 이미지 정책이 공개를 허용하지 않습니다.',
          409
        )
      }

      if (
        Number(
          target.local_storage_allowed
        ) !== 1
      ) {
        return jsonError(
          c,
          '현재 출처는 이미지 로컬 저장을 허용하지 않습니다.',
          409
        )
      }

      const imageCount =
        Number(target.image_count || 0)

      const representativeCount =
        Number(
          target.representative_count || 0
        )

      const validImageCount =
        Number(
          target.valid_image_count || 0
        )

      if (
        imageCount < 1 ||
        representativeCount !== 1 ||
        validImageCount !== imageCount
      ) {
        return jsonError(
          c,
          '공개 이미지의 승인·저장·대표 이미지 상태를 확인해 주세요.',
          409
        )
      }

      const linkedImages =
        await c.env.DB.prepare(`
          SELECT
            wii.id AS image_id,
            wii.watch_item_id,
            wii.stored_image_url,
            wii.image_hash

          FROM variant_preorder_images vpi

          INNER JOIN watch_item_images wii
            ON wii.id = vpi.image_id

          WHERE vpi.preorder_id = ?

          ORDER BY
            vpi.display_order ASC,
            wii.id ASC
        `)
          .bind(target.preorder_id)
          .all<{
            image_id: number
            watch_item_id: number
            stored_image_url: string | null
            image_hash: string | null
          }>()

      if (
        linkedImages.results.length !==
        imageCount
      ) {
        return jsonError(
          c,
          '공개 이미지 연결 정보를 확인해 주세요.',
          409
        )
      }

      for (
        const image of
        linkedImages.results
      ) {
        const objectKey =
          `watcher/games/${gameId}/` +
          `images/${image.image_id}/original`

        const expectedStoredImageUrl =
          `r2://GAME_IMAGES/${objectKey}`

        const imageHash =
          text(image.image_hash)

        if (
          image.watch_item_id !==
            target.watch_item_id ||
          image.stored_image_url !==
            expectedStoredImageUrl ||
          !imageHash
        ) {
          return jsonError(
            c,
            '공개 이미지의 R2 저장 정보를 확인해 주세요.',
            409
          )
        }

        const object =
          await c.env.GAME_IMAGES.head(
            objectKey
          )

        if (!object) {
          return jsonError(
            c,
            '공개 이미지의 R2 객체를 찾지 못했습니다.',
            409
          )
        }

        const metadata =
          object.customMetadata || {}

        if (
          metadata.watchItemId !==
            String(target.watch_item_id) ||
          metadata.imageId !==
            String(image.image_id) ||
          metadata.gameId !==
            String(gameId) ||
          metadata.sha256 !== imageHash
        ) {
          return jsonError(
            c,
            '공개 이미지의 R2 메타데이터가 일치하지 않습니다.',
            409
          )
        }

        const contentType =
          object.httpMetadata
            ?.contentType || ''

        if (
          contentType !== 'image/jpeg' &&
          contentType !== 'image/png' &&
          contentType !== 'image/webp'
        ) {
          return jsonError(
            c,
            '공개 이미지 형식을 확인해 주세요.',
            409
          )
        }
      }

      const allowedPriceStatuses =
        new Set([
          'UNCONFIRMED',
          'CANDIDATE',
          'CONFIRMED',
        ])

      if (
        !allowedPriceStatuses.has(
          target.price_status
        )
      ) {
        return jsonError(
          c,
          '가격 상태를 확인해 주세요.',
          409
        )
      }

      if (
        target.price_status ===
          'CONFIRMED' &&
        (
          !Number.isInteger(
            Number(target.confirmed_price)
          ) ||
          Number(
            target.confirmed_price
          ) <= 0
        )
      ) {
        return jsonError(
          c,
          '확정 가격을 확인해 주세요.',
          409
        )
      }

      if (
        target.price_status ===
          'CANDIDATE' &&
        (
          !Number.isInteger(
            Number(target.candidate_price)
          ) ||
          Number(
            target.candidate_price
          ) <= 0
        )
      ) {
        return jsonError(
          c,
          '후보 가격을 확인해 주세요.',
          409
        )
      }

      const results =
        await c.env.DB.batch([
          c.env.DB.prepare(`
            UPDATE games

            SET
              publish_status =
                'PUBLISHED',
              published_at =
                COALESCE(
                  published_at,
                  CURRENT_TIMESTAMP
                )

            WHERE
              id = ?
              AND publish_status IN (
                'DRAFT',
                'PUBLISHED'
              )
          `).bind(gameId),

          c.env.DB.prepare(`
            UPDATE product_variants

            SET
              publish_status = 'ACTIVE',
              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              id = ?
              AND publish_status = 'DRAFT'
          `).bind(variantId),

          c.env.DB.prepare(`
            UPDATE variant_preorders

            SET
              publish_status =
                'PUBLISHED',
              published_at =
                CURRENT_TIMESTAMP,
              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              id = ?
              AND publish_status =
                'APPROVED'
          `).bind(target.preorder_id),
        ])

      const changed = results.map(
        (result) =>
          Number(
            result.meta.changes || 0
          )
      )

      if (
        changed.length !== 3 ||
        changed.some(
          (count) => count !== 1
        )
      ) {
        return jsonError(
          c,
          '공개 상태 전환 결과를 확인할 수 없습니다.',
          500
        )
      }

      return c.json({
        ok: true,
        alreadyPublished: false,
        gameId,
        variantId,
        preorderId: target.preorder_id,
        gamePublishStatus: 'PUBLISHED',
        variantPublishStatus: 'ACTIVE',
        preorderPublishStatus: 'PUBLISHED',
        publishedAt:
          new Date().toISOString(),
      })
    } catch (error) {
      console.error(
        'preorder publication failed',
        error
      )

      return jsonError(
        c,
        '예약판매 공개 처리 중 오류가 발생했습니다.',
        500
      )
    }
  }
)


// ------------------------------------------------------------
// 게시된 예약판매의 확정 가격 수정
//
// 공개 이후 가격이 확인된 경우 가격 필드만 안전하게 갱신한다.
// 상품 구성, 이미지, 공식 출처, 공개 상태는 변경하지 않는다.
// ------------------------------------------------------------

preorderAdmin.patch(
  '/variants/:variantId/confirmed-price',
  async (c) => {
    const variantId = Number(
      c.req.param('variantId')
    )

    if (
      !Number.isInteger(variantId) ||
      variantId <= 0
    ) {
      return jsonError(
        c,
        'invalid variant id',
        400
      )
    }

    let body: any

    try {
      body = await c.req.json()
    } catch {
      return jsonError(
        c,
        'invalid JSON body',
        400
      )
    }

    const confirmedPrice =
      positiveInteger(body?.confirmedPrice)

    if (!confirmedPrice) {
      return jsonError(
        c,
        '확정 가격은 1원 이상의 정수여야 합니다.',
        400
      )
    }

    const { results } = await c.env.DB.prepare(`
      SELECT
        vp.id,
        vp.variant_id,
        vp.publish_status
      FROM variant_preorders vp
      WHERE
        vp.variant_id = ?
        AND vp.publish_status = 'PUBLISHED'
      ORDER BY vp.id ASC
    `)
      .bind(variantId)
      .all<{
        id: number
        variant_id: number
        publish_status: string
      }>()

    if (!results || results.length < 1) {
      return jsonError(
        c,
        '게시된 예약판매 정보를 찾을 수 없습니다.',
        404
      )
    }

    if (results.length !== 1) {
      return jsonError(
        c,
        '게시된 예약판매 정보가 여러 개여서 자동 수정할 수 없습니다.',
        409
      )
    }

    const preorderId = Number(results[0].id)

    await c.env.DB.prepare(`
      UPDATE variant_preorders
      SET
        confirmed_price = ?,
        candidate_price = NULL,
        price_status = 'CONFIRMED',
        updated_at = CURRENT_TIMESTAMP
      WHERE
        id = ?
        AND publish_status = 'PUBLISHED'
    `)
      .bind(
        confirmedPrice,
        preorderId
      )
      .run()

    return c.json({
      ok: true,
      variantId,
      preorderId,
      confirmedPrice,
      priceStatus: 'CONFIRMED',
      message: '게시된 예약판매의 확정 가격을 수정했습니다.',
    })
  }
)



// ------------------------------------------------------------
// 전체 검토 승인 에디션 일괄 공개
//
// 안전 원칙:
// - 승인 완료(APPROVED) 에디션만 대상으로 함
// - 같은 게임에 DRAFT 예약판매가 하나라도 있으면 전체 중단
// - 화면에서 확인한 게임명과 대상 수가 달라지면 중단
// - 공식 출처, 가격, 일정 예외, 특전, 이미지를 공개 직전 재검증
// - variant_preorders / product_variants / games를 D1 batch로 변경
// - 개별·부분 공개는 수행하지 않음
// ------------------------------------------------------------

preorderAdmin.post(
  '/games/:gameId/publish/bulk',
  async (c) => {
    const gameId = Number(
      c.req.param('gameId')
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      return jsonError(
        c,
        'invalid game id',
        400
      )
    }

    let body: Record<string, unknown> = {}

    try {
      body =
        await c.req.json<
          Record<string, unknown>
        >()
    } catch {
      body = {}
    }

    const expectedCount =
      positiveInteger(
        body.expected_count
      )

    const confirmationTitle = text(
      body.confirmation_title,
      300
    )

    if (!expectedCount) {
      return jsonError(
        c,
        '공개 대상 수를 다시 확인해 주세요.',
        400
      )
    }

    if (!confirmationTitle) {
      return jsonError(
        c,
        '공개 확인용 게임명을 입력해 주세요.',
        400
      )
    }

    const game = await c.env.DB.prepare(`
      SELECT
        id,
        title,
        publish_status

      FROM games

      WHERE id = ?

      LIMIT 1
    `)
      .bind(gameId)
      .first() as Record<
        string,
        unknown
      > | null

    if (!game) {
      return jsonError(
        c,
        'game not found',
        404
      )
    }

    if (
      text(game.publish_status, 30)
        .toUpperCase() === 'ARCHIVED'
    ) {
      return jsonError(
        c,
        '보관된 게임은 공개할 수 없습니다.',
        409
      )
    }

    if (
      confirmationTitle !==
      text(game.title, 300)
    ) {
      return jsonError(
        c,
        '입력한 게임명이 현재 게임명과 일치하지 않습니다.',
        409
      )
    }

    const state = await c.env.DB.prepare(`
      SELECT
        COUNT(*) AS total_count,

        SUM(
          CASE
            WHEN vp.publish_status = 'DRAFT'
            THEN 1
            ELSE 0
          END
        ) AS draft_count,

        SUM(
          CASE
            WHEN vp.publish_status = 'APPROVED'
            THEN 1
            ELSE 0
          END
        ) AS approved_count,

        SUM(
          CASE
            WHEN vp.publish_status = 'PUBLISHED'
            THEN 1
            ELSE 0
          END
        ) AS published_count

      FROM variant_preorders vp

      INNER JOIN product_variants pv
        ON pv.id = vp.variant_id

      INNER JOIN editions e
        ON e.id = pv.edition_id

      WHERE e.game_id = ?
    `)
      .bind(gameId)
      .first() as Record<
        string,
        unknown
      > | null

    const draftCount = Number(
      state?.draft_count || 0
    )

    const approvedCount = Number(
      state?.approved_count || 0
    )

    if (draftCount > 0) {
      return c.json(
        {
          ok: false,
          error:
            '작성 중인 에디션이 남아 있어 전체 공개를 중단했습니다.',
          draft_count: draftCount,
        },
        409
      )
    }

    if (approvedCount < 1) {
      return jsonError(
        c,
        '새로 공개할 검토 승인 에디션이 없습니다.',
        409
      )
    }

    if (approvedCount !== expectedCount) {
      return c.json(
        {
          ok: false,
          error:
            '화면에서 확인한 공개 대상 수와 현재 승인 대상 수가 다릅니다. 새로고침 후 다시 확인해 주세요.',
          expected_count: expectedCount,
          actual_count: approvedCount,
        },
        409
      )
    }

    const { results } =
      await c.env.DB.prepare(`
        SELECT
          vp.id AS preorder_id,
          vp.variant_id,
          vp.release_date,
          vp.preorder_start_date,
          vp.preorder_end_date,
          vp.review_exceptions,
          vp.preorder_status,
          vp.preorder_bonus,
          vp.preorder_bonus_note,
          vp.confirmed_price,
          vp.price_status,
          vp.publish_status
            AS preorder_publish_status,

          pv.variant_name,
          pv.publish_status
            AS variant_publish_status,

          e.platform,

          gos.id AS official_source_id,
          gos.watch_item_id,
          gos.official_source_url,
          gos.permission_status_snapshot,

          sip.permission_status
            AS source_permission_status,
          sip.local_storage_allowed,

          (
            SELECT COUNT(*)

            FROM variant_preorder_images vpi

            WHERE
              vpi.preorder_id = vp.id
          ) AS image_count,

          (
            SELECT COUNT(*)

            FROM variant_preorder_images vpi

            WHERE
              vpi.preorder_id = vp.id
              AND vpi.display_role =
                'REPRESENTATIVE'
          ) AS representative_count,

          (
            SELECT COUNT(*)

            FROM variant_preorder_images vpi

            INNER JOIN watch_item_images wii
              ON wii.id = vpi.image_id

            WHERE
              vpi.preorder_id = vp.id
              AND wii.permission_status =
                'APPROVED'
              AND wii.stored_image_url
                IS NOT NULL
              AND TRIM(
                wii.stored_image_url
              ) <> ''
          ) AS valid_image_count

        FROM variant_preorders vp

        INNER JOIN product_variants pv
          ON pv.id = vp.variant_id

        INNER JOIN editions e
          ON e.id = pv.edition_id

        INNER JOIN game_official_sources gos
          ON gos.id =
            vp.official_source_id

        LEFT JOIN source_image_policies sip
          ON sip.source_id = gos.source_id

        WHERE
          e.game_id = ?
          AND vp.publish_status =
            'APPROVED'

        ORDER BY
          e.platform ASC,
          pv.display_order ASC,
          pv.id ASC,
          vp.display_order ASC,
          vp.id ASC
      `)
        .bind(gameId)
        .all()

    const targets = (
      results ?? []
    ) as Array<
      Record<string, unknown>
    >

    if (
      targets.length !==
      expectedCount
    ) {
      return jsonError(
        c,
        '공개 대상 조회 결과가 예상 수와 다릅니다. 아무것도 공개하지 않았습니다.',
        409
      )
    }

    const validateStoredImages =
      async (
        preorderId: number,
        watchItemId: number,
        expectedImageCount: number
      ): Promise<string[]> => {
        const reasons: string[] = []

        const linkedImages =
          await c.env.DB.prepare(`
            SELECT
              wii.id AS image_id,
              wii.watch_item_id,
              wii.stored_image_url,
              wii.image_hash,
              wii.permission_status

            FROM variant_preorder_images vpi

            INNER JOIN watch_item_images wii
              ON wii.id = vpi.image_id

            WHERE vpi.preorder_id = ?

            ORDER BY
              vpi.display_order ASC,
              wii.id ASC
          `)
            .bind(preorderId)
            .all<{
              image_id: number
              watch_item_id: number
              stored_image_url: string | null
              image_hash: string | null
              permission_status: string
            }>()

        if (
          linkedImages.results.length !==
          expectedImageCount
        ) {
          reasons.push(
            '이미지 연결 수 불일치'
          )

          return reasons
        }

        for (
          const image of
          linkedImages.results
        ) {
          const imageId = Number(
            image.image_id
          )

          const objectKey =
            `watcher/games/${gameId}/` +
            `images/${imageId}/original`

          const expectedStoredImageUrl =
            `r2://GAME_IMAGES/${objectKey}`

          const imageHash = text(
            image.image_hash
          )

          if (
            !Number.isInteger(imageId) ||
            imageId <= 0 ||
            Number(image.watch_item_id) !==
              watchItemId ||
            image.permission_status !==
              'APPROVED' ||
            image.stored_image_url !==
              expectedStoredImageUrl ||
            !imageHash
          ) {
            reasons.push(
              `이미지 #${imageId || '?'} R2 저장 정보 불일치`
            )

            continue
          }

          const object =
            await c.env.GAME_IMAGES.head(
              objectKey
            )

          if (!object) {
            reasons.push(
              `이미지 #${imageId} R2 객체 없음`
            )

            continue
          }

          const metadata =
            object.customMetadata || {}

          if (
            metadata.watchItemId !==
              String(watchItemId) ||
            metadata.imageId !==
              String(imageId) ||
            metadata.gameId !==
              String(gameId) ||
            metadata.sha256 !== imageHash
          ) {
            reasons.push(
              `이미지 #${imageId} R2 메타데이터 불일치`
            )

            continue
          }

          const contentType =
            object.httpMetadata
              ?.contentType || ''

          if (
            contentType !== 'image/jpeg' &&
            contentType !== 'image/png' &&
            contentType !== 'image/webp'
          ) {
            reasons.push(
              `이미지 #${imageId} 형식 확인 필요`
            )
          }
        }

        return reasons
      }

    const blocked: Array<{
      preorder_id: number
      variant_name: string
      reasons: string[]
    }> = []

    for (const target of targets) {
      const reasons: string[] = []

      const preorderId = Number(
        target.preorder_id
      )

      const releaseDate = text(
        target.release_date,
        10
      )

      if (
        !releaseDate ||
        !isValidDate(releaseDate)
      ) {
        reasons.push(
          '출시일 확인 필요'
        )
      }

      const preorderStatus = text(
        target.preorder_status,
        30
      ).toUpperCase()

      if (
        preorderStatus === 'UNKNOWN' ||
        preorderStatus === 'CANCELLED' ||
        !ALLOWED_PREORDER_STATUSES.has(
          preorderStatus
        )
      ) {
        reasons.push(
          '예약판매 상태 확인 필요'
        )
      }

      const exceptions =
        parseReviewExceptions(
          target.review_exceptions
        )

      const startDate = text(
        target.preorder_start_date,
        10
      )

      const endDate = text(
        target.preorder_end_date,
        10
      )

      if (
        startDate
          ? !isValidDate(startDate)
          : !hasReviewException(
              exceptions,
              'PREORDER_START_DATE'
            )
      ) {
        reasons.push(
          '예약판매 시작 일정 확인 필요'
        )
      }

      if (
        endDate
          ? !isValidDate(endDate)
          : !hasReviewException(
              exceptions,
              'PREORDER_END_DATE'
            )
      ) {
        reasons.push(
          '예약판매 종료 일정 확인 필요'
        )
      }

      if (
        startDate &&
        endDate &&
        startDate > endDate
      ) {
        reasons.push(
          '예약판매 기간 순서 확인 필요'
        )
      }

      const priceStatus = text(
        target.price_status,
        30
      ).toUpperCase()

      const confirmedPrice = Number(
        target.confirmed_price
      )

      if (
        priceStatus !== 'CONFIRMED' ||
        !Number.isInteger(
          confirmedPrice
        ) ||
        confirmedPrice <= 0
      ) {
        reasons.push(
          '확정 가격 확인 필요'
        )
      }

      const bonus = text(
        target.preorder_bonus,
        5000
      )

      if (
        !bonus &&
        !hasReviewException(
          exceptions,
          'PREORDER_BONUS'
        )
      ) {
        reasons.push(
          '예약특전 처리 확인 필요'
        )
      }

      if (
        !target.official_source_id ||
        !text(
          target.official_source_url,
          2000
        )
      ) {
        reasons.push(
          '공식 출처 확인 필요'
        )
      }

      const imageCount = Number(
        target.image_count || 0
      )

      const representativeCount =
        Number(
          target.representative_count ||
          0
        )

      const validImageCount = Number(
        target.valid_image_count || 0
      )

      if (imageCount < 1) {
        reasons.push(
          '에디션 이미지 필요'
        )
      }

      if (
        representativeCount !== 1
      ) {
        reasons.push(
          '대표 이미지는 정확히 한 장 필요'
        )
      }

      if (
        validImageCount !== imageCount
      ) {
        reasons.push(
          '이미지 승인·R2 저장 확인 필요'
        )
      }

      const sourceSnapshot =
        text(
          target.permission_status_snapshot,
          30
        ).toUpperCase()

      if (
        sourceSnapshot !== 'APPROVED' &&
        sourceSnapshot !== 'CONDITIONAL'
      ) {
        reasons.push(
          '게임 출처 권한 확인 필요'
        )
      }

      const sourcePermissionStatus =
        text(
          target.source_permission_status,
          30
        ).toUpperCase()

      if (
        sourcePermissionStatus !==
          'APPROVED' &&
        sourcePermissionStatus !==
          'CONDITIONAL'
      ) {
        reasons.push(
          '현재 이미지 정책 확인 필요'
        )
      }

      if (
        Number(
          target.local_storage_allowed
        ) !== 1
      ) {
        reasons.push(
          '이미지 로컬 저장 권한 확인 필요'
        )
      }

      const watchItemId = Number(
        target.watch_item_id
      )

      if (
        !Number.isInteger(watchItemId) ||
        watchItemId <= 0
      ) {
        reasons.push(
          'WATCHER 출처 연결 확인 필요'
        )
      } else if (
        imageCount > 0 &&
        validImageCount === imageCount
      ) {
        const imageReasons =
          await validateStoredImages(
            preorderId,
            watchItemId,
            imageCount
          )

        reasons.push(...imageReasons)
      }

      if (
        text(
          target.variant_publish_status,
          30
        ).toUpperCase() === 'ARCHIVED'
      ) {
        reasons.push(
          '보관된 상품 에디션'
        )
      }

      if (reasons.length > 0) {
        blocked.push({
          preorder_id: preorderId,
          variant_name: text(
            target.variant_name,
            300
          ),
          reasons,
        })
      }
    }

    if (blocked.length > 0) {
      return c.json(
        {
          ok: false,
          error:
            '공개 전 재검증에서 확인이 필요한 항목이 발견되어 전체 공개를 중단했습니다.',
          blocked_count:
            blocked.length,
          blocked,
        },
        409
      )
    }

    const preorderIds = targets.map(
      (target) =>
        Number(target.preorder_id)
    )

    const variantIds = Array.from(
      new Set(
        targets.map(
          (target) =>
            Number(target.variant_id)
        )
      )
    )

    if (
      preorderIds.some(
        (id) =>
          !Number.isInteger(id) ||
          id <= 0
      ) ||
      variantIds.some(
        (id) =>
          !Number.isInteger(id) ||
          id <= 0
      )
    ) {
      return jsonError(
        c,
        '공개 대상 식별자가 올바르지 않습니다.',
        409
      )
    }

    const now = new Date().toISOString()

    const preorderPlaceholders =
      preorderIds
        .map(() => '?')
        .join(', ')

    const variantPlaceholders =
      variantIds
        .map(() => '?')
        .join(', ')

    await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE variant_preorders

        SET
          publish_status = 'PUBLISHED',
          published_at = ?,
          updated_at = ?

        WHERE
          publish_status = 'APPROVED'
          AND id IN (
            ${preorderPlaceholders}
          )
      `).bind(
        now,
        now,
        ...preorderIds
      ),

      c.env.DB.prepare(`
        UPDATE product_variants

        SET
          publish_status = 'ACTIVE',
          updated_at = ?

        WHERE
          publish_status IN (
            'DRAFT',
            'ACTIVE'
          )
          AND id IN (
            ${variantPlaceholders}
          )
      `).bind(
        now,
        ...variantIds
      ),

      c.env.DB.prepare(`
        UPDATE games

        SET
          publish_status = 'PUBLISHED',
          published_at = COALESCE(
            published_at,
            ?
          )

        WHERE
          id = ?
          AND publish_status IN (
            'DRAFT',
            'PUBLISHED'
          )
      `).bind(
        now,
        gameId
      ),
    ])

    const verification =
      await c.env.DB.prepare(`
        SELECT COUNT(*) AS count

        FROM variant_preorders

        WHERE
          publish_status = 'PUBLISHED'
          AND id IN (
            ${preorderPlaceholders}
          )
      `)
        .bind(...preorderIds)
        .first() as Record<
          string,
          unknown
        > | null

    const publishedCount = Number(
      verification?.count || 0
    )

    if (
      publishedCount !==
      preorderIds.length
    ) {
      return jsonError(
        c,
        '공개 후 검증 결과가 예상과 다릅니다. 관리자 확인이 필요합니다.',
        500
      )
    }

    return c.json({
      ok: true,
      game_id: gameId,
      game_title: text(
        game.title,
        300
      ),
      published_count:
        publishedCount,
      published_at: now,
      message:
        '전체 에디션을 공개했습니다.',
    })
  }
)


// ------------------------------------------------------------
// 예약판매 V2 연결 이미지 관리자 미리보기
//
// - APPROVED / PUBLISHED 예약판매 모두 허용
// - 연결되고 승인된 비공개 R2 이미지만 반환
// - 외부 이미지 URL이나 공개 R2 URL은 사용하지 않음
// ------------------------------------------------------------

preorderAdmin.get(
  '/games/:gameId/images/:imageId/preview',
  async (c) => {
    const gameId = Number(
      c.req.param('gameId')
    )

    const imageId = Number(
      c.req.param('imageId')
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0 ||
      !Number.isInteger(imageId) ||
      imageId <= 0
    ) {
      return jsonError(
        c,
        '게임 ID와 이미지 ID를 확인해 주세요.',
        400
      )
    }

    const record =
      await c.env.DB.prepare(`
        SELECT
          g.id AS game_id,

          vp.id AS preorder_id,
          vp.publish_status
            AS preorder_publish_status,

          gos.watch_item_id,

          wii.id AS image_id,
          wii.stored_image_url,
          wii.image_hash,
          wii.permission_status,

          vpi.display_role,
          vpi.alt_text

        FROM variant_preorder_images vpi

        INNER JOIN variant_preorders vp
          ON vp.id = vpi.preorder_id

        INNER JOIN product_variants pv
          ON pv.id = vp.variant_id

        INNER JOIN editions e
          ON e.id = pv.edition_id

        INNER JOIN games g
          ON g.id = e.game_id

        INNER JOIN game_official_sources gos
          ON gos.id = vp.official_source_id

        INNER JOIN watch_item_images wii
          ON wii.id = vpi.image_id

        WHERE
          g.id = ?
          AND wii.id = ?
          AND wii.watch_item_id =
            gos.watch_item_id
          AND wii.permission_status =
            'APPROVED'
          AND vp.publish_status IN (
            'APPROVED',
            'PUBLISHED'
          )

        LIMIT 1
      `)
        .bind(gameId, imageId)
        .first<{
          game_id: number
          preorder_id: number
          preorder_publish_status: string
          watch_item_id: number
          image_id: number
          stored_image_url: string | null
          image_hash: string | null
          permission_status: string
          display_role: string
          alt_text: string | null
        }>()

    if (!record) {
      return jsonError(
        c,
        '미리보기 가능한 연결 이미지를 찾을 수 없습니다.',
        404
      )
    }

    const objectKey =
      `watcher/games/${gameId}/` +
      `images/${imageId}/original`

    const expectedStoredImageUrl =
      `r2://GAME_IMAGES/${objectKey}`

    const imageHash = text(
      record.image_hash
    )

    if (
      record.stored_image_url !==
        expectedStoredImageUrl ||
      !imageHash
    ) {
      return jsonError(
        c,
        '비공개 R2 저장 정보를 확인해 주세요.',
        409
      )
    }

    const object =
      await c.env.GAME_IMAGES.get(
        objectKey
      )

    if (!object) {
      return jsonError(
        c,
        '비공개 R2 이미지 객체를 찾을 수 없습니다.',
        404
      )
    }

    const metadata =
      object.customMetadata || {}

    if (
      metadata.watchItemId !==
        String(record.watch_item_id) ||
      metadata.imageId !==
        String(imageId) ||
      metadata.gameId !==
        String(gameId) ||
      metadata.sha256 !== imageHash
    ) {
      return jsonError(
        c,
        '비공개 R2 이미지 메타데이터가 일치하지 않습니다.',
        409
      )
    }

    const contentType =
      object.httpMetadata
        ?.contentType || ''

    if (
      contentType !== 'image/jpeg' &&
      contentType !== 'image/png' &&
      contentType !== 'image/webp'
    ) {
      return jsonError(
        c,
        '미리보기 이미지 형식을 확인해 주세요.',
        415
      )
    }

    const headers = new Headers()

    headers.set(
      'Content-Type',
      contentType
    )

    headers.set(
      'Content-Length',
      String(object.size)
    )

    headers.set(
      'ETag',
      object.httpEtag
    )

    headers.set(
      'Cache-Control',
      'private, no-store, max-age=0'
    )

    headers.set(
      'Pragma',
      'no-cache'
    )

    headers.set(
      'X-Content-Type-Options',
      'nosniff'
    )

    headers.set(
      'Content-Disposition',
      `inline; filename="preorder-game-${gameId}-image-${imageId}"`
    )

    headers.set(
      'X-Yenu-Image-Id',
      String(imageId)
    )

    headers.set(
      'X-Yenu-Image-Role',
      text(record.display_role, 30)
    )

    return new Response(
      object.body,
      {
        status: 200,
        headers,
      }
    )
  }
)
export default preorderAdmin
