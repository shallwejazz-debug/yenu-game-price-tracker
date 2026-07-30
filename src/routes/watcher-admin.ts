// ============================================================
// WATCHER 愿由ъ옄 API
// src/routes/watcher-admin.ts
//
// GET /admin/api/watcher/summary
// GET /admin/api/watcher/sources
// GET /admin/api/watcher/items
//
// 紐⑤뱺 API??X-Admin-Token ?몄쬆 ?꾩슂
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import {
  collectArcSystemWorksAsia,
} from '../watchers/arc-system-works-asia'
import {
  collectCloudedLeopard,
} from '../watchers/clouded-leopard'

const watcherAdmin = new Hono<{
  Bindings: Bindings
}>()

// ------------------------------------------------------------
// 愿由ъ옄 ?몄쬆
// 湲곗〈 愿由ъ옄 ?붾㈃怨??숈씪?섍쾶 X-Admin-Token ?ъ슜
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
// WATCHER ?꾪솴
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
// ?섏쭛 異쒖쿂? ?대?吏 ?뺤콉 紐⑸줉
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
// ?섏쭛 ??ぉ 紐⑸줉
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
// WATCHER ?대깽??洹몃９ 紐⑸줉
//
// DB?먮뒗 ?곸꽭 ?대깽?몃? 洹몃?濡??좎??섍퀬,
// 愿由ъ옄 ?붾㈃?먯꽌???좎쭨蹂꽷룸낫?꾩옄猷뚮퀎濡?臾띠뼱??諛섑솚?쒕떎.
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
// WATCHER ?대깽??紐⑤몢 ?쎌쓬
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
// WATCHER ?대깽??洹몃９ ?쎌쓬
//
// 媛숈? ?좎쭨??媛숈? 蹂대룄?먮즺?먯꽌 ?앹꽦???대깽?몃?
// ??踰덉뿉 ?쎌쓬 泥섎━?쒕떎.
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
// WATCHER ?대깽??媛쒕퀎 ?쎌쓬
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
// ?뱀젙 ?섏쭛 ??ぉ ?곸꽭
// ------------------------------------------------------------


// ------------------------------------------------------------
// CLOUDED LEOPARD DRAFT SUGGESTION
// Existing transformed values win; only missing values are filled.
// ------------------------------------------------------------

function buildCleDraftSuggestion(
  input: unknown
): Record<string, unknown> {
  const item = {
    ...((input && typeof input === 'object')
      ? input as Record<string, unknown>
      : {}),
  }

  if (
    String(item.source_key || '') !==
    'CLOUDED_LEOPARD'
  ) {
    return item
  }

  const rawTitle = String(
    item.raw_title ||
    item.title ||
    ''
  ).trim()

  const rawText = String(
    item.raw_text ||
    ''
  ).replace(/\r/g, '')

  const sourceUrl = String(
    item.source_url ||
    ''
  ).trim()

  const quotedTitle =
    rawTitle.match(/[『「《](.*?)[』」》]/)?.[1]
      ?.trim() || ''

  const cleanedTitle = rawTitle
    .replace(
      /\s*[|｜]\s*Clouded Leopard Entertainment.*$/i,
      ''
    )
    .replace(
      /\s*[-–—]\s*Clouded Leopard Entertainment.*$/i,
      ''
    )
    .trim()

  const gameTitle =
    quotedTitle ||
    cleanedTitle ||
    rawTitle

  const searchable = `${rawTitle}\n${rawText}`
    .slice(0, 50000)

  const detectedPlatforms: string[] = []

  if (
    /Nintendo\s*Switch\s*2|Switch\s*2|\bNSW2\b/i
      .test(searchable)
  ) {
    detectedPlatforms.push('switch2')
  }

  const withoutSwitch2 = searchable.replace(
    /Nintendo\s*Switch\s*2|Switch\s*2|\bNSW2\b/gi,
    ' '
  )

  if (
    /Nintendo\s*Switch|\bNSW\b/i
      .test(withoutSwitch2)
  ) {
    detectedPlatforms.push('switch')
  }

  if (
    /PlayStation\s*5|\bPS5\b/i
      .test(searchable)
  ) {
    detectedPlatforms.push('ps5')
  }

  if (
    /PlayStation\s*4|\bPS4\b/i
      .test(searchable)
  ) {
    detectedPlatforms.push('ps4')
  }

  if (
    /\bSteam\b|\bPC\b/i.test(searchable)
  ) {
    detectedPlatforms.push('pc')
  }

  if (
    /\bXbox\b/i.test(searchable)
  ) {
    detectedPlatforms.push('xbox')
  }

  const platform =
    detectedPlatforms[0] ||
    'etc'

  let releaseDate = ''

  const releasePatterns = [
    /(?:\uBC1C\uB9E4|\uCD9C\uC2DC|\uD310\uB9E4\s*\uC608\uC815)[^\n]{0,100}?(20\d{2})\s*\uB144\s*(\d{1,2})\s*\uC6D4\s*(\d{1,2})\s*\uC77C/i,
    /(?:\uBC1C\uB9E4|\uCD9C\uC2DC|\uD310\uB9E4\s*\uC608\uC815)[^\n]{0,100}?(20\d{2})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})/i,
    /(20\d{2})\s*\uB144\s*(\d{1,2})\s*\uC6D4\s*(\d{1,2})\s*\uC77C[^\n]{0,60}?(?:\uBC1C\uB9E4|\uCD9C\uC2DC)/i,
    /(20\d{2})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})[^\n]{0,60}?(?:\uBC1C\uB9E4|\uCD9C\uC2DC)/i,
  ]

  for (const pattern of releasePatterns) {
    const match = searchable.match(pattern)

    if (!match) continue

    releaseDate = [
      match[1],
      match[2].padStart(2, '0'),
      match[3].padStart(2, '0'),
    ].join('-')

    break
  }

  let editionName = ''

  if (
    /\uD55C\uC815\uD310|\uD55C\uC815\s*\uC5D0\uB514\uC158|Limited\s*Edition/i
      .test(searchable)
  ) {
    editionName = '\uD55C\uC815\uD310'
  } else if (
    /\uD328\uD0A4\uC9C0\uD310|\uD328\uD0A4\uC9C0\s*\uBC84\uC804/i
      .test(searchable)
  ) {
    editionName = '\uD328\uD0A4\uC9C0\uD310'
  }

  const platformLabels: Record<string, string> = {
    switch2: 'Nintendo Switch 2',
    switch: 'Nintendo Switch',
    ps5: 'PlayStation 5',
    ps4: 'PlayStation 4',
    pc: 'Steam / PC',
    xbox: 'Xbox',
    etc: '\uAE30\uD0C0',
  }

  const detectedPlatformText =
    detectedPlatforms
      .map((value) => platformLabels[value] || value)
      .join(' / ')

  const suggestion: Record<string, unknown> = {
    game_title: gameTitle,
    gameTitle,
    title: gameTitle,

    platform,
    platforms: detectedPlatforms,
    detected_platforms: detectedPlatforms,
    detectedPlatforms,

    release_date: releaseDate,
    releaseDate,

    edition_name: editionName,
    editionName,

    source_url: sourceUrl,
    sourceUrl,
    official_url: sourceUrl,
    officialUrl: sourceUrl,

    source_key: 'CLOUDED_LEOPARD',
    sourceKey: 'CLOUDED_LEOPARD',

    source_name:
      'Clouded Leopard Entertainment',
    sourceName:
      'Clouded Leopard Entertainment',

    permission_status: 'CONDITIONAL',
    permissionStatus: 'CONDITIONAL',

    notes: detectedPlatformText
      ? `\uAC10\uC9C0 \uD50C\uB7AB\uD3FC: ${detectedPlatformText}`
      : '',
  }

  let existing: Record<string, unknown> = {}

  if (
    typeof item.transformed_json === 'string' &&
    item.transformed_json.trim()
  ) {
    try {
      const parsed = JSON.parse(
        item.transformed_json
      )

      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        existing =
          parsed as Record<string, unknown>
      }
    } catch {
      existing = {}
    }
  }

  const merged = {
    ...suggestion,
  }

  for (
    const [key, value] of
    Object.entries(existing)
  ) {
    const hasValue =
      value !== null &&
      value !== undefined &&
      !(
        typeof value === 'string' &&
        value.trim() === ''
      )

    if (hasValue) {
      merged[key] = value
    }
  }

  item.transformed_json =
    JSON.stringify(merged)

  return item
}

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
    item: buildCleDraftSuggestion(item),
    images: images ?? [],
  })
})

// ------------------------------------------------------------
// WATCHER ??ぉ??寃뚯엫 ?깅줉 珥덉븞?쇰줈 蹂??//
// 珥덉븞留???ν븯硫??ㅼ젣 games ?뚯씠釉붿뿉???깅줉?섏? ?딆쓬
// ?대?吏 ?좏깮쨌?ㅼ슫濡쒕뱶쨌怨듦컻???섏? ?딆쓬
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
      'switch2',
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
        '?대?吏 諛??뺣낫 異쒖쿂: ' +
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
// WATCHER 珥덉븞???ㅼ젣 鍮꾧났媛?寃뚯엫 DRAFT濡??깅줉
//
// ?앹꽦:
//   games                  DRAFT
//   editions               ?뚮옯?쇳뙋
//   game_official_sources  怨듭떇 異쒖쿂
//   edition_preorders      ?덉빟?먮ℓ 珥덉븞
//
// ?대?吏:
//   ?좏깮쨌?ㅼ슫濡쒕뱶쨌怨듦컻?섏? ?딆쓬
// ------------------------------------------------------------

watcherAdmin.post(
  '/items/:id/register-draft',
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

    const item = await c.env.DB.prepare(`
      SELECT
        wi.id,
        wi.source_id,
        wi.source_url,
        wi.title AS source_title,
        wi.published_at,
        wi.review_status,
        wi.transformed_json,
        wi.linked_game_id,

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
        review_status: string
        transformed_json: string | null
        linked_game_id: number | null
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

    if (item.linked_game_id) {
      return c.json({
        ok: true,
        alreadyRegistered: true,
        itemId: item.id,
        gameId: Number(item.linked_game_id),
        message:
          '?대? 寃뚯엫 DRAFT???곌껐??蹂대룄?먮즺?낅땲??',
      })
    }

    if (
      item.review_status !== 'TRANSFORMED'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '寃뚯엫 ?깅줉 珥덉븞??癒쇱? ??ν빐 二쇱꽭??',
        },
        409
      )
    }

    if (!item.transformed_json) {
      return c.json(
        {
          ok: false,
          error:
            'transformed draft is missing',
        },
        409
      )
    }

    const permissionStatus = String(
      item.permission_status || 'PENDING'
    ).toUpperCase()

    if (
      permissionStatus !== 'APPROVED' &&
      permissionStatus !== 'CONDITIONAL'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '怨듭떇 異쒖쿂 ?대?吏쨌?뺣낫 ?ъ슜 ?뺤콉???뱀씤?섏? ?딆븯?듬땲??',
        },
        409
      )
    }

    let draft: Record<string, unknown>

    try {
      const parsed = JSON.parse(
        item.transformed_json
      )

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        throw new Error(
          'invalid transformed draft'
        )
      }

      draft = parsed as Record<
        string,
        unknown
      >
    } catch (error) {
      return c.json(
        {
          ok: false,
          error:
            '??λ맂 寃뚯엫 珥덉븞???댁꽍?????놁뒿?덈떎.',
        },
        409
      )
    }

    const text = (
      value: unknown
    ): string => {
      return String(value ?? '').trim()
    }

    const title = text(draft.title)

    const platform = text(
      draft.platform
    ).toLowerCase()

    const editionName =
      text(draft.editionName)

    const genre = text(draft.genre)

    const releaseDate =
      text(draft.releaseDate)

    const preorderStartDate =
      text(draft.preorderStartDate)

    const preorderEndDate =
      text(draft.preorderEndDate)

    const preorderBonus =
      text(draft.preorderBonus)

    const preorderBonusNote =
      text(draft.preorderBonusNote)

    const trailerUrl =
      text(draft.trailerUrl)

    const rawCandidatePrice =
      draft.candidatePrice

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

    if (
      !title ||
      !allowedPlatforms.has(platform) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        releaseDate
      )
    ) {
      return c.json(
        {
          ok: false,
          error:
            '寃뚯엫 ?쒕ぉ쨌?뚮옯?셋룸컻留ㅼ씪???ㅼ떆 ?뺤씤??二쇱꽭??',
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
            '媛寃??꾨낫媛 ?щ컮瑜댁? ?딆뒿?덈떎.',
        },
        400
      )
    }

    const existingGame =
      await c.env.DB.prepare(`
        SELECT
          id,
          publish_status

        FROM games

        WHERE
          LOWER(TRIM(title)) =
          LOWER(TRIM(?))

        LIMIT 1
      `)
        .bind(title)
        .first<{
          id: number
          publish_status: string
        }>()

    if (existingGame) {
      return c.json(
        {
          ok: false,
          error:
            '媛숈? ?쒕ぉ??寃뚯엫???대? ?덉뒿?덈떎. 湲곗〈 寃뚯엫 ?곌껐 湲곕뒫?먯꽌 泥섎━??二쇱꽭??',
          existingGameId:
            Number(existingGame.id),
          existingPublishStatus:
            existingGame.publish_status,
        },
        409
      )
    }

    let preorderStatus =
      'UNKNOWN'

    const todayKst = new Date(
      Date.now() + 9 * 60 * 60 * 1000
    )
      .toISOString()
      .slice(0, 10)

    if (preorderStartDate) {
      if (todayKst < preorderStartDate) {
        preorderStatus = 'UPCOMING'
      } else if (
        preorderEndDate &&
        todayKst > preorderEndDate
      ) {
        preorderStatus = 'CLOSED'
      } else {
        preorderStatus = 'OPEN'
      }
    }

    const priceStatus =
      candidatePrice == null
        ? 'UNCONFIRMED'
        : 'CANDIDATE'

    const sourceCredit =
      text(item.required_credit) ||
      (
        '?대?吏 諛??뺣낫 異쒖쿂: ' +
        item.source_name
      )

    let createdGameId:
      number | null = null

    try {
      const game =
        await c.env.DB.prepare(`
          INSERT INTO games (
            title,
            image_url,
            release_date,
            original_price,
            genre,
            publish_status,
            published_at
          )
          VALUES (
            ?,
            NULL,
            ?,
            NULL,
            ?,
            'DRAFT',
            NULL
          )
          RETURNING id
        `)
          .bind(
            title,
            releaseDate,
            genre || null
          )
          .first<{
            id: number
          }>()

      if (!game?.id) {
        throw new Error(
          'failed to create game draft'
        )
      }

      createdGameId = Number(game.id)

      const edition =
        await c.env.DB.prepare(`
          INSERT INTO editions (
            game_id,
            platform,
            edition_name,
            search_query,
            keywords,
            steam_appid
          )
          VALUES (
            ?, ?, ?, ?, ?, NULL
          )
          RETURNING id
        `)
          .bind(
            createdGameId,
            platform,
            editionName || null,
            title,
            title
          )
          .first<{
            id: number
          }>()

      if (!edition?.id) {
        throw new Error(
          'failed to create edition draft'
        )
      }

      const officialSource =
        await c.env.DB.prepare(`
          INSERT INTO game_official_sources (
            game_id,
            watch_item_id,
            source_id,
            source_title,
            official_source_url,
            trailer_url,
            source_credit,
            required_copyright,
            permission_status_snapshot
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
          RETURNING id
        `)
          .bind(
            createdGameId,
            item.id,
            item.source_id,
            item.source_title,
            item.source_url,
            trailerUrl || null,
            sourceCredit,
            item.required_copyright || null,
            permissionStatus
          )
          .first<{
            id: number
          }>()

      if (!officialSource?.id) {
        throw new Error(
          'failed to create official source'
        )
      }

      const preorder =
        await c.env.DB.prepare(`
          INSERT INTO edition_preorders (
            edition_id,
            official_source_id,
            release_date,
            preorder_start_date,
            preorder_end_date,
            preorder_status,
            preorder_bonus,
            preorder_bonus_note,
            candidate_price,
            confirmed_price,
            price_status,
            selected_image_id,
            publish_status,
            display_order,
            approved_at,
            published_at
          )
          VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, NULL, ?,
            NULL, 'DRAFT', 0,
            NULL, NULL
          )
          RETURNING id
        `)
          .bind(
            edition.id,
            officialSource.id,
            releaseDate,
            preorderStartDate || null,
            preorderEndDate || null,
            preorderStatus,
            preorderBonus || null,
            preorderBonusNote || null,
            candidatePrice,
            priceStatus
          )
          .first<{
            id: number
          }>()

      if (!preorder?.id) {
        throw new Error(
          'failed to create preorder draft'
        )
      }

      await c.env.DB.prepare(`
        UPDATE watch_items

        SET
          linked_game_id = ?,
          review_status = 'APPROVED',
          reviewed_at = CURRENT_TIMESTAMP,
          error_message = NULL,
          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
      `)
        .bind(
          createdGameId,
          item.id
        )
        .run()

      return c.json({
        ok: true,
        alreadyRegistered: false,

        itemId: item.id,
        gameId: createdGameId,
        editionId: Number(edition.id),

        officialSourceId:
          Number(officialSource.id),

        preorderId:
          Number(preorder.id),

        gamePublishStatus: 'DRAFT',
        preorderPublishStatus: 'DRAFT',

        imageSelected: false,
        imagePublished: false,

        message:
          '鍮꾧났媛?寃뚯엫 DRAFT瑜??앹꽦?덉뒿?덈떎.',
      })
    } catch (error) {
      if (createdGameId) {
        try {
          await c.env.DB.prepare(`
            DELETE FROM games
            WHERE
              id = ?
              AND publish_status = 'DRAFT'
          `)
            .bind(createdGameId)
            .run()
        } catch (cleanupError) {
          console.error(
            'Failed to clean up game draft:',
            cleanupError
          )
        }
      }

      const message =
        error instanceof Error
          ? error.message
          : 'failed to register game draft'

      await c.env.DB.prepare(`
        UPDATE watch_items
        SET
          error_message = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
        .bind(
          message.slice(0, 1000),
          item.id
        )
        .run()

      console.error(
        'WATCHER game draft registration failed:',
        error
      )

      return c.json(
        {
          ok: false,
          error:
            '寃뚯엫 DRAFT ?깅줉???ㅽ뙣?덉뒿?덈떎: ' +
            message,
        },
        500
      )
    }
  }
)

// ------------------------------------------------------------
// WATCHER 寃뚯엫 DRAFT ????대?吏 ?꾨낫 ?좏깮
//
// 泥섎━:
//   - 愿由ъ옄媛 ?대?吏 ?좏삎???뺤씤?섏뿬 吏??//   - 媛쒕퀎 ?대?吏 ?곹깭瑜?APPROVED濡?蹂寃?//   - 媛숈? 蹂대룄?먮즺???ㅻⅨ ?대?吏 ?좏깮 ?댁젣
//   - edition_preorders.selected_image_id ?곌껐
//
// ?섏? ?딅뒗 泥섎━:
//   - ?대?吏 ?ㅼ슫濡쒕뱶
//   - R2 ???//   - games.image_url 蹂寃?//   - 寃뚯엫 怨듦컻
// ------------------------------------------------------------

watcherAdmin.post(
  '/items/:id/images/:imageId/select',
  async (c) => {
    const itemId = Number(
      c.req.param('id')
    )

    const imageId = Number(
      c.req.param('imageId')
    )

    if (
      !Number.isInteger(itemId) ||
      itemId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error: 'invalid watcher item id',
        },
        400
      )
    }

    if (
      !Number.isInteger(imageId) ||
      imageId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error: 'invalid watcher image id',
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

    const imageType = String(
      body.imageType ?? ''
    )
      .trim()
      .toUpperCase()

    const allowedImageTypes = new Set([
      'PACKAGE',
      'LIMITED_EDITION',
      'PREORDER_BONUS',
      'FIRST_PRINT_BONUS',
      'STORE_BONUS',
      'KEY_VISUAL',
      'SCREENSHOT',
    ])

    if (!allowedImageTypes.has(imageType)) {
      return c.json(
        {
          ok: false,
          error:
            '????대?吏 ?좏삎???좏깮??二쇱꽭??',
        },
        400
      )
    }

    const record = await c.env.DB.prepare(`
      SELECT
        wi.id AS watch_item_id,
        wi.source_id,
        wi.review_status,
        wi.linked_game_id,

        g.publish_status
          AS game_publish_status,

        image.id AS image_id,
        image.watch_item_id
          AS image_watch_item_id,

        image.source_image_url,
        image.stored_image_url,
        image.image_type,
        image.permission_status
          AS image_permission_status,

        policy.permission_status
          AS source_permission_status,

        policy.package_image_allowed,
        policy.limited_edition_image_allowed,
        policy.preorder_bonus_image_allowed,
        policy.key_visual_allowed,
        policy.screenshot_allowed,
        policy.local_storage_allowed,
        policy.resize_allowed,
        policy.hotlink_allowed

      FROM watch_items wi

      INNER JOIN games g
        ON g.id = wi.linked_game_id

      INNER JOIN watch_item_images image
        ON image.watch_item_id = wi.id

      LEFT JOIN source_image_policies policy
        ON policy.source_id = wi.source_id

      WHERE
        wi.id = ?
        AND image.id = ?

      LIMIT 1
    `)
      .bind(
        itemId,
        imageId
      )
      .first<{
        watch_item_id: number
        source_id: number
        review_status: string
        linked_game_id: number | null
        game_publish_status: string

        image_id: number
        image_watch_item_id: number
        source_image_url: string
        stored_image_url: string | null
        image_type: string
        image_permission_status: string

        source_permission_status: string | null

        package_image_allowed: number | null
        limited_edition_image_allowed:
          number | null
        preorder_bonus_image_allowed:
          number | null
        key_visual_allowed: number | null
        screenshot_allowed: number | null
        local_storage_allowed: number | null
        resize_allowed: number | null
        hotlink_allowed: number | null
      }>()

    if (!record) {
      return c.json(
        {
          ok: false,
          error:
            '?대?吏 ?꾨낫 ?먮뒗 WATCHER ??ぉ??李얠쓣 ???놁뒿?덈떎.',
        },
        404
      )
    }

    const gameId = Number(
      record.linked_game_id || 0
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error:
            '鍮꾧났媛?寃뚯엫 DRAFT瑜?癒쇱? ?깅줉??二쇱꽭??',
        },
        409
      )
    }

    if (
      record.game_publish_status !== 'DRAFT'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '????대?吏 ?꾨낫 ?좏깮? DRAFT 寃뚯엫?먯꽌留?媛?ν빀?덈떎.',
        },
        409
      )
    }

    const sourcePermissionStatus = String(
      record.source_permission_status ||
      'PENDING'
    ).toUpperCase()

    if (
      sourcePermissionStatus !== 'APPROVED' &&
      sourcePermissionStatus !== 'CONDITIONAL'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '異쒖쿂???대?吏 ?ъ슜 ?뺤콉???뱀씤?섏? ?딆븯?듬땲??',
        },
        409
      )
    }

    let imageTypeAllowed = false

    if (imageType === 'PACKAGE') {
      imageTypeAllowed =
        Number(
          record.package_image_allowed
        ) === 1
    }

    if (imageType === 'LIMITED_EDITION') {
      imageTypeAllowed =
        Number(
          record.limited_edition_image_allowed
        ) === 1
    }

    if (
      imageType === 'PREORDER_BONUS' ||
      imageType === 'FIRST_PRINT_BONUS' ||
      imageType === 'STORE_BONUS'
    ) {
      imageTypeAllowed =
        Number(
          record.preorder_bonus_image_allowed
        ) === 1
    }

    if (imageType === 'KEY_VISUAL') {
      imageTypeAllowed =
        Number(
          record.key_visual_allowed
        ) === 1
    }

    if (imageType === 'SCREENSHOT') {
      imageTypeAllowed =
        Number(
          record.screenshot_allowed
        ) === 1
    }

    if (!imageTypeAllowed) {
      return c.json(
        {
          ok: false,
          error:
            '??異쒖쿂?먯꽌???좏깮???대?吏 ?좏삎???ъ슜???덉슜?섏? ?딆븯?듬땲??',
        },
        409
      )
    }

    const preorder = await c.env.DB.prepare(`
      SELECT
        ep.id,
        ep.publish_status

      FROM edition_preorders ep

      INNER JOIN editions e
        ON e.id = ep.edition_id

      INNER JOIN game_official_sources gos
        ON gos.id = ep.official_source_id

      WHERE
        e.game_id = ?
        AND gos.game_id = ?
        AND gos.watch_item_id = ?

      LIMIT 1
    `)
      .bind(
        gameId,
        gameId,
        itemId
      )
      .first<{
        id: number
        publish_status: string
      }>()

    if (!preorder) {
      return c.json(
        {
          ok: false,
          error:
            '?곌껐???덉빟?먮ℓ DRAFT瑜?李얠쓣 ???놁뒿?덈떎.',
        },
        404
      )
    }

    if (preorder.publish_status !== 'DRAFT') {
      return c.json(
        {
          ok: false,
          error:
            'DRAFT ?곹깭???덉빟?먮ℓ ?뺣낫?먯꽌留??대?吏瑜??좏깮?????덉뒿?덈떎.',
        },
        409
      )
    }

    await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE watch_item_images

        SET
          selected_for_publish = 0,
          updated_at = CURRENT_TIMESTAMP

        WHERE watch_item_id = ?
      `)
        .bind(itemId),

      c.env.DB.prepare(`
        UPDATE watch_item_images

        SET
          image_type = ?,
          permission_status = 'APPROVED',
          selected_for_publish = 1,
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP

        WHERE
          id = ?
          AND watch_item_id = ?
      `)
        .bind(
          imageType,
          imageId,
          itemId
        ),

      c.env.DB.prepare(`
        UPDATE edition_preorders

        SET
          selected_image_id = ?,
          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
      `)
        .bind(
          imageId,
          preorder.id
        ),
    ])

    return c.json({
      ok: true,

      itemId,
      gameId,

      preorderId:
        Number(preorder.id),

      selectedImageId:
        imageId,

      imageType,

      imagePermissionStatus:
        'APPROVED',

      sourcePermissionStatus,

      sourceImageUrl:
        record.source_image_url,

      storedImageUrl:
        record.stored_image_url,

      gamePublishStatus:
        'DRAFT',

      preorderPublishStatus:
        'DRAFT',

      gameImageUrlChanged:
        false,

      imageDownloaded:
        false,

      imagePublished:
        false,

      message:
        '????대?吏 ?꾨낫瑜??좏깮?덉뒿?덈떎. ?꾩쭅 ?ㅼ슫濡쒕뱶?섍굅??怨듦컻?섏? ?딆븯?듬땲??',
    })
  }
)

// ------------------------------------------------------------
// ?좏깮??WATCHER ????대?吏 ?먮낯??鍮꾧났媛?R2?????//
// 泥섎━:
//   - ?좏깮쨌?뱀씤???대?吏?몄? ?ш?利?//   - 異쒖쿂??濡쒖뺄 ????덉슜 ?щ? ?ш?利?//   - DRAFT 寃뚯엫쨌?덉빟?먮ℓ?몄? ?ш?利?//   - 怨듭떇 ?먮낯 URL?먯꽌 ?쒕쾭媛 ?ㅼ슫濡쒕뱶
//   - ?뚯씪 ?ш린 諛??ㅼ젣 ?대?吏 ?뺤떇 寃利?//   - SHA-256 怨꾩궛
//   - 鍮꾧났媛?GAME_IMAGES R2 踰꾪궥?????//   - watch_item_images???대? ????꾩튂 湲곕줉
//
// ?섏? ?딅뒗 泥섎━:
//   - games.image_url 蹂寃?//   - 寃뚯엫 ?먮뒗 ?덉빟?먮ℓ 怨듦컻
//   - 怨듦컻 ?대?吏 URL ?앹꽦
// ------------------------------------------------------------

watcherAdmin.post(
  '/items/:id/images/:imageId/store',
  async (c) => {
    const itemId = Number(
      c.req.param('id')
    )

    const imageId = Number(
      c.req.param('imageId')
    )

    if (
      !Number.isInteger(itemId) ||
      itemId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error: 'invalid watcher item id',
        },
        400
      )
    }

    if (
      !Number.isInteger(imageId) ||
      imageId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error: 'invalid watcher image id',
        },
        400
      )
    }

    const record = await c.env.DB.prepare(`
      SELECT
        wi.id AS watch_item_id,
        wi.source_id,
        wi.linked_game_id,
        wi.review_status,

        ws.source_key,
        ws.source_name,

        g.publish_status
          AS game_publish_status,

        image.id AS image_id,
        image.source_image_url,
        image.stored_image_url,
        image.image_type,
        image.image_hash,
        image.permission_status
          AS image_permission_status,
        image.selected_for_publish,

        policy.permission_status
          AS source_permission_status,
        policy.local_storage_allowed,

        ep.id AS preorder_id,
        ep.selected_image_id,
        ep.publish_status
          AS preorder_publish_status

      FROM watch_items wi

      INNER JOIN watch_sources ws
        ON ws.id = wi.source_id

      INNER JOIN games g
        ON g.id = wi.linked_game_id

      INNER JOIN watch_item_images image
        ON image.watch_item_id = wi.id

      LEFT JOIN source_image_policies policy
        ON policy.source_id = wi.source_id

      INNER JOIN game_official_sources gos
        ON
          gos.game_id = g.id
          AND gos.watch_item_id = wi.id

      INNER JOIN edition_preorders ep
        ON ep.official_source_id = gos.id

      INNER JOIN editions edition
        ON
          edition.id = ep.edition_id
          AND edition.game_id = g.id

      WHERE
        wi.id = ?
        AND image.id = ?

      LIMIT 1
    `)
      .bind(
        itemId,
        imageId
      )
      .first<{
        watch_item_id: number
        source_id: number
        linked_game_id: number | null
        review_status: string

        source_key: string
        source_name: string

        game_publish_status: string

        image_id: number
        source_image_url: string
        stored_image_url: string | null
        image_type: string
        image_hash: string | null
        image_permission_status: string
        selected_for_publish: number

        source_permission_status: string | null
        local_storage_allowed: number | null

        preorder_id: number
        selected_image_id: number | null
        preorder_publish_status: string
      }>()

    if (!record) {
      return c.json(
        {
          ok: false,
          error:
            '?곌껐???대?吏쨌寃뚯엫쨌?덉빟?먮ℓ ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎.',
        },
        404
      )
    }

    const gameId = Number(
      record.linked_game_id || 0
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error:
            '鍮꾧났媛?寃뚯엫 DRAFT瑜?癒쇱? ?깅줉??二쇱꽭??',
        },
        409
      )
    }

    if (
      record.game_publish_status !== 'DRAFT'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '?대?吏 ??μ? DRAFT 寃뚯엫?먯꽌留?媛?ν빀?덈떎.',
        },
        409
      )
    }

    if (
      record.preorder_publish_status !== 'DRAFT'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '?대?吏 ??μ? DRAFT ?덉빟?먮ℓ ?뺣낫?먯꽌留?媛?ν빀?덈떎.',
        },
        409
      )
    }

    if (
      Number(record.selected_for_publish) !== 1 ||
      Number(record.selected_image_id) !== imageId
    ) {
      return c.json(
        {
          ok: false,
          error:
            '????대?吏 ?꾨낫瑜?癒쇱? ?좏깮??二쇱꽭??',
        },
        409
      )
    }

    if (
      record.image_permission_status !==
      'APPROVED'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '媛쒕퀎 ?대?吏 寃?섍? ?뱀씤?섏? ?딆븯?듬땲??',
        },
        409
      )
    }

    const sourcePermissionStatus = String(
      record.source_permission_status ||
      'PENDING'
    ).toUpperCase()

    if (
      sourcePermissionStatus !== 'APPROVED' &&
      sourcePermissionStatus !== 'CONDITIONAL'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '異쒖쿂???대?吏 ?ъ슜 ?뺤콉???뱀씤?섏? ?딆븯?듬땲??',
        },
        409
      )
    }

    if (
      Number(record.local_storage_allowed) !== 1
    ) {
      return c.json(
        {
          ok: false,
          error:
            '??異쒖쿂???대?吏 濡쒖뺄 ??μ쓣 ?덉슜?섏? ?딆뒿?덈떎.',
        },
        409
      )
    }

    const allowedRepresentativeTypes =
      new Set([
        'PACKAGE',
        'LIMITED_EDITION',
        'PREORDER_BONUS',
        'FIRST_PRINT_BONUS',
        'STORE_BONUS',
        'KEY_VISUAL',
        'SCREENSHOT',
      ])

    if (
      !allowedRepresentativeTypes.has(
        String(record.image_type).toUpperCase()
      )
    ) {
      return c.json(
        {
          ok: false,
          error:
            '??ν븷 ???녿뒗 ?대?吏 ?좏삎?낅땲??',
        },
        409
      )
    }

    let sourceUrl: URL

    try {
      sourceUrl = new URL(
        record.source_image_url
      )
    } catch (error) {
      return c.json(
        {
          ok: false,
          error:
            '怨듭떇 ?대?吏 ?먮낯 URL???щ컮瑜댁? ?딆뒿?덈떎.',
        },
        409
      )
    }

    if (
      sourceUrl.protocol !== 'https:' &&
      sourceUrl.protocol !== 'http:'
    ) {
      return c.json(
        {
          ok: false,
          error:
            'HTTP ?먮뒗 HTTPS ?대?吏 URL留???ν븷 ???덉뒿?덈떎.',
        },
        409
      )
    }

    const isUnsafeHostname = (
      value: string
    ): boolean => {
      const hostname = value
        .trim()
        .toLowerCase()
        .replace(/^\[/, '')
        .replace(/\]$/, '')

      if (
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname === '::1'
      ) {
        return true
      }

      const parts = hostname
        .split('.')
        .map(Number)

      if (
        parts.length === 4 &&
        parts.every(
          (part) =>
            Number.isInteger(part) &&
            part >= 0 &&
            part <= 255
        )
      ) {
        const first = parts[0]
        const second = parts[1]

        return (
          first === 0 ||
          first === 10 ||
          first === 127 ||
          (
            first === 169 &&
            second === 254
          ) ||
          (
            first === 172 &&
            second >= 16 &&
            second <= 31
          ) ||
          (
            first === 192 &&
            second === 168
          )
        )
      }

      return false
    }

    if (isUnsafeHostname(sourceUrl.hostname)) {
      return c.json(
        {
          ok: false,
          error:
            '?대? ?ㅽ듃?뚰겕 二쇱냼?먯꽌???대?吏瑜?媛?몄삱 ???놁뒿?덈떎.',
        },
        409
      )
    }

    const originalHostname =
      sourceUrl.hostname.toLowerCase()

    const isAllowedRedirectHost = (
      hostname: string
    ): boolean => {
      const nextHostname =
        hostname.toLowerCase()

      return (
        nextHostname === originalHostname ||
        nextHostname.endsWith(
          '.' + originalHostname
        ) ||
        originalHostname.endsWith(
          '.' + nextHostname
        )
      )
    }

    const maximumBytes =
      10 * 1024 * 1024

    let response: Response | null = null
    let currentUrl = sourceUrl

    try {
      for (
        let redirectCount = 0;
        redirectCount <= 3;
        redirectCount += 1
      ) {
        response = await fetch(
          currentUrl.toString(),
          {
            method: 'GET',
            redirect: 'manual',
            headers: {
              Accept:
                'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
            },
            signal:
              AbortSignal.timeout(15000),
          }
        )

        if (
          response.status < 300 ||
          response.status >= 400
        ) {
          break
        }

        const location =
          response.headers.get('location')

        if (!location) {
          break
        }

        if (redirectCount >= 3) {
          return c.json(
            {
              ok: false,
              error:
                '?대?吏 ?먮낯??由щ뵒?됱뀡 ?잛닔媛 ?덈Т 留롮뒿?덈떎.',
            },
            502
          )
        }

        const nextUrl = new URL(
          location,
          currentUrl
        )

        if (
          (
            nextUrl.protocol !== 'https:' &&
            nextUrl.protocol !== 'http:'
          ) ||
          isUnsafeHostname(nextUrl.hostname) ||
          !isAllowedRedirectHost(
            nextUrl.hostname
          )
        ) {
          return c.json(
            {
              ok: false,
              error:
                '?덉슜?섏? ?딆? 二쇱냼濡??대?吏 ?붿껌???대룞?덉뒿?덈떎.',
            },
            409
          )
        }

        currentUrl = nextUrl
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'image download failed'

      return c.json(
        {
          ok: false,
          error:
            '怨듭떇 ?대?吏 ?먮낯??媛?몄삤吏 紐삵뻽?듬땲?? ' +
            message,
        },
        502
      )
    }

    if (!response || !response.ok) {
      return c.json(
        {
          ok: false,
          error:
            '怨듭떇 ?대?吏 ?쒕쾭媛 ?ㅻ쪟瑜?諛섑솚?덉뒿?덈떎.',
          sourceStatus:
            response?.status ?? null,
        },
        502
      )
    }

    const declaredLength = Number(
      response.headers.get(
        'content-length'
      ) || 0
    )

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > maximumBytes
    ) {
      return c.json(
        {
          ok: false,
          error:
            '?대?吏 ?뚯씪??10MB ?쒗븳??珥덇낵?⑸땲??',
        },
        413
      )
    }

    let imageBuffer: ArrayBuffer

    try {
      imageBuffer =
        await response.arrayBuffer()
    } catch (error) {
      return c.json(
        {
          ok: false,
          error:
            '?대?吏 ?곗씠?곕? ?쎌? 紐삵뻽?듬땲??',
        },
        502
      )
    }

    if (
      imageBuffer.byteLength <= 0 ||
      imageBuffer.byteLength >
        maximumBytes
    ) {
      return c.json(
        {
          ok: false,
          error:
            imageBuffer.byteLength <= 0
              ? '鍮??대?吏 ?뚯씪?낅땲??'
              : '?대?吏 ?뚯씪??10MB ?쒗븳??珥덇낵?⑸땲??',
        },
        imageBuffer.byteLength <= 0
          ? 422
          : 413
      )
    }

    const bytes =
      new Uint8Array(imageBuffer)

    let contentType = ''

    if (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    ) {
      contentType = 'image/jpeg'
    } else if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      contentType = 'image/png'
    } else if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      contentType = 'image/webp'
    }

    if (!contentType) {
      return c.json(
        {
          ok: false,
          error:
            'JPEG, PNG ?먮뒗 WebP ?대?吏留???ν븷 ???덉뒿?덈떎.',
          sourceContentType:
            response.headers.get(
              'content-type'
            ),
        },
        415
      )
    }

    const digest =
      await crypto.subtle.digest(
        'SHA-256',
        imageBuffer
      )

    const imageHash = Array.from(
      new Uint8Array(digest)
    )
      .map(
        (value) =>
          value
            .toString(16)
            .padStart(2, '0')
      )
      .join('')

    const objectKey =
      `watcher/games/${gameId}/` +
      `images/${imageId}/original`

    const storedImageUrl =
      `r2://GAME_IMAGES/${objectKey}`

    const existingObject =
      await c.env.GAME_IMAGES.head(
        objectKey
      )

    if (
      existingObject &&
      record.stored_image_url ===
        storedImageUrl &&
      record.image_hash === imageHash
    ) {
      return c.json({
        ok: true,
        alreadyStored: true,

        itemId,
        imageId,
        gameId,
        preorderId:
          Number(record.preorder_id),

        objectKey,
        storedImageUrl,

        contentType:
          existingObject
            .httpMetadata
            ?.contentType ||
          contentType,

        size:
          existingObject.size,

        etag:
          existingObject.etag,

        imageHash,

        gamePublishStatus:
          record.game_publish_status,

        preorderPublishStatus:
          record.preorder_publish_status,

        gameImageUrlChanged: false,
        imagePublished: false,

        message:
          '?대? 鍮꾧났媛?R2????λ맂 ?대?吏?낅땲??',
      })
    }

    let storedObject:
      R2Object | null = null

    try {
      storedObject =
        await c.env.GAME_IMAGES.put(
          objectKey,
          imageBuffer,
          {
            httpMetadata: {
              contentType,
              cacheControl:
                'private, max-age=0, no-store',
            },

            customMetadata: {
              watchItemId:
                String(itemId),

              imageId:
                String(imageId),

              gameId:
                String(gameId),

              imageType:
                String(record.image_type),

              sha256:
                imageHash,
            },

            sha256: digest,
          }
        )

      if (!storedObject) {
        throw new Error(
          'R2 put returned null'
        )
      }

      const updateResult =
        await c.env.DB.prepare(`
          UPDATE watch_item_images

          SET
            stored_image_url = ?,
            image_hash = ?,
            updated_at = CURRENT_TIMESTAMP

          WHERE
            id = ?
            AND watch_item_id = ?
            AND selected_for_publish = 1
            AND permission_status = 'APPROVED'
        `)
          .bind(
            storedImageUrl,
            imageHash,
            imageId,
            itemId
          )
          .run()

      if (
        Number(
          updateResult.meta.changes || 0
        ) !== 1
      ) {
        await c.env.GAME_IMAGES.delete(
          objectKey
        )

        return c.json(
          {
            ok: false,
            error:
              '?대?吏 ?좏깮 ?곹깭媛 蹂寃쎈릺??R2 ??μ쓣 痍⑥냼?덉뒿?덈떎.',
          },
          409
        )
      }
    } catch (error) {
      if (storedObject) {
        try {
          await c.env.GAME_IMAGES.delete(
            objectKey
          )
        } catch (cleanupError) {
          console.error(
            'Failed to clean up R2 object:',
            cleanupError
          )
        }
      }

      const message =
        error instanceof Error
          ? error.message
          : 'R2 storage failed'

      console.error(
        'WATCHER image R2 storage failed:',
        error
      )

      return c.json(
        {
          ok: false,
          error:
            '?대?吏瑜?鍮꾧났媛???μ냼????ν븯吏 紐삵뻽?듬땲?? ' +
            message,
        },
        500
      )
    }

    return c.json({
      ok: true,
      alreadyStored: false,

      itemId,
      imageId,
      gameId,
      preorderId:
        Number(record.preorder_id),

      objectKey,
      storedImageUrl,

      contentType,
      size:
        storedObject.size,
      etag:
        storedObject.etag,

      imageHash,

      gamePublishStatus:
        record.game_publish_status,

      preorderPublishStatus:
        record.preorder_publish_status,

      gameImageUrlChanged: false,
      imagePublished: false,

      message:
        '?좏깮??????대?吏瑜?鍮꾧났媛?R2????ν뻽?듬땲??',
    })
  }
)

// ------------------------------------------------------------
// 鍮꾧났媛?R2 ????대?吏 愿由ъ옄 誘몃━蹂닿린
//
// 蹂댁븞:
//   - watcherAdmin 怨듯넻 X-Admin-Token ?몄쬆 ?곸슜
//   - ?좏깮쨌?뱀씤??????대?吏留??덉슜
//   - DRAFT 寃뚯엫쨌?덉빟?먮ℓ ?뺣낫留??덉슜
//   - DB??湲곕줉??怨좎젙 R2 媛앹껜留?諛섑솚
//   - ?몃? R2 怨듦컻 URL? ?ъ슜?섏? ?딆쓬
// ------------------------------------------------------------

watcherAdmin.get(
  '/items/:id/images/:imageId/preview',
  async (c) => {
    const itemId = Number(
      c.req.param('id')
    )

    const imageId = Number(
      c.req.param('imageId')
    )

    if (
      !Number.isInteger(itemId) ||
      itemId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error: 'invalid watcher item id',
        },
        400
      )
    }

    if (
      !Number.isInteger(imageId) ||
      imageId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error: 'invalid watcher image id',
        },
        400
      )
    }

    const record = await c.env.DB.prepare(`
      SELECT
        wi.id AS watch_item_id,
        wi.linked_game_id,

        g.publish_status
          AS game_publish_status,

        image.id AS image_id,
        image.stored_image_url,
        image.image_hash,
        image.image_type,
        image.permission_status
          AS image_permission_status,
        image.selected_for_publish,

        policy.permission_status
          AS source_permission_status,
        policy.local_storage_allowed,

        ep.id AS preorder_id,
        ep.selected_image_id,
        ep.publish_status
          AS preorder_publish_status

      FROM watch_items wi

      INNER JOIN games g
        ON g.id = wi.linked_game_id

      INNER JOIN watch_item_images image
        ON
          image.watch_item_id = wi.id
          AND image.id = ?

      LEFT JOIN source_image_policies policy
        ON policy.source_id = wi.source_id

      INNER JOIN game_official_sources gos
        ON
          gos.game_id = g.id
          AND gos.watch_item_id = wi.id

      INNER JOIN edition_preorders ep
        ON ep.official_source_id = gos.id

      WHERE wi.id = ?

      LIMIT 1
    `)
      .bind(
        imageId,
        itemId
      )
      .first<{
        watch_item_id: number
        linked_game_id: number | null

        game_publish_status: string

        image_id: number
        stored_image_url: string | null
        image_hash: string | null
        image_type: string
        image_permission_status: string
        selected_for_publish: number

        source_permission_status:
          string | null
        local_storage_allowed:
          number | null

        preorder_id: number
        selected_image_id: number | null
        preorder_publish_status: string
      }>()

    if (!record) {
      return c.json(
        {
          ok: false,
          error:
            '誘몃━蹂닿린 ?대?吏 ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎.',
        },
        404
      )
    }

    const gameId = Number(
      record.linked_game_id || 0
    )

    if (
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      return c.json(
        {
          ok: false,
          error:
            '?곌껐??寃뚯엫 ?뺣낫媛 ?щ컮瑜댁? ?딆뒿?덈떎.',
        },
        409
      )
    }

    if (
      record.game_publish_status !== 'DRAFT'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '?꾩옱 愿由ъ옄 誘몃━蹂닿린??DRAFT 寃뚯엫?먯꽌留??ъ슜?????덉뒿?덈떎.',
        },
        409
      )
    }

    if (
      record.preorder_publish_status !==
      'DRAFT'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '?꾩옱 愿由ъ옄 誘몃━蹂닿린??DRAFT ?덉빟?먮ℓ ?뺣낫?먯꽌留??ъ슜?????덉뒿?덈떎.',
        },
        409
      )
    }

    if (
      Number(
        record.selected_for_publish
      ) !== 1 ||
      Number(
        record.selected_image_id
      ) !== imageId
    ) {
      return c.json(
        {
          ok: false,
          error:
            '?꾩옱 ?좏깮??????대?吏留?誘몃━蹂????덉뒿?덈떎.',
        },
        409
      )
    }

    if (
      record.image_permission_status !==
      'APPROVED'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '媛쒕퀎 ?대?吏 寃?섍? ?뱀씤?섏? ?딆븯?듬땲??',
        },
        409
      )
    }

    const sourcePermissionStatus =
      String(
        record.source_permission_status ||
        'PENDING'
      ).toUpperCase()

    if (
      sourcePermissionStatus !==
        'APPROVED' &&
      sourcePermissionStatus !==
        'CONDITIONAL'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '異쒖쿂???대?吏 ?ъ슜 ?뺤콉???뱀씤?섏? ?딆븯?듬땲??',
        },
        409
      )
    }

    if (
      Number(
        record.local_storage_allowed
      ) !== 1
    ) {
      return c.json(
        {
          ok: false,
          error:
            '??異쒖쿂???대?吏 濡쒖뺄 ??κ낵 誘몃━蹂닿린瑜??덉슜?섏? ?딆뒿?덈떎.',
        },
        409
      )
    }

    const expectedObjectKey =
      `watcher/games/${gameId}/` +
      `images/${imageId}/original`

    const expectedStoredImageUrl =
      `r2://GAME_IMAGES/` +
      expectedObjectKey

    if (
      record.stored_image_url !==
      expectedStoredImageUrl
    ) {
      return c.json(
        {
          ok: false,
          error:
            '鍮꾧났媛?R2 ????뺣낫媛 ?щ컮瑜댁? ?딆뒿?덈떎.',
        },
        409
      )
    }

    if (!record.image_hash) {
      return c.json(
        {
          ok: false,
          error:
            '??λ맂 ?대?吏??臾닿껐???댁떆媛 ?놁뒿?덈떎.',
        },
        409
      )
    }

    const object =
      await c.env.GAME_IMAGES.get(
        expectedObjectKey
      )

    if (!object) {
      return c.json(
        {
          ok: false,
          error:
            '鍮꾧났媛?R2?먯꽌 ?대?吏 媛앹껜瑜?李얠쓣 ???놁뒿?덈떎.',
        },
        404
      )
    }

    const metadata =
      object.customMetadata || {}

    if (
      metadata.watchItemId !==
        String(itemId) ||
      metadata.imageId !==
        String(imageId) ||
      metadata.gameId !==
        String(gameId) ||
      metadata.sha256 !==
        record.image_hash
    ) {
      return c.json(
        {
          ok: false,
          error:
            'R2 ?대?吏 硫뷀??곗씠?곗? DB ?뺣낫媛 ?쇱튂?섏? ?딆뒿?덈떎.',
        },
        409
      )
    }

    const contentType =
      object.httpMetadata
        ?.contentType ||
      'application/octet-stream'

    if (
      contentType !== 'image/jpeg' &&
      contentType !== 'image/png' &&
      contentType !== 'image/webp'
    ) {
      return c.json(
        {
          ok: false,
          error:
            '誘몃━蹂닿린瑜??덉슜?섏? ?딅뒗 ?뚯씪 ?뺤떇?낅땲??',
        },
        415
      )
    }

    const headers = new Headers()

    object.writeHttpMetadata(headers)

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
      `inline; filename="game-${gameId}-image-${imageId}"`
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

// ------------------------------------------------------------
// ?꾪겕?쒖뒪?쒖썚?ㅼ븘?쒖븘 ?섎룞 ?섏쭛 ?ㅽ뻾
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



// ------------------------------------------------------------
// Clouded Leopard Entertainment ?섎룞 ?섏쭛
// ------------------------------------------------------------

watcherAdmin.post(
  '/collect/clouded-leopard',
  async (c) => {
    try {
      const result =
        await collectCloudedLeopard(
          c.env.DB,
          10
        )

      return c.json({
        ok: true,
        result,
      })
    } catch (error) {
      console.error(
        'CLE collector failed:',
        error
      )

      return c.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'CLE collector failed',
        },
        500
      )
    }
  }
)

// ------------------------------------------------------------
// ?꾪겕 + CLE ?꾩껜 ?섏쭛
// ??異쒖쿂 ?ㅽ뙣媛 ?ㅻⅨ 異쒖쿂瑜?以묐떒?섏? ?딅뒗??
// ------------------------------------------------------------

watcherAdmin.post(
  '/collect/all',
  async (c) => {
    const sources: Array<{
      ok: boolean
      sourceKey: string
      result?: {
        found: number
        relevant: number
        created: number
        updated: number
        unchanged: number
        imagesCreated: number
      }
      error?: string
    }> = []

    const collectors = [
      {
        sourceKey: 'ARC_SYSTEM_WORKS_ASIA',
        run: () =>
          collectArcSystemWorksAsia(
            c.env.DB,
            10
          ),
      },
      {
        sourceKey: 'CLOUDED_LEOPARD',
        run: () =>
          collectCloudedLeopard(
            c.env.DB,
            10
          ),
      },
    ]

    for (const collector of collectors) {
      try {
        const result = await collector.run()

        sources.push({
          ok: true,
          sourceKey: collector.sourceKey,
          result,
        })
      } catch (error) {
        console.error(
          collector.sourceKey +
            ' collector failed:',
          error
        )

        sources.push({
          ok: false,
          sourceKey: collector.sourceKey,
          error:
            error instanceof Error
              ? error.message
              : 'collector failed',
        })
      }
    }

    const successful = sources.filter(
      (source) =>
        source.ok && source.result
    )

    const total = (
      key:
        | 'found'
        | 'relevant'
        | 'created'
        | 'updated'
        | 'unchanged'
        | 'imagesCreated'
    ) =>
      successful.reduce(
        (sum, source) =>
          sum +
          Number(
            source.result?.[key] || 0
          ),
        0
      )

    return c.json({
      ok: successful.length > 0,
      partialFailure:
        successful.length !== sources.length,
      result: {
        sourceKey: 'ALL_ENABLED',
        found: total('found'),
        relevant: total('relevant'),
        created: total('created'),
        updated: total('updated'),
        unchanged: total('unchanged'),
        imagesCreated:
          total('imagesCreated'),
      },
      sources,
    })
  }
)

export default watcherAdmin
