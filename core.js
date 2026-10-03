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
    return typeof addr === 'string' && ADDRESS_RE.test(addr.trim());
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
    isHexAddress: isHexAddress,
    bech32Encode: bech32Encode,
    hexToBytes: hexToBytes,
    hexAddressToBech32: hexAddressToBech32,
  };

  global.ADATrackerCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
