// ============================================================
// Clouded Leopard Entertainment 공식 보도자료 수집기
//
// - 한국어 공식 보도자료만 수집
// - 이미지 URL은 현재 수집하지 않음
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
              '1.0.0',
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
        continue
      }

      if (existing.content_hash === contentHash) {
        result.unchanged += 1
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
            parser_version = '1.0.0',
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
          collector_version = '1.0.0',
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
