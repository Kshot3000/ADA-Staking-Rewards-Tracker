# ADA Staking Rewards Tracker

Track your personal Cardano staking rewards per epoch. Connect a CIP-30 wallet (Nami, Eternl, Yoroi, Flint) or paste any `addr1...` / `stake1...` address.

## Features

- 📊 **Per-epoch rewards chart** with 60 / 120 / All toggle
- 💰 **Lifetime rewards total** and average per epoch
- 🏊 **Stake pool tracking** — see which pool earned your rewards
- 🔗 **Wallet connect** via CIP-30 standard
- 📋 **Paste any address** — no wallet required
- 🎨 **Dark glassmorphism UI** inspired by pool.pm, pooltool.io, cardanoscan.io

## ⚡ Quick Deploy

This is a static site — just push to GitHub and enable Pages.

### Step 1: Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. **Source**: Deploy from branch → `main` → `/ (root)` → **Save**
3. Your site will be at `https://kshot3000.github.io/ADA-Staking-Rewards-Tracker/`

### Step 2: Set up the CORS Proxy (required)

The Koios API doesn't send CORS headers, so browser fetch calls are blocked. You need a tiny proxy. **Pick one:**

#### Option A: Cloudflare Worker (recommended — free, fast, reliable)

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) (free account)
2. **Workers & Pages** → **Create Application** → **Create Worker**
3. Name it `ada-proxy` → **Deploy**
4. Click **Edit code** and paste the contents of [`cloudflare-worker/worker.js`](cloudflare-worker/worker.js)
5. **Deploy** again
6. Your worker URL: `https://ada-proxy.YOUR_ACCOUNT.workers.dev`
7. Open [`app.js`](app.js) and set:
   ```js
   const PROXY_URL = 'https://ada-proxy.YOUR_ACCOUNT.workers.dev/koios';
   ```
8. Commit and push

#### Option B: Google Apps Script (no Cloudflare account needed)

1. Go to [script.google.com](https://script.google.com) → **New project**
2. Paste this code:
   ```javascript
   function doPost(e) {
     var path = e.parameter.path;
     var body = e.postData.contents;
     var url = 'https://api.koios.rest/api/v1' + path;
     var options = {
       method: 'POST',
       contentType: 'application/json',
       payload: body,
       muteHttpExceptions: true
     };
     var response = UrlFetchApp.fetch(url, options);
     var content = response.getContentText();
     return ContentService.createTextOutput(content)
       .setMimeType(ContentService.MimeType.JSON)
       .setHeader('Access-Control-Allow-Origin', '*');
   }
   
   function doGet(e) {
     var path = e.parameter.path;
     var url = 'https://api.koios.rest/api/v1' + path;
     var response = UrlFetchApp.fetch(url);
     return ContentService.createTextOutput(response.getContentText())
       .setMimeType(ContentService.MimeType.JSON)
       .setHeader('Access-Control-Allow-Origin', '*');
   }
   ```
3. **Deploy** → **New deployment** → **Web app**
4. **Execute as**: Me → **Who has access**: Anyone
5. Copy the web app URL
6. Open [`app.js`](app.js) and set:
   ```js
   const PROXY_URL = 'YOUR_WEB_APP_URL';
   ```
   > Note: For GAS, set `PROXY_MODE = 'gas'` in `app.js` too — the app already appends `?path=...` to the URL in that mode.

7. Commit and push

### Step 3: Push to GitHub

```bash
git add .
git commit -m "Setup CORS proxy and improve UI"
git push
```

## File Structure

```
├── index.html              # Main page with Tailwind CSS UI
├── core.js                 # Pure helpers: bech32 + CIP-30 hex→bech32, validation, amounts
├── app.js                  # Application logic, API calls, Chart.js
├── 404.html                # Project-scoped not-found bounce
├── cloudflare-worker/
│   ├── worker.js           # CORS proxy for Koios API
│   └── README.md           # Worker setup guide
├── tests/
│   └── smoke.test.mjs      # Node tests (bech32 round-trip, API-shape + hygiene guards)
├── README.md               # This file
└── .nojekyll               # Disable Jekyll processing
```

## API

Data is fetched from the [Koios Cardano API](https://api.koios.rest). Endpoints used:

| Endpoint | Method | Purpose |
|---|---|---|
| `/tip` | GET | Current chain tip (epoch number) |
| `/address_info` | POST `{_addresses: […]}` | Resolve payment address → stake address |
| `/account_reward_history` | POST `{_stake_addresses: […]}` | Full rewards history per epoch |
| `/epoch_info` | GET | Epoch metadata (start times, etc.) |

> The two list endpoints are POST-only in Koios v1 — the address array goes in the JSON body. A GET with `?_addresses=[…]` is rejected by PostgREST ("malformed array literal"); this was verified live and fixed on 2026-10-02.

## Tests

```bash
node --test tests/smoke.test.mjs
```

Covers the bech32 encoder (round-tripped against an independent BIP-173 decoder on real mainnet addresses), CIP-30 hex→bech32 wallet conversion, checksum-verified address validation (every single-character mutation of the real addresses must be rejected), address classification (payment/stake × mainnet/testnet), chart-range state, and guards that the Koios POST endpoint shapes, textContent-only table rendering, and versioned asset URLs stay in place.

## Notes

- **Address validation:** `core.js` verifies the BIP-173 checksum and payload size, not just the address shape — a one-character typo is rejected up front with a "checksum did not verify" message instead of failing inside a Koios lookup.
- **Mainnet only:** this tracker queries mainnet Koios. Testnet addresses (`addr_test1…` / `stake_test1…`) are recognized and answered with an explicit testnet message, never sent to the mainnet API.
- **Wallet connect:** CIP-30 wallets return hex-encoded address bytes; `core.js` converts them to bech32 (`addr1…` / `stake1…`, mainnet and testnet) before lookup.
- **CORS:** Koios sends no `Access-Control-Allow-Origin` header (verified), so a proxy (Step 2 above) is required for browser use — without one, lookups fail with a CORS error message explaining the fix.

Built by [@kshot9000](https://x.com/kshot9000) · [github.com/Kshot3000](https://github.com/Kshot3000)

## Donate

If you find this useful, consider donating ADA:

```
addr1q8hnl6vl5a6k3rw3n5g3jtte696zcl76kfatzv7gpswa9r0dj7fma6klq55y4ffm7tf0em09udnyhuk4ah92pl5x9jpqjae44v
```

## License

MIT
