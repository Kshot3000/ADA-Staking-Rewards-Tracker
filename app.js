const KOIOS = 'https://api.koios.rest/api/v0';

const connectBtn = document.getElementById('connectBtn');
const addressInput = document.getElementById('addressInput');
const loadBtn = document.getElementById('loadBtn');
const walletInfo = document.getElementById('walletInfo');
const dashboard = document.getElementById('dashboard');

const statAddress = document.getElementById('statAddress');
const statEpoch = document.getElementById('statEpoch');
const statLifetime = document.getElementById('statLifetime');
const statPool = document.getElementById('statPool');

let chartInstance = null;

function lovelaceToAda(l) {
  return (Number(l) / 1_000_000).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6});
}

function formatDateFromEpoch(epochNo, epochStart?) {
  // Koios epoch_params returns start_time
  return epochStart ? new Date(epochStart * 1000).toLocaleDateString() : '—';
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function getTip() {
  const data = await fetchJson(`${KOIOS}/tip`);
  return data[0]; // {epoch_no, epoch_slot_no, slot_no, ...}
}

async function getEpochParams(epochNo) {
  const data = await fetchJson(`${KOIOS}/epoch_params?epoch_no=${epochNo}`);
  return data[0];
}

async function getAddressRewards(address) {
  // Koios address_rewards expects address (payment or stake?)
  // Try both address and stake address derivation fallback
  const data = await fetchJson(`${KOIOS}/address_rewards?address=${encodeURIComponent(address)}`);
  return data; // [{epoch_no, amount, ...}]
}

async function getAddressInfo(address) {
  const data = await fetchJson(`${KOIOS}/address_info?address=${encodeURIComponent(address)}`);
  return data[0] || null;
}

async function loadAddress(address) {
  try {
    walletInfo.classList.add('hidden');
    dashboard.classList.remove('hidden');
    statAddress.textContent = address;
    statPool.textContent = 'Loading...';

    const [tip, rewards, addrInfo] = await Promise.all([
      getTip().catch(()=>({epoch_no: '—'})),
      getAddressRewards(address).catch(()=>[]),
      getAddressInfo(address).catch(()=>null)
    ]);

    statEpoch.textContent = tip.epoch_no ?? '—';

    // Determine stake pool
    let poolId = '—';
    if (addrInfo && addrInfo.stake_address) {
      // Fetch stake address info for pool
      try {
        const stakeData = await fetchJson(`${KOIOS}/stake_address?stake_address=${encodeURIComponent(addrInfo.stake_address)}`);
        if (stakeData && stakeData.length) {
          poolId = stakeData[0].pool_id || '—';
        }
      } catch {}
    }
    statPool.textContent = poolId || '—';

    // Sort rewards descending
    const sorted = rewards.sort((a,b)=> a.epoch_no - b.epoch_no);
    const totalLovelace = sorted.reduce((sum,r)=> sum + Number(r.amount || 0), 0);
    statLifetime.textContent = `${lovelaceToAda(totalLovelace)} ADA`;

    // Build table
    const tbody = document.querySelector('#rewardsTable tbody');
    tbody.innerHTML = '';
    for (const r of sorted) {
      const tr = document.createElement('tr');
      const epochNo = r.epoch_no;
      let dateStr = '—';
      try {
        const ep = await getEpochParams(epochNo);
        dateStr = new Date(ep.start_time * 1000).toLocaleDateString();
      } catch {}
      tr.innerHTML = `
        <td>${epochNo}</td>
        <td>${lovelaceToAda(r.amount)}</td>
        <td>${dateStr}</td>
        <td class="mono">${poolId}</td>
      `;
      tbody.appendChild(tr);
    }

    // Chart
    const labels = sorted.map(r => `Epoch ${r.epoch_no}`);
    const values = sorted.map(r => Number(r.amount)/1_000_000);
    const ctx = document.getElementById('rewardsChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Rewards (ADA)',
          data: values,
          backgroundColor: 'rgba(79,140,255,0.6)',
          borderColor: 'rgba(79,140,255,1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive:true,
        plugins:{ legend:{ labels:{ color:'#e6eefc' } } },
        scales:{
          x:{ ticks:{ color:'#8aa0c2' }, grid:{ color:'#1b2540' } },
          y:{ ticks:{ color:'#8aa0c2' }, grid:{ color:'#1b2540' } }
        }
      }
    });
  } catch (err) {
    alert('Failed to load data: ' + err.message);
    console.error(err);
  }
}

connectBtn.addEventListener('click', async () => {
  if (!window.cardano) {
    walletInfo.classList.remove('hidden');
    walletInfo.textContent = 'No Cardano wallet extension detected. Please install Nami, Eternl, Yoroi, or Flint, or paste your address manually.';
    return;
  }
  const wallets = Object.keys(window.cardano);
  if (wallets.length === 0) {
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
    if (!addr) throw new Error('No address found');
    addressInput.value = addr;
    walletInfo.classList.remove('hidden');
    walletInfo.textContent = `Connected ${walletName}: ${addr.slice(0,20)}...`;
    await loadAddress(addr);
  } catch (e) {
    alert('Wallet connection failed: ' + e.message);
  }
});

loadBtn.addEventListener('click', () => {
  const addr = addressInput.value.trim();
  if (!addr) { alert('Please enter an address'); return; }
  loadAddress(addr);
});

addressInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadBtn.click();
});
