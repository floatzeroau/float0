# Deployment

## Infrastructure

| Service    | Platform           | Domain         |
| ---------- | ------------------ | -------------- |
| Engine API | Railway            | api.float0.com |
| Hub        | Cloudflare Pages   | app.float0.com |
| Portal     | Cloudflare Pages   | my.float0.com  |
| Database   | Railway PostgreSQL | (internal)     |
| DNS        | Cloudflare         | float0.com     |

DNS and security are managed via Cloudflare. The float0.com domain nameservers were transferred from GoDaddy to Cloudflare.

## Domain Setup (GoDaddy → Cloudflare)

1. Add float0.com to Cloudflare (free plan)
2. Cloudflare provides two nameservers
3. In GoDaddy: change nameservers to Cloudflare's
4. Wait for propagation (up to 24 hours)

## Railway Setup

1. Create project, add PostgreSQL addon
2. Set environment variables:
   - `DATABASE_URL` — auto-set by Railway PostgreSQL addon
   - `JWT_SECRET` — generate a strong random secret
   - `PORT` — Railway sets this automatically
   - `CORS_ORIGINS` — `https://app.float0.com,https://my.float0.com`
   - `MAILERSEND_API_KEY` — from MailerSend dashboard
   - `SENTRY_DSN` — from Sentry project settings
3. Custom domain: `api.float0.com`
4. Health check: `GET /health`
5. Build config is in `apps/engine/railway.toml`

## Cloudflare Pages Setup

### Hub (app.float0.com)

- Connect GitHub repo (`floatzeroau/float0`)
- Build command: `pnpm install && pnpm turbo run build --filter=@float0/hub`
- Build output directory: `apps/hub/.next`
- Root directory: `/`
- Environment variables: `NODE_VERSION=20`
- Custom domain: `app.float0.com`
- Preview deployments enabled on PRs

### Portal (my.float0.com)

- Connect GitHub repo (`floatzeroau/float0`)
- Build command: `pnpm install && pnpm turbo run build --filter=@float0/portal`
- Build output directory: `apps/portal/.next`
- Root directory: `/`
- Environment variables: `NODE_VERSION=20`
- Custom domain: `my.float0.com`
- Preview deployments enabled on PRs

## Cloudflare DNS Configuration

| Type  | Name | Content                        | Proxy    |
| ----- | ---- | ------------------------------ | -------- |
| CNAME | api  | `<railway-app>.up.railway.app` | Proxied  |
| CNAME | app  | `<hub-project>.pages.dev`      | DNS only |
| CNAME | my   | `<portal-project>.pages.dev`   | DNS only |

- SSL: Full (Strict), minimum TLS 1.2

## Cloudflare Security

### Rate Limiting

WAF custom rule: 100 requests/min per IP on `/auth/*` endpoints.

### Security Headers (Transform Rules)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

### Cache Rules

- `api.float0.com/*` — bypass cache (Cache Rule)
- Static assets on Pages — default Cloudflare caching

### CORS

Allowed origins: `https://app.float0.com`, `https://my.float0.com`, POS app origins.
Configured via `CORS_ORIGINS` env var in the engine.
