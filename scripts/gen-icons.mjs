/**
 * Generates all PWA icons and iOS splash screens as SVG → PNG via sips.
 * Run once: node scripts/gen-icons.mjs
 */
import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// ─── Icon SVG (dark bg, white mic + wordmark) ───────────────────────────────
function iconSVG(size) {
  const s = size;
  const r = Math.round(s * 0.18); // corner radius
  const cx = s / 2;
  const cy = s / 2;

  // mic body proportions
  const mw = s * 0.18;
  const mh = s * 0.28;
  const mx = cx - mw / 2;
  const my = cy - s * 0.22;
  const mr = mw / 2;

  // stand arc
  const arcR = s * 0.22;
  const arcY = cy + s * 0.06;

  // stand line
  const lineX = cx;
  const lineY1 = arcY + arcR - s * 0.01;
  const lineY2 = lineY1 + s * 0.07;
  const lineW = s * 0.12;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${r}" fill="#0a0a0a"/>
  <!-- mic capsule -->
  <rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="${mr}" fill="white"/>
  <!-- stand arc -->
  <path d="M ${cx - arcR} ${arcY} A ${arcR} ${arcR} 0 0 0 ${cx + arcR} ${arcY}"
        stroke="white" stroke-width="${s * 0.04}" fill="none" stroke-linecap="round"/>
  <!-- stand pole -->
  <line x1="${lineX}" y1="${lineY1}" x2="${lineX}" y2="${lineY2}"
        stroke="white" stroke-width="${s * 0.04}" stroke-linecap="round"/>
  <!-- base -->
  <rect x="${cx - lineW / 2}" y="${lineY2}" width="${lineW}" height="${s * 0.025}"
        rx="${s * 0.012}" fill="white"/>
</svg>`;
}

// ─── Splash SVG ──────────────────────────────────────────────────────────────
function splashSVG(w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const iconSize = Math.min(w, h) * 0.18;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#0a0a0a"/>
  <!-- centered mic icon -->
  ${iconSVG(iconSize).replace(`<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}">`, `<g transform="translate(${cx - iconSize / 2}, ${cy - iconSize / 2})">`).replace("</svg>", "</g>")}
  <!-- wordmark -->
  <text x="${cx}" y="${cy + iconSize * 0.75}"
        font-family="-apple-system, BlinkMacSystemFont, sans-serif"
        font-size="${Math.round(iconSize * 0.28)}"
        font-weight="600" fill="white" text-anchor="middle" letter-spacing="2">
    JUSTDILO
  </text>
</svg>`;
}

function writeSVGandConvert(svgContent, outPath, w, h) {
  const tmpSVG = outPath.replace(".png", ".svg");
  writeFileSync(tmpSVG, svgContent);
  // sips converts SVG → PNG natively on macOS
  execSync(`sips -s format png "${tmpSVG}" --out "${outPath}" --resampleWidth ${w} 2>/dev/null || true`);
  execSync(`rm "${tmpSVG}"`);
  console.log(`  ✓ ${outPath.split("/public/")[1]} (${w}×${h})`);
}

// ─── Icon sizes ──────────────────────────────────────────────────────────────
const iconSizes = [16, 32, 57, 60, 72, 76, 114, 120, 144, 152, 167, 180, 192, 512];

console.log("\n📱 Generating icons…");
for (const size of iconSizes) {
  const out = join(root, `public/icons/icon-${size}.png`);
  writeSVGandConvert(iconSVG(size), out, size, size);
}

// apple-touch-icon (must be 180)
execSync(`cp "${join(root, "public/icons/icon-180.png")}" "${join(root, "public/apple-touch-icon.png")}"`);
console.log("  ✓ apple-touch-icon.png (180×180)");

// favicon
execSync(`cp "${join(root, "public/icons/icon-32.png")}" "${join(root, "public/favicon.png")}"`);
console.log("  ✓ favicon.png (32×32)");

// ─── iOS Splash screens (portrait) ───────────────────────────────────────────
const splashes = [
  // [width, height, device]
  [2048, 2732, "ipad-pro-12-9"],
  [1668, 2388, "ipad-pro-11"],
  [1668, 2224, "ipad-10-5"],
  [1536, 2048, "ipad-mini"],
  [1290, 2796, "iphone-pro-max-17"],
  [1179, 2556, "iphone-pro-15"],
  [1170, 2532, "iphone-13-14"],
  [1125, 2436, "iphone-x-11-pro"],
  [1242, 2688, "iphone-xs-max"],
  [828,  1792, "iphone-xr-11"],
  [750,  1334, "iphone-8"],
  [640,  1136, "iphone-se"],
];

console.log("\n📱 Generating splash screens…");
for (const [w, h, name] of splashes) {
  const out = join(root, `public/splash/splash-${name}.png`);
  writeSVGandConvert(splashSVG(w, h), out, w, h);
}

console.log("\n✅ All assets generated.\n");
