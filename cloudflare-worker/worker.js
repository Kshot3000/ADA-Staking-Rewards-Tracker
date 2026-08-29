/**
 * Cloudflare Worker — CORS proxy for Koios Cardano API
 * 
 * Deploy at: https://dash.cloudflare.com/workers
 * Free tier: 100,000 requests/day
 * 
 * This worker forwards requests to Koios and adds CORS headers
 * so the GitHub Pages site can fetch data from the browser.
 */

const KOIOS_BASE = 'https://api.koios.rest/api/v1';
const ALLOWED_ORIGINS = [
  'https://kshot3000.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';

  // Allow known origins and any *.github.io
  const originAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.github.io');
  if (!originAllowed && origin !== '') {
    return new Response('Forbidden', { status: 403 });
  }

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin || '*'),
    });
  }

  // Strip the /koios prefix to get the Koios endpoint path
  const koiosPath = url.pathname.replace(/^\/koios/, '');
  const koiosUrl = new URL(KOIOS_BASE + koiosPath);

  // Forward query parameters
  for (const [key, value] of url.searchParams) {
    koiosUrl.searchParams.set(key, value);
  }

  try {
    const fetchOptions = {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    // Include body for POST requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      fetchOptions.body = await request.text();
    }

    const koiosResponse = await fetch(koiosUrl.toString(), fetchOptions);
    const data = await koiosResponse.text();

    return new Response(data, {
      status: koiosResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        ...corsHeaders(origin || '*'),
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin || '*'),
      },
    });
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
  };
}
