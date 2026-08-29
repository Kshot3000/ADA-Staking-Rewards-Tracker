// ============================================================
// ADA Staking Rewards Tracker — Main Application
// ============================================================

// --- Configuration ---
// 🔧 IMPORTANT: After deploying the Cloudflare Worker (see cloudflare-worker/README.md),
//    replace the URL below with your worker URL + '/koios'
//    Example: 'https://ada-proxy.YOUR_ACCOUNT.workers.dev/koios'
//    Leave empty to try direct Koios (will fail due to CORS in most browsers).
const PROXY_URL = '';

const KOIOS = PROXY_URL || 'https://api.koios.rest/api/v1';
const DONATION_ADDRESS = 'addr1q8hnl6vl5a6k3rw3n5g3jtte696zcl76kfatzv7gpswa9r0dj7fma6klq55y4ffm7tf0em09udnyhuk4ah92pl5x9jpqjae44v';

// --- DOM References ---
const connectBtn        = document.getElementById('connectBtn');
const pasteBtn          = document.getElementById('pasteBtn');
const addressInput      = document.getElementById('addressInput');
const loadBtn           = document.getElementById('loadBtn');
const statusMsg         = document.getElementById('statusMsg');
const dashboard         = document.getElementById('dashboard');
const loadingOverlay    = document.getElementById('loadingOverlay');
const loadingText       = document.getElementById('loadingText');
const chainTip          = document.getElementById('chainTip');

const statAddress       = document.getElementById('statAddress');
const statEpoch         = document.getElementById('statEpoch');
const statLifetime      = document.getElementById('statLifetime');
const statPool          = document.getElementById('statPool');
const statEpochsTracked = document.getElementById('statEpochsTracked');
const statAvgReward     = document.getElementById('statAvgReward');
const statFirstEpoch    = document.getElementById('statFirstEpoch');

const rewardsTableBody  = document.getElementById('rewardsTable');
const copyDonateBtn     = document.getElementById('copyDonate');

const chartToggle60     = document.getElementById('chartToggle60');
const chartToggle120    = document.getElementById('chartToggle120');
const chartToggleAll    = document.getElementById('chartToggleAll');

// --- State ---
let chartInstance  = null;
let allRewards     = [];
let epochInfoMap   = null;
let currentEpoch   = null;
let chartEpochCount = 60;

// --- Utilities ---
function lovelaceToAda(lov) { return Number(lov) / 1_000_000; }

function formatAda(ada) {
  return ada.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function isValidAddress(addr) {
  return /^(addr1[a-z0-9]{50,}|stake1[a-z0-9]{50,})$/i.test(addr.trim());
}

function showStatus(msg, type = 'info') {
  statusMsg.classList.remove('hidden', 'text-red-400', 'text-emerald-400', 'text-amber-400', 'text-slate-300');
  const cls = { error: 'text-red-400', success: 'text-emerald-400', warning: 'text-amber-400', info: 'text-slate-300' };
  statusMsg.classList.add(cls[type] || cls.info);
  statusMsg.textContent = msg;
}

function hideStatus() { statusMsg.classList.add('hidden'); }

function showLoading(text = 'Fetching data from Cardano...') {
  loadingText.textContent = text;
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() { loadingOverlay.classList.add('hidden'); }

// --- API (GET-based with proper URL encoding for PostgREST arrays) ---
async function apiFetch(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Encode a value as a PostgREST JSON array in the query string.
 * PostgREST expects array params as {"val1","val2",...}
 */
function arrayParam(values) {
  return JSON.stringify(Array.isArray(values) ? values : [values]);
}

async function getTip() {
  const data = await apiFetch(KOIOS + '/tip');
  return data[0] || {};
}

async function getAddressInfo(address) {
  const encoded = encodeURIComponent(arrayParam([address]));
  const data = await apiFetch(`${KOIOS}/address_info?_addresses=${encoded}`);
  return data[0] || null;
}

async function getRewardHistory(stakeAddress) {
  const encoded = encodeURIComponent(arrayParam([stakeAddress]));
  const data = await apiFetch(`${KOIOS}/account_reward_history?_stake_addresses=${encoded}`);
  return Array.isArray(data) ? data : [];
}

async function getEpochInfoMap() {
  if (epochInfoMap) return epochInfoMap;
  const data = await apiFetch(`${KOIOS}/epoch_info`);
  const map = {};
  for (const e of data) map[e.epoch_no] = e;
  epochInfoMap = map;
  return map;
}

// --- Rendering ---
function epochDate(epochNo) {
  if (!epochInfoMap || !epochInfoMap[epochNo]) return '—';
  return new Date(epochInfoMap[epochNo].start_time * 1000)
    .toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function renderTable(rows) {
  rewardsTableBody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-white/[0.03] transition-colors';
    tr.innerHTML = `
      <td class="px-3 py-2 text-slate-300">E${r.epoch_no}</td>
      <td class="px-3 py-2 text-right text-emerald-400 font-medium">${formatAda(lovelaceToAda(r.amount))}</td>
      <td class="px-3 py-2 text-slate-500">${r.date}</td>`;
    rewardsTableBody.appendChild(tr);
  });
}

function renderChart(count) {
  const ctx = document.getElementById('rewardsChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  const sliced = allRewards.slice(-count);
  const labels = sliced.map(r => `E${r.earned_epoch}`);
  const values = sliced.map(r => lovelaceToAda(r.amount));

  const gradient = ctx.createLinearGradient(0, 0, 0, 340);
  gradient.addColorStop(0, 'rgba(74,108,247,0.3)');
  gradient.addColorStop(1, 'rgba(74,108,247,0.0)');

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Rewards (ADA)',
        data: values,
        tension: 0.35,
        borderColor: '#4A6CF7',
        backgroundColor: gradient,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#4A6CF7',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17,24,39,0.95)',
          titleColor: '#cbd5e1',
          bodyColor: '#4ade80',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          cornerRadius: 12,
          padding: 12,
          titleFont: { family: 'Inter', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 13, weight: '600' },
          callbacks: {
            title: items => `Epoch ${items[0].label}`,
            label: item => `${formatAda(item.raw)} ADA`,
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#475569', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 12 },
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
        },
        y: {
          ticks: { color: '#475569', font: { family: 'Inter', size: 11 }, callback: v => formatAda(v) },
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
        }
      }
    }
  });
}

function setActiveChartButton(count) {
  const active = 'bg-cardano-blue/30 text-cardano-light';
  const inactive = 'bg-dark-700 text-slate-400';
  const btns = { 60: chartToggle60, 120: chartToggle120, all: chartToggleAll };
  Object.entries(btns).forEach(([k, btn]) => {
    const isActive = (k === String(count)) || (k === 'all' && count === allRewards.length);
    btn.className = `text-xs px-3 py-1 rounded-lg transition-colors ${isActive ? active : inactive}`;
  });
}

function refreshView(count) {
  const sliced = allRewards.slice(-count);
  const rows = sliced.reverse().map(r => ({
    epoch_no: r.earned_epoch,
    amount: r.amount,
    date: epochDate(r.earned_epoch),
  }));
  renderTable(rows);
  renderChart(count);
  setActiveChartButton(count);
}

// --- Main Load Logic ---
async function loadAddress(address) {
  address = address.trim();
  if (!isValidAddress(address)) {
    showStatus('Please enter a valid Cardano address (addr1... or stake1...)', 'error');
    return;
  }

  hideStatus();
  showLoading('Resolving address...');
  dashboard.classList.add('hidden');

  try {
    // Step 1: Resolve stake address
    let stakeAddress = address.startsWith('stake1') ? address : null;
    if (!stakeAddress) {
      const info = await getAddressInfo(address);
      if (info?.stake_address) stakeAddress = info.stake_address;
      else throw new Error('No stake address found for this payment address');
    }

    showLoading('Fetching rewards history...');

    // Step 2: Parallel fetch
    const [tip, rewards, epochMap] = await Promise.all([
      getTip().catch(() => ({})),
      getRewardHistory(stakeAddress),
      getEpochInfoMap().catch(() => ({})),
    ]);

    currentEpoch = tip.epoch_no ?? '—';
    chainTip.textContent = `Epoch ${currentEpoch}`;
    chainTip.classList.remove('hidden');

    // Filter & sort
    allRewards = (rewards || [])
      .filter(r => r.amount && Number(r.amount) >= 0)
      .sort((a, b) => (a.earned_epoch || 0) - (b.earned_epoch || 0));

    if (!allRewards.length) {
      showStatus('No staking rewards found. This address may not be delegated to a pool.', 'warning');
      hideLoading();
      return;
    }

    // Stats
    const totalAda = allRewards.reduce((s, r) => s + lovelaceToAda(r.amount), 0);
    const latest = allRewards[allRewards.length - 1];

    statAddress.textContent = address;
    statEpoch.textContent = `E${currentEpoch}`;
    statLifetime.textContent = `${formatAda(totalAda)} ADA`;
    statPool.textContent = latest.pool_id_bech32 || '—';
    statEpochsTracked.textContent = allRewards.length;
    statAvgReward.textContent = `${formatAda(totalAda / allRewards.length)} ADA`;
    statFirstEpoch.textContent = `E${allRewards[0].earned_epoch}`;

    // Render
    chartEpochCount = Math.min(60, allRewards.length);
    refreshView(chartEpochCount);

    hideLoading();
    dashboard.classList.remove('hidden');
    showStatus(`Loaded ${allRewards.length} epochs of reward data`, 'success');
    setTimeout(() => dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

  } catch (err) {
    console.error('Load error:', err);
    hideLoading();

    // CORS detection
    if (err.message.includes('Failed to fetch') || err instanceof TypeError) {
      showStatus(
        'CORS blocked. Deploy the Cloudflare Worker proxy and set PROXY_URL in app.js. See cloudflare-worker/README.md',
        'error'
      );
    } else {
      showStatus(`Error: ${err.message}`, 'error');
    }
  }
}

// --- Event Listeners ---

connectBtn.addEventListener('click', async () => {
  if (!window.cardano) {
    showStatus('No Cardano wallet detected. Install Nami, Eternl, Yoroi, or Flint — or paste an address.', 'warning');
    return;
  }
  const wallets = Object.keys(window.cardano);
  if (!wallets.length) { showStatus('No wallet found.', 'error'); return; }

  try {
    const name = wallets[0];
    showStatus(`Connecting to ${name}...`, 'info');
    const api = await window.cardano[name].enable();
    const used = await api.getUsedAddresses();
    const change = await api.getChangeAddress();
    const addr = used[0] || change;
    if (!addr) throw new Error('No address returned');
    addressInput.value = addr;
    showStatus(`Connected to ${name}`, 'success');
    await loadAddress(addr);
  } catch (e) {
    showStatus(`Wallet error: ${e.message}`, 'error');
  }
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (text) { addressInput.value = text; showStatus('Pasted from clipboard', 'info'); }
  } catch { showStatus('Could not read clipboard', 'warning'); }
});

loadBtn.addEventListener('click', () => {
  const addr = addressInput.value.trim();
  if (!addr) { showStatus('Enter an address first', 'warning'); return; }
  loadAddress(addr);
});

addressInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadBtn.click(); });
addressInput.addEventListener('input', hideStatus);

// Chart toggles
chartToggle60.addEventListener('click', () => { chartEpochCount = Math.min(60, allRewards.length); refreshView(chartEpochCount); });
chartToggle120.addEventListener('click', () => { chartEpochCount = Math.min(120, allRewards.length); refreshView(chartEpochCount); });
chartToggleAll.addEventListener('click', () => { chartEpochCount = allRewards.length; refreshView(chartEpochCount); });

// Copy donation address
copyDonateBtn?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(DONATION_ADDRESS);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = DONATION_ADDRESS; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }
  copyDonateBtn.textContent = 'Copied!';
  copyDonateBtn.classList.add('text-emerald-400');
  setTimeout(() => { copyDonateBtn.textContent = 'Copy'; copyDonateBtn.classList.remove('text-emerald-400'); }, 2000);
});

// --- Init ---
document.getElementById('yearFooter').textContent = new Date().getFullYear();

// Fetch chain tip on load (non-blocking)
getTip().then(tip => {
  if (tip?.epoch_no !== undefined) {
    currentEpoch = tip.epoch_no;
    chainTip.textContent = `Epoch ${currentEpoch}`;
    chainTip.classList.remove('hidden');
  }
}).catch(() => {});
