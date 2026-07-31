// ============================================================
// Clouded Leopard Entertainment 공식 보도자료 수집기
//
// - 한국어 공식 보도자료만 수집
// - 공식 보도자료 이미지 URL 후보 수집
// - 이미지 다운로드/R2 저장/자동 공개 없음
// - watch_items 관리자 검수 후보로만 저장
// ============================================================

const SOURCE_KEY = 'CLOUDED_LEOPARD'

const LIST_URL =
  'https://www.cloudedleopardent.com/kr/news/product/'

const SEED_URLS = [
  'https://www.cloudedleopardent.com/kr/news/9568/',
]

const RELEVANT_PATTERN =
  /예약|패키지|한정판|초회|특전|출시|발매|한국어|PlayStation|PS5|Nintendo|Switch|게임/i

type CleListItem = {
  externalId: string
  sourceUrl: string
  title: string
}

export type CloudedLeopardCollectorResult = {
  sourceKey: string
  found: number
  relevant: number
  created: number
  updated: number
  unchanged: number
  imagesCreated: number
}

function decodeHtml(value: string): string {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    )
}

function stripHtml(value: string): string {
  return decodeHtml(
    String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(
        /<\/(?:p|div|li|section|article|h1|h2|h3)>/gi,
        '\n'
      )
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getMeta(
  html: string,
  property: string
): string | null {
  const escaped = property.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  )

  const first = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
    'i'
  )

  const second = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
    'i'
  )

  const match = html.match(first) || html.match(second)

  return match
    ? decodeHtml(match[1]).trim()
    : null
}

function parsePublishedAt(
  html: string
): string | null {
  const meta =
    getMeta(html, 'article:published_time') ||
    getMeta(html, 'datePublished')

  const iso = meta?.match(
    /(20\d{2})-(\d{2})-(\d{2})/
  )

  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`
  }

  const textMatch = stripHtml(html).match(
    /\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/
  )

  if (!textMatch) return null

  return [
    textMatch[1],
    textMatch[2].padStart(2, '0'),
    textMatch[3].padStart(2, '0'),
  ].join('-')
}

function parseTitle(
  html: string,
  fallback: string
): string {
  const meta =
    getMeta(html, 'og:title') ||
    getMeta(html, 'twitter:title')

  if (meta) {
    return meta
      .replace(
        /\s*[|｜]\s*Clouded Leopard Entertainment.*$/i,
        ''
      )
      .trim()
  }

  const heading = html.match(
    /<h1[^>]*>([\s\S]*?)<\/h1>/i
  )

  if (heading) {
    return stripHtml(heading[1])
  }

  return fallback || 'Clouded Leopard Entertainment 보도자료'
}

function normalizeArticleUrl(
  value: string
): string | null {
  try {
    const url = new URL(
      decodeHtml(value),
      'https://www.cloudedleopardent.com'
    )

    if (
      url.hostname !== 'www.cloudedleopardent.com' &&
      url.hostname !== 'cloudedleopardent.com'
    ) {
      return null
    }

    const match = url.pathname.match(
      /^\/kr\/news\/(\d+)\/?$/
    )

    if (!match) return null

    return `https://www.cloudedleopardent.com/kr/news/${match[1]}/`
  } catch {
    return null
  }
}

function parseList(html: string): CleListItem[] {
  const results: CleListItem[] = []
  const seen = new Set<string>()

  const linkPattern =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi

  let match: RegExpExecArray | null

  while ((match = linkPattern.exec(html))) {
    const sourceUrl = normalizeArticleUrl(match[1])

    if (!sourceUrl) continue

    const id = sourceUrl.match(
      /\/news\/(\d+)\//
    )?.[1]

    if (!id || seen.has(id)) continue
    seen.add(id)

    results.push({
      externalId: id,
      sourceUrl,
      title: stripHtml(match[2]),
    })
  }

  for (const sourceUrl of SEED_URLS) {
    const id = sourceUrl.match(
      /\/news\/(\d+)\//
    )?.[1]

    if (!id || seen.has(id)) continue
    seen.add(id)

    results.unshift({
      externalId: id,
      sourceUrl,
      title: '',
    })
  }

  return results
}

﻿function normalizeCleImageUrl(
  value: string,
  articleUrl: string
): string | null {
  const decoded = decodeHtml(value)
    .replace(/\\\//g, '/')
    .trim()

  if (
    !decoded ||
    /^(?:data|blob|javascript):/i.test(decoded)
  ) {
    return null
  }

  try {
    const url = new URL(decoded, articleUrl)
    const host = url.hostname.toLowerCase()

    if (
      host !== 'cloudedleopardent.com' &&
      host !== 'www.cloudedleopardent.com' &&
      !host.endsWith('.cloudedleopardent.com')
    ) {
      return null
    }

    url.protocol = 'https:'
    url.hash = ''

    const pathname = url.pathname.toLowerCase()

    if (
      !/\.(?:jpg|jpeg|png|webp|gif|avif)$/.test(
        pathname
      )
    ) {
      return null
    }

    if (
      /(?:favicon|logo|icon|emoji|avatar|spacer|blank|loading|tracking|pixel)/i
        .test(pathname)
    ) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

function cleImageAttribute(
  tag: string,
  attributeName: string
): string | null {
  const pattern =
    /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

  let match: RegExpExecArray | null

  while ((match = pattern.exec(tag))) {
    if (
      String(match[1] || '').toLowerCase() !==
      attributeName.toLowerCase()
    ) {
      continue
    }

    const value =
      match[2] || match[3] || match[4] || ''

    return decodeHtml(value).trim() || null
  }

  return null
}

function classifyCleImage(context: string): string {
  const text = stripHtml(context)

  if (
    /예약\s*(?:구매|판매)?\s*특전|사전\s*예약\s*특전/i
      .test(text)
  ) {
    return 'PREORDER_BONUS'
  }

  if (
    /초회\s*(?:구입|구매|한정)?\s*특전/i
      .test(text)
  ) {
    return 'FIRST_PRINT_BONUS'
  }

  if (
    /우로보로스\s*BOX|한정판|세트\s*내용|구성품/i
      .test(text)
  ) {
    return 'LIMITED_EDITION'
  }

  if (
    /패키지\s*(?:이미지|버전|판|제품)?/i
      .test(text)
  ) {
    return 'PACKAGE'
  }

  if (
    /키\s*비주얼|메인\s*비주얼/i
      .test(text)
  ) {
    return 'KEY_VISUAL'
  }

  if (
    /스크린\s*샷|스크린샷|게임\s*화면/i
      .test(text)
  ) {
    return 'SCREENSHOT'
  }

  if (/배너|banner/i.test(text)) {
    return 'BANNER'
  }

  return 'UNKNOWN'
}

function extractCleImages(
  articleHtml: string,
  articleUrl: string
): Array<{
  url: string
  altText: string | null
  imageType: string
}> {
  const results: Array<{
    url: string
    altText: string | null
    imageType: string
  }> = []

  const seen = new Set<string>()

  const add = (
    rawUrl: string | null,
    altText: string | null,
    imageType: string
  ) => {
    if (!rawUrl || results.length >= 60) return

    const url = normalizeCleImageUrl(
      rawUrl,
      articleUrl
    )

    if (!url || seen.has(url)) return

    seen.add(url)

    results.push({
      url,
      altText:
        altText && altText.trim()
          ? altText.trim().slice(0, 1000)
          : null,
      imageType,
    })
  }

  const tagPattern = /<(?:img|source)\b[^>]*>/gi
  let match: RegExpExecArray | null

  while ((match = tagPattern.exec(articleHtml))) {
    const tag = match[0]

    const altText =
      cleImageAttribute(tag, 'alt') ||
      cleImageAttribute(tag, 'title')

    const contextStart = Math.max(
      0,
      match.index - 1000
    )

    const contextEnd = Math.min(
      articleHtml.length,
      match.index + tag.length + 1000
    )

    const imageType = classifyCleImage(
      articleHtml.slice(
        contextStart,
        contextEnd
      )
    )

    const srcset =
      cleImageAttribute(tag, 'srcset') ||
      cleImageAttribute(tag, 'data-srcset')

    if (srcset) {
      const srcsetCandidates = srcset
        .split(',')
        .map((entry) =>
          entry.trim().split(/\s+/)[0]
        )
        .filter(Boolean)

      for (
        let index = srcsetCandidates.length - 1;
        index >= 0;
        index -= 1
      ) {
        const before = results.length

        add(
          srcsetCandidates[index],
          altText,
          imageType
        )

        if (results.length > before) break
      }
    }

    const urlCandidates = [
      cleImageAttribute(tag, 'data-original'),
      cleImageAttribute(tag, 'data-lazy-src'),
      cleImageAttribute(tag, 'data-src'),
      cleImageAttribute(tag, 'src'),
    ]

    for (const candidate of urlCandidates) {
      const before = results.length

      add(candidate, altText, imageType)

      if (results.length > before) break
    }

    if (results.length >= 60) break
  }

  add(
    getMeta(articleHtml, 'og:image') ||
      getMeta(articleHtml, 'twitter:image'),
    '공식 보도자료 대표 이미지',
    'KEY_VISUAL'
  )

  return results
}

async function storeCleImages(
  db: D1Database,
  sourceId: number,
  externalId: string,
  articleUrl: string,
  title: string,
  articleHtml: string
): Promise<number> {
  const item = await db
    .prepare(`
      SELECT id
      FROM watch_items
      WHERE source_id = ?
        AND external_id = ?
      LIMIT 1
    `)
    .bind(sourceId, externalId)
    .first<{ id: number }>()

  if (!item?.id) return 0

  const images = extractCleImages(
    articleHtml,
    articleUrl
  )

  let created = 0

  for (
    let index = 0;
    index < images.length;
    index += 1
  ) {
    const image = images[index]

    const insertResult = await db
      .prepare(`
        INSERT OR IGNORE INTO watch_item_images (
          watch_item_id,
          source_image_url,
          image_type,
          alt_text,
          permission_status,
          selected_for_publish,
          display_order,
          source_credit,
          source_article_url
        )
        VALUES (
          ?, ?, ?, ?,
          'PENDING',
          0,
          ?,
          '이미지 및 정보 출처: Clouded Leopard Entertainment',
          ?
        )
      `)
      .bind(
        item.id,
        image.url,
        image.imageType,
        image.altText,
        index,
        articleUrl
      )
      .run()

    if (
      Number(insertResult.meta.changes || 0) > 0
    ) {
      created += 1

      await db
        .prepare(`
          INSERT INTO watch_events (
            watch_item_id,
            source_id,
            event_type,
            title,
            message
          )
          VALUES (?, ?, 'IMAGE_NEW', ?, ?)
        `)
        .bind(
          item.id,
          sourceId,
          title,
          '공식 이미지 후보를 발견했습니다: ' +
            image.imageType
        )
        .run()
    }
  }

  return created
}


async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language':
        'ko-KR,ko;q=0.9,en;q=0.6',
      'User-Agent':
        'YeonuDeal/1.0 (+https://yeonudeal.com/)',
    },
  })

  if (!response.ok) {
    throw new Error(
      `CLE request failed: ${response.status} ${url}`
    )
  }

  return response.text()
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes
  )

  return Array.from(new Uint8Array(digest))
    .map((value) =>
      value.toString(16).padStart(2, '0')
    )
    .join('')
}

export type CloudedLeopardImageBackfillResult = {
  sourceKey: string
  watchItemId: number
  linkedGameId: number | null
  found: number
  created: number
}

export async function backfillCloudedLeopardItemImages(
  db: D1Database,
  watchItemIdValue: number
): Promise<CloudedLeopardImageBackfillResult> {
  const watchItemId = Number(watchItemIdValue)

  if (
    !Number.isInteger(watchItemId) ||
    watchItemId <= 0
  ) {
    throw new Error('invalid watcher item id')
  }

  const item = await db
    .prepare(`
      SELECT
        wi.id,
        wi.source_id,
        wi.external_id,
        wi.source_url,
        wi.title,
        wi.linked_game_id,
        ws.source_key
      FROM watch_items wi
      INNER JOIN watch_sources ws
        ON ws.id = wi.source_id
      WHERE wi.id = ?
      LIMIT 1
    `)
    .bind(watchItemId)
    .first<{
      id: number
      source_id: number
      external_id: string
      source_url: string
      title: string
      linked_game_id: number | null
      source_key: string
    }>()

  if (!item) {
    throw new Error('watcher item not found')
  }

  if (item.source_key !== SOURCE_KEY) {
    throw new Error(
      'target watcher item is not a Clouded Leopard item'
    )
  }

  const articleUrl = String(
    item.source_url || ''
  ).trim()

  if (!articleUrl) {
    throw new Error(
      'Clouded Leopard source URL is missing'
    )
  }

  const articleHtml = await fetchHtml(articleUrl)

  const found = extractCleImages(
    articleHtml,
    articleUrl
  ).length

  const created = await storeCleImages(
    db,
    item.source_id,
    item.external_id,
    articleUrl,
    item.title,
    articleHtml
  )

  return {
    sourceKey: SOURCE_KEY,
    watchItemId: item.id,
    linkedGameId: item.linked_game_id,
    found,
    created,
  }
}

export async function collectCloudedLeopard(
  db: D1Database,
  requestedLimit = 10
): Promise<CloudedLeopardCollectorResult> {
  const limit = Math.min(
    20,
    Math.max(1, Number(requestedLimit) || 10)
  )

  const source = await db
    .prepare(`
      SELECT id, enabled
      FROM watch_sources
      WHERE source_key = ?
      LIMIT 1
    `)
    .bind(SOURCE_KEY)
    .first<{
      id: number
      enabled: number
    }>()

  if (!source) {
    throw new Error(
      'CLE watcher source is not registered'
    )
  }

  if (Number(source.enabled) !== 1) {
    throw new Error(
      'CLE watcher source is disabled'
    )
  }

  const result: CloudedLeopardCollectorResult = {
    sourceKey: SOURCE_KEY,
    found: 0,
    relevant: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    imagesCreated: 0,
  }

  try {
    await db
      .prepare(`
        UPDATE watch_sources
        SET
          last_checked_at = CURRENT_TIMESTAMP,
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(source.id)
      .run()

    const listHtml = await fetchHtml(LIST_URL)
    const listItems = parseList(listHtml)

    result.found = listItems.length

    for (const item of listItems.slice(0, limit)) {
      const html = await fetchHtml(item.sourceUrl)
      const title = parseTitle(html, item.title)
      const rawText = stripHtml(html).slice(
        0,
        200000
      )

      if (
        !RELEVANT_PATTERN.test(
          `${title}\n${rawText}`
        )
      ) {
        continue
      }

      result.relevant += 1

      const publishedAt = parsePublishedAt(html)
      const contentHash = await sha256(
        [
          title,
          publishedAt || '',
          rawText,
        ].join('\n')
      )

      const existing = await db
        .prepare(`
          SELECT id, content_hash
          FROM watch_items
          WHERE source_id = ?
            AND external_id = ?
          LIMIT 1
        `)
        .bind(
          source.id,
          item.externalId
        )
        .first<{
          id: number
          content_hash: string | null
        }>()

      if (!existing) {
        await db
          .prepare(`
            INSERT INTO watch_items (
              source_id,
              external_id,
              source_url,
              title,
              raw_title,
              published_at,
              content_hash,
              raw_text,
              raw_html,
              parser_name,
              parser_version,
              event_type,
              review_status
            )
            VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?,
              'CloudedLeopardCollector',
              '1.1.0',
              'SOURCE_NEW',
              'DISCOVERED'
            )
          `)
          .bind(
            source.id,
            item.externalId,
            item.sourceUrl,
            title,
            title,
            publishedAt,
            contentHash,
            rawText,
            html.slice(0, 200000)
          )
          .run()

        result.created += 1

        result.imagesCreated +=
          await storeCleImages(
            db,
            source.id,
            item.externalId,
            item.sourceUrl,
            title,
            html
          )

        continue
      }

      if (existing.content_hash === contentHash) {
        result.unchanged += 1

        result.imagesCreated +=
          await storeCleImages(
            db,
            source.id,
            item.externalId,
            item.sourceUrl,
            title,
            html
          )

        continue
      }

      await db
        .prepare(`
          UPDATE watch_items
          SET
            source_url = ?,
            title = ?,
            raw_title = ?,
            published_at = ?,
            content_hash = ?,
            raw_text = ?,
            raw_html = ?,
            parser_name =
              'CloudedLeopardCollector',
            parser_version = '1.1.0',
            event_type = 'SOURCE_UPDATED',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .bind(
          item.sourceUrl,
          title,
          title,
          publishedAt,
          contentHash,
          rawText,
          html.slice(0, 200000),
          existing.id
        )
        .run()

      await db
        .prepare(`
          INSERT INTO watch_events (
            watch_item_id,
            source_id,
            event_type,
            title,
            message
          )
          SELECT
            ?, ?,
            'SOURCE_CHANGED',
            ?,
            'Clouded Leopard Entertainment 보도자료 내용이 변경되었습니다.'
          WHERE NOT EXISTS (
            SELECT 1
            FROM watch_events
            WHERE watch_item_id = ?
              AND source_id = ?
              AND event_type = 'SOURCE_CHANGED'
          )
        `)
        .bind(
          existing.id,
          source.id,
          title,
          existing.id,
          source.id
        )
        .run()

      result.imagesCreated +=
        await storeCleImages(
          db,
          source.id,
          item.externalId,
          item.sourceUrl,
          title,
          html
        )

      result.updated += 1
    }

    // 기존에 수집됐지만 이벤트가 생성되지 않은 CLE 항목과
    // 이번 실행에서 새로 발견한 항목을 작업 큐에 보충한다.
    await db
      .prepare(`
        INSERT INTO watch_events (
          watch_item_id,
          source_id,
          event_type,
          title,
          message
        )
        SELECT
          wi.id,
          wi.source_id,
          'SOURCE_NEW',
          wi.title,
          'Clouded Leopard Entertainment에서 새로운 보도자료를 발견했습니다.'
        FROM watch_items wi
        WHERE wi.source_id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM watch_events we
            WHERE we.watch_item_id = wi.id
              AND we.source_id = wi.source_id
              AND we.event_type IN (
                'SOURCE_NEW',
                'SOURCE_CHANGED'
              )
          )
      `)
      .bind(source.id)
      .run()

    await db
      .prepare(`
        UPDATE watch_sources
        SET
          last_success_at = CURRENT_TIMESTAMP,
          last_error = NULL,
          collector_name =
            'CloudedLeopardCollector',
          collector_version = '1.1.0',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(source.id)
      .run()

    return result
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 1000)
        : 'Unknown CLE collector error'

    await db
      .prepare(`
        UPDATE watch_sources
        SET
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(message, source.id)
      .run()

    throw error
  }
}
