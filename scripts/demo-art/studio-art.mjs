#!/usr/bin/env node
/**
 * Generated pictures for the Golden Hour Weddings and Loop Local Media showcases, where
 * no free photograph can honestly show the thing: an album's cover
 * materials and sizes, a per-plate catering card, an agency's printed
 * standee, table tent, brand-kit pack and a sample monthly report.
 *
 * Each is a small SVG, written to `scripts/demo-art/studio/<key>.svg` to
 * look at, and into `packages/database/src/seed/showcase/studio-art.ts` as
 * a `data:` URI. A data URI because every surface that draws these — the
 * merchant site (saroh.app), the product editor (app.saroh.in), the post
 * renderer — uses a plain <img> with no next/image allowlist or img-src
 * policy, and a URI renders the same on every host without a file being
 * served from any app's public folder.
 *
 *   node scripts/demo-art/studio-art.mjs && npx prettier --write packages/database/src/seed/showcase/studio-art.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const outDir = new URL("scripts/demo-art/studio/", root);
mkdirSync(outDir, { recursive: true });

const W = 1600;
const H = 1200;
const serif = "Georgia, 'Times New Roman', serif";
const sans = "'Helvetica Neue', Arial, sans-serif";

const svg = (body, w = W, h = H) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** A closed flush-mount album, lying at a slight angle, with its cover. */
function album({ cover, spine, texture, title, sub, ground, ink = "#f4ead8" }) {
    return svg(`
<defs>${texture}</defs>
<rect width="${W}" height="${H}" fill="${ground}"/>
<ellipse cx="800" cy="1010" rx="560" ry="60" fill="#000" opacity="0.12"/>
<g transform="rotate(-4 800 600)">
<rect x="330" y="170" width="940" height="780" rx="14" fill="${spine}"/>
<rect x="350" y="160" width="920" height="780" rx="12" fill="${cover}"/>
<rect x="350" y="160" width="920" height="780" rx="12" fill="url(#tex)"/>
<rect x="350" y="160" width="60" height="780" fill="#000" opacity="0.10"/>
<text x="840" y="540" text-anchor="middle" font-family="${serif}" font-size="74" fill="${ink}" opacity="0.92" letter-spacing="6">${title}</text>
<text x="840" y="610" text-anchor="middle" font-family="${serif}" font-size="30" fill="${ink}" opacity="0.75" letter-spacing="10">${sub}</text>
</g>`);
}

const ART = {
    albumLinen: {
        alt: "A wedding album with a sand linen cover, initials stamped in gold",
        svg: album({
            ground: "#efe9df",
            cover: "#cbbda3",
            ink: "#7a5a22",
            spine: "#a89a80",
            texture: `<pattern id="tex" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 4h8M4 0v8" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.2"/></pattern>`,
            title: "A &amp; K",
            sub: "UDAIPUR · 2026",
        }),
    },
    albumLeather: {
        alt: "A wedding album bound in deep maroon leather, initials stamped in gold",
        svg: album({
            ground: "#ece6dc",
            cover: "#6b1f24",
            spine: "#4d1418",
            texture: `<radialGradient id="tex" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/></radialGradient>`,
            title: "R &amp; D",
            sub: "JAIPUR · 2026",
        }),
    },
    albumAcrylic: {
        alt: "A wedding album with a glossy acrylic photo cover of a couple at sunset",
        svg: svg(`
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6b56b"/><stop offset="0.55" stop-color="#e2735a"/><stop offset="1" stop-color="#5a2a3c"/></linearGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.35" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="#e9e4dc"/>
<ellipse cx="800" cy="1010" rx="560" ry="60" fill="#000" opacity="0.12"/>
<g transform="rotate(-4 800 600)">
<rect x="330" y="170" width="940" height="780" rx="14" fill="#2b2b2b"/>
<rect x="350" y="160" width="920" height="780" rx="12" fill="url(#sky)"/>
<circle cx="980" cy="560" r="90" fill="#ffd9a0" opacity="0.9"/>
<path d="M350 700 Q600 640 820 690 T1270 660 V940 H350Z" fill="#3a1e2c"/>
<path d="M740 700 q18-70 40-70 q22 0 30 70z M800 705 q14-60 36-60 q20 0 26 60z" fill="#1d0f17"/>
<rect x="350" y="160" width="920" height="780" rx="12" fill="url(#gloss)"/>
</g>`),
    },
    albumSizes: {
        alt: "The three album sizes side by side: 10 by 12, 12 by 15 and 12 by 18 inches",
        svg: svg(`
<rect width="${W}" height="${H}" fill="#f4efe6"/>
<g font-family="${sans}" fill="#3b3128">
<rect x="150" y="430" width="300" height="360" rx="8" fill="#d8ccb6" stroke="#a89a80" stroke-width="4"/>
<rect x="560" y="340" width="375" height="450" rx="8" fill="#cfc0a6" stroke="#a89a80" stroke-width="4"/>
<rect x="1040" y="250" width="450" height="540" rx="8" fill="#c4b393" stroke="#a89a80" stroke-width="4"/>
<text x="300" y="860" text-anchor="middle" font-size="52" font-family="${serif}">10 × 12</text>
<text x="747" y="860" text-anchor="middle" font-size="52" font-family="${serif}">12 × 15</text>
<text x="1265" y="860" text-anchor="middle" font-size="52" font-family="${serif}">12 × 18</text>
<text x="800" y="150" text-anchor="middle" font-size="44" letter-spacing="8">ALBUM SIZES, IN INCHES</text>
<text x="800" y="960" text-anchor="middle" font-size="34" fill="#7a6b5a">30, 40 or 50 pages · linen, leather or acrylic</text>
</g>`),
    },
    canvasWall: {
        alt: "A large gallery-wrapped canvas of a couple at sunset hanging above a sofa",
        svg: svg(`
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3b36c"/><stop offset="0.6" stop-color="#d9684f"/><stop offset="1" stop-color="#4f2433"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="#e9e1d4"/>
<rect x="430" y="150" width="740" height="500" fill="#3a2a2a" opacity="0.25" transform="translate(14 14)"/>
<rect x="430" y="150" width="740" height="500" fill="url(#sky)"/>
<circle cx="900" cy="420" r="70" fill="#ffd9a0" opacity="0.9"/>
<path d="M430 520 Q640 470 820 510 T1170 490 V650 H430Z" fill="#33192a"/>
<path d="M760 520 q14-60 34-60 q18 0 26 60z M812 524 q12-52 30-52 q16 0 22 52z" fill="#1c0e16"/>
<rect x="300" y="820" width="1000" height="200" rx="40" fill="#8a7a66"/>
<rect x="260" y="760" width="1080" height="110" rx="40" fill="#9c8b75"/>
<rect x="0" y="1020" width="${W}" height="180" fill="#cdbfa9"/>`),
    },
    frameDesk: {
        alt: "A sheesham wood frame with a white mount holding a wedding photograph, standing on a desk",
        svg: svg(`
<rect width="${W}" height="${H}" fill="#efe8dd"/>
<rect y="820" width="${W}" height="380" fill="#b98f62"/>
<rect x="560" y="200" width="480" height="620" rx="6" fill="#6b4226"/>
<rect x="600" y="240" width="400" height="540" fill="#fbf8f2"/>
<rect x="660" y="300" width="280" height="400" fill="#c9a07a"/>
<path d="M660 600 Q760 560 800 600 T940 590 V700 H660Z" fill="#7a3b2e"/>
<circle cx="800" cy="440" r="60" fill="#f2d3a8"/>
<ellipse cx="800" cy="830" rx="300" ry="18" fill="#000" opacity="0.15"/>`),
    },
    printBox: {
        alt: "A linen keepsake box with a stack of printed wedding photographs beside it",
        svg: svg(`
<rect width="${W}" height="${H}" fill="#ece5da"/>
<rect x="300" y="380" width="620" height="460" rx="12" fill="#cbbda3"/>
<rect x="300" y="380" width="620" height="90" rx="12" fill="#b7a789"/>
<text x="610" y="680" text-anchor="middle" font-family="${serif}" font-size="54" fill="#7a5a22" letter-spacing="6">N &amp; S</text>
<g transform="rotate(6 1150 600)"><rect x="980" y="380" width="340" height="460" fill="#fff" stroke="#ddd3c4" stroke-width="3"/><rect x="1005" y="405" width="290" height="360" fill="#9c6b4e"/></g>
<g transform="rotate(-3 1130 620)"><rect x="960" y="400" width="340" height="460" fill="#fff" stroke="#ddd3c4" stroke-width="3"/><rect x="985" y="425" width="290" height="360" fill="#d8a35f"/></g>
<ellipse cx="800" cy="880" rx="560" ry="30" fill="#000" opacity="0.12"/>`),
    },
    cateringMenu: {
        alt: "Golden Hour's per-plate catering card: veg classic, veg royal Rajasthani, non-veg classic and non-veg royal, with prices",
        svg: svg(`
<rect width="${W}" height="${H}" fill="#7a1f1f"/>
<rect x="120" y="90" width="1360" height="1020" rx="18" fill="#fbf4e6"/>
<rect x="150" y="120" width="1300" height="960" rx="12" fill="none" stroke="#c9963b" stroke-width="3"/>
<g font-family="${serif}" fill="#4a1a12" text-anchor="middle">
<text x="800" y="240" font-size="40" letter-spacing="10" fill="#9c6b1e">GOLDEN HOUR · CATERING</text>
<text x="800" y="330" font-size="72">Per plate, includes GST</text>
</g>
<g font-family="${serif}" fill="#3b2418" font-size="50">
<text x="260" y="490">Veg classic</text><text x="1340" y="490" text-anchor="end">₹1,450</text>
<text x="260" y="620">Veg royal Rajasthani</text><text x="1340" y="620" text-anchor="end">₹2,100</text>
<text x="260" y="750">Non-veg classic</text><text x="1340" y="750" text-anchor="end">₹1,850</text>
<text x="260" y="880">Non-veg royal</text><text x="1340" y="880" text-anchor="end">₹2,600</text>
</g>
<g stroke="#e3cfa4" stroke-width="2"><path d="M260 530H1340M260 660H1340M260 790H1340"/></g>
<text x="800" y="1000" text-anchor="middle" font-family="${sans}" font-size="30" fill="#7a5a3a">Minimum 100 plates · final count billed after the event</text>`),
    },
    standee: {
        alt: "A printed tabletop standee asking customers to review the business on Google, with a QR code",
        svg: (() => {
            let qr = "";
            // A decorative QR-like pattern: seeded, not a scannable code.
            let s = 7;
            for (let y = 0; y < 21; y++)
                for (let x = 0; x < 21; x++) {
                    s = (s * 1103515245 + 12345) % 2147483648;
                    const finder =
                        (x < 7 && y < 7) ||
                        (x > 13 && y < 7) ||
                        (x < 7 && y > 13);
                    if (finder) continue;
                    if (s % 3 === 0)
                        qr += `<rect x="${640 + x * 15}" y="${520 + y * 15}" width="15" height="15"/>`;
                }
            const finder = (x, y) =>
                `<rect x="${x}" y="${y}" width="105" height="105" fill="#1f2937"/><rect x="${x + 15}" y="${y + 15}" width="75" height="75" fill="#fff"/><rect x="${x + 30}" y="${y + 30}" width="45" height="45" fill="#1f2937"/>`;
            return svg(`
<rect width="${W}" height="${H}" fill="#e8e1d6"/>
<ellipse cx="800" cy="1060" rx="420" ry="40" fill="#000" opacity="0.15"/>
<path d="M520 1050 L560 120 H1040 L1080 1050Z" fill="#fffaf2" stroke="#d6cbb8" stroke-width="4"/>
<rect x="560" y="120" width="480" height="150" fill="#e0703a"/>
<text x="800" y="215" text-anchor="middle" font-family="${sans}" font-weight="700" font-size="54" fill="#fff">Loved it?</text>
<text x="800" y="380" text-anchor="middle" font-family="${sans}" font-size="40" fill="#3b2f25">Tell others on Google</text>
<text x="800" y="440" text-anchor="middle" font-family="${sans}" font-size="30" fill="#7a6a58">Scan · tap a star · done</text>
<g fill="#1f2937">${qr}</g>${finder(640, 520)}${finder(850, 520)}${finder(640, 730)}
<text x="800" y="960" text-anchor="middle" font-family="${sans}" font-size="28" fill="#7a6a58">A5 standee · printed by Loop Local Media</text>`);
        })(),
    },
    tableTent: {
        alt: "A folded table tent card on a café table with the café's Instagram handle and a review prompt",
        svg: svg(`
<rect width="${W}" height="${H}" fill="#c9a27a"/>
<rect y="760" width="${W}" height="440" fill="#8a5a36"/>
<path d="M430 860 L620 300 H980 L1170 860Z" fill="#fff8ee"/>
<path d="M620 300 L800 260 L980 300" fill="#efe4d2"/>
<rect x="660" y="360" width="280" height="70" rx="35" fill="#2f6b4f"/>
<text x="800" y="407" text-anchor="middle" font-family="${sans}" font-weight="700" font-size="34" fill="#fff">KULHAD &amp; CO.</text>
<text x="800" y="520" text-anchor="middle" font-family="${serif}" font-size="46" fill="#3b2a1e">Chai's on us</text>
<text x="800" y="580" text-anchor="middle" font-family="${sans}" font-size="28" fill="#6b5442">when you post your cup and tag us</text>
<text x="800" y="680" text-anchor="middle" font-family="${sans}" font-size="30" fill="#2f6b4f">@kulhadandco.indore</text>
<text x="800" y="1080" text-anchor="middle" font-family="${sans}" font-size="28" fill="#f5e6d3">Table tents · pack of 10</text>`),
    },
    brandKit: {
        alt: "A printed brand kit pack fanned out: logo sheet, colour palette swatches and type specimen cards",
        svg: svg(`
<rect width="${W}" height="${H}" fill="#efeae2"/>
<g transform="rotate(-8 700 600)"><rect x="300" y="250" width="620" height="760" rx="10" fill="#ffffff" stroke="#ddd3c4" stroke-width="3"/>
<circle cx="610" cy="520" r="140" fill="#e0703a"/><text x="610" y="545" text-anchor="middle" font-family="${serif}" font-size="74" fill="#fff">G</text>
<text x="610" y="760" text-anchor="middle" font-family="${sans}" font-size="40" letter-spacing="6" fill="#2b2b2b">GLOW THEORY</text></g>
<g transform="rotate(4 1100 600)"><rect x="820" y="230" width="560" height="760" rx="10" fill="#ffffff" stroke="#ddd3c4" stroke-width="3"/>
<rect x="870" y="290" width="460" height="120" fill="#e0703a"/><rect x="870" y="420" width="460" height="120" fill="#2b3a55"/><rect x="870" y="550" width="460" height="120" fill="#f2c9a0"/><rect x="870" y="680" width="460" height="120" fill="#f7f1e8" stroke="#e6dccb"/>
<text x="880" y="900" font-family="${sans}" font-size="30" fill="#5b5146">Palette · type · 20 templates</text></g>`),
    },
    reportSample: {
        alt: "A one-page monthly report: reach, saves, calls from Google and cost per enquiry, with a small bar chart",
        svg: (() => {
            const bars = [42, 55, 51, 63, 70, 66, 81, 88, 79, 92, 104, 110]
                .map(
                    (v, i) =>
                        `<rect x="${240 + i * 95}" y="${980 - v * 4}" width="60" height="${v * 4}" rx="6" fill="${i === 11 ? "#e0703a" : "#c9bba6"}"/>`,
                )
                .join("");
            return svg(`
<rect width="${W}" height="${H}" fill="#f6f2ec"/>
<rect x="140" y="80" width="1320" height="1040" rx="16" fill="#fff" stroke="#e4dbcd" stroke-width="3"/>
<text x="220" y="190" font-family="${sans}" font-weight="700" font-size="48" fill="#2b2b2b">Monthly report · September</text>
<text x="220" y="245" font-family="${sans}" font-size="30" fill="#7a6e60">Sample · figures for illustration</text>
<g font-family="${sans}">
<text x="220" y="350" font-size="28" fill="#7a6e60">Reach</text><text x="220" y="410" font-size="56" fill="#2b2b2b">48.2k</text>
<text x="520" y="350" font-size="28" fill="#7a6e60">Saves</text><text x="520" y="410" font-size="56" fill="#2b2b2b">1,140</text>
<text x="820" y="350" font-size="28" fill="#7a6e60">Calls from Google</text><text x="820" y="410" font-size="56" fill="#2b2b2b">73</text>
<text x="1160" y="350" font-size="28" fill="#7a6e60">Cost per enquiry</text><text x="1160" y="410" font-size="56" fill="#2b2b2b">₹212</text>
</g>${bars}
<path d="M220 980H1420" stroke="#d8cdbc" stroke-width="3"/>`);
        })(),
    },
};

const entries = Object.entries(ART).map(([key, { alt, svg: body }]) => {
    const clean = body.replace(/\n/g, "").replace(/>\s+</g, "><");
    writeFileSync(new URL(`${key}.svg`, outDir), clean + "\n");
    const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
    return `    ${key}: {\n        url: ${JSON.stringify(uri)},\n        alt: ${JSON.stringify(alt.replace(/&amp;/g, "&"))},\n        width: ${W},\n        height: ${H},\n        creditName: null,\n        creditUrl: null,\n    },`;
});

writeFileSync(
    new URL("packages/database/src/seed/showcase/studio-art.ts", root),
    `// GENERATED by scripts/demo-art/studio-art.mjs — edit that, then run it.
import type { StudioImage } from "./studio-types";

/**
 * Pictures no free photograph can honestly show (album covers and sizes, a
 * catering card, printed standees, a brand kit, a sample report), drawn as
 * SVG and carried as data URIs so they render on every host.
 */
export const STUDIO_ART = {
${entries.join("\n")}
} as const satisfies Record<string, StudioImage>;
`,
);
console.log(`studio-art: ${entries.length} pictures written.`);
