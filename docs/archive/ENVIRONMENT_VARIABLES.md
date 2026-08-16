# YEONU DEAL environment-variable checklist

Values are intentionally **not stored** in this repository, SQL dump, or archive manifest.

| Name | Type | Purpose | Required | Where to obtain |
| --- | --- | --- | --- | --- |
| `ADMIN_TOKEN` | Cloudflare Pages secret | Protects administrator API/UI requests | Yes for administration | Create a new high-entropy token before restore |
| `NAVER_CLIENT_ID` | Cloudflare Pages secret | Naver Shopping Search API client identity | Yes for automated Naver search/import | Naver Developers application credentials |
| `NAVER_CLIENT_SECRET` | Cloudflare Pages secret | Naver Shopping Search API client secret | Yes for automated Naver search/import | Naver Developers application credentials |
| `COUPANG_PARTNERS_ID` | Optional runtime secret | Coupon/affiliate redirect parameter | Optional | Affiliate program account |
| `GMARKET_ESM_ID` | Optional runtime secret | Gmarket affiliate redirect parameter | Optional | Affiliate program account |
| `ELEVENST_AFFILIATE_ID` | Optional runtime secret | 11st affiliate redirect parameter | Optional | Affiliate program account |

The production Pages dashboard snapshot contained the first three names. The affiliate values are code-supported optional variables; they may alternatively be stored in the D1 `settings` table.

