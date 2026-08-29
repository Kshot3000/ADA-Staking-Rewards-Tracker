# Cloudflare Worker — Koios CORS Proxy

This worker proxies requests to the Koios Cardano API and adds CORS headers so the GitHub Pages site can fetch data from the browser.

## Deploy in ~2 minutes

1. Go to [https://dash.cloudflare.com](https://dash.cloudflare.com) and sign in (free account)
2. Click **Workers & Pages** → **Overview** → **Create Application** → **Create Worker**
3. Name it something like `ada-proxy`
4. Click **Deploy**
5. Go to **Settings** → **Variables** → Add these:
   - No variables needed, the worker is self-contained
6. Replace the default worker code with the contents of `worker.js`
7. Click **Deploy**
8. Your worker will be at `https://ada-proxy.YOUR_ACCOUNT.workers.dev`
9. Update `PROXY_URL` in `app.js` to point to your worker URL

## How it works

- Accepts requests only from `*.github.io` origins (plus localhost for dev)
- Forwards requests to `api.koios.rest/api/v1`
- Adds `Access-Control-Allow-Origin` headers to all responses
- Free tier handles 100,000 requests/day — more than enough for this site
