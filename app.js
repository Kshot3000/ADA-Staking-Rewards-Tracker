const KOIOS = 'https://api.koios.rest/api/v0';

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

function lovelaceToAda(l) {
  const ada = Number(l) / 1_000_000;
  return ada.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6});
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getTip() {
  const data = await fetchJson(`${KOIOS}/tip`);
  return data[0];
}

async function getEpochParams(epochNo) {
  const data = await fetchJson(`${KOIOS}/epoch_params?epoch_no=${epochNo}`);
  return data[0];
}

async function getAddressRewards(address) {
  const data = await fetchJson(`${KOIOS}/address_rewards?address=${encodeURIComponent(address)}`);
  return data;
}

async function getAddressInfo(address) {
  const data = await fetchJson(`${KOIOS}/address_info?address=${encodeURIComponent(address)}`);
  return data[0] || null;
}

async function getStakeAddressInfo(stakeAddress) {
  const data = await fetchJson(`${KOIOS}/stake_address?stake_address=${encodeURIComponent(stakeAddress)}`);
  return data[0] || null;
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

    const [tip, addrInfo] = await Promise.all([
      getTip().catch(() => ({epoch_no: '—'})),
      getAddressInfo(address).catch(() => null)
    ]);

    statEpoch.textContent = tip.epoch_no ?? '—';

    let rewards = await getAddressRewards(address).catch(() => []);
    if ((!rewards || rewards.length === 0) && addrInfo?.stake_address) {
      rewards = await getAddressRewards(addrInfo.stake_address).catch(() => []);
    }

    let poolId = '—';
    if (addrInfo?.stake_address) {
      const stakeInfo = await getStakeAddressInfo(addrInfo.stake_address).catch(() => null);
      if (stakeInfo?.pool_id) poolId = stakeInfo.pool_id;
    }
    statPool.textContent = poolId;

    const sorted = rewards.sort((a,b) => a.epoch_no - b.epoch_no);
    const totalLovelace = sorted.reduce((s,r) => s + Number(r.amount || 0), 0);
    statLifetime.textContent = `${lovelaceToAda(totalLovelace)} ADA`;

    // Prepare rows with dates
    const rows = [];
    for (const r of sorted.slice(-60)) {
      let dateStr = '—';
      try {
        const ep = await getEpochParams(r.epoch_no);
        dateStr = new Date(ep.start_time * 1000).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' });
      } catch {}
      rows.push({ epoch_no: r.epoch_no, amount: r.amount, date: dateStr });
    }

    renderTable(rows);

    const labels = sorted.slice(-60).map(r => `E${r.epoch_no}`);
    const values = sorted.slice(-60).map(r => Number(r.amount)/1_000_000);
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
