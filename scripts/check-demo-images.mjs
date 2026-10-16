#!/usr/bin/env node
/**
 * Every photo the Leela & Loom, Rye & Co., Noor Salon & Bridal and Motion
 * Physio showcases seed must load (#471, #522).
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
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (file) =>
    readFileSync(
        new URL(
            `../packages/database/src/seed/showcase/${file}`,
            import.meta.url,
        ),
        "utf8",
    );
const boutique = read("boutique-catalog.ts");
// Noor Salon & Bridal and Motion Physio: catalogues and journals.
const diaryShops = [
    "salon-catalog.ts",
    "salon-posts.ts",
    "physio-catalog.ts",
    "physio-posts.ts",
].map(read);
// Rye & Co.'s photos (#522) are written as unsplash("photo-…").
const bakery = read("bakery-product-page.ts");
const urls = [
    ...new Set([
        ...[...boutique.matchAll(/"url":\s*"([^"]+)"|url:\s*"([^"]+)"/g)].map(
            (m) => m[1] ?? m[2],
        ),
        ...diaryShops.flatMap((src) =>
            [...src.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]),
        ),
        ...[...bakery.matchAll(/unsplash\("([^"]+)"\)/g)].map(
            (m) =>
                `https://images.unsplash.com/${m[1]}?w=1600&q=80&auto=format&fit=crop`,
        ),
    ]),
];

// Generated images (shade cards, band and tape colours) are files in the
// workspace's public folder, served at https://app.saroh.localhost/demo/…
// (`diary-shop-types.ts`): checked on disk, so this needs no running stack.
const demoFiles = [
    ...new Set(
        diaryShops.flatMap((src) =>
            [...src.matchAll(/demoAsset\(\s*"([^"]+)"/g)].map((m) => m[1]),
        ),
    ),
];
const swatchList = JSON.parse(
    execFileSync(
        "pnpm",
        [
            "--silent",
            "--filter",
            "@saroh/database",
            "exec",
            "tsx",
            "../../scripts/demo-swatches/export.ts",
        ],
        {
            cwd: fileURLToPath(new URL("..", import.meta.url)),
            encoding: "utf8",
        },
    ),
);
const generated = [
    ...new Set([
        ...demoFiles,
        ...swatchList.flatMap((g) => g.swatches.map((s) => s.file)),
    ]),
];
let missing = 0;
for (const file of generated) {
    if (
        !existsSync(
            new URL(
                `../apps/app.saroh.in/public/demo/${file}`,
                import.meta.url,
            ),
        )
    ) {
        missing += 1;
        console.error(
            `✗ missing generated image apps/app.saroh.in/public/demo/${file} (run scripts/demo-swatches)`,
        );
    }
}

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
console.log(
    `check-demo-images: ${urls.length - failed} of ${urls.length} photos load; ` +
        `${generated.length - missing} of ${generated.length} generated images are on disk.`,
);
process.exit(failed + missing > 0 ? 1 : 0);
