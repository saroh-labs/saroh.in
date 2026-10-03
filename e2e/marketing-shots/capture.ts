/**
 * Capture the marketing site's product screenshots from the real app
 * (plan U20, KTD-11).
 *
 *   pnpm --filter @saroh/e2e shots              # every shot
 *   pnpm --filter @saroh/e2e shots s-home g-book # just these keys
 *
 * Needs the local stack with the showcase seed (`docs/architecture/LOCAL_DEV.md`:
 * `pnpm --filter @saroh/database db:seed:showcase`, then api, accounts, app and
 * the sites renderer under portless). It signs in through accounts as the demo
 * owner, opens each shot's business, and for each entry in `shots.config.ts`
 * lays the page out in light mode at 2× pixel density, takes the shot, and
 * writes an optimised WebP to `apps/saroh.in/public/shots/v2/<key>.webp`. Then
 * it rewrites `apps/saroh.in/content/shots.ts` from every WebP on disk.
 *
 * Read-only: it only navigates and sets page-local UI state. It never saves.
 * The seed moves with the calendar, so re-seed before a run for "today" to
 * look like today.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { Browser, Page } from "@playwright/test";
import { chromium } from "@playwright/test";

import { urls } from "../playwright.config";
import type { Business, Role, Shot } from "./shots.config";
import { BUSINESSES, ROLES, SHOTS } from "./shots.config";

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "apps/saroh.in/public/shots/v2");
const MANIFEST = path.join(ROOT, "apps/saroh.in/content/shots.ts");
const AUTH_DIR = path.join(ROOT, "e2e/.auth");
const PASSWORD = "demo-password-123";

const DPR = 2;
const WEBP = { quality: 72, effort: 6 } as const;

/**
 * sharp, borrowed from the marketing app's Next.js (which ships it for image
 * optimisation) so e2e takes on no native dependency of its own.
 */
type Sharp = (input: Buffer) => {
    webp(o: { quality: number; effort: number }): {
        toBuffer(): Promise<Buffer>;
    };
    metadata(): Promise<{ width?: number; height?: number }>;
};
function loadSharp(): Sharp {
    const fromWeb = createRequire(
        path.join(ROOT, "apps/saroh.in/package.json"),
    );
    const fromNext = createRequire(fromWeb.resolve("next/package.json"));
    return fromNext("sharp") as Sharp;
}

/** The coming Monday (today if it is Monday), as YYYY-MM-DD in India. */
function nextMonday(): string {
    const today = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    );
    const add = (8 - today.getDay()) % 7;
    today.setDate(today.getDate() + add);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

function urlOf(shot: Shot): string {
    const route = shot.route.replace("{nextMonday}", nextMonday());
    if (route.startsWith("site:")) {
        const renderer = new URL(urls.RENDERER_URL);
        const host = `${BUSINESSES[shot.business].site}.${renderer.host}`;
        return `${renderer.protocol}//${host}${route.slice("site:".length)}`;
    }
    return `${urls.APP_URL}${route}`;
}

/** Sign in once per role through the real form; keep the session on disk. */
async function sessionFor(browser: Browser, role: Role): Promise<string> {
    const file = path.join(AUTH_DIR, `marketing-shots-${role}.json`);
    if (fs.existsSync(file)) return file;
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(ROLES[role]);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
    await context.storageState({ path: file });
    await context.close();
    return file;
}

/** Hide what no shot should show: Next's dev badge, carets, animation. */
const STILL = `
nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; caret-color: transparent !important; }
`;

async function settle(page: Page) {
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: STILL });
    await page.waitForTimeout(400);
}

/** Open the shot's business: the workspace's own cookie, in this context. */
async function open(page: Page, business: Business) {
    await page.goto(`${urls.APP_URL}/open/${BUSINESSES[business].id}`);
}

async function capture(page: Page, shot: Shot): Promise<Buffer> {
    await page.goto(urlOf(shot), { waitUntil: "domcontentloaded" });
    await settle(page);
    if (/\/login|\/businesses/.test(new URL(page.url()).pathname)) {
        throw new Error(`${shot.key}: landed on ${page.url()}`);
    }
    for (const step of shot.steps ?? []) {
        if ("hide" in step) {
            await page.locator(step.hide).evaluateAll((els) => {
                for (const el of els)
                    (el as HTMLElement).style.display = "none";
            });
        } else if ("click" in step) {
            await page.locator(step.click).first().click();
        } else {
            await page.locator(step.waitFor).first().waitFor();
        }
    }
    await page.waitForTimeout(300);
    if (!shot.clip) return page.screenshot({ animations: "disabled" });

    // Clipped from the viewport as laid out, not scrolled to: the workspace
    // scrolls inside its own pane under a sticky bar, which a scrolled shot
    // would lay over the element. A shot whose element runs past the bottom
    // gets a taller viewport in the config instead.
    const box = await page.locator(shot.clip.selector).last().boundingBox();
    if (!box)
        throw new Error(`${shot.key}: ${shot.clip.selector} not on the page`);
    const pad = shot.clip.pad ?? 0;
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad);
    const width = Math.min(box.width + pad * 2, shot.viewport.width - x);
    const height = box.y + box.height + pad - y;
    if (y + height > shot.viewport.height) {
        throw new Error(
            `${shot.key}: ${shot.clip.selector} ends at ${Math.ceil(y + height)}px, past the viewport's ${shot.viewport.height}px; make the viewport taller`,
        );
    }
    return page.screenshot({
        animations: "disabled",
        clip: { x, y, width, height },
    });
}

/** Rewrite the manifest from every shot in the config that has a file. */
async function writeManifest(sharp: Sharp) {
    const lines: string[] = [];
    for (const shot of SHOTS) {
        const file = path.join(OUT_DIR, `${shot.key}.webp`);
        if (!fs.existsSync(file)) continue;
        const { width = 0, height = 0 } = await sharp(
            fs.readFileSync(file),
        ).metadata();
        lines.push(
            `    ${JSON.stringify(shot.key)}: {\n` +
                `        src: ${JSON.stringify(`/shots/v2/${shot.key}.webp`)},\n` +
                `        alt: ${JSON.stringify(shot.alt)},\n` +
                `        width: ${width},\n` +
                `        height: ${height},\n` +
                `    },`,
        );
    }
    const body = `/**
 * Product screenshots for the marketing site, captured from the real app's
 * demo businesses by \`e2e/marketing-shots/capture.ts\` (plan U20). Generated:
 * edit \`e2e/marketing-shots/shots.config.ts\` and re-run the capture instead.
 * \`width\` and \`height\` are the image's pixels (2× the CSS layout).
 */
export const SHOTS: Record<
    string,
    { src: string; alt: string; width: number; height: number }
> = {
${lines.join("\n")}
};
`;
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    fs.writeFileSync(MANIFEST, body);
}

async function main() {
    const only = new Set(process.argv.slice(2));
    const shots = only.size ? SHOTS.filter((s) => only.has(s.key)) : SHOTS;
    const unknown = [...only].filter((k) => !SHOTS.some((s) => s.key === k));
    if (unknown.length)
        throw new Error(`Unknown shot keys: ${unknown.join(", ")}`);

    const sharp = loadSharp();
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const browser = await chromium.launch();
    const failed: string[] = [];
    try {
        const sessions = new Map<Role, string>();
        for (const shot of shots) {
            let storageState = sessions.get(shot.role);
            if (!storageState) {
                storageState = await sessionFor(browser, shot.role);
                sessions.set(shot.role, storageState);
            }
            const context = await browser.newContext({
                storageState,
                ignoreHTTPSErrors: true,
                viewport: shot.viewport,
                deviceScaleFactor: DPR,
                colorScheme: "light",
                reducedMotion: "reduce",
                locale: "en-IN",
                timezoneId: "Asia/Kolkata",
            });
            const page = await context.newPage();
            try {
                await open(page, shot.business);
                const png = await capture(page, shot);
                const webp = await sharp(png).webp(WEBP).toBuffer();
                fs.writeFileSync(path.join(OUT_DIR, `${shot.key}.webp`), webp);
                console.log(
                    `${shot.key.padEnd(12)} ${(webp.length / 1024).toFixed(0).padStart(5)} KB  ${urlOf(shot)}`,
                );
            } catch (error) {
                failed.push(shot.key);
                console.error(`${shot.key}: ${(error as Error).message}`);
            } finally {
                await context.close();
            }
        }
    } finally {
        await browser.close();
    }
    await writeManifest(sharp);
    const total = fs
        .readdirSync(OUT_DIR)
        .filter((f) => f.endsWith(".webp"))
        .reduce((sum, f) => sum + fs.statSync(path.join(OUT_DIR, f)).size, 0);
    console.log(`\n${(total / 1024 / 1024).toFixed(2)} MB in ${OUT_DIR}`);
    if (failed.length) {
        console.error(`Failed: ${failed.join(", ")}`);
        process.exitCode = 1;
    }
}

void main();
