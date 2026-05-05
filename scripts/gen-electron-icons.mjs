/**
 * Generates Electron app icons from the existing 512x512 PNG.
 * Outputs: build/icons/icon.icns (macOS), build/icons/icon.ico (Windows), build/icons/icon.png
 * Requires: macOS (uses sips + iconutil)
 * Run once before building: node scripts/gen-electron-icons.mjs
 */
import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, rmSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'public/icons/icon-512.png');
const outDir = join(root, 'build/icons');

mkdirSync(outDir, { recursive: true });

// ─── icon.png (Linux + fallback) ──────────────────────────────────────────────
copyFileSync(src, join(outDir, 'icon.png'));
console.log('✓ build/icons/icon.png');

// ─── icon.icns (macOS) ────────────────────────────────────────────────────────
const iconsetDir = join(outDir, 'icon.iconset');
mkdirSync(iconsetDir, { recursive: true });

// iconutil requires these exact filenames
const macSizes = [16, 32, 64, 128, 256, 512];
for (const size of macSizes) {
  execSync(`sips -s format png "${src}" --out "${join(iconsetDir, `icon_${size}x${size}.png`)}" --resampleWidth ${size} 2>/dev/null`);
  execSync(`sips -s format png "${src}" --out "${join(iconsetDir, `icon_${size}x${size}@2x.png`)}" --resampleWidth ${size * 2} 2>/dev/null`);
}
execSync(`iconutil -c icns "${iconsetDir}" -o "${join(outDir, 'icon.icns')}"`);
rmSync(iconsetDir, { recursive: true });
console.log('✓ build/icons/icon.icns');

// ─── icon.ico (Windows) — multi-resolution ICO ────────────────────────────────
async function buildIco() {
  const { default: pngToIco } = await import('png-to-ico');
  const sizes = [16, 24, 32, 48, 64, 128, 256];

  // Write temp PNGs at each size
  const tmpFiles = [];
  for (const size of sizes) {
    const out = join(outDir, `_tmp_${size}.png`);
    execSync(`sips -s format png "${src}" --out "${out}" --resampleWidth ${size} 2>/dev/null`);
    tmpFiles.push(out);
  }

  const icoBuffer = await pngToIco(tmpFiles);
  const icoPath = join(outDir, 'icon.ico');
  const ws = createWriteStream(icoPath);
  ws.write(icoBuffer);
  ws.end();
  await new Promise(r => ws.on('finish', r));

  // Clean up temp files
  tmpFiles.forEach(f => rmSync(f));
  console.log('✓ build/icons/icon.ico');
}

await buildIco().catch(err => {
  console.warn('⚠ Could not build icon.ico:', err.message);
  console.warn('  Install png-to-ico: npm install --save-dev png-to-ico');
  console.warn('  Then re-run: node scripts/gen-electron-icons.mjs');
});

console.log('\n✅ Electron icons ready in build/icons/\n');
