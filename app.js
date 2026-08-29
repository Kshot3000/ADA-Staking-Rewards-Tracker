const KOIOS = 'https://api.koios.rest/api/v1';

const connectBtn = document.getElementById('connectBtn');
const pasteBtn = document.getElementById('pasteBtn');
const addressInput = document.getElementById('addressInput');
const loadBtn = document.getElementById('loadBtn');
const walletInfo = document.getElementById('walletInfo');
const dashboard = document.getElementById('dashboard');

const statAddress = document.getElementById('statAddress');
const statEpoch = document.getElementById('statEpoch');
const statLifetime = document.getElementById('statLifetime');
const statPool = document.getElementById('statPool');

const rewardsTableBody = document.getElementById('rewardsTable');
const copyDonateBtn = document.getElementById('copyDonate');
const donationAddrEl = document.getElementById('donationAddr');

let chartInstance = null;
let epochInfoMap = null;

function lovelaceToAda(l) {
  const ada = Number(l) / 1_000_000;
  return ada.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6});
}

async function apiGet(path, params = {}) {
  const url = new URL(KOIOS + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(KOIOS + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getTip() {
  const data = await apiGet('/tip');
  return data[0];
}

async function getAddressInfo(address) {
  const data = await apiPost('/address_info', { _addresses: [address] });
  return data[0] || null;
}

async function getRewardHistory(stakeAddress) {
  const data = await apiPost('/account_reward_history', { _stake_addresses: [stakeAddress] });
  return data || [];
}

async function getEpochInfoMap() {
  if (epochInfoMap) return epochInfoMap;
  const data = await apiGet('/epoch_info');
  const map = {};
  for (const e of data) map[e.epoch_no] = e;
  epochInfoMap = map;
  return map;
}

function renderTable(rows) {
  rewardsTableBody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-white/[0.03]';
    tr.innerHTML = `
      <td class="px-3 py-2 mono">${r.epoch_no}</td>
      <td class="px-3 py-2">${lovelaceToAda(r.amount)} ADA</td>
      <td class="px-3 py-2 text-slate-400">${r.date}</td>
      <td class="px-3 py-2 mono text-slate-300">${r.pool || '—'}</td>
    `;
    rewardsTableBody.appendChild(tr);
  });
}

function renderChart(labels, values) {
  const ctx = document.getElementById('rewardsChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Rewards ADA',
        data: values,
        tension: 0.3,
        borderColor: '#4f8cff',
        backgroundColor: 'rgba(79,140,255,0.15)',
        fill: true,
        pointRadius: 2,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#cbd5e1' } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } }
      }
    }
  });
}

async function loadAddress(address) {
  try {
    walletInfo.classList.add('hidden');
    dashboard.classList.remove('hidden');
    statAddress.textContent = address;
    statPool.textContent = 'Loading...';
    statLifetime.textContent = '—';

    let stakeAddress = address.startsWith('stake1') ? address : null;
    if (!stakeAddress) {
      const addrInfo = await getAddressInfo(address);
      if (addrInfo?.stake_address) stakeAddress = addrInfo.stake_address;
    }

    if (!stakeAddress) {
      statLifetime.textContent = 'No stake address found';
      statPool.textContent = '—';
      rewardsTableBody.innerHTML = '<tr><td colspan="4" class="px-3 py-3 text-slate-400">No stake address detected for this payment address.</td></tr>';
      if (chartInstance) chartInstance.destroy();
      return;
    }

    const [tip, rewards, epochMap] = await Promise.all([
      getTip().catch(() => ({ epoch_no: '—' })),
      getRewardHistory(stakeAddress),
      getEpochInfoMap().catch(() => ({}))
    ]);

    statEpoch.textContent = tip.epoch_no ?? '—';

    const sorted = rewards
      .filter(r => r.amount && Number(r.amount) >= 0)
      .sort((a, b) => (a.earned_epoch || 0) - (b.earned_epoch || 0));

    const totalLovelace = sorted.reduce((s, r) => s + Number(r.amount || 0), 0);
    statLifetime.textContent = `${lovelaceToAda(totalLovelace)} ADA`;

    if (sorted.length === 0) {
      statPool.textContent = '—';
      rewardsTableBody.innerHTML = '<tr><td colspan="4" class="px-3 py-3 text-slate-400">No rewards found for this stake address.</td></tr>';
      if (chartInstance) chartInstance.destroy();
      return;
    }

    const latest = sorted[sorted.length - 1];
    statPool.textContent = latest.pool_id_bech32 || '—';

    const rows = sorted.slice(-60).map(r => ({
      epoch_no: r.earned_epoch,
      amount: r.amount,
      pool: r.pool_id_bech32,
      date: epochMap[r.earned_epoch]
        ? new Date(epochMap[r.earned_epoch].start_time * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
        : '—'
    }));

    renderTable(rows);

    const labels = rows.map(r => `E${r.epoch_no}`);
    const values = rows.map(r => Number(r.amount) / 1_000_000);
    renderChart(labels, values);

  } catch (err) {
    alert('Failed to load data: ' + err.message);
    console.error(err);
  }
}

connectBtn.addEventListener('click', async () => {
  if (!window.cardano) {
    walletInfo.classList.remove('hidden');
    walletInfo.textContent = 'No Cardano wallet extension detected. Install Nami/Eternl/Yoroi/Flint or paste address.';
    return;
  }
  const wallets = Object.keys(window.cardano);
  if (!wallets.length) {
    walletInfo.classList.remove('hidden');
    walletInfo.textContent = 'No wallet found.';
    return;
  }
  try {
    const walletName = wallets[0];
    const api = await window.cardano[walletName].enable();
    const used = await api.getUsedAddresses();
    const change = await api.getChangeAddress();
    const addr = used[0] || change;
    if (!addr) throw new Error('No address returned');
    addressInput.value = addr;
    walletInfo.classList.remove('hidden');
    walletInfo.textContent = `Connected ${walletName}`;
    await loadAddress(addr);
  } catch (e) {
    alert('Wallet connection failed: ' + e.message);
  }
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) addressInput.value = text.trim();
  } catch {}
});

loadBtn.addEventListener('click', () => {
  const addr = addressInput.value.trim();
  if (!addr) return alert('Please enter an address');
  loadAddress(addr);
});

addressInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadBtn.click();
});

copyDonateBtn?.addEventListener('click', async () => {
  const addr = donationAddrEl.textContent.trim();
  await navigator.clipboard.writeText(addr);
  copyDonateBtn.textContent = 'Copied!';
  setTimeout(() => copyDonateBtn.textContent = 'Copy', 2000);
});
