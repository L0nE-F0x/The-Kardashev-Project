import zlib from 'node:zlib';
import { paletteTable } from '../../src/render/palette';
import type { PixelCanvas } from '../../src/render/pixels';

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc(bytes: Uint8Array): number {
  let c = -1;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

/** Encode RGBA bytes as a PNG (node only — used by preview tests). */
export function encodePngRgba(w: number, h: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Flatten indexed canvases (bottom → top) to RGBA, optionally upscaled by an integer. */
export function pixelCanvasToPng(layers: PixelCanvas[], scale = 1, background = [11, 10, 18]): Buffer {
  const base = layers[0];
  const w = base.w * scale;
  const h = base.h * scale;
  const out = new Uint8Array(w * h * 4);
  const pal = paletteTable();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      out[o] = background[0];
      out[o + 1] = background[1];
      out[o + 2] = background[2];
      out[o + 3] = 255;
      for (const layer of layers) {
        const c = layer.data[Math.floor(y / scale) * layer.w + Math.floor(x / scale)];
        if (!c) continue;
        out[o] = pal[c * 4];
        out[o + 1] = pal[c * 4 + 1];
        out[o + 2] = pal[c * 4 + 2];
      }
    }
  }
  return encodePngRgba(w, h, out);
}
