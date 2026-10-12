#!/usr/bin/env node
/**
 * The smaller copies of each marketing screenshot, as files.
 *
 *   pnpm --filter web shots:sizes            # what is missing
 *   pnpm --filter web shots:sizes --force    # every copy again
 *
 * A page's screenshot used to go through `/_next/image`, which on Cloudflare
 * re-encodes it on every request and sends no cache header (about a second
 * to the first byte of the largest thing on the page, 12 Oct 2026). So the
 * widths a page can ask for are made here, once, and committed:
 * `public/shots/v2/<key>.webp` (the capture, `e2e/marketing-shots/capture.ts`)
 * gets `public/shots/v2/sized/<key>-<width>.webp` for every width in
 * `content/shot-widths.json` narrower than itself.
 * `components/v2/shot-image.tsx` names them in a `srcset`
 * (`lib/shot-sources.ts`), and `public/_headers` lets a browser keep them.
 *
 * Run it after a capture, with `--force` for a screenshot taken again:
 * `lib/shot-sources.test.ts` fails on a missing copy and on one left behind.
 * A copy whose screenshot is gone is removed.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(APP, "public/shots/v2");
const SIZED = path.join(SHOTS, "sized");
const WIDTHS = JSON.parse(
    fs.readFileSync(path.join(APP, "content/shot-widths.json"), "utf8"),
);
/** As the capture encodes them, a little higher: these are encoded twice. */
const WEBP = { quality: 76, effort: 6 };

// sharp, borrowed from this app's Next.js, as the capture does: no native
// dependency of our own.
const fromApp = createRequire(path.join(APP, "package.json"));
const sharp = createRequire(fromApp.resolve("next/package.json"))("sharp");

const force = process.argv.includes("--force");
fs.mkdirSync(SIZED, { recursive: true });
const wanted = new Set();
let written = 0;
let bytes = 0;

for (const file of fs.readdirSync(SHOTS).sort()) {
    if (!file.endsWith(".webp")) continue;
    const key = file.slice(0, -".webp".length);
    const source = path.join(SHOTS, file);
    const { width = 0 } = await sharp(source).metadata();
    for (const w of WIDTHS) {
        if (w >= width) continue;
        const name = `${key}-${w}.webp`;
        const out = path.join(SIZED, name);
        wanted.add(name);
        if (force || !fs.existsSync(out)) {
            await sharp(source).resize({ width: w }).webp(WEBP).toFile(out);
            written += 1;
        }
        bytes += fs.statSync(out).size;
    }
}

let removed = 0;
for (const file of fs.readdirSync(SIZED)) {
    if (wanted.has(file)) continue;
    fs.rmSync(path.join(SIZED, file));
    removed += 1;
}

console.log(
    `${wanted.size} sized shots (${(bytes / 1024 / 1024).toFixed(2)} MB): ${written} written, ${removed} removed`,
);
