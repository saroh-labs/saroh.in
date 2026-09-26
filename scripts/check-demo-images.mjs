#!/usr/bin/env node
/**
 * Every photo the Leela & Loom and Rye & Co. showcases seed must load (#471, #522).
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
    readFileSync(new URL(`../packages/database/src/seed/showcase/${file}`, import.meta.url), "utf8");
const boutique = read("boutique-catalog.ts");
// Rye & Co.'s photos (#522) are written as unsplash("photo-…").
const bakery = read("bakery-product-page.ts");
const urls = [
    ...new Set([
        ...[...boutique.matchAll(/"url":\s*"([^"]+)"|url:\s*"([^"]+)"/g)].map((m) => m[1] ?? m[2]),
        ...[...bakery.matchAll(/unsplash\("([^"]+)"\)/g)].map(
            (m) => `https://images.unsplash.com/${m[1]}?w=1600&q=80&auto=format&fit=crop`,
        ),
    ]),
];

let failed = 0;
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
console.log(`check-demo-images: ${urls.length - failed} of ${urls.length} photos load.`);
process.exit(failed > 0 ? 1 : 0);
