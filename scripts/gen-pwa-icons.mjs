// One-off ops helper (NOT part of the build): regenerates the PWA app icons in public/.
// Pure Node (zlib) PNG writer — no image dependencies. Run: node scripts/gen-pwa-icons.mjs
// Placeholder artwork (a ball on the brand green); swap the PNGs for real artwork anytime.
import fs from 'node:fs';
import zlib from 'node:zlib';

function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (~c) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function png(size, draw) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    for (let x = 0; x < size; x++) { const [r, g, b, a] = draw(x, y); const o = y * (stride + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const BG = [17, 25, 22, 255];       // #111916 brand background (matches theme-color)
const BALL = [240, 248, 244, 255];  // near-white ball
const RING = [63, 174, 106, 255];   // #3fae6a accent ring

function makeIcon(size, ballScale) {
  const cx = size / 2, cy = size / 2, R = (size * ballScale) / 2;
  return png(size, (x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= R) return dist > R * 0.82 ? RING : BALL;
    return BG;
  });
}

fs.writeFileSync('public/icon-192.png', makeIcon(192, 0.72));
fs.writeFileSync('public/icon-512.png', makeIcon(512, 0.72));
fs.writeFileSync('public/icon-maskable-512.png', makeIcon(512, 0.56)); // extra padding for maskable safe zone
console.log('PWA icons written: public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png');
