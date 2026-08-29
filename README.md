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
   > Note: For GAS, you'll need to update `app.js` to append `?path=...` to the URL. See the GAS-specific branch or ask for help.

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
├── app.js                  # Application logic, API calls, Chart.js
├── cloudflare-worker/
│   ├── worker.js           # CORS proxy for Koios API
│   └── README.md           # Worker setup guide
├── README.md               # This file
└── .nojekyll              # Disable Jekyll processing
```

## API

Data is fetched from the [Koios Cardano API](https://api.koios.rest). Endpoints used:

| Endpoint | Purpose |
|---|---|
| `GET /tip` | Current chain tip (epoch number) |
| `GET /address_info` | Resolve payment address → stake address |
| `GET /account_reward_history` | Full rewards history per epoch |
| `GET /epoch_info` | Epoch metadata (start times, etc.) |

## Donate

If you find this useful, consider donating ADA:

```
addr1q8hnl6vl5a6k3rw3n5g3jtte696zcl76kfatzv7gpswa9r0dj7fma6klq55y4ffm7tf0em09udnyhuk4ah92pl5x9jpqjae44v
```

## License

MIT
