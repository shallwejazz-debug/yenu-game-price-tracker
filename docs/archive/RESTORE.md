# Restore YEONU DEAL

Restore this repository from tag `yeonudeal-archive-2026-08`. Do not reuse or alter any YEONU LAB resources.

## Prerequisites

- Node.js and npm compatible with this repository's lockfile.
- Cloudflare account access for the intended account.
- A D1 database and R2 bucket dedicated to YEONU DEAL.
- The secret names and sources listed in [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md).
- Private archive directory containing the D1 SQL export and R2 object copy.

## Restore procedure

```powershell
git clone https://github.com/shallwejazz-debug/yenu-game-price-tracker.git
cd yenu-game-price-tracker
git checkout yeonudeal-archive-2026-08
npm ci
```

Create or select the D1 database, then set its exact ID in `wrangler.jsonc` and bind it in the Pages project as `DB`. Restore the archive dump to the explicitly named database:

```powershell
npx wrangler d1 execute webapp-production --remote --file <private-backup>\d1-production-2026-08-16.sql
```

Create or select R2 bucket `yeonudeal-game-images`, bind it as `GAME_IMAGES`, then upload each file from `<private-backup>\r2-yeonudeal-game-images` preserving its relative object key.

In Pages project `yenu-game-price-tracker`, add the required secrets by name only, then deploy:

```powershell
npm run build
npx wrangler pages deploy dist --project-name yenu-game-price-tracker
```

Finally, restore the apex and `www` DNS CNAME records from [CLOUDFLARE_CONFIG.md](CLOUDFLARE_CONFIG.md) only when the root domain should serve YEONU DEAL again.

## Smoke-test checklist

- `GET /` redirects to the game list.
- `GET /games?platform=pc` renders and reads D1 data.
- `GET /api/games/:gameId` returns the selected game's editions and prices.
- `GET /go/:priceId` redirects correctly.
- `/admin` rejects requests without `X-Admin-Token` and accepts the configured token.
- Existing R2-backed watcher/game images resolve through the application.
- Naver automatic import/search is tested separately. Mark it **expected unavailable** when the Naver API/provider remains unavailable.
- Preorder/watcher collection is tested separately; upstream provider/API failures are **expected unavailable**, not restore failures.

