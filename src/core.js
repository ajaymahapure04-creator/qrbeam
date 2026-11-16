// QRBeam core: packing, fountain (LT) coding, peeling decoder. Works in browser and Node.
(function (root) {
  'use strict';
  const MAGIC = 0x51; // 'Q'
  const HDR = 20;     // header bytes

  // ---------- utils ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const B64R = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) B64R[B64.charCodeAt(i)] = i;
  function toB64(u8) {
    let s = '', i = 0;
    for (; i + 2 < u8.length; i += 3) { const n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2]; s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]; }
    const r = u8.length - i;
    if (r === 1) { const n = u8[i] << 16; s += B64[n >> 18] + B64[(n >> 12) & 63] + '=='; }
    else if (r === 2) { const n = (u8[i] << 16) | (u8[i + 1] << 8); s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '='; }
    return s;
  }
  function fromB64(s) {
    s = s.replace(/[^A-Za-z0-9+/]/g, '');
    const out = new Uint8Array(Math.floor(s.length * 3 / 4)); let o = 0;
    for (let i = 0; i < s.length; i += 4) {
      const a = B64R[s.charCodeAt(i)], b = B64R[s.charCodeAt(i + 1)], c = i + 2 < s.length ? B64R[s.charCodeAt(i + 2)] : -1, d = i + 3 < s.length ? B64R[s.charCodeAt(i + 3)] : -1;
      if (a < 0 || b < 0) return null;
      out[o++] = (a << 2) | (b >> 4);
      if (c >= 0) { out[o++] = ((b & 15) << 4) | (c >> 2); if (d >= 0) out[o++] = ((c & 3) << 6) | d; }
    }
    return out.subarray(0, o);
  }

  // ---------- container: [nameLen u16][name][mimeLen u16][mime][bytes] ----------
  const enc = new TextEncoder(), dec = new TextDecoder();
  function packFile(name, mime, bytes) {
    const n = enc.encode(name || 'file'), m = enc.encode(mime || 'application/octet-stream');
    const out = new Uint8Array(4 + n.length + m.length + bytes.length); const dv = new DataView(out.buffer);
    dv.setUint16(0, n.length); out.set(n, 2); dv.setUint16(2 + n.length, m.length); out.set(m, 4 + n.length); out.set(bytes, 4 + n.length + m.length);
    return out;
  }
  function unpackFile(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const nl = dv.getUint16(0); const name = dec.decode(buf.subarray(2, 2 + nl));
    const ml = dv.getUint16(2 + nl); const mime = dec.decode(buf.subarray(4 + nl, 4 + nl + ml));
    return { name, mime, bytes: buf.subarray(4 + nl + ml) };
  }

  // ---------- degree distribution (robust soliton) ----------
  function makeCdf(K) {
    if (K === 1) return new Float64Array([1]);
    const c = 0.05, delta = 0.5, R = c * Math.log(K / delta) * Math.sqrt(K);
    const rho = new Float64Array(K + 1), tau = new Float64Array(K + 1);
    rho[1] = 1 / K; for (let d = 2; d <= K; d++) rho[d] = 1 / (d * (d - 1));
    const pivot = Math.max(1, Math.min(K, Math.floor(K / R)));
    for (let d = 1; d < pivot; d++) tau[d] = R / (d * K);
    tau[pivot] = (R * Math.log(R / delta)) / K; if (!(tau[pivot] > 0)) tau[pivot] = 0;
    let Z = 0; for (let d = 1; d <= K; d++) Z += rho[d] + tau[d];
    const cdf = new Float64Array(K); let acc = 0;
    for (let d = 1; d <= K; d++) { acc += (rho[d] + tau[d]) / Z; cdf[d - 1] = acc; }
    cdf[K - 1] = 1; return cdf;
  }
  const cdfCache = new Map();
  function blockIndices(seed, K) {
    let cdf = cdfCache.get(K); if (!cdf) { cdf = makeCdf(K); cdfCache.set(K, cdf); }
    const rnd = mulberry32(seed ^ 0x9E3779B9);
    const u = rnd(); let lo = 0, hi = K - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid; }
    const d = lo + 1; const set = new Set();
    while (set.size < d) set.add(Math.floor(rnd() * K));
    return Array.from(set);
  }

  // ---------- encoder ----------
  // header: magic u8 | type u8 (0=systematic,1=LT) | fileId u32 | totalLen u32 | chunk u16 | seed u32 | crc u32
  function Encoder(data, chunk) {
    this.data = data; this.chunk = chunk; this.K = Math.max(1, Math.ceil(data.length / chunk));
    this.crc = crc32(data); this.fileId = (Math.random() * 0xFFFFFFFF) >>> 0; this.n = 0;
    this.blocks = [];
    for (let i = 0; i < this.K; i++) { const b = new Uint8Array(chunk); b.set(data.subarray(i * chunk, Math.min(data.length, (i + 1) * chunk))); this.blocks.push(b); }
  }
  Encoder.prototype.packet = function (n) {
    if (n === undefined) n = this.n++;
    const K = this.K, out = new Uint8Array(HDR + this.chunk), dv = new DataView(out.buffer);
    let type, seed, idx;
    // K === 1: plain copy. Otherwise every frame is a fountain-coded mix (best overhead).
    if (K === 1) { type = 0; seed = 0; idx = [0]; }
    else { type = 1; seed = ((n + 1) * 2654435761) >>> 0; idx = blockIndices(seed, K); }
    dv.setUint8(0, MAGIC); dv.setUint8(1, type); dv.setUint32(2, this.fileId); dv.setUint32(6, this.data.length);
    dv.setUint16(10, this.chunk); dv.setUint32(12, seed); dv.setUint32(16, this.crc);
    const p = out.subarray(HDR);
    for (const i of idx) { const b = this.blocks[i]; for (let j = 0; j < b.length; j++) p[j] ^= b[j]; }
    return toB64(out);
  };

  // ---------- decoder (peeling) ----------
  function Decoder() { this.reset(); }
  Decoder.prototype.reset = function () {
    this.fileId = null; this.K = 0; this.solved = 0; this.blocks = null; this.pending = []; this.byBlock = null;
    this.packets = 0; this.useful = 0; this.done = false; this.result = null; this.bad = 0; this.seen = new Set();
  };
  Decoder.prototype.parse = function (text) {
    const u = fromB64(text); if (!u || u.length <= HDR) return null;
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength); if (dv.getUint8(0) !== MAGIC) return null;
    const h = { type: dv.getUint8(1), fileId: dv.getUint32(2), total: dv.getUint32(6), chunk: dv.getUint16(10), seed: dv.getUint32(12), crc: dv.getUint32(16), payload: u.subarray(HDR) };
    if (h.payload.length !== h.chunk || h.chunk === 0) return null; return h;
  };
  // returns 'new' | 'dup' | 'bad' | 'done' | 'other'
  Decoder.prototype.push = function (text) {
    const h = this.parse(text); if (!h) { this.bad++; return 'bad'; }
    if (this.fileId !== h.fileId) {
      if (this.done) return 'other';
      this.reset(); this.fileId = h.fileId; this.total = h.total; this.chunk = h.chunk; this.crc = h.crc;
      this.K = Math.max(1, Math.ceil(h.total / h.chunk)); this.blocks = new Array(this.K).fill(null); this.byBlock = Array.from({ length: this.K }, () => []);
    }
    if (this.done) return 'done';
    this.packets++;
    const key = h.type + ':' + h.seed; if (this.seen.has(key)) return 'dup'; this.seen.add(key);
    const idx = h.type === 0 ? [h.seed % this.K] : blockIndices(h.seed, this.K);
    const data = new Uint8Array(h.payload); const set = new Set();
    for (const i of idx) { if (this.blocks[i]) { const b = this.blocks[i]; for (let j = 0; j < data.length; j++) data[j] ^= b[j]; } else set.add(i); }
    if (set.size === 0) return 'dup';
    this.useful++;
    const pk = { set, data }; this.addPending(pk);
    if (this.solved === this.K) this.finish();
    return this.done ? 'done' : 'new';
  };
  Decoder.prototype.addPending = function (pk) {
    const queue = [pk];
    while (queue.length) {
      const p = queue.pop();
      if (p.set.size === 0) continue;
      if (p.set.size > 1) { p.alive = true; for (const i of p.set) this.byBlock[i].push(p); continue; }
      const i = p.set.values().next().value; p.alive = false;
      if (this.blocks[i]) continue;
      this.blocks[i] = p.data; this.solved++;
      const users = this.byBlock[i]; this.byBlock[i] = [];
      for (const q of users) {
        if (!q.alive || !q.set.has(i)) continue;
        for (let j = 0; j < q.data.length; j++) q.data[j] ^= p.data[j];
        q.set.delete(i);
        if (q.set.size === 1) { q.alive = false; queue.push(q); }
      }
    }
  };
  Decoder.prototype.finish = function () {
    const out = new Uint8Array(this.K * this.chunk);
    for (let i = 0; i < this.K; i++) out.set(this.blocks[i], i * this.chunk);
    const data = out.subarray(0, this.total);
    this.crcOk = crc32(data) === this.crc; this.done = true; this.result = data;
  };
  Decoder.prototype.progress = function () { return this.K ? this.solved / this.K : 0; };

  const api = { Encoder, Decoder, packFile, unpackFile, crc32, toB64, fromB64, HDR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.QRBeam = api;
})(typeof self !== 'undefined' ? self : this);
