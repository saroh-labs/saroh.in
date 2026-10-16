#!/usr/bin/env node
/**
 * Every photo the Leela & Loom, Rye & Co., Frame & Vow, Pixel & Chai, Ammi's
 * Achaar and Pagdandi Books showcases seed must load (#471, #522).
 *
 * The boutique's photos are free-licence Unsplash images hot-linked by
 * address, because local storage does not persist uploads. A photo that stops
 * loading would put a broken image in front of a camera, so this asks each
 * address once and fails on anything but an image. Run it before changing the
 * catalogue, and before filming:
 *
 *   node scripts/check-demo-images.mjs
 *
 * It needs the network; the seed itself never does.
 */
import { readFileSync } from "node:fs";

const read = (file) =>
    readFileSync(
        new URL(
            `../packages/database/src/seed/showcase/${file}`,
            import.meta.url,
        ),
        "utf8",
    );
const boutique = read("boutique-catalog.ts");
// Rye & Co.'s photos (#522) are written as unsplash("photo-…").
const bakery = read("bakery-product-page.ts");
// Frame & Vow's and Pixel & Chai's photos are tables of Unsplash ids in their
// writing; their sites and catalogues pick from the same tables
// (`studio-photos.ts`). Their drawn pictures are data URIs and need no network.
const studios = ["frame-vow-posts.ts", "pixel-chai-posts.ts"]
    .map(read)
    .join("\n");
const urls = [
    ...new Set([
        ...[...studios.matchAll(/"(photo-\d+-[0-9a-f]+)"/g)].map(
            (m) =>
                `https://images.unsplash.com/${m[1]}?w=1600&q=80&auto=format&fit=crop`,
        ),
        ...[...boutique.matchAll(/"url":\s*"([^"]+)"|url:\s*"([^"]+)"/g)].map(
            (m) => m[1] ?? m[2],
        ),
        ...[...bakery.matchAll(/unsplash\("([^"]+)"\)/g)].map(
            (m) =>
                `https://images.unsplash.com/${m[1]}?w=1600&q=80&auto=format&fit=crop`,
        ),
    ]),
];

// Ammi's Achaar and Pagdandi Books (catalogue and journal) name Unsplash
// photos by id, often through a helper, so every id in their files counts.
const demoShops = [
    "achaar-catalog.ts",
    "achaar-posts.ts",
    "pagdandi-catalog.ts",
    "pagdandi-posts.ts",
].map(read);
for (const text of demoShops) {
    for (const m of text.matchAll(/\b(\d{10,13}-[0-9a-f]{12})\b/g)) {
        urls.push(`https://images.unsplash.com/photo-${m[1]}?w=1600&q=80&auto=format&fit=crop`);
    }
}
// Generated images (Pagdandi's book covers) are data: URIs, checked offline.
let failed = 0;
let generated = 0;
for (const text of [...demoShops, read("pagdandi-covers.ts")]) {
    for (const m of text.matchAll(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g)) {
        generated += 1;
        const svg = Buffer.from(m[1], "base64").toString("utf8");
        if (!svg.trimStart().startsWith("<svg") || !svg.trimEnd().endsWith("</svg>")) {
            failed += 1;
            console.error(`✗ a generated image is not a whole SVG: ${svg.slice(0, 60)}`);
        }
    }
}
const unique = [...new Set(urls)];
urls.length = 0;
urls.push(...unique);
const queue = [...urls];
async function worker() {
    for (let url = queue.shift(); url; url = queue.shift()) {
        try {
            const res = await fetch(url, { method: "GET" });
            const type = res.headers.get("content-type") ?? "";
            await res.body?.cancel();
            if (!res.ok || !type.startsWith("image/")) {
                failed += 1;
                console.error(`✗ ${res.status} ${type} ${url}`);
            }
        } catch (error) {
            failed += 1;
            console.error(`✗ ${String(error)} ${url}`);
        }
    }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log(
    `check-demo-images: ${urls.length + generated - failed} of ${urls.length + generated} images load (${generated} generated).`,
);
process.exit(failed > 0 ? 1 : 0);
