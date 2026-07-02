// ============================================================
// 행 삽입형 펼침 (방식 B)
// public/static/app.js
//   - 카드 모양/크기는 그대로 유지 (그리드 흔들림 없음)
//   - 클릭한 카드가 속한 "행(row)" 바로 아래에 상세 패널을 삽입
//   - 다른 카드 클릭 시 패널이 그 행으로 이동, 같은 카드 재클릭 시 닫힘
// ============================================================

(function () {
  'use strict'

  const won = (n) =>
    n === null || n === undefined ? '-' : '₩' + Number(n).toLocaleString('ko-KR')

  function discountRate(price, original) {
    if (!original || original <= 0 || price >= original) return null
    return Math.round((1 - price / original) * 100)
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // 현재 펼쳐진 상태
  let openGameId = null
  let panelEl = null // 삽입된 패널 li
  const cache = {} // gameId -> API data

  // ---------- 가격 섹션 ----------
  function renderSection(title, icon, section, original) {
    const rows = section.rows || []
    if (rows.length === 0) {
      return `<section class="price-section">
          <h2><span class="section-icon">${icon}</span> ${title}</h2>
          <p class="no-data">등록된 ${title} 가격이 없습니다.</p>
        </section>`
    }
    // 역대최저가 + 날짜 맥락 (예: "오늘 🔥" / "1년 6개월 전 · 갱신될 수 있음")
    let lowestEverHtml = ''
    if (section.lowestEver != null) {
      const ctx = section.lowestDateContext
      const ctxHtml = ctx
        ? `<span class="lowest-date ${ctx.fresh ? 'fresh' : ''} ${ctx.stale ? 'stale' : ''}">${escapeHtml(
            ctx.text
          )}</span>`
        : section.lowestDate
        ? `<span class="lowest-date">(${section.lowestDate.slice(0, 10)})</span>`
        : ''
      lowestEverHtml = `<div class="lowest-info">역대 최저가: <strong>${won(
        section.lowestEver
      )}</strong> ${ctxHtml}</div>`
    }
    const rowsHtml = rows
      .map((r) => {
        const rate = discountRate(r.price, original)
        const isLowest = section.currentLowest != null && r.price <= section.currentLowest
        const buy = r.go_url
          ? `<a class="buy-link" href="${r.go_url}" target="_blank" rel="noopener">구매 →</a>`
          : ''
        return `<li class="price-row">
            <span class="source-name">${escapeHtml(r.sourceLabel)}</span>
            <span class="price-value">${won(r.price)}${
          rate !== null ? `<span class="discount">-${rate}%</span>` : ''
        }${isLowest ? '<span class="lowest-badge">최저</span>' : ''}</span>
            ${buy}
          </li>`
      })
      .join('')
    return `<section class="price-section">
        <h2><span class="section-icon">${icon}</span> ${title}</h2>
        ${lowestEverHtml}
        <ul class="price-list">${rowsHtml}</ul>
      </section>`
  }

  // 인사이트 배너 (디지털 vs 패키지 비교 한 줄)
  function renderInsight(insight) {
    if (!insight) return ''
    return `<div class="insight-banner insight-${insight.tone}">
        <span class="insight-icon">${insight.tone === 'buy' ? '⚡' : insight.tone === 'wait' ? '⏳' : 'ℹ️'}</span>
        <span class="insight-text">${escapeHtml(insight.text)}</span>
      </div>`
  }

  // 그래프에 쓸 데이터가 충분한지 (서로 다른 날짜 2개 이상)
  function trendUsable(trend) {
    if (!trend) return false
    const dates = new Set()
    ;(trend.digital || []).forEach((d) => dates.add(d.date))
    ;(trend.package || []).forEach((d) => dates.add(d.date))
    return dates.size >= 2
  }

  function renderTrendBlock(ed) {
    const usable = trendUsable(ed.trend)
    if (!usable) {
      return `<section class="trend-section">
          <h2><span class="section-icon">📈</span> 가격 추이 (최근 6개월)</h2>
          <p class="trend-empty">아직 추이를 그릴 만큼 가격 기록이 쌓이지 않았습니다. 가격이 수집될수록 그래프가 채워집니다.</p>
        </section>`
    }
    // 캔버스만 두고, 렌더 후 drawTrendChart 로 그림
    return `<section class="trend-section">
        <h2><span class="section-icon">📈</span> 가격 추이 (최근 6개월)</h2>
        <div class="trend-chart-wrap"><canvas class="trend-canvas"></canvas></div>
      </section>`
  }

  function renderEditionDetail(ed, original) {
    return `${renderInsight(ed.insight)}
      <div class="price-sections">
        ${renderSection('디지털', '💾', ed.digital, original)}
        ${renderSection('패키지', '📦', ed.package, original)}
      </div>
      ${renderTrendBlock(ed)}`
  }

  // ---------- 가격 추이 차트 그리기 (Chart.js) ----------
  const chartRegistry = new WeakMap() // canvas -> Chart 인스턴스
  function drawTrendChart(container, ed) {
    if (typeof Chart === 'undefined') return
    const canvas = container.querySelector('.trend-canvas')
    if (!canvas || !ed.trend) return

    // 이전 차트 정리
    const prev = chartRegistry.get(canvas)
    if (prev) prev.destroy()

    // 모든 날짜를 합쳐 x축 라벨 구성
    const map = {} // date -> {digital, package}
    ;(ed.trend.digital || []).forEach((d) => {
      ;(map[d.date] = map[d.date] || {}).digital = d.price
    })
    ;(ed.trend.package || []).forEach((d) => {
      ;(map[d.date] = map[d.date] || {}).package = d.price
    })
    const labels = Object.keys(map).sort()
    const digitalData = labels.map((d) => (map[d].digital != null ? map[d].digital : null))
    const packageData = labels.map((d) => (map[d].package != null ? map[d].package : null))

    const ds = []
    if (digitalData.some((v) => v != null)) {
      ds.push({
        label: '디지털',
        data: digitalData,
        borderColor: '#4f7cff',
        backgroundColor: 'rgba(79,124,255,.15)',
        tension: 0.25,
        spanGaps: true,
        pointRadius: 3,
      })
    }
    if (packageData.some((v) => v != null)) {
      ds.push({
        label: '패키지',
        data: packageData,
        borderColor: '#ff9f43',
        backgroundColor: 'rgba(255,159,67,.15)',
        tension: 0.25,
        spanGaps: true,
        pointRadius: 3,
      })
    }

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: labels.map((d) => d.slice(5)), datasets: ds }, // MM-DD 표기
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#cdd1d8', boxWidth: 14 } },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: ₩${Number(ctx.parsed.y).toLocaleString('ko-KR')}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: '#9aa0aa', maxTicksLimit: 8 }, grid: { color: '#22262f' } },
          y: {
            ticks: {
              color: '#9aa0aa',
              callback: (v) => '₩' + Number(v).toLocaleString('ko-KR'),
            },
            grid: { color: '#22262f' },
          },
        },
      },
    })
    chartRegistry.set(canvas, chart)
  }

  function renderDetail(data, preferredPlatform) {
    const game = data.game
    const editions = data.editions || []
    if (editions.length === 0) {
      return `<div class="row-panel-inner"><p class="no-data">등록된 플랫폼이 없습니다.</p></div>`
    }
    let activeIdx = editions.findIndex((e) => e.platform === preferredPlatform)
    if (activeIdx < 0) activeIdx = 0

    const switchHtml = editions
      .map(
        (e, i) =>
          `<button type="button" class="platform-pill ${i === activeIdx ? 'active' : ''}" data-edition-idx="${i}">
            ${e.platformIcon} ${e.platformLabel}
          </button>`
      )
      .join('')

    // 이 게임이 가진 모든 플랫폼 아이콘 (한눈에 어떤 기종으로 나오는지)
    const allPlatformsHtml = editions
      .map((e) => `<span class="header-plat" title="${escapeHtml(e.platformLabel)}">${e.platformIcon}</span>`)
      .join('')

    const headerHtml = `<div class="panel-header">
        <div class="panel-title">
          ${game.image_url ? `<img src="${game.image_url}" alt="" class="panel-thumb" />` : ''}
          <div class="panel-title-text">
            <h3>${escapeHtml(game.title)}</h3>
            <div class="panel-platforms">${allPlatformsHtml}</div>
            <div class="panel-meta">
              ${game.genre ? `<span class="meta-chip genre">${escapeHtml(game.genre)}</span>` : ''}
              ${game.release_date ? `<span class="meta-chip">출시 ${escapeHtml(game.release_date)}</span>` : ''}
              ${game.original_price ? `<span class="meta-chip">정가 ${won(game.original_price)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="panel-actions">
          <button type="button" class="wishlist-btn" data-game-id="${game.id}" aria-label="알림받기">
            <span class="wl-icon">♡</span> 알림받기
          </button>
          <a class="detail-full-link" href="/games/${game.id}/${editions[activeIdx].platform}">전체 ↗</a>
          <button type="button" class="panel-close" aria-label="닫기">✕</button>
        </div>
      </div>`

    return `<div class="row-panel-inner">
        ${headerHtml}
        <nav class="platform-switch">${switchHtml}</nav>
        <div class="edition-body">${renderEditionDetail(editions[activeIdx], game.original_price)}</div>
        <p class="notice">※ 디지털 가격은 정보 제공용, 패키지 가격은 한국 쇼핑몰 비교입니다.<br>※ 이 사이트는 쿠팡 파트너스 등 제휴 마케팅 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.</p>
      </div>`
  }

  // ---------- 클릭한 카드와 같은 행의 "마지막 카드" 찾기 ----------
  function lastCardInRow(card, allCards) {
    const top = card.offsetTop
    let last = card
    for (const c of allCards) {
      // 같은 행 = offsetTop 비슷함 (오차 허용)
      if (Math.abs(c.offsetTop - top) < 4) {
        if (c.offsetLeft >= last.offsetLeft) last = c
      }
    }
    return last
  }

  // ---------- 패널 닫기 ----------
  function closePanel() {
    // 1) 열린 카드 표시 해제
    if (openGameId != null) {
      const prev = document.querySelector(`.game-card[data-game-id="${openGameId}"]`)
      if (prev) {
        prev.classList.remove('open')
        const t = prev.querySelector('.game-card-trigger')
        if (t) t.setAttribute('aria-expanded', 'false')
      }
    }
    openGameId = null

    // 2) 패널 접고 제거
    const toRemove = panelEl
    panelEl = null
    if (!toRemove) return

    // 현재 높이를 픽셀로 고정한 뒤(none이어도) 0으로 보내 애니메이션
    const startH = toRemove.scrollHeight
    toRemove.style.maxHeight = startH + 'px'
    // 강제 reflow → 트랜지션이 확실히 동작하도록
    void toRemove.offsetHeight
    toRemove.style.maxHeight = '0px'

    let removed = false
    const remove = () => {
      if (removed) return
      removed = true
      if (toRemove.parentNode) toRemove.parentNode.removeChild(toRemove)
    }
    toRemove.addEventListener('transitionend', remove, { once: true })
    // transitionend가 안 터지는 경우(이미 0이거나 none) 대비 fallback
    setTimeout(remove, 320)
  }

  // ---------- 카드 클릭 ----------
  async function onCardClick(card) {
    const gameId = card.dataset.gameId
    const platform = card.dataset.platform || 'pc'
    const grid = card.closest('.game-grid')
    if (!grid) return

    // 같은 카드 재클릭 → 닫기
    if (String(openGameId) === String(gameId)) {
      closePanel()
      return
    }

    // 다른 게 열려 있으면 먼저 닫기 (즉시 제거 — 행 계산 정확하게)
    if (panelEl && panelEl.parentNode) {
      panelEl.parentNode.removeChild(panelEl)
      panelEl = null
    }
    if (openGameId != null) {
      const prev = document.querySelector(`.game-card[data-game-id="${openGameId}"]`)
      if (prev) {
        prev.classList.remove('open')
        const pt = prev.querySelector('.game-card-trigger')
        if (pt) pt.setAttribute('aria-expanded', 'false')
      }
    }

    openGameId = gameId
    card.classList.add('open')
    const trigger = card.querySelector('.game-card-trigger')
    if (trigger) trigger.setAttribute('aria-expanded', 'true')

    // 패널 li 생성 (그리드 전체 폭 차지)
    panelEl = document.createElement('li')
    panelEl.className = 'row-panel'
    panelEl.innerHTML = '<div class="row-panel-inner"><p class="accordion-loading">불러오는 중…</p></div>'

    // 같은 행 마지막 카드 뒤에 삽입
    const allCards = Array.from(grid.querySelectorAll('.game-card'))
    const last = lastCardInRow(card, allCards)
    last.insertAdjacentElement('afterend', panelEl)

    // 펼침 애니메이션 시작 (max-height 0 → 내용 높이)
    panelEl.style.maxHeight = '0px'

    // 데이터 로드
    let data = cache[gameId]
    try {
      if (!data) {
        const res = await fetch(`/api/games/${gameId}`)
        if (!res.ok) throw new Error('HTTP ' + res.status)
        data = await res.json()
        cache[gameId] = data
      }
      // 패널이 그 사이 닫혔으면 중단
      if (!panelEl || String(openGameId) !== String(gameId)) return
      panelEl.innerHTML = renderDetail(data, platform)
      bindPanel(panelEl, data, card)
      // 현재 활성 에디션 그래프 그리기
      const body0 = panelEl.querySelector('.edition-body')
      const activeEd0 = currentEdition(panelEl, data, platform)
      if (body0 && activeEd0) drawTrendChart(body0, activeEd0)
    } catch (err) {
      if (panelEl) {
        panelEl.innerHTML = `<div class="row-panel-inner"><p class="no-data">가격 정보를 불러오지 못했습니다. (${escapeHtml(
          err.message
        )})</p></div>`
      }
    }

    // 높이 애니메이션
    if (panelEl) {
      requestAnimationFrame(() => {
        if (panelEl) panelEl.style.maxHeight = panelEl.scrollHeight + 'px'
      })
      panelEl.addEventListener(
        'transitionend',
        function handler() {
          if (panelEl) panelEl.style.maxHeight = 'none'
          if (panelEl) panelEl.removeEventListener('transitionend', handler)
        },
        { once: true }
      )
      // 패널이 보이도록 살짝 스크롤
      setTimeout(() => {
        if (panelEl) panelEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 120)
    }
  }

  // 활성 플랫폼 핀에 해당하는 에디션 객체
  function currentEdition(panel, data, preferredPlatform) {
    const editions = data.editions || []
    if (editions.length === 0) return null
    const active = panel.querySelector('.platform-pill.active')
    if (active) {
      const idx = Number(active.dataset.editionIdx)
      if (editions[idx]) return editions[idx]
    }
    const i = editions.findIndex((e) => e.platform === preferredPlatform)
    return editions[i >= 0 ? i : 0]
  }

  // ---------- 패널 내부 핸들러 (플랫폼 전환 + 닫기) ----------
  function bindPanel(panel, data, card) {
    const pills = panel.querySelectorAll('.platform-pill')
    const body = panel.querySelector('.edition-body')
    const fullLink = panel.querySelector('.detail-full-link')
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const idx = Number(pill.dataset.editionIdx)
        const ed = data.editions[idx]
        if (!ed) return
        pills.forEach((p) => p.classList.remove('active'))
        pill.classList.add('active')
        body.innerHTML = renderEditionDetail(ed, data.game.original_price)
        if (fullLink) fullLink.setAttribute('href', `/games/${data.game.id}/${ed.platform}`)
        // 전환된 에디션의 그래프 다시 그리기
        drawTrendChart(body, ed)
        // 높이 재조정
        if (panel) {
          panel.style.maxHeight = 'none'
        }
      })
    })
    const closeBtn = panel.querySelector('.panel-close')
    if (closeBtn) closeBtn.addEventListener('click', () => closePanel())

    // 위시리스트(알림받기) 버튼 — 현재는 로컬 저장 + 안내 (실제 이메일 알림은 추후 회원/Resend 연동)
    const wlBtn = panel.querySelector('.wishlist-btn')
    if (wlBtn) {
      const gid = wlBtn.dataset.gameId
      if (isWished(gid)) markWished(wlBtn, true)
      wlBtn.addEventListener('click', () => {
        const now = toggleWish(gid)
        markWished(wlBtn, now)
        toast(now ? '관심 목록에 추가했습니다 ♥ (가격 알림은 곧 지원 예정)' : '관심 목록에서 제거했습니다')
      })
    }
  }

  // ---------- 위시리스트 (localStorage 임시) ----------
  const WL_KEY = 'gpt_wishlist'
  function wishSet() {
    try {
      return new Set(JSON.parse(localStorage.getItem(WL_KEY) || '[]'))
    } catch {
      return new Set()
    }
  }
  function isWished(id) {
    return wishSet().has(String(id))
  }
  function toggleWish(id) {
    const s = wishSet()
    const k = String(id)
    if (s.has(k)) s.delete(k)
    else s.add(k)
    localStorage.setItem(WL_KEY, JSON.stringify([...s]))
    return s.has(k)
  }
  function markWished(btn, on) {
    btn.classList.toggle('wished', on)
    const icon = btn.querySelector('.wl-icon')
    if (icon) icon.textContent = on ? '♥' : '♡'
    btn.childNodes.forEach((n) => {
      if (n.nodeType === 3) n.textContent = on ? ' 알림 켜짐' : ' 알림받기'
    })
  }

  // ---------- 간단 토스트 ----------
  let toastTimer
  function toast(msg) {
    let el = document.getElementById('gpt-toast')
    if (!el) {
      el = document.createElement('div')
      el.id = 'gpt-toast'
      el.className = 'gpt-toast'
      document.body.appendChild(el)
    }
    el.textContent = msg
    el.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600)
  }

  // ---------- 초기화 ----------
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.game-card .game-card-trigger').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const card = trigger.closest('.game-card')
        if (card) onCardClick(card)
      })
    })

    // 창 "폭"이 바뀔 때만 패널 닫기 (모바일 주소창 접힘=높이변화는 무시)
    let rt
    let lastW = window.innerWidth
    window.addEventListener('resize', () => {
      // 폭 변화 없으면(=높이만 바뀐 스크롤 상황) 무시
      if (window.innerWidth === lastW) return
      lastW = window.innerWidth
      if (openGameId == null) return
      clearTimeout(rt)
      rt = setTimeout(() => closePanel(), 150)
    })

  })
})()
