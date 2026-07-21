// ============================================================
// 아크시스템웍스아시아 공식 보도자료 수집기
// src/watchers/arc-system-works-asia.ts
//
// - 예약판매 관련 보도자료 메타데이터 저장
// - 공식 이미지 URL은 후보로만 기록
// - 이미지 다운로드·R2 저장·공개 없음
// ============================================================

const SOURCE_KEY = 'ARC_SYSTEM_WORKS_ASIA'
const LIST_URL =
  'https://www.arcsystemworks.asia/bbs/board.php?bo_table=notice&page=1'

const RELEVANT_TITLE_PATTERN =
  /예약|패키지|한정판|초회|특전|출시|발매/i

type ArcListItem = {
  externalId: string
  sourceUrl: string
  title: string
  category: string
  publishedAt: string | null
}

export type ArcCollectorResult = {
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
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
}

function stripHtml(value: string): string {
  return decodeHtml(
    String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractArticleBody(html: string): string {
  const startMatch = html.match(
    /<div[^>]+id=["']bo_v_con["'][^>]*>/i
  )

  if (!startMatch || startMatch.index == null) {
    return ''
  }

  const start = startMatch.index + startMatch[0].length

  const endMarkers = [
    '<!-- } 본문 내용 끝',
    '<!-- 본문 내용 끝',
    '<div id="bo_v_share"',
    '<section id="bo_v_link"',
  ]

  let end = html.length

  for (const marker of endMarkers) {
    const markerIndex = html.indexOf(marker, start)

    if (markerIndex >= 0 && markerIndex < end) {
      end = markerIndex
    }
  }

  return html.slice(start, end)
}

function parsePublishedDate(block: string): string | null {
  const match = block.match(
    /<p[^>]+class=["'][^"']*date[^"']*["'][^>]*>\s*<span>(\d{1,2})<\/span>\s*(\d{4})\.(\d{1,2})/i
  )

  if (!match) return null

  const day = match[1].padStart(2, '0')
  const year = match[2]
  const month = match[3].padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseList(html: string): ArcListItem[] {
  const results: ArcListItem[] = []
  const seen = new Set<string>()

  const itemPattern =
    /<li[^>]+class=["'][^"']*clearfix[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi

  let match: RegExpExecArray | null

  while ((match = itemPattern.exec(html))) {
    const block = match[1]

    const linkMatch = block.match(
      /href=["']([^"']*bo_table=notice(?:&amp;|&)wr_id=(\d+)[^"']*)["']/i
    )

    const titleMatch = block.match(
      /<p[^>]+class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/p>/i
    )

    const categoryMatch = block.match(
      /<span[^>]+class=["'][^"']*cate[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
    )

    if (!linkMatch || !titleMatch) continue

    const externalId = linkMatch[2]

    if (seen.has(externalId)) continue
    seen.add(externalId)

    results.push({
      externalId,
      sourceUrl:
        'https://www.arcsystemworks.asia/bbs/board.php' +
        `?bo_table=notice&wr_id=${externalId}`,
      title: stripHtml(titleMatch[1]),
      category: categoryMatch
        ? stripHtml(categoryMatch[1]).replace(/^#/, '')
        : '',
      publishedAt: parsePublishedDate(block),
    })
  }

  return results
}

function normalizeImageUrl(value: string): string | null {
  try {
    const decoded = decodeHtml(value)
    const url = new URL(
      decoded,
      'https://www.arcsystemworks.asia'
    )

    if (
      url.hostname !== 'www.arcsystemworks.asia' &&
      url.hostname !== 'arcsystemworks.asia'
    ) {
      return null
    }

    if (!url.pathname.includes('/data/editor/')) {
      return null
    }

    url.hostname = 'www.arcsystemworks.asia'
    url.protocol = 'https:'
    url.search = ''
    url.hash = ''

    url.pathname = url.pathname.replace(
      /\/thumb-(.+)_\d+x\d+(\.(?:jpg|jpeg|png|webp|gif))$/i,
      '/$1$2'
    )

    return url.toString()
  } catch {
    return null
  }
}

function classifyImage(context: string): string {
  const text = stripHtml(context)

  if (/예약\s*(구매)?\s*특전|예약\s*특전/i.test(text)) {
    return 'PREORDER_BONUS'
  }

  if (/초회\s*(한정)?\s*특전/i.test(text)) {
    return 'FIRST_PRINT_BONUS'
  }

  if (/한정판\s*구성|한정판/i.test(text)) {
    return 'LIMITED_EDITION'
  }

  if (/패키지\s*(이미지|판)/i.test(text)) {
    return 'PACKAGE'
  }

  if (/스크린샷|게임\s*화면/i.test(text)) {
    return 'SCREENSHOT'
  }

  if (/키\s*비주얼|메인\s*비주얼/i.test(text)) {
    return 'KEY_VISUAL'
  }

  return 'UNKNOWN'
}

function extractImages(articleHtml: string): Array<{
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
  const imagePattern = /<img\b[^>]*>/gi

  let match: RegExpExecArray | null

  while ((match = imagePattern.exec(articleHtml))) {
    const tag = match[0]
    const srcMatch = tag.match(
      /\bsrc=["']([^"']+)["']/i
    )

    if (!srcMatch) continue

    const url = normalizeImageUrl(srcMatch[1])

    if (!url || seen.has(url)) continue
    seen.add(url)

    const altMatch = tag.match(
      /\balt=["']([^"']*)["']/i
    )

    const contextStart = Math.max(0, match.index - 500)
    const contextEnd = Math.min(
      articleHtml.length,
      match.index + tag.length + 500
    )

    results.push({
      url,
      altText: altMatch
        ? decodeHtml(altMatch[1]).trim() || null
        : null,
      imageType: classifyImage(
        articleHtml.slice(contextStart, contextEnd)
      ),
    })

    if (results.length >= 40) break
  }

  return results
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)

  const digest = await crypto.subtle.digest(
    'SHA-256',
    data
  )

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent':
        'YeonuDeal-Watcher/1.0 (+https://yeonudeal.com)',
    },
  })

  if (!response.ok) {
    throw new Error(
      `ARC request failed: ${response.status} ${url}`
    )
  }

  return response.text()
}

export async function collectArcSystemWorksAsia(
  db: D1Database,
  requestedLimit = 10
): Promise<ArcCollectorResult> {
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
    throw new Error('ARC watcher source is not registered')
  }

  if (Number(source.enabled) !== 1) {
    throw new Error('ARC watcher source is disabled')
  }

  const result: ArcCollectorResult = {
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

    const relevantItems = listItems
      .filter((item) => item.category === '보도자료')
      .filter((item) =>
        RELEVANT_TITLE_PATTERN.test(item.title)
      )
      .slice(0, limit)

    result.relevant = relevantItems.length

    for (const listItem of relevantItems) {
      const detailHtml = await fetchHtml(
        listItem.sourceUrl
      )

      const articleHtml = extractArticleBody(detailHtml)
      const rawText = stripHtml(articleHtml).slice(0, 60000)
      const contentHash = await sha256(
        `${listItem.title}\n${rawText}`
      )

      const existing = await db
        .prepare(`
          SELECT id, content_hash
          FROM watch_items
          WHERE source_id = ?
            AND external_id = ?
          LIMIT 1
        `)
        .bind(source.id, listItem.externalId)
        .first<{
          id: number
          content_hash: string | null
        }>()

      let itemId: number
      let eventType: 'SOURCE_NEW' | 'SOURCE_CHANGED' | null

      if (!existing) {
        const inserted = await db
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
              'ArcSystemWorksAsiaCollector',
              '1.0.0',
              'SOURCE_NEW',
              'DISCOVERED'
            )
            RETURNING id
          `)
          .bind(
            source.id,
            listItem.externalId,
            listItem.sourceUrl,
            listItem.title,
            listItem.title,
            listItem.publishedAt,
            contentHash,
            rawText,
            articleHtml.slice(0, 200000)
          )
          .first<{ id: number }>()

        if (!inserted) {
          throw new Error(
            `ARC item insert failed: ${listItem.externalId}`
          )
        }

        itemId = inserted.id
        eventType = 'SOURCE_NEW'
        result.created += 1
      } else {
        itemId = existing.id

        if (existing.content_hash === contentHash) {
          await db
            .prepare(`
              UPDATE watch_items
              SET
                last_seen_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `)
            .bind(itemId)
            .run()

          eventType = null
          result.unchanged += 1
        } else {
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
                event_type = 'SOURCE_CHANGED',
                last_seen_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `)
            .bind(
              listItem.sourceUrl,
              listItem.title,
              listItem.title,
              listItem.publishedAt,
              contentHash,
              rawText,
              articleHtml.slice(0, 200000),
              itemId
            )
            .run()

          eventType = 'SOURCE_CHANGED'
          result.updated += 1
        }
      }

      if (eventType) {
        await db
          .prepare(`
            INSERT INTO watch_events (
              watch_item_id,
              source_id,
              event_type,
              title,
              message
            )
            VALUES (?, ?, ?, ?, ?)
          `)
          .bind(
            itemId,
            source.id,
            eventType,
            listItem.title,
            eventType === 'SOURCE_NEW'
              ? '아크시스템웍스아시아에서 새로운 보도자료를 발견했습니다.'
              : '아크시스템웍스아시아 보도자료 내용이 변경되었습니다.'
          )
          .run()
      }

      const images = extractImages(articleHtml)

      for (let index = 0; index < images.length; index += 1) {
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
              '이미지 및 정보 출처: 아크시스템웍스아시아 (공식 보도자료 링크)',
              ?
            )
          `)
          .bind(
            itemId,
            image.url,
            image.imageType,
            image.altText,
            index,
            listItem.sourceUrl
          )
          .run()

        if (Number(insertResult.meta.changes || 0) > 0) {
          result.imagesCreated += 1

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
              itemId,
              source.id,
              listItem.title,
              `공식 이미지 후보를 발견했습니다: ${image.imageType}`
            )
            .run()
        }
      }
    }

    await db
      .prepare(`
        UPDATE watch_sources
        SET
          last_success_at = CURRENT_TIMESTAMP,
          last_error = NULL,
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
        : 'Unknown ARC collector error'

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
