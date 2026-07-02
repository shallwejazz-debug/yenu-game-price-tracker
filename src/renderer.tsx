import { jsxRenderer } from 'hono/jsx-renderer'

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>여누딜 - 게임가격트래커</title>
        <meta name="description" content="PS5, 닌텐도 스위치, Xbox, PC 게임 최저가를 한눈에 비교하는 게임가격트래커" />

        {/* Open Graph (카카오톡/티스토리/페이스북 등 링크 카드용) */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="여누딜" />
        <meta property="og:title" content="여누딜 - 게임가격트래커" />
        <meta property="og:description" content="PS5, 닌텐도 스위치, Xbox, PC 게임 최저가를 한눈에 비교" />
        <meta property="og:url" content="https://yeonudeal.com" />

        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎮</text></svg>"
        />
        <link href="/static/style.css" rel="stylesheet" />
      </head>
      <body>
        {children}
        <footer class="site-footer">
          <p>※ 이 사이트는 쿠팡 파트너스 등 제휴 마케팅 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.</p>
        </footer>
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
        <script src="/static/app.js"></script>
      </body>
    </html>
  )
})
