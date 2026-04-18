#!/usr/bin/env node
/**
 * Remove near-white background from logo.png, then:
 * - reactive-mark.png — icon-only (top slice; no wordmark/tagline)
 * - reactive-logo.png — full image (optional archive)
 * Favicons use the mark only.
 *
 * Tweak slice: LOGO_MARK_RATIO=0.45 node scripts/strip-logo-bg.mjs (fraction of height)
 */
import fs from "fs";
import pathMod from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));
const root = pathMod.join(__dirname, "..");
const src = pathMod.join(root, "logo.png");
const outFull = pathMod.join(root, "apps", "web", "public", "reactive-logo.png");
const outMark = pathMod.join(root, "apps", "web", "public", "reactive-mark.png");

const markRatio = Math.min(0.65, Math.max(0.28, Number(process.env.LOGO_MARK_RATIO) || 0.48));

if (!fs.existsSync(src)) {
  console.error("Missing logo.png at repo root");
  process.exit(1);
}

const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const px = new Uint8ClampedArray(data);

for (let i = 0; i < px.length; i += channels) {
  const r = px[i];
  const g = px[i + 1];
  const b = px[i + 2];
  const a = px[i + 3];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const lum = (r + g + b) / 3;

  // Strong white / off-white paper background
  if (lum > 252 && sat < 0.08) {
    px[i + 3] = 0;
    continue;
  }
  // Soft anti-halo for light gray fringe near old edge
  if (lum > 238 && sat < 0.12) {
    const t = (lum - 238) / 14;
    px[i + 3] = Math.round(a * (1 - Math.min(1, t)));
  }
}

const pngBuf = await sharp(Buffer.from(px), {
  raw: { width, height, channels: 4 },
})
  .png({ compressionLevel: 9 })
  .toBuffer();

const publicDir = pathMod.join(root, "apps", "web", "public");
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(outFull, pngBuf);

const markH = Math.max(32, Math.floor(height * markRatio));
const markBuf = await sharp(pngBuf)
  .extract({ left: 0, top: 0, width, height: markH })
  .png({ compressionLevel: 9 })
  .toBuffer();
fs.writeFileSync(outMark, markBuf);

await sharp(markBuf).resize(32, 32, { fit: "inside" }).png().toFile(pathMod.join(publicDir, "favicon-32.png"));

const touchBg = { r: 12, g: 12, b: 16, alpha: 1 };
await sharp(markBuf)
  .resize(180, 180, { fit: "contain", background: touchBg })
  .png()
  .toFile(pathMod.join(publicDir, "apple-touch-icon.png"));

console.log(
  "Wrote",
  outFull,
  `${width}x${height}`,
  "| mark",
  outMark,
  `${width}x${markH} (ratio ${markRatio})`,
  "+ favicon-32.png, apple-touch-icon.png"
);
