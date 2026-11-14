# Mesiai — AI & Web Portfolio

**A bilingual Persian/English portfolio website for Meysam, built for Cloudflare Workers.**

[View the live site](https://mesiai.meysamebadii58.workers.dev/) · [LinkedIn](https://www.linkedin.com/in/meysam-hoseini-9bb31044b/) · [Karlancer](https://karlancer.com/profile/1454366) · [Ponisha](https://ponisha.ir/profile/MeysamAi)

## فارسی

Mesiai یک سایت معرفی خدمات دوزبانه برای میثم است که برای اجرا روی Cloudflare Workers آماده شده. رابط فارسی و انگلیسی، پس‌زمینهٔ کیهانی، حرکت‌های تعاملی، طراحی واکنش‌گرا و محتوای ساختاریافته برای معرفی خدمات را در یک تجربهٔ سبک و بدون وابستگی به کتابخانه‌های فرانت‌اند ارائه می‌کند.

## Features

- Persian RTL and English LTR pages with language switching
- Responsive layout and reduced-motion support
- Interactive service visuals for Python, n8n, AI agents, websites, and mobile apps
- FAQ and privacy pages, metadata, structured data, canonical/hreflang, and robots configuration
- Cloudflare Worker endpoints with request validation, rate limiting, and security headers
- Python build scripts and Node-based Worker tests

The interactive service previews are visual demonstrations, not client case studies. Portfolio, product, and blog sections are intentionally empty until real work is ready to publish.

## Current feature status

- **Chat:** Uses prepared FAQ responses. Live generative AI is disabled in production.
- **Lead capture and discount popup:** Disabled until the owner configures the private Apps Script endpoint and matching secrets in Cloudflare and Apps Script. The repository contains no deployment URL or secret. No visitor lead data is currently collected or forwarded.
- **Contact brief:** Generated in the visitor's browser; it is not submitted to the owner.

## Stack

HTML · CSS · JavaScript · Python · Cloudflare Workers · Wrangler · Node.js

## Run locally

Requirements: Python 3 and Node.js.

```bash
python3 build.py
python3 bundle_worker.py
python3 -m http.server 8080 --directory public
```

The static preview does not run Worker APIs. To run the Worker locally, configure Wrangler and use:

```bash
npx wrangler dev
```

To deploy, authenticate Wrangler with the intended Cloudflare account and run:

```bash
npx wrangler deploy
```

## Private configuration

Keep deployment-specific values out of Git. Configure them in Cloudflare Worker settings or local `.dev.vars` as appropriate:

- `LEADS_WEBHOOK_URL`: the owner's Apps Script Web App URL
- `LEADS_SHARED_SECRET`: a secret shared with Apps Script Script Properties

Do not commit `.dev.vars`, API keys, secrets, personal CRM links, or visitor data. Lead capture remains disabled unless both required values are configured correctly. Keep `AI_ENABLED=false` until the live Cloudflare AI binding has been verified.

## Project structure

- `build.py` — generates Persian and English pages
- `public/` — website pages and static assets
- `worker.mjs` — Worker routes, request validation, rate limiting, and response headers
- `wrangler.jsonc` — non-secret Wrangler configuration
- `bundle_worker.py` — creates a self-contained Worker bundle
- `tests/worker.test.mjs` — Worker tests

The Apps Script/CRM receiver and private Sheet configuration are intentionally not included in this public repository.

## License

No open-source license is included. All rights remain with the owner unless a license is added.
