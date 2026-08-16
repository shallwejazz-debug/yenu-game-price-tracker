# YEONU DEAL Cloudflare production configuration

Archive baseline: `132e1e85a8faa388902ee35ad4883b1f61649a9d` (`yeonudeal-archive-2026-08`).

This document covers **YEONU DEAL only**. Do not use it to inspect, restore, or alter any YEONU LAB resource.

## Pages

| Setting | Value |
| --- | --- |
| Project | `yenu-game-price-tracker` |
| Production branch | `main` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Compatibility date | `2026-04-26` |
| Compatibility flags | `nodejs_compat` |
| Production URLs | `https://yeonudeal.com`, `https://www.yeonudeal.com`, `https://yenu-game-price-tracker.pages.dev` |

Pages Functions are emitted by the Hono/Vite build; there is no separately deployed Worker for this service.

## Persistent bindings

| Binding | Resource | Restore requirement |
| --- | --- | --- |
| `DB` | D1 `webapp-production` (`c02e6277-0285-4043-92a1-489fc9bfb731`) | Required |
| `GAME_IMAGES` | R2 `yeonudeal-game-images` | Required for stored watcher/game images |

No KV namespace, Durable Object, Queue, Images binding, external database, or Pages cron trigger is configured for this Pages project.

## Routes and DNS snapshot (2026-08-16)

| Name | Type | Target | Proxy |
| --- | --- | --- | --- |
| apex `yeonudeal.com` | CNAME | `yenu-game-price-tracker.pages.dev` | Proxied |
| `www` | CNAME | `yenu-game-price-tracker.pages.dev` | Proxied |
| `lab` | CNAME | `yeonu-lab.pages.dev` | Proxied |
| apex `yeonudeal.com` | TXT | Google site-verification record | DNS only |

The `lab` record is listed only to prevent accidental collision. It is outside this archive's scope and must not be changed during YEONU DEAL restoration.

