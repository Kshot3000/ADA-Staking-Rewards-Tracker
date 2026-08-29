# Cloudflare Worker — Koios CORS Proxy

This worker proxies requests to the Koios Cardano API and adds CORS headers so the GitHub Pages site can fetch data from the browser.

## Deploy in ~2 minutes

1. Go to [https://dash.cloudflare.com](https://dash.cloudflare.com) and sign in (free account)
2. Click **Workers & Pages** → **Overview** → **Create Application** → **Create Worker**
3. Name it something like `ada-proxy`
4. Click **Deploy**
5. Click **Edit code** and replace everything with the contents of `worker.js`
6. Click **Deploy** again
7. Your worker URL will be: `https://ada-proxy.YOUR_ACCOUNT.workers.dev`
8. Open `app.js` in the parent folder and set:
   ```js
   const PROXY_URL = 'https://ada-proxy.YOUR_ACCOUNT.workers.dev/koios';
   ```
9. Commit and push

## How it works

- Accepts requests only from `*.github.io` origins (plus localhost for dev)
- Forwards requests to `api.koios.rest/api/v1`
- Adds `Access-Control-Allow-Origin` headers to all responses
- Free tier handles 100,000 requests/day — more than enough for this site

## Alternative: Google Apps Script

If you don't want to use Cloudflare, you can use Google Apps Script instead:

1. Go to [script.google.com](https://script.google.com) → **New project**
2. Paste this code:
```javascript
function doGet(e) {
  var params = JSON.parse(e.parameter.params || '{}');
  var path = e.parameter.path;
  var url = 'https://api.koios.rest/api/v1' + path;
  var options = {
    method: 'GET',
    contentType: 'application/json',
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  return ContentService.createTextOutput(response.getContentText())
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*');
}

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
  return ContentService.createTextOutput(response.getContentText())
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*');
}
```
3. Click **Deploy** → **New deployment** → Gear icon → **Web app**
4. **Execute as**: Me → **Who has access**: Anyone
5. Click **Deploy** → copy the Web App URL
6. Update `app.js` to use GAS mode:
   ```js
   const PROXY_URL = 'YOUR_WEB_APP_URL';
   const PROXY_MODE = 'gas';  // Add this line
   ```
7. Commit and push

> ⚠️ Google Apps Script has slower cold starts (5-10s on first request) but is completely free.
