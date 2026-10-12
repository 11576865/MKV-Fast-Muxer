// Deterministic R-02 *test-only* fixture encoder shared by independent
// MKVToolNix research and Chromium extraction scenarios.
// NOT a product Matroska authoring backend.
export const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQTX3+HwAEdQJpxgFBFwAAAABJRU5ErkJggg==',
  'base64',
);
function sizeVint(value) {
  for (let width = 1; width <= 8; width += 1) {
    if (value < (2 ** (width * 7)) - 1) {
      const bytes = Buffer.alloc(width);
      let n = BigInt(value) | (1n << BigInt(width * 7));
      for (let i = width - 1; i >= 0; i--) {
        bytes[i] = Number(n & 255n);
        n >>= 8n;
      }
      return bytes;
    }
  }
  throw new Error('R02_EBML_ELEMENT_TOO_LARGE');
}
const element = (id, data) => Buffer.concat([
  Buffer.from(id, 'hex'), sizeVint(data.length), data,
]);
const unsigned = number => {
  let value = BigInt(number);
  const bytes = [];
  do {
    bytes.unshift(Number(value & 255n));
    value >>= 8n;
  } while (value > 0n);
  return Buffer.from(bytes);
};
const text = value => Buffer.from(value, 'utf8');
const all = parts => Buffer.concat(parts);

export function createResearchFixture() {
  const header = element('1A45DFA3', all([
    element('4286', unsigned(1)), element('42F7', unsigned(1)),
    element('42F2', unsigned(4)), element('42F3', unsigned(8)),
    element('4282', text('matroska')), element('4287', unsigned(4)),
    element('4285', unsigned(2)),
  ]));
  const info = element('1549A966', all([
    element('2AD7B1', unsigned(1000000)),
    element('4D80', text('R02 research fixture')),
    element('5741', text('R02 research fixture')),
  ]));
  const attachedFile = element('61A7', all([
    element('466E', text('pixel.png')),
    element('4660', text('image/png')),
    element('465C', pngBytes),
    element('46AE', unsigned(42)),
  ]));
  // No Tracks, Cluster or invented static video.
  return Buffer.concat([
    header, element('18538067', all([info, element('1941A469', attachedFile)])),
  ]);
}
