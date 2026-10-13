/**
 * Incremental SHA-256 for browser-local File slices.
 *
 * SHA-256 here is FIPS 180-4 SHA-256, not a Merkle digest of chunk hashes.
 * Memory is O(64) besides the caller's single slice ArrayBuffer. Do not
 * export partial digests or treat these hashes as signatures.
 */
const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);
const INITIAL = [
  0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
  0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19,
];
const rotate = (word, distance) => (word >>> distance) | (word << (32 - distance));
const toHex = value => value.toString(16).padStart(8, '0');

export class IncrementalSha256 {
  #state = new Uint32Array(INITIAL);
  #pending = new Uint8Array(64);
  #used = 0;
  #length = 0n;
  #finished = false;

  #compress(block, offset = 0) {
    const words = new Uint32Array(64);
    for (let i = 0; i < 16; i++) {
      const p = offset + i * 4;
      words[i] = ((block[p] << 24) | (block[p + 1] << 16) |
        (block[p + 2] << 8) | block[p + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15], y = words[i - 2];
      const sigma0 = rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3);
      const sigma1 = rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10);
      words[i] = (words[i - 16] + sigma0 + words[i - 7] + sigma1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = this.#state;
    for (let i = 0; i < 64; i++) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + K[i] + words[i]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    const accum = [a,b,c,d,e,f,g,h];
    for (let i = 0; i < 8; i++) this.#state[i] = (this.#state[i] + accum[i]) >>> 0;
  }

  update(bytes) {
    if (this.#finished) throw Error('SHA256_ALREADY_FINALIZED');
    if (!(bytes instanceof Uint8Array)) throw Error('SHA256_CHUNK_REQUIRED');
    this.#length += BigInt(bytes.byteLength);
    let offset = 0;
    if (this.#used) {
      const count = Math.min(64 - this.#used, bytes.byteLength);
      this.#pending.set(bytes.subarray(0, count), this.#used);
      this.#used += count;
      offset += count;
      if (this.#used === 64) {
        this.#compress(this.#pending);
        this.#used = 0;
      }
    }
    while (offset + 64 <= bytes.byteLength) {
      this.#compress(bytes, offset);
      offset += 64;
    }
    if (offset < bytes.byteLength) {
      this.#pending.set(bytes.subarray(offset), 0);
      this.#used = bytes.byteLength - offset;
    }
    return this;
  }

  digestHex() {
    if (this.#finished) throw Error('SHA256_ALREADY_FINALIZED');
    this.#finished = true;
    const lengthBits = (this.#length * 8n) & 0xffffffffffffffffn;
    this.#pending[this.#used++] = 0x80;
    if (this.#used > 56) {
      this.#pending.fill(0, this.#used);
      this.#compress(this.#pending);
      this.#used = 0;
    }
    this.#pending.fill(0, this.#used, 56);
    for (let i = 0; i < 8; i++) {
      this.#pending[56 + i] = Number((lengthBits >> BigInt((7 - i) * 8)) & 0xffn);
    }
    this.#compress(this.#pending);
    return [...this.#state].map(toHex).join('');
  }
}
