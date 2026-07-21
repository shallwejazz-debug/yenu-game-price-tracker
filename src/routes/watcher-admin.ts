// ============================================================
// WATCHER 관리자 API
// src/routes/watcher-admin.ts
//
// GET /admin/api/watcher/summary
// GET /admin/api/watcher/sources
// GET /admin/api/watcher/items
//
// 모든 API는 X-Admin-Token 인증 필요
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import {
  collectArcSystemWorksAsia,
} from '../watchers/arc-system-works-asia'

const watcherAdmin = new Hono<{
  Bindings: Bindings
}>()

// ------------------------------------------------------------
// 관리자 인증
// 기존 관리자 화면과 동일하게 X-Admin-Token 사용
// ------------------------------------------------------------

watcherAdmin.use('*', async (c, next) => {
  const expectedToken = String(
    c.env.ADMIN_TOKEN ?? ''
  ).trim()

  const receivedToken = String(
    c.req.header('X-Admin-Token') ?? ''
  ).trim()

  if (!expectedToken) {
    return c.json(
      {
        ok: false,
        error: 'ADMIN_TOKEN is not configured',
      },
      503
    )
  }

  if (
    !receivedToken ||
    receivedToken !== expectedToken
  ) {
    return c.json(
      {
        ok: false,
        error: 'unauthorized',
      },
      401
    )
  }

  await next()
})


// ------------------------------------------------------------
// WATCHER 현황
// ------------------------------------------------------------

watcherAdmin.get('/summary', async (c) => {
  const summary = await c.env.DB.prepare(`
    SELECT
      (
        SELECT COUNT(*)
        FROM watch_sources
        WHERE enabled = 1
      ) AS enabled_sources,

      (
        SELECT COUNT(*)
        FROM watch_items
        WHERE review_status = 'DISCOVERED'
      ) AS discovered_items,

      (
        SELECT COUNT(*)
        FROM watch_items
        WHERE review_status = 'TRANSFORMED'
      ) AS transformed_items,

      (
        SELECT COUNT(*)
        FROM watch_items
        WHERE review_status = 'REVIEWING'
      ) AS reviewing_items,

      (
        SELECT COUNT(*)
        FROM watch_items
        WHERE review_status = 'APPROVED'
      ) AS approved_items,

      (
        SELECT COUNT(*)
        FROM watch_items
        WHERE review_status = 'HOLD'
      ) AS hold_items,

      (
        SELECT COUNT(*)
        FROM (
          SELECT
            date(created_at, '+9 hours') AS event_date,

            CASE
              WHEN watch_item_id IS NOT NULL
                THEN 'item:' || watch_item_id
              ELSE
                'event:' || id
            END AS event_group

          FROM watch_events

          WHERE is_read = 0

          GROUP BY
            event_date,
            event_group
        )
      ) AS unread_events,

      (
        SELECT COUNT(*)
        FROM source_image_policies
        WHERE permission_status = 'PENDING'
      ) AS pending_permissions,

      (
        SELECT COUNT(*)
        FROM watch_item_images
        WHERE permission_status = 'PENDING'
      ) AS pending_images
  `).first<{
    enabled_sources: number
    discovered_items: number
    transformed_items: number
    reviewing_items: number
    approved_items: number
    hold_items: number
    unread_events: number
    pending_permissions: number
    pending_images: number
  }>()

  return c.json({
    ok: true,
    summary: summary ?? {
      enabled_sources: 0,
      discovered_items: 0,
      transformed_items: 0,
      reviewing_items: 0,
      approved_items: 0,
      hold_items: 0,
      unread_events: 0,
      pending_permissions: 0,
      pending_images: 0,
    },
  })
})


// ------------------------------------------------------------
// 수집 출처와 이미지 정책 목록
// ------------------------------------------------------------

watcherAdmin.get('/sources', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT
      s.id,
      s.source_key,
      s.source_name,
      s.base_url,
      s.list_url,
      s.collection_mode,
      s.collector_name,
      s.collector_version,
      s.enabled,
      s.poll_interval_minutes,
      s.priority,
      s.last_checked_at,
      s.last_success_at,
      s.last_error,

      p.permission_status,
      p.package_image_allowed,
      p.limited_edition_image_allowed,
      p.preorder_bonus_image_allowed,
      p.key_visual_allowed,
      p.screenshot_allowed,
      p.local_storage_allowed,
      p.resize_allowed,
      p.post_release_retention_allowed,
      p.hotlink_allowed,
      p.required_credit,
      p.required_copyright,
      p.permission_note,
      p.permission_received_at,
      p.permission_expires_at

    FROM watch_sources s

    LEFT JOIN source_image_policies p
      ON p.source_id = s.id

    ORDER BY
      s.priority ASC,
      s.source_name ASC
  `).all()

  return c.json({
    ok: true,
    sources: results ?? [],
  })
})


// ------------------------------------------------------------
// 수집 항목 목록
//
// query:
//   status=DISCOVERED
//   sourceId=1
//   limit=50
// ------------------------------------------------------------

watcherAdmin.get('/items', async (c) => {
  const requestedStatus = String(
    c.req.query('status') ?? ''
  ).trim().toUpperCase()

  const sourceId = Number(
    c.req.query('sourceId') ?? 0
  )

  const rawLimit = Number(
    c.req.query('limit') ?? 50
  )

  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(100, rawLimit))
    : 50

  const allowedStatuses = new Set([
    'DISCOVERED',
    'TRANSFORMED',
    'REVIEWING',
    'APPROVED',
    'UPLOADED',
    'HOLD',
    'IGNORED',
    'ERROR',
  ])

  const conditions: string[] = []
  const bindings: Array<string | number> = []

  if (
    requestedStatus &&
    allowedStatuses.has(requestedStatus)
  ) {
    conditions.push('wi.review_status = ?')
    bindings.push(requestedStatus)
  }

  if (
    Number.isInteger(sourceId) &&
    sourceId > 0
  ) {
    conditions.push('wi.source_id = ?')
    bindings.push(sourceId)
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

  bindings.push(limit)

  const statement = c.env.DB.prepare(`
    SELECT
      wi.id,
      wi.source_id,
      ws.source_key,
      ws.source_name,

      wi.external_id,
      wi.source_url,
      wi.title,
      wi.raw_title,

      wi.published_at,
      wi.first_seen_at,
      wi.last_seen_at,

      wi.event_type,
      wi.review_status,
      wi.transform_confidence,
      wi.linked_game_id,

      wi.reviewed_at,
      wi.uploaded_at,
      wi.error_message,

      (
        SELECT COUNT(*)
        FROM watch_item_images image
        WHERE image.watch_item_id = wi.id
      ) AS image_count,

      (
        SELECT COUNT(*)
        FROM watch_item_images image
        WHERE
          image.watch_item_id = wi.id
          AND image.permission_status = 'APPROVED'
      ) AS approved_image_count,

      (
        SELECT COUNT(*)
        FROM watch_item_images image
        WHERE
          image.watch_item_id = wi.id
          AND image.permission_status = 'PENDING'
      ) AS pending_image_count

    FROM watch_items wi

    INNER JOIN watch_sources ws
      ON ws.id = wi.source_id

    ${whereClause}

    ORDER BY
      wi.first_seen_at DESC,
      wi.id DESC

    LIMIT ?
  `)

  const { results } = await statement
    .bind(...bindings)
    .all()

  return c.json({
    ok: true,
    items: results ?? [],
    filters: {
      status: requestedStatus || null,
      sourceId: sourceId > 0
        ? sourceId
        : null,
      limit,
    },
  })
})

// ------------------------------------------------------------
// WATCHER 이벤트 그룹 목록
//
// DB에는 상세 이벤트를 그대로 유지하고,
// 관리자 화면에서는 날짜별·보도자료별로 묶어서 반환한다.
// ------------------------------------------------------------

watcherAdmin.get('/events', async (c) => {
  const rawLimit = Number(
    c.req.query('limit') ?? 100
  )

  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(200, rawLimit))
    : 100

  const unreadOnly =
    String(c.req.query('unread') ?? '') === '1'

  const { results } = await c.env.DB.prepare(`
    SELECT
      date(e.created_at, '+9 hours')
        AS event_date,

      e.watch_item_id,

      MAX(e.id)
        AS representative_event_id,

      MAX(e.source_id)
        AS source_id,

      MAX(e.title)
        AS title,

      MAX(e.message)
        AS latest_message,

      MAX(ws.source_key)
        AS source_key,

      MAX(ws.source_name)
        AS source_name,

      MAX(wi.source_url)
        AS source_url,

      MAX(wi.review_status)
        AS review_status,

      datetime(
        MAX(e.created_at),
        '+9 hours'
      ) AS latest_at,

      COUNT(*)
        AS event_count,

      SUM(
        CASE
          WHEN e.is_read = 0 THEN 1
          ELSE 0
        END
      ) AS unread_count,

      SUM(
        CASE
          WHEN e.event_type = 'SOURCE_NEW'
            THEN 1
          ELSE 0
        END
      ) AS source_new_count,

      SUM(
        CASE
          WHEN e.event_type = 'SOURCE_CHANGED'
            THEN 1
          ELSE 0
        END
      ) AS source_changed_count,

      SUM(
        CASE
          WHEN e.event_type = 'IMAGE_NEW'
            THEN 1
          ELSE 0
        END
      ) AS image_new_count,

      SUM(
        CASE
          WHEN e.event_type = 'ERROR'
            THEN 1
          ELSE 0
        END
      ) AS error_count

    FROM watch_events e

    LEFT JOIN watch_sources ws
      ON ws.id = e.source_id

    LEFT JOIN watch_items wi
      ON wi.id = e.watch_item_id

    GROUP BY
      event_date,

      CASE
        WHEN e.watch_item_id IS NOT NULL
          THEN 'item:' || e.watch_item_id
        ELSE
          'event:' || e.id
      END

    HAVING
      (? = 0 OR unread_count > 0)

    ORDER BY
      event_date DESC,
      latest_at DESC,
      representative_event_id DESC

    LIMIT ?
  `)
    .bind(unreadOnly ? 1 : 0, limit)
    .all()

  return c.json({
    ok: true,
    groups: results ?? [],
    filters: {
      unreadOnly,
      limit,
    },
  })
})

// ------------------------------------------------------------
// WATCHER 이벤트 모두 읽음
// ------------------------------------------------------------

watcherAdmin.post(
  '/events/read-all',
  async (c) => {
    const result = await c.env.DB.prepare(`
      UPDATE watch_events
      SET is_read = 1
      WHERE is_read = 0
    `).run()

    return c.json({
      ok: true,
      changed: Number(
        result.meta.changes || 0
      ),
    })
  }
)

// ------------------------------------------------------------
// WATCHER 이벤트 그룹 읽음
//
// 같은 날짜에 같은 보도자료에서 생성된 이벤트를
// 한 번에 읽음 처리한다.
// ------------------------------------------------------------

watcherAdmin.post(
  '/events/group/read',
  async (c) => {
    let body: {
      eventDate?: unknown
      watchItemId?: unknown
    }

    try {
      body = await c.req.json()
    } catch (error) {
      return c.json(
        {
          ok: false,
          error: 'invalid JSON body',
        },
        400
      )
    }

    const eventDate = String(
      body.eventDate ?? ''
    ).trim()

    const watchItemId = Number(
      body.watchItemId
    )

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    ) {
      return c.json(
        {
          ok: false,
          error: 'invalid event date',
        },
        400
      )
    }

    if (
      !Number.isInteger(watchItemId) ||
      watchItemId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error: 'invalid watcher item id',
        },
        400
      )
    }

    const item = await c.env.DB.prepare(`
      SELECT id
      FROM watch_items
      WHERE id = ?
      LIMIT 1
    `)
      .bind(watchItemId)
      .first()

    if (!item) {
      return c.json(
        {
          ok: false,
          error: 'watcher item not found',
        },
        404
      )
    }

    const result = await c.env.DB.prepare(`
      UPDATE watch_events

      SET is_read = 1

      WHERE
        watch_item_id = ?
        AND date(created_at, '+9 hours') = ?
        AND is_read = 0
    `)
      .bind(
        watchItemId,
        eventDate
      )
      .run()

    return c.json({
      ok: true,
      eventDate,
      watchItemId,
      changed: Number(
        result.meta.changes || 0
      ),
    })
  }
)

// ------------------------------------------------------------
// WATCHER 이벤트 개별 읽음
// ------------------------------------------------------------

watcherAdmin.post(
  '/events/:id/read',
  async (c) => {
    const id = Number(c.req.param('id'))

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return c.json(
        {
          ok: false,
          error: 'invalid watcher event id',
        },
        400
      )
    }

    const existing = await c.env.DB.prepare(`
      SELECT id
      FROM watch_events
      WHERE id = ?
      LIMIT 1
    `)
      .bind(id)
      .first()

    if (!existing) {
      return c.json(
        {
          ok: false,
          error: 'watcher event not found',
        },
        404
      )
    }

    const result = await c.env.DB.prepare(`
      UPDATE watch_events
      SET is_read = 1
      WHERE id = ?
    `)
      .bind(id)
      .run()

    return c.json({
      ok: true,
      id,
      changed: Number(
        result.meta.changes || 0
      ),
    })
  }
)

// ------------------------------------------------------------
// 특정 수집 항목 상세
// ------------------------------------------------------------

watcherAdmin.get('/items/:id', async (c) => {
  const id = Number(c.req.param('id'))

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return c.json(
      {
        ok: false,
        error: 'invalid watcher item id',
      },
      400
    )
  }

  const item = await c.env.DB.prepare(`
    SELECT
      wi.*,
      ws.source_key,
      ws.source_name,
      ws.base_url,
      ws.collection_mode,

      p.permission_status
        AS source_permission_status,

      p.package_image_allowed,
      p.limited_edition_image_allowed,
      p.preorder_bonus_image_allowed,
      p.key_visual_allowed,
      p.screenshot_allowed,
      p.local_storage_allowed,
      p.resize_allowed,
      p.post_release_retention_allowed,
      p.hotlink_allowed,
      p.required_credit,
      p.required_copyright

    FROM watch_items wi

    INNER JOIN watch_sources ws
      ON ws.id = wi.source_id

    LEFT JOIN source_image_policies p
      ON p.source_id = wi.source_id

    WHERE wi.id = ?

    LIMIT 1
  `)
    .bind(id)
    .first()

  if (!item) {
    return c.json(
      {
        ok: false,
        error: 'watcher item not found',
      },
      404
    )
  }

  const { results: images } =
    await c.env.DB.prepare(`
      SELECT *
      FROM watch_item_images
      WHERE watch_item_id = ?
      ORDER BY
        display_order ASC,
        id ASC
    `)
      .bind(id)
      .all()

  return c.json({
    ok: true,
    item,
    images: images ?? [],
  })
})

// ------------------------------------------------------------
// WATCHER 항목을 게임 등록 초안으로 변환
//
// 초안만 저장하며 실제 games 테이블에는 등록하지 않음
// 이미지 선택·다운로드·공개도 하지 않음
// ------------------------------------------------------------

watcherAdmin.post(
  '/items/:id/transform',
  async (c) => {
    const id = Number(c.req.param('id'))

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return c.json(
        {
          ok: false,
          error: 'invalid watcher item id',
        },
        400
      )
    }

    const body = await c.req
      .json<Record<string, unknown>>()
      .catch(() => null)

    if (!body) {
      return c.json(
        {
          ok: false,
          error: 'invalid JSON body',
        },
        400
      )
    }

    const text = (
      value: unknown
    ): string => {
      return String(value ?? '').trim()
    }

    const isDate = (
      value: string
    ): boolean => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false
      }

      const parts = value
        .split('-')
        .map(Number)

      const year = parts[0]
      const month = parts[1]
      const day = parts[2]

      const date = new Date(
        Date.UTC(year, month - 1, day)
      )

      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      )
    }

    const isHttpUrl = (
      value: string
    ): boolean => {
      if (!value) return true

      try {
        const url = new URL(value)

        return (
          url.protocol === 'http:' ||
          url.protocol === 'https:'
        )
      } catch (error) {
        return false
      }
    }

    const title = text(body.title)
    const platform = text(body.platform)
      .toLowerCase()

    const editionName =
      text(body.editionName)

    const genre = text(body.genre)

    const releaseDate =
      text(body.releaseDate)

    const preorderStartDate =
      text(body.preorderStartDate)

    const preorderEndDate =
      text(body.preorderEndDate)

    const preorderBonus =
      text(body.preorderBonus)

    const preorderBonusNote =
      text(body.preorderBonusNote)

    const trailerUrl =
      text(body.trailerUrl)

    const rawCandidatePrice =
      body.candidatePrice

    const candidatePrice =
      rawCandidatePrice == null ||
      rawCandidatePrice === ''
        ? null
        : Number(rawCandidatePrice)

    const allowedPlatforms = new Set([
      'pc',
      'ps5',
      'ps4',
      'xbox',
      'switch',
      'etc',
    ])

    if (!title) {
      return c.json(
        {
          ok: false,
          error: 'title is required',
        },
        400
      )
    }

    if (!allowedPlatforms.has(platform)) {
      return c.json(
        {
          ok: false,
          error: 'invalid platform',
        },
        400
      )
    }

    if (
      !releaseDate ||
      !isDate(releaseDate)
    ) {
      return c.json(
        {
          ok: false,
          error:
            'releaseDate must be YYYY-MM-DD',
        },
        400
      )
    }

    if (
      preorderStartDate &&
      !isDate(preorderStartDate)
    ) {
      return c.json(
        {
          ok: false,
          error:
            'preorderStartDate must be YYYY-MM-DD',
        },
        400
      )
    }

    if (
      preorderEndDate &&
      !isDate(preorderEndDate)
    ) {
      return c.json(
        {
          ok: false,
          error:
            'preorderEndDate must be YYYY-MM-DD',
        },
        400
      )
    }

    if (
      preorderStartDate &&
      preorderEndDate &&
      preorderStartDate > preorderEndDate
    ) {
      return c.json(
        {
          ok: false,
          error:
            'preorder start date cannot be after end date',
        },
        400
      )
    }

    if (!isHttpUrl(trailerUrl)) {
      return c.json(
        {
          ok: false,
          error: 'invalid trailer URL',
        },
        400
      )
    }

    if (
      candidatePrice != null &&
      (
        !Number.isInteger(candidatePrice) ||
        candidatePrice <= 0
      )
    ) {
      return c.json(
        {
          ok: false,
          error:
            'candidatePrice must be a positive integer',
        },
        400
      )
    }

    const item = await c.env.DB.prepare(`
      SELECT
        wi.id,
        wi.source_id,
        wi.source_url,
        wi.title AS source_title,
        wi.published_at,

        ws.source_key,
        ws.source_name,

        p.permission_status,
        p.required_credit,
        p.required_copyright

      FROM watch_items wi

      INNER JOIN watch_sources ws
        ON ws.id = wi.source_id

      LEFT JOIN source_image_policies p
        ON p.source_id = wi.source_id

      WHERE wi.id = ?

      LIMIT 1
    `)
      .bind(id)
      .first<{
        id: number
        source_id: number
        source_url: string
        source_title: string
        published_at: string | null
        source_key: string
        source_name: string
        permission_status: string | null
        required_credit: string | null
        required_copyright: string | null
      }>()

    if (!item) {
      return c.json(
        {
          ok: false,
          error: 'watcher item not found',
        },
        404
      )
    }

    const sourceCredit =
      text(item.required_credit) ||
      (
        '이미지 및 정보 출처: ' +
        item.source_name
      )

    const draft = {
      schemaVersion: 1,

      watchItemId: item.id,

      title,
      platform,
      editionName,
      genre,

      releaseDate,

      preorderStartDate:
        preorderStartDate || null,

      preorderEndDate:
        preorderEndDate || null,

      preorderBonus:
        preorderBonus || null,

      preorderBonusNote:
        preorderBonusNote || null,

      trailerUrl:
        trailerUrl || null,

      officialSourceUrl:
        item.source_url,

      sourceTitle:
        item.source_title,

      sourcePublishedAt:
        item.published_at,

      sourceKey:
        item.source_key,

      sourceName:
        item.source_name,

      sourceCredit,

      requiredCopyright:
        item.required_copyright || null,

      sourcePermissionStatus:
        item.permission_status || 'PENDING',

      priceStatus:
        candidatePrice == null
          ? 'UNCONFIRMED'
          : 'CANDIDATE',

      candidatePrice,

      selectedImageId: null,

      imagePermissionStatus: 'PENDING',

      publishStatus: 'DRAFT',

      transformedAt:
        new Date().toISOString(),
    }

    const result = await c.env.DB.prepare(`
      UPDATE watch_items

      SET
        transformed_json = ?,
        transform_confidence = ?,
        review_status = 'TRANSFORMED',
        reviewed_at = NULL,
        error_message = NULL,
        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
    `)
      .bind(
        JSON.stringify(draft),
        1,
        id
      )
      .run()

    return c.json({
      ok: true,
      itemId: id,
      changed: Number(
        result.meta.changes || 0
      ),
      reviewStatus: 'TRANSFORMED',
      draft,
    })
  }
)


// ------------------------------------------------------------
// 아크시스템웍스아시아 수동 수집 실행
// ------------------------------------------------------------

watcherAdmin.post(
  '/collect/arc-system-works',
  async (c) => {
    try {
      const result =
        await collectArcSystemWorksAsia(c.env.DB, 10)

      return c.json({
        ok: true,
        result,
      })
    } catch (error) {
      console.error(
        'ARC System Works Asia collector failed:',
        error
      )

      return c.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'ARC collector failed',
        },
        500
      )
    }
  }
)


export default watcherAdmin
