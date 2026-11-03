import bwipjs from 'bwip-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';

/**
 * Writes a Y4M video file for Chromium's fake camera: a still picture of a
 * FAKE Code 128 label, centred on a white background, repeated a few frames.
 * (Generated at test time, not stored in the repository.)
 */
export async function writeFakeCameraFile(path: string, text: string): Promise<void> {
  const W = 640;
  const H = 480;
  const png = PNG.sync.read(await bwipjs.toBuffer({ bcid: 'code128', text, scale: 3, height: 18, includetext: false, paddingwidth: 12, paddingheight: 8, backgroundcolor: 'FFFFFF' }));

  const y = Buffer.alloc(W * H, 255); // white
  const ox = Math.max(0, Math.floor((W - png.width) / 2));
  const oy = Math.max(0, Math.floor((H - png.height) / 2));
  for (let r = 0; r < png.height && r + oy < H; r++) {
    for (let c = 0; c < png.width && c + ox < W; c++) {
      const i = (r * png.width + c) * 4;
      y[(r + oy) * W + c + ox] = Math.round(0.299 * png.data[i]! + 0.587 * png.data[i + 1]! + 0.114 * png.data[i + 2]!);
    }
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, chroma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([header, ...Array.from({ length: 10 }, () => frame)]));
}
