// ============================================================
// 愿由ъ옄 肄섏넄 HTML ?섏씠吏
// src/routes/admin-page.tsx
//
// ??援ъ꽦
//   1. ?꾪솴
//   2. ?꾨낫 ?좊퀎
//   3. 寃뚯엫 媛?몄삤湲?//   4. 寃뚯엫 愿由?//   5. ?ㅼ젙 / 諛깆뾽
//
// 二쇱쓽
//   - ?꾨낫 ?됯?留뚯쑝濡?寃뚯엫??諛붾줈 ??ν븯吏 ?딆쓬
//   - ?좏깮 ?꾨낫??寃뚯엫 媛?몄삤湲???쑝濡쒕쭔 ?꾨떖
//   - ?ㅼ젣 ?????湲곗〈 誘몃━蹂닿린 ?④퀎瑜?嫄곗묠
// ============================================================

export function AdminPage(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>愿由ъ옄 肄섏넄 쨌 ?щ늻??/title>

  <link
    rel="icon"
    href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>?숋툘</text></svg>"
  />

  <link href="/static/style.css" rel="stylesheet" />
  <link
    href="/static/admin.css?v=20260722-preorder-v2-1"
    rel="stylesheet"
  />
</head>

<body>
  <!-- ======================================================
       愿由ъ옄 ?좉툑 ?붾㈃
       ====================================================== -->
  <div id="lockScreen" class="lock-screen">
    <div class="lock-box">
      <div class="lock-icon">?뵏</div>

      <h1>愿由ъ옄 ?몄쬆</h1>

      <p class="lock-hint">
        愿由ъ옄 鍮꾨?踰덊샇瑜??낅젰?섏꽭??
      </p>

      <form id="lockForm" autocomplete="off">
        <input
          type="password"
          id="lockPassword"
          class="lock-input"
          placeholder="鍮꾨?踰덊샇"
          autocomplete="current-password"
        />

        <button
          type="submit"
          class="btn btn-primary lock-btn"
        >
          ?좉툑 ?댁젣
        </button>
      </form>

      <p id="lockStatus" class="admin-status"></p>

      <a href="/games" class="lock-back">
        ???ъ씠?몃줈 ?뚯븘媛湲?      </a>
    </div>
  </div>

  <!-- ======================================================
       愿由ъ옄 蹂몃Ц
       ====================================================== -->
  <main class="admin-wrap" id="adminContent" hidden>
    <header class="admin-head">
      <div>
        <h1>?숋툘 愿由ъ옄 肄섏넄</h1>
        <p class="admin-head-sub">
          ?щ늻??寃뚯엫쨌媛寃㈑룻썑蹂?愿由?        </p>
      </div>

      <div class="admin-head-actions">
        <button
          id="lockBtn"
          class="btn btn-sm"
          type="button"
        >
          ?뵏 ?좉렇湲?        </button>

        <a href="/games" class="admin-back">
          ???ъ씠?몃줈
        </a>
      </div>
    </header>

    <!-- ====================================================
         ?곷떒 ??         ==================================================== -->
    <nav
      class="admin-tabs"
      id="adminTabs"
      aria-label="愿由ъ옄 硫붾돱"
    >
      <button
        type="button"
        class="admin-tab is-active"
        data-admin-tab="dashboard"
        aria-selected="true"
      >
        <span class="admin-tab-icon">?룧</span>
        <span>?꾪솴</span>
      </button>

      <button
              type="button"
              class="admin-tab"
              data-admin-tab="watcher"
              aria-selected="false"
            >
              <span class="admin-tab-icon">?뱻</span>
              <span>?덊뙋 WATCHER</span>
              <span
                id="watcherTabBadge"
                class="admin-tab-badge"
                hidden
              >
                0
              </span>
            </button>

      <button
        type="button"
        class="admin-tab"
        data-admin-tab="preorder-v2"
        aria-selected="false"
      >
        <span class="admin-tab-icon">?썟</span>
        <span>?ъ쟾?덉빟 V2</span>
        <span
          id="preorderV2TabBadge"
          class="admin-tab-badge"
          hidden
        >
          0
        </span>
      </button>


      <button
        type="button"
        class="admin-tab"
        data-admin-tab="candidates"
        aria-selected="false"
      >
        <span class="admin-tab-icon">?뱤</span>
        <span>?꾨낫 ?좊퀎</span>
        <span
          id="candidateTabBadge"
          class="admin-tab-badge"
          hidden
        >
          0
        </span>
      </button>

      <button
        type="button"
        class="admin-tab"
        data-admin-tab="import"
        aria-selected="false"
      >
        <span class="admin-tab-icon">?쨼</span>
        <span>寃뚯엫 媛?몄삤湲?/span>
        <span
          id="importTabBadge"
          class="admin-tab-badge"
          hidden
        >
          0
        </span>
      </button>

      <button
        type="button"
        class="admin-tab"
        data-admin-tab="games"
        aria-selected="false"
      >
        <span class="admin-tab-icon">?렜</span>
        <span>寃뚯엫 愿由?/span>
      </button>

      <button
        type="button"
        class="admin-tab"
        data-admin-tab="settings"
        aria-selected="false"
      >
        <span class="admin-tab-icon">?숋툘</span>
        <span>?ㅼ젙쨌諛깆뾽</span>
      </button>
    </nav>

    <!-- ====================================================
         ??1: ?꾪솴
         ==================================================== -->
    <section
      class="admin-panel is-active"
      data-admin-panel="dashboard"
    >
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>?룧 愿由??꾪솴</h2>
            <p class="admin-hint">
              ?깅줉??寃뚯엫怨??꾩옱 ?꾨낫 ?묒뾽 ?곹깭瑜??쒕늿???뺤씤?⑸땲??
            </p>
          </div>

          <button
            id="refreshDashboard"
            class="btn btn-sm"
            type="button"
          >
            ?덈줈怨좎묠
          </button>
        </div>

        <div class="dashboard-grid">
          <article class="dashboard-stat">
            <span class="dashboard-stat-label">
              ?깅줉??寃뚯엫
            </span>
            <strong
              id="dashboardGameCount"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">
              ?꾩껜 ?묓뭹 ??            </span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">
              ?깅줉???먮뵒??            </span>
            <strong
              id="dashboardEditionCount"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">
              ?뚮옯?쇰퀎 ?깅줉 ?⑷퀎
            </span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">
              ?됯????꾨낫
            </span>
            <strong
              id="dashboardCandidateCount"
              class="dashboard-stat-value"
            >
              0
            </strong>
            <span class="dashboard-stat-sub">
              ?꾩옱 釉뚮씪?곗? ?꾩떆 ?묒뾽
            </span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">
              媛?몄삤湲??湲?            </span>
            <strong
              id="dashboardImportCount"
              class="dashboard-stat-value"
            >
              0
            </strong>
            <span class="dashboard-stat-sub">
              ?꾩쭅 ??ν븯吏 ?딆? ??            </span>
          </article>
        </div>
      </section>

      <section class="admin-card">
        <h2>?? 鍮좊Ⅸ ?묒뾽</h2>

        <p class="admin-hint">
          ?먰븯???묒뾽?쇰줈 諛붾줈 ?대룞?????덉뒿?덈떎.
        </p>

        <div class="dashboard-actions">
          <button
            type="button"
            class="btn btn-primary"
            data-go-admin-tab="candidates"
          >
            ?뱤 ?꾨낫 寃뚯엫 ?좊퀎
          </button>

          <button
            type="button"
            class="btn"
            data-go-admin-tab="import"
          >
            ?쨼 寃뚯엫 媛?몄삤湲?          </button>

          <button
            type="button"
            class="btn"
            data-go-admin-tab="games"
          >
            ?렜 ?깅줉 寃뚯엫 愿由?          </button>

          <button
            type="button"
            class="btn"
            data-go-admin-tab="settings"
          >
            ?숋툘 ?ㅼ젙 諛?諛깆뾽
          </button>
        </div>
      </section>

      <section class="admin-card">
        <h2>?뮕 沅뚯옣 ?묒뾽 ?쒖꽌</h2>

        <ol class="admin-step-list">
          <li>
            ?ㅻ굹? ?깆뿉???꾨낫 寃뚯엫紐낆쓣 蹂듭궗?⑸땲??
          </li>
          <li>
            <b>?꾨낫 ?좊퀎</b> ??뿉 ??以꾩뿉 ?섎굹??遺숈뿬?ｌ뒿?덈떎.
          </li>
          <li>
            ?щ늻?쒖쓽 ?먮룞 ?됯? 寃곌낵? ?먯젙 ?댁쑀瑜??뺤씤?⑸땲??
          </li>
          <li>
            ?깅줉???꾨낫留?泥댄겕?섏뿬 <b>寃뚯엫 媛?몄삤湲?/b>濡??꾨떖?⑸땲??
          </li>
          <li>
            媛?몄삤湲?誘몃━蹂닿린瑜??뺤씤?????ㅼ젣 ??ν빀?덈떎.
          </li>
        </ol>

        <div class="admin-notice">
          ?꾨낫 ?됯? 寃곌낵留뚯쑝濡?寃뚯엫???먮룞 ?깅줉?섏????딆뒿?덈떎.
          ?ㅼ젣 ??μ? 諛섎뱶??寃뚯엫 媛?몄삤湲???뿉??吏곸젒 ?ㅽ뻾?댁빞 ?⑸땲??
        </div>
      </section>
    </section>

      <!-- ====================================================
         ??2: ?덊뙋 WATCHER
         ==================================================== -->
    <section
      class="admin-panel"
      data-admin-panel="watcher"
      hidden
    >
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>?뱻 ?덊뙋 WATCHER</h2>
            <p class="admin-hint">
              怨듭떇 蹂대룄?먮즺 諛쒓껄 ?꾪솴怨?異쒖쿂蹂??대?吏 ?ъ슜 ?뺤콉??              ?뺤씤?⑸땲?? ?덇? ?湲??대?吏??怨듦컻?섏? ?딆뒿?덈떎.
            </p>
          </div>

                    <div class="admin-row" style="margin-top: 0;">
            <button
              id="collectArcWatcher"
              class="btn btn-sm"
              type="button"
            >
              ?꾩껜 ?섏쭛 ?ㅽ뻾
            </button>

            <button
              id="refreshWatcher"
              class="btn btn-sm"
              type="button"
            >
              ?덈줈怨좎묠
            </button>
          </div>

        </div>

        <div class="watcher-summary-grid">
          <article class="dashboard-stat">
            <span class="dashboard-stat-label">?쒖꽦 異쒖쿂</span>
            <strong
              id="watcherEnabledSources"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">?꾩옱 媛먯떆 ???/span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">?좉퇋 諛쒓껄</span>
            <strong
              id="watcherDiscoveredItems"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">蹂????蹂대룄?먮즺</span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">蹂???꾨즺</span>
            <strong
              id="watcherTransformedItems"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">寃??以鍮??꾨즺</span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">寃??以?/span>
            <strong
              id="watcherReviewingItems"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">愿由ъ옄 ?뺤씤 ?꾩슂</span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">異쒖쿂 ?덇? ?湲?/span>
            <strong
              id="watcherPendingPermissions"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">異쒖쿂蹂??뺤콉 ?뚯떊 ?湲?/span>
          </article>

          <article class="dashboard-stat">
            <span class="dashboard-stat-label">???대깽??/span>
            <strong
              id="watcherUnreadEvents"
              class="dashboard-stat-value"
            >
              -
            </strong>
            <span class="dashboard-stat-sub">?쎌? ?딆? ?뚮┝</span>
          </article>
        </div>

        <p
          id="watcherStatus"
          class="admin-status"
          aria-live="polite"
        ></p>
      </section>

      <!-- ======================================================
           WATCHER ?대깽??           ====================================================== -->
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>?뵒 WATCHER ?대깽??/h2>

            <p class="admin-hint">
              蹂대룄?먮즺? ?대?吏 ?꾨낫 諛쒓껄 ?대젰???쒖떆?⑸땲??
              ?쎌쓬 泥섎━?대룄 湲곕줉? ??젣?섏? ?딆뒿?덈떎.
            </p>
          </div>

          <button
            id="markAllWatcherEventsRead"
            class="btn btn-sm"
            type="button"
          >
            紐⑤몢 ?쎌쓬
          </button>
        </div>

        <div
          id="watcherEventList"
          class="watcher-event-list"
        >
          <div class="admin-empty">
            ?대깽?몃? 遺덈윭?ㅻ뒗 以묒엯?덈떎.
          </div>
        </div>
      </section>

            <!-- ==================================================
           WATCHER 寃뚯엫 ?깅줉 珥덉븞
           ================================================== -->
      <section
        id="watcherTransformCard"
        class="admin-card"
        hidden
      >
        <div class="admin-section-head">
          <div>
            <h2>?뱷 寃뚯엫 ?깅줉 珥덉븞</h2>

            <p class="admin-hint">
              蹂대룄?먮즺?먯꽌 ?뺤씤???ъ떎 ?뺣낫留??낅젰?⑸땲??
              珥덉븞 ??λ쭔?쇰줈 寃뚯엫??怨듦컻?섏????딆뒿?덈떎.
            </p>
          </div>

          <button
            id="closeWatcherTransform"
            class="btn btn-sm"
            type="button"
          >
            ?リ린
          </button>
        </div>

        <input
          id="watcherTransformItemId"
          type="hidden"
          value=""
        />

        <div class="admin-notice">
          <strong id="watcherTransformSourceTitle">
            蹂대룄?먮즺瑜??좏깮??二쇱꽭??
          </strong>

          <div>
            <a
              id="watcherTransformSourceLink"
              class="watcher-item-link"
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              hidden
            >
              怨듭떇 蹂대룄?먮즺 ?닿린 ??            </a>
          </div>
        </div>

        <div class="watcher-transform-grid">
          <label class="admin-field">
            <span>寃뚯엫 ?쒕ぉ</span>

            <input
              id="watcherTransformTitle"
              type="text"
              placeholder="寃뚯엫 怨듭떇 ?쒕ぉ"
            />
          </label>

          <label class="admin-field">
            <span>?뚮옯??/span>

            <select id="watcherTransformPlatform">
              <option value="switch">
                Nintendo Switch
              </option>

              <option value="ps5">
                PlayStation 5
              </option>

              <option value="ps4">
                PlayStation 4
              </option>

              <option value="xbox">
                Xbox
              </option>

              <option value="pc">
                PC
              </option>

              <option value="etc">
                湲고?
              </option>
            </select>
          </label>

          <label class="admin-field">
            <span>?먮뵒???쒖떆紐?/span>

            <input
              id="watcherTransformEditionName"
              type="text"
              placeholder="?? Nintendo Switch ?쒓뎅???⑦궎吏??
            />
          </label>

          <label class="admin-field">
            <span>?λⅤ</span>

            <input
              id="watcherTransformGenre"
              type="text"
              placeholder="?? ?먰?吏 RPG"
            />
          </label>

          <label class="admin-field">
            <span>?⑦궎吏 諛쒕ℓ??/span>

            <input
              id="watcherTransformReleaseDate"
              type="date"
            />
          </label>

          <label class="admin-field">
            <span>?덉빟?먮ℓ ?쒖옉??/span>

            <input
              id="watcherTransformPreorderStart"
              type="date"
            />
          </label>

          <label class="admin-field">
            <span>?덉빟?먮ℓ 醫낅즺??/span>

            <input
              id="watcherTransformPreorderEnd"
              type="date"
            />
          </label>

          <label class="admin-field">
            <span>媛寃??꾨낫</span>

            <input
              id="watcherTransformCandidatePrice"
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              placeholder="?? 44800"
            />
          </label>
        </div>

        <label class="admin-field">
          <span>?덉빟 援щℓ ?뱀쟾</span>

          <input
            id="watcherTransformBonus"
            type="text"
            placeholder="?? 硫???대━??
          />
        </label>

        <label class="admin-field">
          <span>?뱀쟾 李멸퀬?ы빆</span>

          <textarea
            id="watcherTransformBonusNote"
            rows="3"
            placeholder="?? ??200 횞 200mm, ?섎웾 ?쒖젙, 議곌린 ?뚯쭊 媛??
          ></textarea>
        </label>

        <label class="admin-field">
          <span>怨듭떇 ?몃젅?쇰윭 URL</span>

          <input
            id="watcherTransformTrailer"
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </label>

  <!-- ==================================================
       WATCHER ????대?吏 ?꾨낫
       ================================================== -->
  <div
    id="watcherTransformImageSection"
    class="watcher-transform-images"
  >
    <div class="admin-section-head">
      <div>
        <h3>?뼹截?怨듭떇 ?대?吏 ?꾨낫</h3>

        <p class="admin-hint">
          怨듭떇 蹂대룄?먮즺?먯꽌 ?섏쭛???대?吏 以?????대?吏 ?꾨낫瑜?          ?????좏깮?⑸땲?? ?꾨낫 ?좏깮留뚯쑝濡??대?吏瑜??ㅼ슫濡쒕뱶?섍굅??          怨듦컻?섏? ?딆뒿?덈떎.
        </p>
      </div>

      <span
        id="watcherTransformImageCount"
        class="watcher-badge"
      >
        0媛?      </span>
    </div>

    <div
      id="watcherTransformImagePolicy"
      class="admin-notice"
    >
      <strong>?대?吏 ?뺤콉 ?뺤씤 以?/strong>

      <p class="admin-hint">
        異쒖쿂???대?吏 ?ъ슜 ?뺤콉怨?寃뚯엫 ?깅줉 ?곹깭瑜??뺤씤?⑸땲??
      </p>
    </div>

    <div
      id="watcherTransformSelectedImage"
      class="admin-notice"
      hidden
    >
      <strong>?좏깮??????대?吏</strong>

      <p
        id="watcherTransformSelectedImageText"
        class="admin-hint"
      ></p>
    </div>

        <div
      id="watcherTransformPrivatePreview"
      class="watcher-private-preview admin-notice"
      hidden
    >
      <div class="admin-section-head">
        <div>
          <strong>?뵏 鍮꾧났媛?R2 ?대?吏 誘몃━蹂닿린</strong>

          <p class="admin-hint">
            愿由ъ옄 ?몄쬆 API瑜??듯빐 鍮꾧났媛?R2 ?대?吏瑜??꾩떆濡?            遺덈윭?듬땲?? ??誘몃━蹂닿린??怨듦컻 URL???꾨떃?덈떎.
          </p>
        </div>

        <button
          id="loadWatcherPrivatePreview"
          class="btn btn-sm"
          type="button"
          disabled
        >
          愿由ъ옄 誘몃━蹂닿린 遺덈윭?ㅺ린
        </button>
      </div>

      <div
        id="watcherTransformPreviewFrame"
        class="watcher-private-preview-frame"
        hidden
      >
        <img
          id="watcherTransformPreviewImage"
          class="watcher-private-preview-image"
          alt="?좏깮??寃뚯엫 ????대?吏 鍮꾧났媛?誘몃━蹂닿린"
        />
      </div>

      <p
        id="watcherTransformPreviewInfo"
        class="admin-hint"
      >
        ??λ맂 ????대?吏瑜??좏깮??二쇱꽭??
      </p>

      <p
        id="watcherTransformPreviewStatus"
        class="admin-status"
        aria-live="polite"
      ></p>
    </div>


    <div
      id="watcherTransformImageList"
      class="watcher-transform-image-grid"
    >
      <div class="admin-empty">
        蹂대룄?먮즺瑜??대㈃ 怨듭떇 ?대?吏 ?꾨낫瑜?遺덈윭?듬땲??
      </div>
    </div>

    <p
      id="watcherTransformImageStatus"
      class="admin-status"
      aria-live="polite"
    ></p>

    <div class="admin-notice">
      <strong>?꾩옱 ?④퀎???덉쟾 ?먯튃</strong>

      <p class="admin-hint">
      ????대?吏 ?꾨낫 ?좏깮 ??怨듭떇 ?먮낯??鍮꾧났媛?R2????ν븷 ??      ?덉뒿?덈떎. R2 ??λ쭔?쇰줈 寃뚯엫? 怨듦컻?섏? ?딆쑝硫?
      games.image_url怨?怨듦컻 ?곹깭??蹂寃쏀븯吏 ?딆뒿?덈떎.
      </p>
    </div>
  </div>

        <!-- ================================================
             WATCHER 理쒖쥌 怨듦컻 ?붾㈃ 寃??             ?ㅼ젣 怨듦컻 泥섎━ ?놁쓬
             ================================================ -->
        <section
          id="watcherFinalReview"
          class="watcher-final-review"
          hidden
        >
          <div class="admin-section-head">
            <div>
              <h3>?몓截?理쒖쥌 怨듦컻 ?붾㈃ 寃??/h3>

              <p class="admin-hint">
                ?꾩옱 ?낅젰媛믨낵 鍮꾧났媛?R2 ?대?吏瑜??ㅼ젣 怨듦컻 ?붾㈃怨?                鍮꾩듂???뺥깭濡??뺤씤?⑸땲?? ??移대뱶??議고쉶 ?꾩슜?대ŉ
                寃뚯엫 怨듦컻 ?곹깭瑜?蹂寃쏀븯吏 ?딆뒿?덈떎.
              </p>
            </div>

            <span class="watcher-badge watcher-final-draft-badge">
              DRAFT 쨌 鍮꾧났媛?            </span>
          </div>

          <article class="watcher-final-card">
            <div class="watcher-final-image-area">
              <img
                id="watcherFinalImage"
                class="watcher-final-image"
                alt="寃뚯엫 ????대?吏 理쒖쥌 寃??
                hidden
              />

              <div
                id="watcherFinalImagePlaceholder"
                class="watcher-final-image-placeholder"
              >
                ?뵏
                <span>
                  愿由ъ옄 R2 誘몃━蹂닿린瑜?癒쇱? 遺덈윭? 二쇱꽭??
                </span>
              </div>
            </div>

            <div class="watcher-final-body">
              <div class="watcher-final-badges">
                <span
                  id="watcherFinalPlatform"
                  class="watcher-badge"
                >
                  ?뚮옯??誘몄엯??                </span>

                <span
                  id="watcherFinalGameId"
                  class="watcher-badge"
                >
                  寃뚯엫 DRAFT
                </span>
              </div>

              <h3 id="watcherFinalTitle">
                寃뚯엫 ?쒕ぉ 誘몄엯??              </h3>

              <p
                id="watcherFinalEdition"
                class="watcher-final-edition"
              >
                ?먮뵒???쒖떆紐?誘몄엯??              </p>

              <dl class="watcher-final-meta">
                <div>
                  <dt>諛쒕ℓ??/dt>
                  <dd id="watcherFinalReleaseDate">-</dd>
                </div>

                <div>
                  <dt>?덉빟?먮ℓ 湲곌컙</dt>
                  <dd id="watcherFinalPreorderPeriod">-</dd>
                </div>

                <div>
                  <dt>媛寃??꾨낫</dt>
                  <dd id="watcherFinalPrice">誘명솗??/dd>
                </div>

                <div>
                  <dt>?λⅤ</dt>
                  <dd id="watcherFinalGenre">-</dd>
                </div>
              </dl>

              <section class="watcher-final-bonus">
                <strong>?럞 ?덉빟 援щℓ ?뱀쟾</strong>

                <p id="watcherFinalBonus">
                  ?깅줉???뱀쟾 ?뺣낫媛 ?놁뒿?덈떎.
                </p>

                <p
                  id="watcherFinalBonusNote"
                  class="admin-hint"
                ></p>
              </section>

              <div class="watcher-final-links">
                <a
                  id="watcherFinalSourceLink"
                  class="watcher-item-link"
                  href="#"
                  target="_blank"
                  rel="noopener noreferrer"
                  hidden
                >
                  怨듭떇 蹂대룄?먮즺 ?뺤씤 ??                </a>

                <a
                  id="watcherFinalTrailerLink"
                  class="watcher-item-link"
                  href="#"
                  target="_blank"
                  rel="noopener noreferrer"
                  hidden
                >
                  怨듭떇 ?몃젅?쇰윭 ?뺤씤 ??                </a>
              </div>

              <footer class="watcher-final-credit">
                <p id="watcherFinalCredit">
                  異쒖쿂 ?뺣낫瑜??뺤씤??二쇱꽭??
                </p>

                <p id="watcherFinalCopyright"></p>
              </footer>
            </div>
          </article>

          <div class="admin-notice watcher-final-safety">
            <strong>?꾩옱 寃???곹깭</strong>

            <p class="admin-hint">
              ???붾㈃? 愿由ъ옄 釉뚮씪?곗??먯꽌 ?앹꽦??Blob ?대?吏?
              ?낅젰媛믩쭔 議고빀?⑸땲?? games.image_url, 寃뚯엫 怨듦컻 ?곹깭,
              ?덉빟?먮ℓ 怨듦컻 ?곹깭??蹂寃쏀븯吏 ?딆뒿?덈떎.
            </p>
          </div>
        </section>


        <div class="admin-row admin-row-wrap">
          <button
            id="saveWatcherTransform"
            class="btn btn-primary"
            type="button"
          >
            珥덉븞 ???          </button>
            <button
              id="registerWatcherDraft"
              class="btn"
              type="button"
              disabled
            >
              珥덉븞 ??????깅줉
            </button>

          <button
            id="cancelWatcherTransform"
            class="btn"
            type="button"
          >
            痍⑥냼
          </button>
        </div>

        <p
          id="watcherTransformStatus"
          class="admin-status"
          aria-live="polite"
        ></p>
      </section>


      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>?룫 ?섏쭛 異쒖쿂 諛??대?吏 ?뺤콉</h2>
            <p class="admin-hint">
              PENDING? ?ъ슜 ?덇?瑜??섎??섏? ?딆뒿?덈떎.
              ?뚯떊 ?꾩뿉??愿由ъ옄 ?꾨낫 ?뺤씤留?媛?ν빀?덈떎.
            </p>
          </div>
        </div>

        <div
          id="watcherSourceList"
          class="watcher-source-list"
        >
          <div class="admin-empty">
            異쒖쿂 ?뺣낫瑜?遺덈윭?ㅻ뒗 以묒엯?덈떎.
          </div>
        </div>
      </section>

      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>?벐 諛쒓껄??怨듭떇 蹂대룄?먮즺</h2>
            <p class="admin-hint">
              理쒖떊 諛쒓껄 ??ぉ 50媛쒕? ?쒖떆?⑸땲??
            </p>
          </div>
        </div>

        <div
          id="watcherItemList"
          class="watcher-item-list"
        >
          <div class="admin-empty">
            ?섏쭛 ??ぉ??遺덈윭?ㅻ뒗 以묒엯?덈떎.
          </div>
        </div>
      </section>

      <section class="admin-card">
        <h2>?뵏 ?꾩옱 ?대?吏 ?댁쁺 ?먯튃</h2>

        <div class="admin-notice">
          ?대?吏 ?뺤콉??PENDING??異쒖쿂??怨듭떇 ?대?吏 URL留??꾨낫濡?          湲곕줉?⑸땲?? ?ъ씠??怨듦컻, ?먯껜 ??? 由ъ궗?댁쫰 諛??щ같?щ뒗
          ?덇? 踰붿쐞媛 ?뺤씤???뚭퉴吏 李⑤떒?⑸땲??
        </div>
      </section>
    </section>


    <!-- ====================================================
         ?ъ쟾?덉빟 V2
         ?뚮옯?????곹뭹 ?먮뵒?????덉빟?먮ℓ
         ==================================================== -->
    <section
      class="admin-panel"
      data-admin-panel="preorder-v2"
      hidden
    >
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>?썟 ?ъ쟾?덉빟 V2</h2>
            <p class="admin-hint">
              WATCHER媛 ?앹꽦??鍮꾧났媛?DRAFT 寃뚯엫???뚮옯?쇰퀎
              ?듭긽?먃룻븳?뺥뙋쨌?붾윮???먮뵒?섏쓣 ?깅줉?⑸땲??
              湲곗〈 Legacy 媛寃⑷낵 ?ㅼ씠踰??섏쭛湲곕뒗 蹂寃쏀븯吏 ?딆뒿?덈떎.
            </p>
          </div>

          <button
            id="refreshPreorderV2"
            class="btn btn-sm"
            type="button"
          >
            ?덈줈怨좎묠
          </button>
        </div>

        <div class="admin-notice">
          ???붾㈃?먯꽌 ??ν븯??寃뚯엫쨌?곹뭹 ?먮뵒?샕룹삁?쏀뙋留??뺣낫??          紐⑤몢 DRAFT?낅땲?? ??λ쭔?쇰줈 硫붿씤?대굹 怨듦컻 寃뚯엫 ?붾㈃??          ?쒖떆?섏? ?딆뒿?덈떎.
        </div>

        <label class="admin-field">
          <span>鍮꾧났媛?DRAFT 寃뚯엫</span>
          <select id="preorderV2Game">
            <option value="">
              寃뚯엫???좏깮??二쇱꽭??
            </option>
          </select>
        </label>

        <p
          id="preorderV2Status"
          class="admin-status"
          aria-live="polite"
        ></p>
      </section>

      <section
        id="preorderV2Editor"
        class="admin-card"
        hidden
      >
        <div class="admin-section-head">
          <div>
            <h2 id="preorderV2GameTitle">
              ?곹뭹 ?먮뵒???깅줉
            </h2>

            <p
              id="preorderV2GameMeta"
              class="admin-hint"
            ></p>
          </div>

          <button
            id="resetPreorderV2Form"
            class="btn btn-sm"
            type="button"
          >
            ???먮뵒??          </button>
        </div>

        <form id="preorderV2Form">
          <div class="preorder-v2-section">
            <h3>1. ?뚮옯??/h3>

            <div class="preorder-v2-grid preorder-v2-grid-2">
              <label class="admin-field">
                <span>?뚮옯??/span>
                <select
                  id="preorderV2Platform"
                  required
                >
                  <option value="switch">
                    Nintendo Switch
                  </option>
                  <option value="switch2">
                    Nintendo Switch 2
                  </option>
                  <option value="ps5">
                    PlayStation 5
                  </option>
                  <option value="ps4">
                    PlayStation 4
                  </option>
                  <option value="xbox">
                    Xbox
                  </option>
                  <option value="pc">
                    PC
                  </option>
                  <option value="etc">
                    湲고?
                  </option>
                </select>
              </label>

              <label class="admin-field">
                <span>?뚮옯?쇳뙋 ?쒖떆紐?/span>
                <input
                  type="text"
                  id="preorderV2PlatformEditionName"
                  placeholder="?? Nintendo Switch ?쒓뎅???⑦궎吏??
                  maxlength="100"
                />
              </label>
            </div>
          </div>

          <div class="preorder-v2-section">
            <h3>2. ?곹뭹 ?먮뵒??/h3>

            <div class="preorder-v2-grid preorder-v2-grid-2">
              <label class="admin-field">
                <span>?먮뵒??醫낅쪟</span>
                <select
                  id="preorderV2VariantKind"
                  required
                >
                  <option value="STANDARD">?듭긽??/option>
                  <option value="DELUXE">?붾윮??/option>
                  <option value="ULTIMATE">?쇳떚諛?/option>
                  <option value="LIMITED">?쒖젙??/option>
                  <option value="COLLECTORS">而щ젆?곗뒪</option>
                  <option value="OTHER">湲고?</option>
                </select>
              </label>

              <label class="admin-field">
                <span>?곹뭹 ?뺥깭</span>
                <select
                  id="preorderV2PackageType"
                  required
                >
                  <option value="PACKAGE">?⑦궎吏</option>
                  <option value="DIGITAL">?붿???/option>
                  <option value="BOTH">?⑦궎吏쨌?붿???怨듯넻</option>
                </select>
              </label>

              <label class="admin-field">
                <span>?먮뵒??肄붾뱶</span>
                <input
                  type="text"
                  id="preorderV2VariantCode"
                  value="STANDARD"
                  placeholder="STANDARD"
                  maxlength="40"
                  required
                />
              </label>

              <label class="admin-field">
                <span>?먮뵒???쒖떆紐?/span>
                <input
                  type="text"
                  id="preorderV2VariantName"
                  value="?듭긽??
                  placeholder="?? ?쒓뎅 ?쒖젙??
                  maxlength="100"
                  required
                />
              </label>
            </div>

            <div class="preorder-v2-inline-options">
              <label class="preorder-v2-check">
                <input
                  type="checkbox"
                  id="preorderV2IsDefault"
                  checked
                />
                <span>
                  ???뚮옯?쇱쓽 湲곕낯 ?먮뵒??                </span>
              </label>

              <label class="admin-field preorder-v2-order">
                <span>?쒖떆 ?쒖꽌</span>
                <input
                  type="number"
                  id="preorderV2DisplayOrder"
                  value="0"
                  step="1"
                />
              </label>
            </div>
          </div>

          <div class="preorder-v2-section">
            <h3>3. 怨듭떇 異쒖쿂 諛??쇱젙</h3>

            <label class="admin-field">
              <span>怨듭떇 蹂대룄?먮즺</span>
              <select
                id="preorderV2OfficialSource"
                required
              >
                <option value="">
                  怨듭떇 異쒖쿂瑜??좏깮??二쇱꽭??
                </option>
              </select>
            </label>

            <div class="preorder-v2-grid preorder-v2-grid-3">
              <label class="admin-field">
                <span>異쒖떆??/span>
                <input
                  type="date"
                  id="preorderV2ReleaseDate"
                  required
                />
              </label>

              <label class="admin-field">
                <span>?덉빟?먮ℓ ?쒖옉??/span>
                <input
                  type="date"
                  id="preorderV2StartDate"
                />
              </label>

              <label class="admin-field">
                <span>?덉빟?먮ℓ 醫낅즺??/span>
                <input
                  type="date"
                  id="preorderV2EndDate"
                />
              </label>
            </div>

            <label class="admin-field">
              <span>?덉빟?먮ℓ ?곹깭</span>
              <select id="preorderV2PreorderStatus">
                <option value="UNKNOWN">?뺤씤 ??/option>
                <option value="UPCOMING">?덉젙</option>
                <option value="OPEN">吏꾪뻾 以?/option>
                <option value="CLOSED">醫낅즺</option>
                <option value="CANCELLED">痍⑥냼</option>
              </select>
            </label>
          </div>

          <div class="preorder-v2-section">
            <h3>4. 怨듭떇 媛寃?/h3>

            <div class="preorder-v2-grid preorder-v2-grid-3">
              <label class="admin-field">
                <span>媛寃??곹깭</span>
                <select id="preorderV2PriceStatus">
                  <option value="UNCONFIRMED">
                    誘명솗??                  </option>
                  <option value="CANDIDATE">
                    媛寃??꾨낫
                  </option>
                  <option value="CONFIRMED">
                    怨듭떇 ?뺤젙
                  </option>
                </select>
              </label>

              <label class="admin-field">
                <span>媛寃??꾨낫</span>
                <input
                  type="number"
                  id="preorderV2CandidatePrice"
                  min="1"
                  step="1"
                  placeholder="?? 59800"
                />
              </label>

              <label class="admin-field">
                <span>?뺤젙 媛寃?/span>
                <input
                  type="number"
                  id="preorderV2ConfirmedPrice"
                  min="1"
                  step="1"
                  placeholder="怨듭떇 ?뺤젙 ???낅젰"
                />
              </label>
            </div>
          </div>

          <div class="preorder-v2-section">
            <h3>5. 援ъ꽦??諛??덉빟 ?뱀쟾</h3>

            <label class="admin-field">
              <span>?먮뵒??援ъ꽦??/span>
              <textarea
                id="preorderV2Contents"
                rows="5"
                placeholder="?? 寃뚯엫 蹂명렪, ?꾪듃遺? ?ъ슫?쒗듃?? ?꾪겕由??ㅽ깲??
              ></textarea>
            </label>

            <label class="admin-field">
              <span>?덉빟 援щℓ ?뱀쟾</span>
              <textarea
                id="preorderV2Bonus"
                rows="4"
                placeholder="?덉빟 援щℓ?먯뿉寃??쒓났?섎뒗 怨듭떇 ?뱀쟾"
              ></textarea>
            </label>

            <label class="admin-field">
              <span>?뱀쟾 李멸퀬?ы빆</span>
              <textarea
                id="preorderV2BonusNote"
                rows="3"
                placeholder="?섎웾 ?쒖젙, ?먮ℓ泥섎퀎 李⑥씠 ??
              ></textarea>
            </label>
          </div>

          <div class="preorder-v2-section">
            <div class="admin-section-head">
              <div>
                <h3>6. ?먮뵒???대?吏</h3>
                <p class="admin-hint">
                  ?좏깮??怨듭떇 異쒖쿂?먯꽌 ?뱀씤?섍퀬 鍮꾧났媛?R2??                  ??λ맂 ?대?吏留??곌껐?????덉뒿?덈떎.
                </p>
              </div>
            </div>

            <div
              id="preorderV2Images"
              class="preorder-v2-images"
            >
              <div class="admin-empty">
                怨듭떇 異쒖쿂瑜??좏깮??二쇱꽭??
              </div>
            </div>
          </div>

          <div class="preorder-v2-actions">
            <button
              id="savePreorderV2"
              class="btn btn-primary"
              type="submit"
            >
              DRAFT ???            </button>
          </div>
        </form>
      </section>

      <section
        id="preorderV2ExistingSection"
        class="admin-card"
        hidden
      >
        <div class="admin-section-head">
          <div>
            <h2>?깅줉???곹뭹 ?먮뵒??/h2>
            <p class="admin-hint">
              ?뚮옯?쇨낵 ?먮뵒?섎퀎濡?遺꾨━???ъ쟾?덉빟 DRAFT?낅땲??
            </p>
          </div>
        </div>

        <div
          id="preorderV2Existing"
          class="preorder-v2-existing"
        ></div>
      </section>
    </section>


    <!-- ====================================================
         ??3: ?꾨낫 ?좊퀎
         ==================================================== -->
    <section
      class="admin-panel"
      data-admin-panel="candidates"
      hidden
    >
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>?뱤 ?꾨낫 寃뚯엫 ?먮룞 ?좊퀎</h2>
            <p class="admin-hint">
              ?꾨낫紐낆쓣 ?쒓볼踰덉뿉 ?낅젰?섎㈃ 湲곗〈 ?깅줉 ?щ?? ?ㅼ씠踰??쇳븨
              寃??寃곌낵瑜?諛뷀깢?쇰줈 異붿쿇쨌寃?졖룹젣?몃줈 遺꾨쪟?⑸땲??
            </p>
          </div>

          <button
            id="resetCandidateWork"
            class="btn btn-sm"
            type="button"
          >
            ?꾩떆 ?묒뾽 珥덇린??          </button>
        </div>

        <div class="candidate-options">
          <label class="admin-field candidate-option">
            <span>????뚮옯??/span>

            <select id="candidatePlatform">
              <option value="switch">SWITCH</option>
              <option value="switch2">SWITCH 2</option>
              <option value="ps5">PS5</option>
              <option value="ps4">PS4</option>
              <option value="xbox">XBOX</option>
              <option value="pc">PC</option>
            </select>
          </label>

          <label class="admin-field candidate-option">
            <span>異쒖떆?곕룄 ?먮뒗 ?쒖쐞?곕룄</span>

            <select id="candidateYear">
              <option value="">?곕룄 誘몄???/option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
              <option value="2022">2022</option>
              <option value="2021">2021</option>
              <option value="2020">2020</option>
              <option value="2019">2019</option>
              <option value="2018">2018</option>
              <option value="2017">2017</option>
            </select>
          </label>
        </div>

        <label class="admin-field">
          <span>?꾨낫 寃뚯엫紐?/span>

          <textarea
            id="candidateTitles"
            class="admin-textarea candidate-textarea"
            rows="12"
            placeholder="??以꾩뿉 寃뚯엫 ?섎굹??遺숈뿬?ｌ쑝?몄슂.&#10;&#10;??&#10;?쇳겕誘?4&#10;?덊띁 留덈━?ㅻ툕?쇰뜑???먮뜑&#10;?ㅻ떎???꾩꽕 ?곗뼱???ㅻ툕 ???밸뜡"
          ></textarea>
        </label>

        <div class="candidate-input-summary">
          <span>
            ?낅젰:
            <b id="candidateInputCount">0</b>媛?          </span>

          <span>
            以묐났 ?쒓굅 ??
            <b id="candidateUniqueCount">0</b>媛?          </span>

          <span>
            ??踰덉뿉 理쒕? 100媛?          </span>
        </div>

        <div class="admin-row admin-row-wrap">
          <button
            id="evaluateCandidates"
            class="btn btn-primary"
            type="button"
          >
            ?뵇 ?꾨낫 ?먮룞 ?됯? ?쒖옉
          </button>

          <button
            id="stopCandidateEvaluation"
            class="btn"
            type="button"
            disabled
          >
            ?됯? 以묐떒
          </button>

          <button
            id="restoreCandidateDraft"
            class="btn"
            type="button"
          >
            ?꾩떆 ???蹂듭썝
          </button>
        </div>

        <p
          id="candidateStatus"
          class="admin-status"
          aria-live="polite"
        ></p>

        <div
          id="candidateProgressWrap"
          class="candidate-progress-wrap"
          hidden
        >
          <div class="candidate-progress-head">
            <span id="candidateProgressText">
              ?됯? 以鍮?以?            </span>

            <span id="candidateProgressPercent">
              0%
            </span>
          </div>

          <div
            class="candidate-progress"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="0"
          >
            <div
              id="candidateProgressBar"
              class="candidate-progress-bar"
            ></div>
          </div>

          <p
            id="candidateCurrentTitle"
            class="candidate-current-title"
          ></p>
        </div>
      </section>

      <section
        id="candidateResultCard"
        class="admin-card"
        hidden
      >
        <div class="admin-section-head">
          <div>
            <h2>?뱥 ?됯? 寃곌낵</h2>

            <p class="admin-hint">
              ?먯닔? ?먯젙 ?댁쑀瑜??뺤씤?????깅줉??寃뚯엫留??좏깮?섏꽭??
            </p>
          </div>

          <button
            id="retryFailedCandidates"
            class="btn btn-sm"
            type="button"
            hidden
          >
            ?ㅽ뙣 ??ぉ ?ъ떆??          </button>
        </div>

        <div class="candidate-summary-grid">
          <button
            type="button"
            class="candidate-summary is-active"
            data-candidate-filter="all"
          >
            <span>?꾩껜</span>
            <strong id="candidateCountAll">0</strong>
          </button>

          <button
            type="button"
            class="candidate-summary candidate-summary-recommend"
            data-candidate-filter="recommend"
          >
            <span>異붿쿇</span>
            <strong id="candidateCountRecommend">0</strong>
          </button>

          <button
            type="button"
            class="candidate-summary candidate-summary-review"
            data-candidate-filter="review"
          >
            <span>寃??/span>
            <strong id="candidateCountReview">0</strong>
          </button>

          <button
            type="button"
            class="candidate-summary candidate-summary-exclude"
            data-candidate-filter="exclude"
          >
            <span>?쒖쇅</span>
            <strong id="candidateCountExclude">0</strong>
          </button>

          <button
            type="button"
            class="candidate-summary candidate-summary-existing"
            data-candidate-filter="existing"
          >
            <span>湲곕벑濡?/span>
            <strong id="candidateCountExisting">0</strong>
          </button>

          <button
            type="button"
            class="candidate-summary candidate-summary-error"
            data-candidate-filter="error"
          >
            <span>?ㅻ쪟</span>
            <strong id="candidateCountError">0</strong>
          </button>
        </div>

        <div class="candidate-toolbar">
          <div class="candidate-toolbar-left">
            <label class="admin-selall">
              <input
                type="checkbox"
                id="selectAllCandidates"
              />
              ?꾩옱 紐⑸줉 ?꾩껜 ?좏깮
            </label>

            <button
              id="selectRecommendedCandidates"
              class="btn btn-sm"
              type="button"
            >
              異붿쿇留??좏깮
            </button>

            <button
              id="clearCandidateSelection"
              class="btn btn-sm"
              type="button"
            >
              ?좏깮 ?댁젣
            </button>
          </div>

          <div class="candidate-toolbar-right">
            <label class="candidate-sort-label">
              ?뺣젹

              <select id="candidateSort">
                <option value="score-desc">
                  ?먯닔 ?믪? ??                </option>
                <option value="stores-desc">
                  ?먮ℓ泥?留롮? ??                </option>
                <option value="price-spread-desc">
                  媛寃?李⑥씠 ????                </option>
                <option value="name-asc">
                  ?대쫫 ??                </option>
                <option value="input-order">
                  ?낅젰 ?쒖꽌
                </option>
              </select>
            </label>
          </div>
        </div>

        <div
          id="candidateResultList"
          class="candidate-result-list"
        ></div>

        <div class="candidate-bottom-bar">
          <div class="candidate-selected-info">
            <b id="candidateSelectedCount">0</b>媛??좏깮??          </div>

          <button
            id="sendCandidatesToImport"
            class="btn btn-primary"
            type="button"
            disabled
          >
            ?좏깮 ?꾨낫瑜?寃뚯엫 媛?몄삤湲곕줈 蹂대궡湲?          </button>
        </div>
      </section>
    </section>

    <!-- ====================================================
         ??4: 寃뚯엫 媛?몄삤湲?         ==================================================== -->
    <section
      class="admin-panel"
      data-admin-panel="import"
      hidden
    >
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>?쨼 寃뚯엫 ?먮룞 媛?몄삤湲?/h2>

            <p class="admin-hint">
              ???됱씠 ?섎굹??寃뚯엫?낅땲?? 癒쇱? 誘몃━蹂닿린濡?寃??寃곌낵瑜?              ?뺤씤?섍퀬 臾몄젣媛 ?놁쓣 ?뚮쭔 ?ㅼ젣 ??μ쓣 ?ㅽ뻾?섏꽭??
            </p>
          </div>

          <button
            id="clearImportRows"
            class="btn btn-sm"
            type="button"
          >
            ?낅젰 ??珥덇린??          </button>
        </div>

        <div class="admin-notice">
          ?꾨낫 ?좊퀎?먯꽌 ?꾨떖??寃뚯엫? 湲곗〈 ?낅젰 ?됱쓣 ??뼱?곗? ?딄퀬
          ?꾨옒履쎌뿉 異붽??⑸땲?? ?대? 媛숈? ?대쫫???낅젰???덉쑝硫?以묐났?쇰줈
          異붽??섏? ?딆뒿?덈떎.
        </div>

        <details class="admin-details">
          <summary>?낅젰 ??ぉ ?ъ슜踰?蹂닿린</summary>

          <div class="admin-details-body">
            <ul class="admin-help-list">
              <li>
                <b>????대쫫</b>: ?ъ씠?몄뿉 ?쒖떆??寃뚯엫紐낆엯?덈떎.
              </li>
              <li>
                <b>?ㅼ썙??/b>: ?쒕━利덈Ъ?먯꽌 ?뱀젙 ?묓뭹??援щ텇????                ?ъ슜?⑸땲?? ?쇳몴濡??щ윭 媛??낅젰?????덉뒿?덈떎.
              </li>
              <li>
                <b>?쒖쇅??/b>: ?뚯깮?먯씠???ㅽ??ㅽ봽 ?깆쓣 ?쒖쇅????                ?ъ슜?⑸땲??
              </li>
              <li>
                <b>?대?吏 URL</b>: 鍮꾩슦硫??ㅼ씠踰?寃곌낵?먯꽌 ?먮룞
                ?섏쭛?⑸땲??
              </li>
              <li>
                <b>?ㅼ쐞移??뺤콉</b>: Switch 1쨌Switch 2 遺꾨쪟媛
                ?좊ℓ???뚮쭔 吏?뺥빀?덈떎.
              </li>
            </ul>
          </div>
        </details>

        <div class="ig-table">
          <div class="ig-head">
            <span class="ig-col-name">
              ????대쫫
            </span>

            <span class="ig-col-keywords">
              ?ㅼ썙??            </span>

            <span class="ig-col-bottom">
              ?쒖쇅??/ ?대?吏 URL / ?ㅼ쐞移??뺤콉
            </span>

            <span class="ig-col-exclude">
              ?쒖쇅??            </span>

            <span class="ig-col-image">
              ?대?吏 URL
            </span>

            <span class="ig-col-policy">
              ?ㅼ쐞移??뺤콉
            </span>

            <span class="ig-col-act"></span>
          </div>

          <div id="importGroups" class="ig-body"></div>
        </div>

        <div class="admin-row admin-row-wrap">
          <button
            id="addGroupRow"
            class="btn btn-sm"
            type="button"
          >
            ????異붽?
          </button>

          <button
            id="removeEmptyImportRows"
            class="btn btn-sm"
            type="button"
          >
            鍮????뺣━
          </button>
        </div>

        <div class="admin-row admin-row-wrap import-action-row">
          <button
            id="previewImport"
            class="btn"
            type="button"
          >
            ?뵇 誘몃━蹂닿린
          </button>

          <button
            id="runImport"
            class="btn btn-primary"
            type="button"
          >
            燧뉛툘 ?ㅼ젣 ???          </button>
        </div>

        <p
          id="importStatus"
          class="admin-status"
          aria-live="polite"
        ></p>

        <div
          id="importResult"
          class="import-result"
        ></div>
      </section>
    </section>

    <!-- ====================================================
         ??5: 寃뚯엫 愿由?         ==================================================== -->
    <section
      class="admin-panel"
      data-admin-panel="games"
      hidden
    >
      <section class="admin-card">
        <div class="admin-section-head">
          <div>
            <h2>?렜 ?깅줉??寃뚯엫</h2>

            <p class="admin-hint">
              ?꾩옱 ?깅줉??寃뚯엫???뺤씤?섍굅???좏깮??寃뚯엫????젣????              ?덉뒿?덈떎.
            </p>
          </div>

          <button
            id="refreshGames"
            class="btn btn-sm"
            type="button"
          >
            ?덈줈怨좎묠
          </button>
        </div>

        <label class="admin-field">
          <span>寃뚯엫 寃??/span>

          <input
            type="text"
            id="gameListSearch"
            placeholder="寃뚯엫紐낆쑝濡?寃??
          />
        </label>

        <div class="admin-bulk-bar">
          <label class="admin-selall">
            <input
              type="checkbox"
              id="selectAllGames"
            />
            ?꾩옱 紐⑸줉 ?꾩껜 ?좏깮
          </label>

          <span id="selectedGameCount" class="admin-selection-count">
            0媛??좏깮??          </span>

          <button
            id="bulkDeleteBtn"
            class="btn btn-sm btn-danger"
            type="button"
            disabled
          >
            ?좏깮 ??젣
          </button>
        </div>

        <p
          id="gameListStatus"
          class="admin-status"
        ></p>

        <ul
          id="gameList"
          class="admin-game-list"
        ></ul>
      </section>
    </section>

    <!-- ====================================================
         ??6: ?ㅼ젙 諛?諛깆뾽
         ==================================================== -->
    <section
      class="admin-panel"
      data-admin-panel="settings"
      hidden
    >
      <section class="admin-card">
        <h2>?숋툘 愿由ъ옄 ?ㅼ젙</h2>

        <h3>?뮥 ?쇳븨紐??덊띁??ID</h3>

        <p class="admin-hint">
          ??踰덈쭔 ?낅젰?대몢硫?援щℓ 留곹겕???먮룞?쇰줈 ?곸슜?⑸땲??
          ?쒕쾭?먯꽌 寃고빀?섎?濡??쇰컲 ?ъ슜???붾㈃?먮뒗 ?ㅼ젙媛믪씠 吏곸젒
          ?몄텧?섏? ?딆뒿?덈떎.
        </p>

        <label class="admin-field">
          <span>荑좏뙜 ?뚰듃?덉뒪 ID</span>

          <input
            type="text"
            id="coupang_partners_id"
            placeholder="?? AF1234567"
          />
        </label>

        <label class="admin-field">
          <span>留곹겕?꾨씪?댁뒪 ?쇰툝由ъ뀛 ID</span>

          <input
            type="text"
            id="linkprice_id"
            placeholder="?? A100705627"
          />
        </label>

        <hr class="admin-hr" />

        <h3>?슟 ?꾩뿭 ?섏쭛 ?꾪꽣</h3>

        <p class="admin-hint">
          紐⑤뱺 寃뚯엫???ㅼ씠踰?媛寃??섏쭛??怨듯넻?쇰줈 ?곸슜?⑸땲??
          ??ぉ? ?쇳몴 ?먮뒗 以꾨컮轅덉쑝濡?援щ텇?섏꽭??
          ?뺢퇋?앹씠 ?꾨땶 ?쇰컲 臾몄옄?대줈 寃?됰맗?덈떎.
        </p>

        <label class="admin-field">
          <span>異붽? 釉붾옓由ъ뒪???ㅼ썙??/span>

          <textarea
            id="custom_blacklist_keywords"
            class="admin-textarea"
            rows="6"
            placeholder="??&#10;?댁쇅??#10;怨꾩젙?먮ℓ&#10;寃뚯엫 怨듬왂吏?
          ></textarea>
        </label>

        <p class="admin-hint">
          ?곹뭹 ?쒕ぉ????臾몄옄?댁씠 ?ы븿?섎㈃ 媛寃??섏쭛 ??곸뿉??          ?쒖쇅?⑸땲?? ?뱀젙 寃뚯엫 ?섎굹?먮쭔 ?곸슜???쒖쇅?대뒗 寃뚯엫
          媛?몄삤湲곗쓽 ?쒖쇅????ぉ???ъ슜?섏꽭??
        </p>

        <label class="admin-field">
          <span>異붽? 李⑤떒 ?쇳븨紐?/span>

          <textarea
            id="custom_blocked_malls"
            class="admin-textarea"
            rows="5"
            placeholder="??&#10;臾몄젣?쇳븨紐?#10;?낆껜紐?
          ></textarea>
        </label>

        <p class="admin-hint">
          ?ㅼ씠踰??쇳븨???먮ℓ泥??대쫫????臾몄옄?댁씠 ?ы븿?섎㈃ ?대떦
          ?먮ℓ泥??곹뭹???쒖쇅?⑸땲??
        </p>

        <button
          id="saveSettings"
          class="btn btn-primary"
          type="button"
        >
          愿由ъ옄 ?ㅼ젙 ???        </button>

        <p
          id="settingsStatus"
          class="admin-status"
        ></p>
      </section>

      <section class="admin-card">
        <h2>?뮶 諛깆뾽 / 蹂듭썝</h2>

        <p class="admin-hint">
          ?꾩옱 ?깅줉??寃뚯엫???꾨옒 ?뺤떇?쇰줈 ?대낫?낅땲??
        </p>

        <div class="admin-format-box">
          ??쒖씠由?| 寃?됱뼱 | ?대?吏URL | keywords | ?쒖쇅??| ?ㅼ쐞移섏젙梨?        </div>

        <p class="admin-hint">
          ?대낫???띿뒪?몃? 蹂꾨룄濡?蹂닿??섎㈃ ?섏쨷??遺숈뿬?ｊ린 諛⑹떇?쇰줈
          ?ㅼ떆 ?깅줉?????덉뒿?덈떎. 媛寃⑹? 蹂듭썝 ??理쒖떊媛믪쑝濡??ㅼ떆
          ?섏쭛?⑸땲??
        </p>

        <div class="admin-row admin-row-wrap">
          <button
            id="exportBtn"
            class="btn"
            type="button"
          >
            燧놅툘 紐⑸줉 ?대낫?닿린
          </button>

          <button
            id="exportTxtBtn"
            class="btn"
            type="button"
          >
            ?뱞 TXT ???          </button>

          <button
            id="exportCsvBtn"
            class="btn"
            type="button"
          >
            ?뱤 CSV ???          </button>
        </div>

        <textarea
          id="exportArea"
          class="admin-textarea"
          rows="8"
          placeholder="?대낫?닿린 踰꾪듉???꾨Ⅴ硫??ш린??紐⑸줉???쒖떆?⑸땲??"
        ></textarea>

        <p
          id="exportStatus"
          class="admin-status"
        ></p>

        <hr class="admin-hr" />

        <h3>?삼툘 遺숈뿬?ｊ린濡?蹂듭썝</h3>

        <p class="admin-hint">
          諛깆뾽???댁슜????以꾩뿉 ??寃뚯엫??遺숈뿬?ｌ쑝?몄슂.
          癒쇱? 誘몃━蹂닿린瑜??ㅽ뻾?????ㅼ젣 ??ν븯??寃껋쓣 沅뚯옣?⑸땲??
        </p>

        <textarea
          id="importPasteArea"
          class="admin-textarea"
          rows="10"
          placeholder="??&#10;?⑷낵 媛숈씠 2 | ?⑷낵 媛숈씠 2 | https://.../img.jpg | ?⑷낵媛숈씠,2 | |&#10;?섎뱺留?| ?섎뱺留?| | | ?섏씠?몃젅??|&#10;007 ?쇱뒪?몃씪?댄듃 | | https://.../img.jpg | | | s2"
        ></textarea>

        <div class="admin-row admin-row-wrap">
          <button
            id="pastePreviewBtn"
            class="btn"
            type="button"
          >
            ?뵇 遺숈뿬?ｊ린 誘몃━蹂닿린
          </button>

          <button
            id="pasteImportBtn"
            class="btn btn-primary"
            type="button"
          >
            燧뉛툘 遺숈뿬?ｊ린濡??ㅼ젣 ???          </button>
        </div>

        <p
          id="pasteStatus"
          class="admin-status"
        ></p>

        <div
          id="pasteResult"
          class="import-result"
        ></div>
      </section>

      <section class="admin-card admin-danger-zone">
        <h2>?좑툘 ?꾪뿕 援ъ뿭</h2>

        <p class="admin-hint">
          紐⑤뱺 寃뚯엫쨌?먮뵒?샕룰?寃㈑룹씠???곗씠?곕? ??젣?⑸땲??
          ?덊띁??ID? ?꾩뿭 ?섏쭛 ?꾪꽣 ?ㅼ젙? ?좎??⑸땲??
          ???묒뾽? ?섎룎由????놁쑝誘濡?諛섎뱶??癒쇱? 諛깆뾽?섏꽭??
        </p>

        <button
          id="resetAllBtn"
          class="btn btn-danger"
          type="button"
        >
          ?꾩껜 ?곗씠??珥덇린??        </button>

        <p
          id="resetStatus"
          class="admin-status"
        ></p>
      </section>
    </section>

    <!-- ?붾㈃ ?뚮┝ -->
    <div
      id="adminToast"
      class="admin-toast"
      role="status"
      aria-live="polite"
      hidden
    ></div>
  </main>

	<script src="/static/admin.js?v=20260724-naver-preorder-v1"></script>
	<script src="/static/watcher-admin.js?v=20260722-watcher-script-fix-1"></script>
	<script src="/static/preorder-admin.js?v=20260724-naver-preorder-v1"></script>
</body>
</html>`
}
