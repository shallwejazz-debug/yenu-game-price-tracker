import type { Bindings } from '../types'

type HomePreorderRow = {
  game_id: number
  game_title: string
  platform: string
  variant_id: number
  variant_name: string
  variant_kind: string
  package_type: string
  preorder_id: number
  preorder_status: string
  release_date: string
  preorder_start: string | null
  preorder_end: string | null
  price_status: string
  confirmed_price: number | null
  candidate_price: number | null
  preorder_bonus: string | null
  source_title: string
  official_source_url: string
  trailer_url: string | null
  representative_image_id: number | null
}

type HomePreorderEdition = {
  id: number
  variantName: string
  variantKind: string
  packageType: string
  preorderStatus: string
  releaseDate: string
  preorderStart: string | null
  preorderEnd: string | null
  priceStatus: string
  confirmedPrice: number | null
  candidatePrice: number | null
  preorderBonus: string | null
}

export type HomePreorderNews = {
  gameId: number
  title: string
  platform: string
  sourceTitle: string
  officialSourceUrl: string
  trailerUrl: string | null
  representativeImageId: number | null
  editions: HomePreorderEdition[]
}

function won(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

function getPriceLabel(
  edition: HomePreorderEdition
): string {
  if (
    edition.priceStatus === 'CONFIRMED' &&
    edition.confirmedPrice !== null
  ) {
    return won(edition.confirmedPrice)
  }

  if (
    edition.priceStatus === 'CANDIDATE' &&
    edition.candidatePrice !== null
  ) {
    return `${won(edition.candidatePrice)} (확정 전)`
  }

  return '가격 미정'
}

function getPeriodLabel(
  edition: HomePreorderEdition
): string {
  if (
    edition.preorderStart &&
    edition.preorderEnd
  ) {
    return `${edition.preorderStart} ~ ${edition.preorderEnd}`
  }

  if (edition.preorderStart) {
    return `${edition.preorderStart}부터`
  }

  if (edition.preorderEnd) {
    return `${edition.preorderEnd}까지`
  }

  return '공식 출처에서 확인'
}

function getStatusLabel(status: string): string {
  if (status === 'OPEN') {
    return '예약판매 진행 중'
  }

  if (status === 'UPCOMING') {
    return '예약판매 예정'
  }

  if (status === 'CLOSED') {
    return '예약판매 종료'
  }

  return '예약판매 소식'
}

export async function getHomePreorderNews(
  db: Bindings['DB']
): Promise<HomePreorderNews[]> {
  const result = await db
    .prepare(`
      SELECT
        g.id AS game_id,
        g.title AS game_title,
        e.platform,
        pv.id AS variant_id,
        pv.variant_name,
        pv.variant_kind,
        pv.package_type,
        vp.id AS preorder_id,
        vp.preorder_status AS preorder_status,
        vp.release_date,
        vp.preorder_start_date AS preorder_start,
        vp.preorder_end_date AS preorder_end,
        vp.price_status,
        vp.confirmed_price,
        vp.candidate_price,
        vp.preorder_bonus,
        gos.source_title,
        gos.official_source_url,
        gos.trailer_url,

        (
          SELECT wii.id
          FROM variant_preorder_images vpi
          INNER JOIN watch_item_images wii
            ON wii.id = vpi.image_id
          WHERE vpi.preorder_id = vp.id
            AND vpi.display_role = 'REPRESENTATIVE'
            AND wii.permission_status = 'APPROVED'
            AND wii.stored_image_url IS NOT NULL
            AND TRIM(wii.stored_image_url) <> ''
            AND wii.image_hash IS NOT NULL
            AND LENGTH(TRIM(wii.image_hash)) = 64
          ORDER BY
            vpi.display_order ASC,
            wii.id ASC
          LIMIT 1
        ) AS representative_image_id

      FROM variant_preorders vp

      INNER JOIN product_variants pv
        ON pv.id = vp.variant_id

      INNER JOIN editions e
        ON e.id = pv.edition_id

      INNER JOIN games g
        ON g.id = e.game_id

      INNER JOIN game_official_sources gos
        ON gos.id = vp.official_source_id

      INNER JOIN source_image_policies sip
        ON sip.source_id = gos.source_id

      WHERE g.publish_status = 'PUBLISHED'
        AND pv.publish_status = 'ACTIVE'
        AND vp.publish_status = 'PUBLISHED'
        AND gos.permission_status_snapshot
          IN ('APPROVED', 'CONDITIONAL')
        AND sip.permission_status
          IN ('APPROVED', 'CONDITIONAL')
        AND sip.local_storage_allowed = 1
        AND gos.official_source_url IS NOT NULL
        AND TRIM(gos.official_source_url) <> ''

      ORDER BY
        vp.published_at DESC,
        g.id DESC,
        pv.display_order ASC,
        vp.display_order ASC
    `)
    .all<HomePreorderRow>()

  const grouped = new Map<
    number,
    HomePreorderNews
  >()

  for (const row of result.results) {
    let news = grouped.get(row.game_id)

    if (!news) {
      news = {
        gameId: row.game_id,
        title: row.game_title,
        platform: row.platform,
        sourceTitle: row.source_title,
        officialSourceUrl:
          row.official_source_url,
        trailerUrl: row.trailer_url,
        representativeImageId:
          row.representative_image_id,
        editions: [],
      }

      grouped.set(row.game_id, news)
    }

    if (
      news.representativeImageId === null &&
      row.representative_image_id !== null
    ) {
      news.representativeImageId =
        row.representative_image_id
    }

    news.editions.push({
      id: row.preorder_id,
      variantName: row.variant_name,
      variantKind: row.variant_kind,
      packageType: row.package_type,
      preorderStatus: row.preorder_status,
      releaseDate: row.release_date,
      preorderStart: row.preorder_start,
      preorderEnd: row.preorder_end,
      priceStatus: row.price_status,
      confirmedPrice: row.confirmed_price,
      candidatePrice: row.candidate_price,
      preorderBonus: row.preorder_bonus,
    })
  }

  return [...grouped.values()].slice(0, 4)
}

export function HomePreorderNewsSection({
  news,
}: {
  news: HomePreorderNews[]
}) {
  if (news.length === 0) {
    return null
  }

  return (
    <section class="home-section home-preorder-section">
      <div class="home-section-heading">
        <div>
          <p class="home-preorder-eyebrow">
            PRE-ORDER NEWS
          </p>

          <h2>예약판매 소식</h2>

          <p>
            공식 발표를 기준으로 예약판매 일정과
            특전을 정리했습니다.
          </p>
        </div>
      </div>

      <div class="home-preorder-news-list">
        {news.map((item, index) => {
          const primary = item.editions[0]

          return (
            <article
              class={`home-preorder-news ${index === 0 ? 'home-preorder-news--featured' : 'home-preorder-news--compact'}`}
              key={item.gameId}
            >
              <a
                class="home-preorder-news-image"
                href={`/games/${item.gameId}/${item.platform}`}
                aria-label={`${item.title} 예약판매 자세히 보기`}
              >
                {item.representativeImageId !==
                null ? (
                  <img
                    src={`/games/preorder-images/${item.representativeImageId}`}
                    alt={`${item.title} 예약판매 대표 이미지`}
                    loading="lazy"
                  />
                ) : (
                  <span aria-hidden="true">🎮</span>
                )}
              </a>

              <div class="home-preorder-news-body">
                <div class="home-preorder-news-status">
                  {getStatusLabel(
                    primary.preorderStatus
                  )}
                </div>

                <h3>
                  <a
                    href={`/games/${item.gameId}/${item.platform}`}
                  >
                    {item.title} 예약판매 소식
                  </a>
                </h3>

                <div
                  class="home-preorder-editions"
                  aria-label="예약판매 에디션"
                >
                  {item.editions.map((edition) => (
                    <span key={edition.id}>
                      {edition.variantName}
                    </span>
                  ))}
                </div>

                <dl class="home-preorder-summary">
                  <div>
                    <dt>예약 기간</dt>
                    <dd>
                      {getPeriodLabel(primary)}
                    </dd>
                  </div>

                  <div>
                    <dt>출시일</dt>
                    <dd>{primary.releaseDate}</dd>
                  </div>

                  <div>
                    <dt>가격</dt>
                    <dd>
                      {getPriceLabel(primary)}
                    </dd>
                  </div>
                </dl>

                {primary.preorderBonus && (
                  <p class="home-preorder-bonus">
                    <strong>예약 특전</strong>
                    <span>
                      {primary.preorderBonus}
                    </span>
                  </p>
                )}

                {item.editions.length > 1 && (
                  <p class="home-preorder-edition-note">
                    총 {item.editions.length}개 에디션의
                    상세 정보가 등록되어 있습니다.
                  </p>
                )}

                <div class="home-preorder-actions">
                  <a
                    class="home-preorder-detail-link"
                    href={`/games/${item.gameId}/${item.platform}`}
                  >
                    자세히 보기
                  </a>

                  {item.trailerUrl && (
                    <a
                      class="home-preorder-trailer-link"
                      href={item.trailerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      트레일러 보기 ▶
                    </a>
                  )}

                  <a
                    class="home-preorder-source-link"
                    href={item.officialSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    공식 정보 ↗
                  </a>
                </div>

                <p class="home-preorder-source">
                  출처: {item.sourceTitle}
                </p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}