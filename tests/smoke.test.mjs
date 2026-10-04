// Smoke tests for ADA Staking Rewards Tracker — run: node --test tests/smoke.test.mjs
// Includes an INDEPENDENT bech32 decoder (written from BIP-173) so the
// encoder in core.js is verified by round-trip, not by itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../core.js');
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// --- Independent BIP-173 decoder (test-only) ---
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let j = 0; j < 5; j++) if ((top >> j) & 1) chk ^= GEN[j];
  }
  return chk;
}
function decodeBech32(str) {
  const pos = str.lastIndexOf('1');
  assert.ok(pos >= 1, 'separator');
  const hrp = str.slice(0, pos);
  const data = [...str.slice(pos + 1)].map((c) => {
    const v = CHARSET.indexOf(c);
    assert.ok(v !== -1, `bad char ${c}`);
    return v;
  });
  const expand = [];
  for (const c of hrp) expand.push(c.charCodeAt(0) >> 5);
  expand.push(0);
  for (const c of hrp) expand.push(c.charCodeAt(0) & 31);
  assert.equal(polymod(expand.concat(data)), 1, 'checksum must verify');
  // strip 6-word checksum, convert 5->8 bits
  const words = data.slice(0, -6);
  let acc = 0, bits = 0;
  const bytes = [];
  for (const w of words) {
    acc = (acc << 5) | w; bits += 5;
    while (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); }
  }
  return { hrp, bytes };
}

const DONATION = 'addr1q8hnl6vl5a6k3rw3n5g3jtte696zcl76kfatzv7gpswa9r0dj7fma6klq55y4ffm7tf0em09udnyhuk4ah92pl5x9jpqjae44v';
const STAKE = 'stake1u8ke0ya7at0s22z255al95huahj7xejt7t27mj4ql6rzeqsfy7dg5'; // stake addr of DONATION, per live Koios

test('bech32 round-trip: real mainnet addresses decode and re-encode identically', () => {
  for (const [addr, hrp, len] of [[DONATION, 'addr', 57], [STAKE, 'stake', 29]]) {
    const { hrp: h, bytes } = decodeBech32(addr);
    assert.equal(h, hrp);
    assert.equal(bytes.length, len);
    assert.equal(core.bech32Encode(hrp, bytes), addr);
  }
});

test('BIP-173 checksum vectors: valid passes, corrupted fails', () => {
  assert.doesNotThrow(() => decodeBech32('a12uel5l'));
  assert.doesNotThrow(() => decodeBech32('split1checkupstagehandshakeupstreamerranterredcaperred2y9e3w'));
  assert.throws(() => decodeBech32('a12uel5x')); // flipped char
  assert.throws(() => decodeBech32('x1b4n0q5v')); // 'b' not in charset
});

test('CIP-30 hex -> bech32: payment (0x01) and reward (0xe1) headers', () => {
  const payHex = '01' + 'ab'.repeat(28) + 'cd'.repeat(28); // 57 bytes
  const pay = core.hexAddressToBech32(payHex);
  assert.ok(pay.startsWith('addr1'), pay);
  assert.equal(pay.length, 103);
  assert.ok(core.isValidAddress(pay));
  assert.deepEqual(decodeBech32(pay).bytes, core.hexToBytes(payHex));

  const rewHex = 'e1' + 'ab'.repeat(28); // 29 bytes
  const rew = core.hexAddressToBech32(rewHex);
  assert.ok(rew.startsWith('stake1'), rew);
  assert.equal(rew.length, 59);
  assert.ok(core.isValidAddress(rew));

  const testHex = '00' + 'ab'.repeat(28) + 'cd'.repeat(28); // testnet payment
  assert.ok(core.hexAddressToBech32(testHex).startsWith('addr_test1'));
  assert.equal(core.hexAddressToBech32('not-hex'), null);
  assert.equal(core.hexAddressToBech32(''), null);
});

test('isValidAddress accepts bech32, rejects hex and bad charset', () => {
  assert.ok(core.isValidAddress(DONATION));
  assert.ok(core.isValidAddress(STAKE));
  assert.ok(!core.isValidAddress('01' + 'ab'.repeat(56))); // raw CIP-30 hex must NOT pass
  assert.ok(!core.isValidAddress('addr1' + 'b'.repeat(60))); // 'b' is not bech32
  assert.ok(!core.isValidAddress('addr1short'));
  assert.ok(!core.isValidAddress(''));
});

test('isValidAddress verifies the BIP-173 checksum: every 1-char mutation rejected', () => {
  // Regression guard: the shape-only validator accepted 732/732 of these.
  for (const base of [DONATION, STAKE]) {
    for (let i = 6; i < base.length; i++) {
      for (const c of ['q', 'p', 'z', '0', 'x']) {
        if (base[i] === c) continue;
        const mutated = base.slice(0, i) + c + base.slice(i + 1);
        assert.ok(!core.isValidAddress(mutated), `mutation at ${i} must fail: ${mutated}`);
      }
    }
  }
  // bech32Decode agrees: real addresses decode, mutations return null.
  assert.equal(core.bech32Decode(DONATION).hrp, 'addr');
  assert.equal(core.bech32Decode(DONATION).bytes.length, 57);
  assert.equal(core.bech32Decode(STAKE).bytes.length, 29);
  assert.equal(core.bech32Decode(DONATION.slice(0, -1) + 'q'), null);
  assert.equal(core.bech32Decode('Addr1' + DONATION.slice(5)), null, 'mixed case rejected');
});

test('isValidAddress enforces payload sizes behind valid checksums', () => {
  // 30-byte stake payload: shape regex passes (54 body chars), checksum
  // is genuinely valid — only the 29-byte stake rule can reject it.
  const stake30 = core.bech32Encode('stake', core.hexToBytes('e1' + 'ab'.repeat(29)));
  assert.ok(!core.isValidAddress(stake30));
  // 28-byte payment payload: below the 29-byte enterprise minimum.
  const pay28 = core.bech32Encode('addr', core.hexToBytes('00' + 'ab'.repeat(27)));
  assert.ok(!core.isValidAddress(pay28));
  // 29-byte enterprise payment address is legitimate and must pass.
  const pay29 = core.bech32Encode('addr', core.hexToBytes('00' + 'ab'.repeat(28)));
  assert.ok(core.isValidAddress(pay29));
});

test('classifyAddress: kind + network for all four prefix forms', () => {
  assert.deepEqual(core.classifyAddress(DONATION), { kind: 'payment', network: 'mainnet' });
  assert.deepEqual(core.classifyAddress(STAKE), { kind: 'stake', network: 'mainnet' });
  const testPay = core.bech32Encode('addr_test', core.hexToBytes('00' + 'ab'.repeat(28) + 'cd'.repeat(28)));
  const testStake = core.bech32Encode('stake_test', core.hexToBytes('e0' + 'ab'.repeat(28)));
  assert.ok(core.isValidAddress(testPay) && core.isValidAddress(testStake));
  assert.deepEqual(core.classifyAddress(testPay), { kind: 'payment', network: 'testnet' });
  assert.deepEqual(core.classifyAddress(testStake), { kind: 'stake', network: 'testnet' });
  assert.equal(core.classifyAddress('addr1' + 'q'.repeat(60)), null, 'bad checksum classifies as null');
  assert.equal(core.classifyAddress('nonsense'), null);
});

test('chartRangeView: count saturates, active toggle stays the picked range', () => {
  // Regression guard: with 30 rewards, picking 60 used to light up "All".
  assert.deepEqual(core.chartRangeView('60', 30), { count: 30, active: '60' });
  assert.deepEqual(core.chartRangeView('120', 100), { count: 100, active: '120' });
  assert.deepEqual(core.chartRangeView('60', 215), { count: 60, active: '60' });
  assert.deepEqual(core.chartRangeView(120, 215), { count: 120, active: '120' });
  assert.deepEqual(core.chartRangeView('all', 215), { count: 215, active: 'all' });
  assert.deepEqual(core.chartRangeView('all', 0), { count: 0, active: 'all' });
});

test('amount helpers', () => {
  assert.equal(core.lovelaceToAda('1866214'), 1.866214);
  assert.equal(core.lovelaceToAda(0), 0);
  assert.match(core.formatAda(1234.5), /1,234\.50/);
});

test('repo hygiene: POST endpoints, versioned assets, 404 scope, attribution', () => {
  const app = read('app.js');
  assert.match(app, /apiPost\('\/address_info', \{ _addresses:/);
  assert.match(app, /apiPost\('\/account_reward_history', \{ _stake_addresses:/);
  assert.ok(!app.includes('?_addresses=${'), 'GET array-param form must stay gone (PostgREST rejects it)');
  assert.ok(!app.includes('function arrayParam'), 'broken arrayParam helper removed');
  assert.match(app, /hexAddressToBech32\(hexAddr\)/, 'wallet hex must be converted before load');
  assert.match(app, /classifyAddress\(address\)/, 'load must classify (checksum + kind + network) before querying');
  assert.match(app, /testnet address/, 'testnet input gets an explicit mainnet-only message');
  assert.ok(!app.includes("startsWith('stake1')"), 'stake fast-path must not miss stake_test1 (now via classifyAddress)');
  assert.ok(!app.includes('.innerHTML'), 'table rendering is textContent-only (API payloads stay inert)');
  assert.match(app, /chartRangeView\(chartRange/, 'active chart toggle derives from the picked range');

  const html = read('index.html');
  assert.match(html, /core\.js\?v=2/);
  assert.match(html, /app\.js\?v=2/);
  assert.match(html, /og:url" content="https:\/\/kshot3000\.github\.io\/ADA-Staking-Rewards-Tracker\/"/);
  assert.match(html, /x\.com\/kshot9000/);
  assert.ok(html.includes(DONATION), 'donation address matches the known ADA address');

  const nf = read('404.html');
  assert.match(nf, /url=\/ADA-Staking-Rewards-Tracker\//);
  assert.ok(!/url=\/" /.test(nf), '404 must not bounce to the user-page root');
});
