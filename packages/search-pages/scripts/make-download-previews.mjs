#!/usr/bin/env node
/**
 * Each download page's preview picture, made from its real file
 * (content/downloads/files/<slug>/), into content/downloads/previews/<slug>/
 * as preview.webp (1920 wide) and preview-<width>.webp for the narrower
 * widths. saroh.in's docs-content.config.ts copies a page's previews to
 * public/downloads/<slug>/ only while the page is live, like its files.
 *
 *   node packages/search-pages/scripts/make-download-previews.mjs [slug…]
 *
 * Run it after make-download-files.py changes a file. macOS only: a PDF page
 * is drawn by PDFKit (through `swift`), an Excel sheet by Quick Look's HTML
 * preview (`qlmanage -p`) photographed with e2e's Playwright Chromium; sharp
 * is saroh.in's Next.js copy (as scripts/shot-sizes.mjs borrows it).
 * Word files aren't used: Quick Look draws their tables too narrow.
 * src/download-previews.test.ts fails when a page's preview is missing.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.join(PKG, "../..");
const FILES = path.join(PKG, "content/downloads/files");
const OUT = path.join(PKG, "content/downloads/previews");

/** Which file each picture shows: an Excel sheet by its tab, or a PDF page. */
const PAGES = {
    "gst-invoice-format": { file: "gst-invoice-format.xlsx", sheet: "Example" },
    "bill-of-supply-format": {
        file: "bill-of-supply-format.xlsx",
        sheet: "Example",
    },
    "customer-list-template": {
        file: "customer-list.xlsx",
        sheet: "Customers",
    },
    "receipt-format": { file: "receipt-format.pdf", page: 2, width: 940 },
    "salon-rate-card": { file: "salon-rate-card.pdf", page: 2, width: 1040 },
    "appointment-book": { file: "appointment-book.pdf", page: 2 },
};

/** The board's 16:7 frame (downloads/Sample), and saroh.in's shot ladder (content/shot-widths.json). */
const W = 1920;
const H = 840;
const WIDTHS = [640, 960, 1280];
const WEBP = { quality: 78, effort: 6 };
const PAPER = "#F5F2EC"; // --sp-paper
const LINE = "#DCD7CD"; // --sp-line

const fromApp = createRequire(path.join(REPO, "apps/saroh.in/package.json"));
const sharp = createRequire(fromApp.resolve("next/package.json"))("sharp");
const fromE2e = createRequire(path.join(REPO, "e2e/package.json"));
const { chromium } = fromE2e("@playwright/test");

const SWIFT = `import PDFKit
let a = CommandLine.arguments
guard let doc = PDFDocument(url: URL(fileURLWithPath: a[1])), let page = doc.page(at: Int(a[2])! - 1) else { fatalError("no such page") }
let scale = CGFloat(Double(a[4])!)
let box = page.bounds(for: .mediaBox)
let w = Int(box.width * scale), h = Int(box.height * scale)
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
ctx.scaleBy(x: scale, y: scale)
page.draw(with: .mediaBox, to: ctx)
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[3]) as CFURL, "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
CGImageDestinationFinalize(dest)
`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "download-previews-"));

/** A PDF page as a PNG, 3× its points. */
function pdfPage(file, page) {
    const swift = path.join(tmp, "page.swift");
    fs.writeFileSync(swift, SWIFT);
    const png = path.join(tmp, `${path.basename(file)}-${page}.png`);
    execFileSync("swift", [swift, file, String(page), png, "3"]);
    return png;
}

/** An Excel sheet's used cells as a PNG on a white sheet, from Quick Look's HTML. */
async function excelSheet(browser, file, sheet) {
    execFileSync("qlmanage", ["-p", "-o", tmp, file], { stdio: "ignore" });
    const dir = path.join(tmp, `${path.basename(file)}.qlpreview`);
    const html = fs.readFileSync(path.join(dir, "Preview.html"), "utf8");
    const tab = new RegExp(`TabHeader">${sheet}</div><a href="([^"]+)"`).exec(
        html,
    );
    if (!tab) throw new Error(`${file} has no ${sheet} sheet`);
    const page = await browser.newPage({
        viewport: { width: 1000, height: 1400 },
        deviceScaleFactor: 3,
    });
    await page.goto(`file://${path.join(dir, tab[1])}`);
    // The sheet to its last filled row, with a margin like a page's.
    const clip = await page.evaluate(() => {
        const table = document.querySelector("table.worksheet");
        const filled = [...table.rows].filter((r) => r.textContent.trim());
        // Quick Look gives some rows thousands of pixels (31 Oct): an Excel row is never that tall.
        for (const td of table.querySelectorAll("td"))
            if (td.getBoundingClientRect().height > 60)
                td.style.height = "auto";
        const t = table.getBoundingClientRect();
        const last = filled[filled.length - 1].getBoundingClientRect();
        const m = 24;
        document.body.style.margin = `${m}px`;
        return { m, width: t.width, height: last.bottom - t.top };
    });
    const png = path.join(tmp, `${path.basename(file)}-${sheet}.png`);
    await page.screenshot({
        path: png,
        clip: {
            x: 0,
            y: 0,
            width: clip.width + 2 * clip.m,
            height: clip.height + 2 * clip.m,
        },
    });
    await page.close();
    return png;
}

/** The sheet on the paper ground with a soft edge: whole when it fits, else its top. */
async function compose(png, sheetWidth) {
    const meta = await sharp(png).metadata();
    const pad = 64;
    let w = sheetWidth ?? W - 2 * pad;
    let h = Math.round((meta.height * w) / meta.width);
    if (!sheetWidth && h > H - 2 * pad) {
        h = H - 2 * pad;
        w = Math.round((meta.width * h) / meta.height);
    }
    const x = Math.round((W - w) / 2);
    const y = h <= H - 2 * pad ? Math.round((H - h) / 2) : pad;
    const shown = Math.min(h, H - y);
    // A cut sheet's edge runs on past the frame; a whole one closes.
    const edgeH = shown < h ? shown + 40 : shown;
    const sheet = await sharp(png)
        .resize({ width: w, height: h })
        .extract({ left: 0, top: 0, width: w, height: shown })
        .toBuffer();
    const ground = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PAPER}"/><filter id="s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="18"/></filter><rect x="${x}" y="${y + 10}" width="${w}" height="${edgeH}" fill="rgba(28,28,26,0.10)" filter="url(#s)"/></svg>`,
    );
    const edge = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${edgeH - 2}" rx="4" fill="none" stroke="${LINE}" stroke-width="2"/></svg>`,
    );
    return sharp(ground)
        .composite([{ input: sheet, left: x, top: y }, { input: edge }])
        .flatten({ background: PAPER })
        .png()
        .toBuffer();
}

const only = process.argv.slice(2);
const browser = await chromium.launch();
try {
    for (const [slug, p] of Object.entries(PAGES)) {
        if (only.length && !only.includes(slug)) continue;
        const file = path.join(FILES, slug, p.file);
        const png = p.page
            ? pdfPage(file, p.page)
            : await excelSheet(browser, file, p.sheet);
        const full = await compose(png, p.width);
        const dir = path.join(OUT, slug);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        const sizes = [];
        for (const width of [W, ...WIDTHS]) {
            const name = width === W ? "preview.webp" : `preview-${width}.webp`;
            await sharp(full)
                .resize({ width })
                .webp(WEBP)
                .toFile(path.join(dir, name));
            sizes.push(
                `${name} ${Math.round(fs.statSync(path.join(dir, name)).size / 1024)} KB`,
            );
        }
        console.log(`${slug}: ${sizes.join(", ")}`);
    }
} finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
}
