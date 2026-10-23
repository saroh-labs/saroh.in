/**
 * Capture the template gallery's and the picker's pictures from the real
 * renderer (industry templates plan U14, KTD-6).
 *
 *   pnpm --filter sites build:templates               # the renderer, built
 *   pnpm --filter sites start:templates               # …and served, alone
 *   pnpm --filter @saroh/e2e shots:templates           # every gallery template
 *   pnpm --filter @saroh/e2e shots:templates gym store # just these (id or slug)
 *
 * The renderer serves `/template-renders` only with `TEMPLATE_RENDERS=on` on
 * its own host (`apps/saroh.app/lib/template-renders/guard.ts`);
 * `start:templates` runs it that way under portless at
 * https://templates.saroh.app.localhost, apart from the usual stack and its
 * ports (`TEMPLATE_RENDER_NAME=<name>` on both scripts serves it under
 * another portless name; point `TEMPLATE_RENDER_URL` at it). Capture from
 * that production build, never `dev:templates` (for
 * working on a render): a dev server draws Next's indicator and its issue
 * badge, which no committed picture may show. Every render is drawn at one
 * fixed weekday morning (`FIXTURE_NOW`, `packages/site-blocks/src/showcase/fixtures.ts`),
 * so "Open now" and "Free today" read the same whenever the run is. `TEMPLATE_RENDER_URL` points this elsewhere. No API, database or
 * sign-in: each template is drawn for its sample business from fixtures.
 *
 * For each template, in its first colourway, every page its sample business
 * gets, on a computer (1440×900) and a phone (390×844), the top of the page
 * at 2× pixel density, as WebP:
 *
 * - `apps/saroh.in/public/templates/<slug>/<page>-<device>.webp` for the
 *   gallery, listed in `apps/saroh.in/content/template-shots.ts`;
 * - `apps/app.saroh.in/public/templates/<id>.webp`, the home page on a
 *   computer at card size, for the picker, listed in
 *   `apps/app.saroh.in/lib/sites/template-thumbnails.ts`.
 *
 * Both lists are rewritten from every file on disk
 * (`template-shots-manifest.ts`), so a partial run keeps the rest.
 *
 *   pnpm --filter @saroh/e2e shots:templates --looks          # Look row
 *   pnpm --filter @saroh/e2e shots:templates --looks salon    # one template
 *
 * `--looks` captures instead the editor's Look row pictures (DEC-172, U16):
 * each template's home page on a phone in Classic, Quiet, Folio and Live
 * (`?look=`), into `apps/app.saroh.in/public/looks/<id>-<look>.webp`,
 * listed in `apps/app.saroh.in/lib/sites/look-thumbnails.ts`.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { Page } from "@playwright/test";
import { chromium, request } from "@playwright/test";

import type {
    CapturedLookThumbnail,
    CapturedShot,
    CapturedThumbnail,
    Device,
} from "./template-shots-manifest";
import {
    lookThumbnailsSource,
    templateShotsSource,
    templateThumbnailsSource,
} from "./template-shots-manifest";

const ROOT = path.resolve(__dirname, "..", "..");
const RENDER_URL = (
    process.env.TEMPLATE_RENDER_URL ?? "https://templates.saroh.app.localhost"
).replace(/\/+$/, "");

const GALLERY_DIR = path.join(ROOT, "apps/saroh.in/public/templates");
const GALLERY_MANIFEST = path.join(
    ROOT,
    "apps/saroh.in/content/template-shots.ts",
);
const PICKER_DIR = path.join(ROOT, "apps/app.saroh.in/public/templates");
const PICKER_MANIFEST = path.join(
    ROOT,
    "apps/app.saroh.in/lib/sites/template-thumbnails.ts",
);

const DPR = 2;
const WEBP = { quality: 72, effort: 6 } as const;
const DEVICES: Record<
    Device,
    { viewport: { width: number; height: number }; mobile: boolean }
> = {
    desktop: { viewport: { width: 1440, height: 900 }, mobile: false },
    phone: { viewport: { width: 390, height: 844 }, mobile: true },
};
/** The picker's card picture, in CSS pixels: a 16:10 card at its widest. */
const THUMBNAIL_WIDTH = 360;

const LOOKS_DIR = path.join(ROOT, "apps/app.saroh.in/public/looks");
const LOOKS_MANIFEST = path.join(
    ROOT,
    "apps/app.saroh.in/lib/sites/look-thumbnails.ts",
);
/** The Look row's looks, Classic first (`?look=` absent). */
const LOOKS = ["classic", "quiet", "folio", "live"] as const;
/** The Look row's phone picture, in CSS pixels: twice the row's 50px. */
const LOOK_THUMBNAIL_WIDTH = 100;

/** What `/template-renders` lists (`render.ts`, `templateRenderIndex`). */
interface RenderEntry {
    id: string;
    slug: string;
    name: string;
    styles: { id: string; name: string }[];
    pages: { path: string; title: string; file: string }[];
}

/**
 * sharp, borrowed from the marketing app's Next.js as `capture.ts` does, so
 * e2e takes on no native dependency of its own.
 */
interface SharpImage {
    resize(width: number): SharpImage;
    webp(o: { quality: number; effort: number }): SharpImage;
    toBuffer(): Promise<Buffer>;
    metadata(): Promise<{ width?: number; height?: number }>;
}
type Sharp = (input: Buffer) => SharpImage;
function loadSharp(): Sharp {
    const fromWeb = createRequire(
        path.join(ROOT, "apps/saroh.in/package.json"),
    );
    const fromNext = createRequire(fromWeb.resolve("next/package.json"));
    return fromNext("sharp") as Sharp;
}

/** Hide what no shot should show: Next's dev badge, carets, animation. */
const STILL = `
nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; caret-color: transparent !important; }
`;

async function index(): Promise<RenderEntry[]> {
    const api = await request.newContext({ ignoreHTTPSErrors: true });
    try {
        const res = await api.get(`${RENDER_URL}/template-renders`);
        if (!res.ok()) {
            throw new Error(
                `${RENDER_URL}/template-renders answered ${res.status()}: is the renderer running with TEMPLATE_RENDERS=on (pnpm --filter sites dev:templates)?`,
            );
        }
        return ((await res.json()) as { templates: RenderEntry[] }).templates;
    } finally {
        await api.dispose();
    }
}

function renderUrl(t: RenderEntry, pagePath: string): string {
    const style = t.styles[0]?.id ?? "_";
    const rest = pagePath.replace(/^\/+/, "");
    return `${RENDER_URL}/template-renders/${encodeURIComponent(t.id)}/${encodeURIComponent(style)}${rest ? `/${rest}` : ""}`;
}

async function shoot(page: Page, url: string): Promise<Buffer> {
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    if (!res?.ok()) throw new Error(`${url} answered ${res?.status()}`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.locator("[data-template-render]").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: STILL });
    await page.waitForTimeout(400);
    return page.screenshot({ animations: "disabled" });
}

async function sizeOf(sharp: Sharp, file: string) {
    const { width = 0, height = 0 } = await sharp(
        fs.readFileSync(file),
    ).metadata();
    // The manifests carry CSS pixels: the file is twice them.
    return { width: Math.round(width / DPR), height: Math.round(height / DPR) };
}

/** Every gallery shot on disk that names a page the renderer lists. */
async function shotsOnDisk(
    sharp: Sharp,
    templates: RenderEntry[],
): Promise<CapturedShot[]> {
    const out: CapturedShot[] = [];
    for (const t of templates) {
        for (const p of t.pages) {
            for (const device of ["desktop", "phone"] as const) {
                const name = `${p.file}-${device}.webp`;
                const file = path.join(GALLERY_DIR, t.slug, name);
                if (!fs.existsSync(file)) continue;
                out.push({
                    slug: t.slug,
                    path: p.path,
                    device,
                    src: `/templates/${t.slug}/${name}`,
                    ...(await sizeOf(sharp, file)),
                });
            }
        }
    }
    return out;
}

async function thumbnailsOnDisk(
    sharp: Sharp,
    templates: RenderEntry[],
): Promise<CapturedThumbnail[]> {
    const out: CapturedThumbnail[] = [];
    for (const t of templates) {
        const file = path.join(PICKER_DIR, `${t.id}.webp`);
        if (!fs.existsSync(file)) continue;
        out.push({
            id: t.id,
            src: `/templates/${t.id}.webp`,
            ...(await sizeOf(sharp, file)),
        });
    }
    return out;
}

/** Every Look row picture on disk for a template the renderer lists. */
async function lookThumbnailsOnDisk(
    sharp: Sharp,
    templates: RenderEntry[],
): Promise<CapturedLookThumbnail[]> {
    const out: CapturedLookThumbnail[] = [];
    for (const t of templates) {
        for (const look of LOOKS) {
            const name = `${t.id}-${look}.webp`;
            const file = path.join(LOOKS_DIR, name);
            if (!fs.existsSync(file)) continue;
            out.push({
                id: t.id,
                look,
                src: `/looks/${name}`,
                ...(await sizeOf(sharp, file)),
            });
        }
    }
    return out;
}

/** The Look row's pictures (U16): each template's home, on a phone, per look. */
async function captureLooks(all: RenderEntry[], chosen: RenderEntry[]) {
    const sharp = loadSharp();
    const browser = await chromium.launch();
    const failed: string[] = [];
    try {
        for (const t of chosen) {
            for (const look of LOOKS) {
                const key = `${t.slug} ${look}`;
                const context = await browser.newContext({
                    ignoreHTTPSErrors: true,
                    viewport: DEVICES.phone.viewport,
                    deviceScaleFactor: DPR,
                    isMobile: true,
                    hasTouch: true,
                    colorScheme: "light",
                    reducedMotion: "reduce",
                    locale: "en-IN",
                    timezoneId: "Asia/Kolkata",
                });
                const page = await context.newPage();
                try {
                    const url =
                        renderUrl(t, "/") +
                        (look === "classic" ? "" : `?look=${look}`);
                    const png = await shoot(page, url);
                    const webp = await sharp(png)
                        .resize(LOOK_THUMBNAIL_WIDTH * DPR)
                        .webp(WEBP)
                        .toBuffer();
                    fs.mkdirSync(LOOKS_DIR, { recursive: true });
                    fs.writeFileSync(
                        path.join(LOOKS_DIR, `${t.id}-${look}.webp`),
                        webp,
                    );
                    console.log(
                        `${key.padEnd(24)} ${(webp.length / 1024).toFixed(0).padStart(5)} KB  ${url}`,
                    );
                } catch (error) {
                    failed.push(key);
                    console.error(`${key}: ${(error as Error).message}`);
                } finally {
                    await context.close();
                }
            }
        }
    } finally {
        await browser.close();
    }
    fs.writeFileSync(
        LOOKS_MANIFEST,
        lookThumbnailsSource(await lookThumbnailsOnDisk(sharp, all)),
    );
    if (failed.length) {
        console.error(`Failed: ${failed.join(", ")}`);
        process.exitCode = 1;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const looks = args.includes("--looks");
    const only = new Set(args.filter((a) => a !== "--looks"));
    const all = await index();
    const chosen = only.size
        ? all.filter((t) => only.has(t.id) || only.has(t.slug))
        : all;
    const unknown = [...only].filter(
        (k) => !all.some((t) => t.id === k || t.slug === k),
    );
    if (unknown.length) {
        throw new Error(
            `Not gallery templates: ${unknown.join(", ")} (have ${all.map((t) => t.id).join(", ")})`,
        );
    }

    if (looks) {
        await captureLooks(all, chosen);
        return;
    }

    const sharp = loadSharp();
    const browser = await chromium.launch();
    const failed: string[] = [];
    try {
        for (const t of chosen) {
            for (const p of t.pages) {
                for (const device of ["desktop", "phone"] as const) {
                    const key = `${t.slug} ${p.path} ${device}`;
                    const context = await browser.newContext({
                        ignoreHTTPSErrors: true,
                        viewport: DEVICES[device].viewport,
                        deviceScaleFactor: DPR,
                        isMobile: DEVICES[device].mobile,
                        hasTouch: DEVICES[device].mobile,
                        colorScheme: "light",
                        reducedMotion: "reduce",
                        locale: "en-IN",
                        timezoneId: "Asia/Kolkata",
                    });
                    const page = await context.newPage();
                    try {
                        const url = renderUrl(t, p.path);
                        const png = await shoot(page, url);
                        const webp = await sharp(png).webp(WEBP).toBuffer();
                        const file = path.join(
                            GALLERY_DIR,
                            t.slug,
                            `${p.file}-${device}.webp`,
                        );
                        fs.mkdirSync(path.dirname(file), { recursive: true });
                        fs.writeFileSync(file, webp);
                        console.log(
                            `${key.padEnd(34)} ${(webp.length / 1024).toFixed(0).padStart(5)} KB  ${url}`,
                        );
                        if (p.path === "/" && device === "desktop") {
                            const card = await sharp(png)
                                .resize(THUMBNAIL_WIDTH * DPR)
                                .webp(WEBP)
                                .toBuffer();
                            fs.mkdirSync(PICKER_DIR, { recursive: true });
                            fs.writeFileSync(
                                path.join(PICKER_DIR, `${t.id}.webp`),
                                card,
                            );
                        }
                    } catch (error) {
                        failed.push(key);
                        console.error(`${key}: ${(error as Error).message}`);
                    } finally {
                        await context.close();
                    }
                }
            }
        }
    } finally {
        await browser.close();
    }

    fs.writeFileSync(
        GALLERY_MANIFEST,
        templateShotsSource(await shotsOnDisk(sharp, all)),
    );
    fs.writeFileSync(
        PICKER_MANIFEST,
        templateThumbnailsSource(await thumbnailsOnDisk(sharp, all)),
    );
    if (failed.length) {
        console.error(`Failed: ${failed.join(", ")}`);
        process.exitCode = 1;
    }
}

void main().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
});
