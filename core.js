// ============================================================
// ADA Staking Rewards Tracker — pure helpers (no DOM)
// Loaded before app.js in the browser; also require()-able by
// the Node test suite (tests/smoke.test.mjs).
// ============================================================
(function (global) {
  'use strict';

  // --- Amounts ---
  function lovelaceToAda(lov) { return Number(lov) / 1_000_000; }

  function formatAda(ada) {
    return Number(ada).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }

  // --- Address validation ---
  // Bech32 charset excludes 1, b, i, o. Mainnet payment addresses are
  // 103 chars (addr1…), testnet 108 (addr_test1…); stake addresses are
  // 59 chars (stake1…), testnet 64 (stake_test1…). Bounds stay loose
  // enough for enterprise/pointer variants but reject hex + garbage.
  var BECH32_BODY = '[023456789acdefghjklmnpqrstuvwxyz]';
  var ADDRESS_RE = new RegExp(
    '^(addr1' + BECH32_BODY + '{50,110}|addr_test1' + BECH32_BODY + '{50,110}' +
    '|stake1' + BECH32_BODY + '{45,60}|stake_test1' + BECH32_BODY + '{45,60})$'
  );

  function isValidAddress(addr) {
    if (typeof addr !== 'string' || !ADDRESS_RE.test(addr.trim())) return false;
    // Shape alone is not enough: a one-character typo keeps the shape
    // (and the bech32 charset) but breaks the BIP-173 checksum — the
    // old shape-only check accepted 732/732 single-char mutations of
    // real addresses, then sent them to Koios to fail obscurely.
    var decoded = bech32Decode(addr.trim());
    if (!decoded) return false;
    // Payload sizes: stake/reward accounts are exactly 29 bytes;
    // payment addresses run 29 (enterprise) to 57 (base) bytes.
    if (decoded.hrp === 'stake' || decoded.hrp === 'stake_test') {
      return decoded.bytes.length === 29;
    }
    return decoded.bytes.length >= 29 && decoded.bytes.length <= 57;
  }

  /**
   * Classify a valid address by kind + network, or return null.
   * The tracker reads MAINNET Koios only, so callers use this to
   * handle testnet input explicitly instead of querying mainnet with
   * it (and stake_test1… must take the stake fast-path too — a plain
   * startsWith('stake1') check misses it).
   */
  function classifyAddress(addr) {
    if (!isValidAddress(addr)) return null;
    var a = addr.trim();
    if (a.indexOf('stake_test1') === 0) return { kind: 'stake', network: 'testnet' };
    if (a.indexOf('stake1') === 0) return { kind: 'stake', network: 'mainnet' };
    if (a.indexOf('addr_test1') === 0) return { kind: 'payment', network: 'testnet' };
    return { kind: 'payment', network: 'mainnet' };
  }

  /**
   * Chart range state: the COUNT saturates at the number of rewards
   * (60 requested with only 30 epochs of history shows 30), but the
   * ACTIVE toggle must reflect the range the user picked — deriving
   * it from the saturated count lit up "All" whenever a 60/120 pick
   * saturated. Returns { count, active } with active '60'|'120'|'all'
   * (or the numeric range as a string).
   */
  function chartRangeView(range, total) {
    var t = Math.max(0, Math.floor(Number(total) || 0));
    if (range === 'all') return { count: t, active: 'all' };
    var n = Number(range) || 60;
    return { count: Math.min(n, t), active: String(n) };
  }

  function isHexAddress(value) {
    return typeof value === 'string' && /^[0-9a-fA-F]+$/.test(value.trim()) && value.trim().length % 2 === 0;
  }

  // --- Bech32 (BIP-173) encoding ---
  var BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

  function bech32Polymod(values) {
    var GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    var chk = 1;
    for (var i = 0; i < values.length; i++) {
      var top = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ values[i];
      for (var j = 0; j < 5; j++) {
        if ((top >> j) & 1) chk ^= GEN[j];
      }
    }
    return chk;
  }

  function bech32HrpExpand(hrp) {
    var out = [];
    for (var i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
    out.push(0);
    for (var k = 0; k < hrp.length; k++) out.push(hrp.charCodeAt(k) & 31);
    return out;
  }

  function convertBits(data, fromBits, toBits, pad) {
    var acc = 0, bits = 0, out = [];
    var maxv = (1 << toBits) - 1;
    for (var i = 0; i < data.length; i++) {
      acc = (acc << fromBits) | data[i];
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        out.push((acc >> bits) & maxv);
      }
    }
    if (pad) {
      if (bits) out.push((acc << (toBits - bits)) & maxv);
    } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
      return null;
    }
    return out;
  }

  function bech32Encode(hrp, bytes) {
    var data = convertBits(bytes, 8, 5, true);
    var values = bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
    var polymod = bech32Polymod(values) ^ 1;
    var checksum = [];
    for (var i = 0; i < 6; i++) checksum.push((polymod >> (5 * (5 - i))) & 31);
    return hrp + '1' + data.concat(checksum).map(function (v) { return BECH32_CHARSET[v]; }).join('');
  }

  /**
   * Decode + checksum-verify a bech32 string (BIP-173). Returns
   * { hrp, bytes } or null for any defect: bad separator, characters
   * outside the charset, mixed case, checksum mismatch, or non-zero
   * padding in the final partial group.
   */
  function bech32Decode(str) {
    if (typeof str !== 'string' || str !== str.toLowerCase()) return null;
    var pos = str.lastIndexOf('1');
    if (pos < 1 || str.length - pos - 1 < 6) return null;
    var hrp = str.slice(0, pos);
    var values = [];
    for (var i = pos + 1; i < str.length; i++) {
      var v = BECH32_CHARSET.indexOf(str[i]);
      if (v === -1) return null;
      values.push(v);
    }
    if (bech32Polymod(bech32HrpExpand(hrp).concat(values)) !== 1) return null;
    var bytes = convertBits(values.slice(0, -6), 5, 8, false);
    if (!bytes) return null;
    return { hrp: hrp, bytes: bytes };
  }

  function hexToBytes(hex) {
    var out = [];
    for (var i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
    return out;
  }

  /**
   * CIP-30 wallets return addresses as hex-encoded bytes, not bech32.
   * Convert using the address header byte: the high nibble is the
   * address type (0xE/0xF = reward/stake account), the low nibble is
   * the network id (1 = mainnet, 0 = testnet).
   */
  function hexAddressToBech32(hex) {
    var clean = String(hex || '').trim();
    if (!isHexAddress(clean)) return null;
    var bytes = hexToBytes(clean);
    if (!bytes.length) return null;
    var header = bytes[0];
    var type = header >> 4;
    var mainnet = (header & 0x0f) === 1;
    var isReward = type === 0x0e || type === 0x0f;
    var hrp = isReward
      ? (mainnet ? 'stake' : 'stake_test')
      : (mainnet ? 'addr' : 'addr_test');
    return bech32Encode(hrp, bytes);
  }

  var api = {
    lovelaceToAda: lovelaceToAda,
    formatAda: formatAda,
    isValidAddress: isValidAddress,
    classifyAddress: classifyAddress,
    chartRangeView: chartRangeView,
    isHexAddress: isHexAddress,
    bech32Encode: bech32Encode,
    bech32Decode: bech32Decode,
    hexToBytes: hexToBytes,
    hexAddressToBech32: hexAddressToBech32,
  };

  global.ADATrackerCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
