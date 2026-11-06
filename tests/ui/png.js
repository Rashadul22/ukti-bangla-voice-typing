// A minimal PNG decoder for screenshot comparison: 8-bit RGB or RGBA, no
// interlacing, which is what Chromium writes. No dependency.
const zlib = require('node:zlib');

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let at = 8, width, height, depth, type;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), kind = buf.toString('ascii', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; }
    if (kind === 'IDAT') idat.push(data);
    if (kind === 'IEND') break;
    at += 12 + len;
  }
  if (depth !== 8 || (type !== 6 && type !== 2)) throw new Error(`unsupported PNG: depth ${depth} type ${type}`);
  const bpp = type === 6 ? 4 : 3, stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, up = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[up + x] : 0, c = (x >= bpp && y) ? px[up + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? b : c; }
      px[row + x] = v & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < px.length; i += bpp, j += 4) {
    rgba[j] = px[i]; rgba[j + 1] = px[i + 1]; rgba[j + 2] = px[i + 2]; rgba[j + 3] = bpp === 4 ? px[i + 3] : 255;
  }
  return { width, height, rgba };
}

// Share of pixels that differ by more than `tolerance` in any channel.
function diff(a, b, tolerance = 24) {
  if (a.width !== b.width || a.height !== b.height) return { sizeChanged: true, share: 1 };
  let n = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    if (Math.abs(a.rgba[i] - b.rgba[i]) > tolerance || Math.abs(a.rgba[i + 1] - b.rgba[i + 1]) > tolerance ||
        Math.abs(a.rgba[i + 2] - b.rgba[i + 2]) > tolerance) n++;
  }
  return { sizeChanged: false, share: n / (a.width * a.height) };
}

module.exports = { decode, diff };
