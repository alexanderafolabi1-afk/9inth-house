// SUPERSEDED. This drew an abstract nine-dot ring from primitives, with no
// image library and no network. The house mark actually in use everywhere
// else, the header glyph and favicon.svg, is the Jupiter glyph on an ivory
// field, and the committed icons/*.png now match that instead: same field
// and gold rule this script draws, but the real mark rendered from
// favicon.svg through a browser rather than approximated from rectangles,
// since a serif character cannot be drawn from primitives without risking a
// mark that only resembles the one everyone already recognises. Running
// this script would overwrite them with the old abstract ring; it is kept
// only as a record of how that ring was drawn. To regenerate the real mark,
// rasterise favicon.svg at each manifest size instead (any Chromium-based
// browser will do; a real font that covers U+2643 is required, such as
// Noto Sans Symbols).

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const IVORY = [251, 247, 238];      // #FBF7EE, the house paper
const GOLD = [169, 127, 47];        // #A97F2F, the house gold
const GOLD_SOFT = [201, 165, 87];   // #C9A557, the lighter rule

/* ---------- PNG writer ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// rgba is a Uint8Array of width * height * 4, top row first.
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // 8 bits per channel
  ihdr[9] = 6;   // truecolour with alpha
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  // One filter byte (0, meaning none) in front of every scanline.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const at = y * (1 + width * 4);
    raw[at] = 0;
    rgba.subarray(y * width * 4, (y + 1) * width * 4).forEach((v, i) => { raw[at + 1 + i] = v; });
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- drawing ---------- */

// A tiny painter over a float buffer at supersampled resolution. Coordinates
// are given in the 0..1 unit square so the same drawing code serves every size.
function draw(size, scale, { maskable }) {
  const S = size * scale;
  const px = new Float64Array(S * S * 4);

  const put = (x, y, [r, g, b], a = 1) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    const inv = 1 - a;
    px[i] = px[i] * inv + r * a;
    px[i + 1] = px[i + 1] * inv + g * a;
    px[i + 2] = px[i + 2] * inv + b * a;
    px[i + 3] = px[i + 3] * inv + 255 * a;
  };

  const rect = (x0, y0, x1, y1, colour) => {
    for (let y = Math.round(y0 * S); y < Math.round(y1 * S); y++) {
      for (let x = Math.round(x0 * S); x < Math.round(x1 * S); x++) put(x, y, colour);
    }
  };

  // Rounded rectangle, used for the field on the non-maskable icons.
  const roundRect = (inset, radius, colour) => {
    const a = inset * S, b = (1 - inset) * S, r = radius * S;
    for (let y = Math.floor(a); y < Math.ceil(b); y++) {
      for (let x = Math.floor(a); x < Math.ceil(b); x++) {
        const cx = Math.min(Math.max(x, a + r), b - r);
        const cy = Math.min(Math.max(y, a + r), b - r);
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r) put(x, y, colour);
      }
    }
  };

  const disc = (cx, cy, radius, colour) => {
    const r = radius * S, x0 = (cx - radius) * S, y0 = (cy - radius) * S;
    for (let y = Math.floor(y0); y <= Math.ceil(y0 + 2 * r); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x0 + 2 * r); x++) {
        const dx = x - cx * S, dy = y - cy * S;
        if (dx * dx + dy * dy <= r * r) put(x, y, colour);
      }
    }
  };

  const ring = (cx, cy, radius, thickness, colour) => {
    const outer = (radius + thickness / 2) * S, inner = (radius - thickness / 2) * S;
    for (let y = Math.floor(cy * S - outer); y <= Math.ceil(cy * S + outer); y++) {
      for (let x = Math.floor(cx * S - outer); x <= Math.ceil(cx * S + outer); x++) {
        const dx = x - cx * S, dy = y - cy * S;
        const d2 = dx * dx + dy * dy;
        if (d2 <= outer * outer && d2 >= inner * inner) put(x, y, colour);
      }
    }
  };

  // A maskable icon may be cropped to a circle by the launcher, so the field
  // runs edge to edge and the mark sits inside the 80% safe zone. A standard
  // icon keeps the rounded-square field the rest of the house uses.
  if (maskable) {
    rect(0, 0, 1, 1, IVORY);
  } else {
    roundRect(0.02, 0.20, IVORY);
    ring(0.5, 0.5, 0.455, 0.014, GOLD_SOFT);
  }

  // The mark. Shrunk on maskable icons so nothing important can be cropped.
  const spread = maskable ? 0.255 : 0.30;
  const dot = maskable ? 0.049 : 0.058;

  ring(0.5, 0.5, spread, 0.008, GOLD_SOFT);
  for (let n = 0; n < 9; n++) {
    // Start at twelve o'clock and run clockwise, so the gap never lands on top.
    const angle = (Math.PI * 2 * n) / 9 - Math.PI / 2;
    disc(0.5 + Math.cos(angle) * spread, 0.5 + Math.sin(angle) * spread, dot, GOLD);
  }
  disc(0.5, 0.5, dot * 1.5, GOLD);

  // Average the supersampled buffer down to the target size.
  const out = new Uint8Array(size * size * 4);
  const area = scale * scale;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const i = ((y * scale + sy) * S + (x * scale + sx)) * 4;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; a += px[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / area);
      out[o + 1] = Math.round(g / area);
      out[o + 2] = Math.round(b / area);
      out[o + 3] = Math.round(a / area);
    }
  }
  return out;
}

/* ---------- build ---------- */

mkdirSync('icons', { recursive: true });

// 192 and 512 are the two sizes a manifest is required to carry. 144 and 384
// keep Android from upscaling on mid-density screens, 180 is the iOS home
// screen icon, and 48 is what a desktop tab or a task switcher asks for.
const PLAIN = [48, 144, 180, 192, 384, 512];

for (const size of PLAIN) {
  writeFileSync(`icons/icon-${size}.png`, encodePng(size, size, draw(size, 4, { maskable: false })));
}
for (const size of [192, 512]) {
  writeFileSync(`icons/icon-${size}-maskable.png`, encodePng(size, size, draw(size, 4, { maskable: true })));
}

console.log('Wrote ' + (PLAIN.length + 2) + ' icons to icons/');
