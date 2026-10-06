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
 * writes an optimised WebP to `apps/saroh.in/public/shots/v2/<key>.webp`
 * (`public/shots/help/` for the Help articles' `help-…` keys). Then it
 * rewrites `apps/saroh.in/content/shots.captured.ts` from every WebP on disk.
 * A shot with a `mark` also records where that control sits in the image,
 * for the Help article's Saffron ring.
 *
 * Read-only: it only navigates, sets page-local UI state and types into
 * forms it never submits. It never saves.
 * The seed moves with the calendar, so re-seed before a run for "today" to
 * look like today.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { Browser, Page } from "@playwright/test";
import { chromium } from "@playwright/test";

import { CAPTURED } from "../../apps/saroh.in/content/shots.captured";
import { urls } from "../playwright.config";
import type { Business, Role, Shot } from "./shots.config";
import { BUSINESSES, ROLES, SHOTS } from "./shots.config";

const ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_DIR = path.join(ROOT, "apps/saroh.in/public");

/** Where a shot's image is served from: Help's own folder, or V2's. */
function srcOf(key: string): string {
    return key.startsWith("help-")
        ? `/shots/help/${key}.webp`
        : `/shots/v2/${key}.webp`;
}
const fileOf = (key: string) => path.join(PUBLIC_DIR, srcOf(key));

/** Where the marked control sits, in fractions of the image (0–1). */
interface Mark {
    x: number;
    y: number;
    w: number;
    h: number;
}

const MANIFEST = path.join(ROOT, "apps/saroh.in/content/shots.captured.ts");
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
    if (route.startsWith("accounts:")) {
        return `${urls.ACCOUNTS_URL}${route.slice("accounts:".length)}`;
    }
    if (route.startsWith("site:")) {
        if (!shot.business)
            throw new Error(`${shot.key}: a site needs a business`);
        const renderer = new URL(urls.RENDERER_URL);
        const host = `${BUSINESSES[shot.business].site}.${renderer.host}`;
        return `${renderer.protocol}//${host}${route.slice("site:".length)}`;
    }
    return `${urls.APP_URL}${route}`;
}

/**
 * Sign in once per role through the real form; keep the session on disk.
 * A visitor has none.
 */
async function sessionFor(
    browser: Browser,
    role: Role,
): Promise<string | undefined> {
    if (role === "visitor") return undefined;
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

/** The marked control's box within the area `clip` (CSS px), as fractions. */
async function markOf(
    page: Page,
    shot: Shot,
    clip: { x: number; y: number; width: number; height: number },
): Promise<Mark | undefined> {
    if (!shot.mark) return undefined;
    const box = await page.locator(shot.mark).last().boundingBox();
    if (!box) throw new Error(`${shot.key}: mark ${shot.mark} not on the page`);
    const pad = 6;
    const round = (n: number) => Math.round(n * 10000) / 10000;
    return {
        x: round((box.x - pad - clip.x) / clip.width),
        y: round((box.y - pad - clip.y) / clip.height),
        w: round((box.width + pad * 2) / clip.width),
        h: round((box.height + pad * 2) / clip.height),
    };
}

async function capture(
    page: Page,
    shot: Shot,
): Promise<{ png: Buffer; mark?: Mark }> {
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
        } else if ("fill" in step) {
            await page.locator(step.fill).first().fill(step.value);
        } else {
            await page.locator(step.waitFor).first().waitFor();
        }
    }
    await page.waitForTimeout(300);
    if (!shot.clip) {
        const whole = { x: 0, y: 0, ...shot.viewport };
        const mark = await markOf(page, shot, whole);
        return { png: await page.screenshot({ animations: "disabled" }), mark };
    }

    // Clipped from the viewport as laid out, not scrolled to: the workspace
    // scrolls inside its own pane under a sticky bar, which a scrolled shot
    // would lay over the element. A shot whose element runs past the bottom
    // gets a taller viewport in the config instead.
    let box = await page.locator(shot.clip.selector).last().boundingBox();
    if (!box)
        throw new Error(`${shot.key}: ${shot.clip.selector} not on the page`);
    if (shot.clip.until) {
        const end = await page.locator(shot.clip.until).last().boundingBox();
        if (!end)
            throw new Error(`${shot.key}: ${shot.clip.until} not on the page`);
        const left = Math.min(box.x, end.x);
        const right = Math.max(box.x + box.width, end.x + end.width);
        box = {
            x: left,
            y: box.y,
            width: right - left,
            height: end.y + end.height - box.y,
        };
    }
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
    const mark = await markOf(page, shot, { x, y, width, height });
    const png = await page.screenshot({
        animations: "disabled",
        clip: { x, y, width, height },
    });
    return { png, mark };
}

/** The marks the manifest has now, kept for shots this run doesn't retake. */
function readMarks(): Record<string, Mark> {
    const marks: Record<string, Mark> = {};
    for (const [key, shot] of Object.entries(CAPTURED)) {
        if (shot.mark) marks[key] = shot.mark;
    }
    return marks;
}

/** Rewrite the manifest from every shot in the config that has a file. */
async function writeManifest(sharp: Sharp, marks: Record<string, Mark>) {
    const lines: string[] = [];
    for (const shot of SHOTS) {
        const file = fileOf(shot.key);
        if (!fs.existsSync(file)) continue;
        const mark = shot.mark ? marks[shot.key] : undefined;
        const { width = 0, height = 0 } = await sharp(
            fs.readFileSync(file),
        ).metadata();
        lines.push(
            `    ${JSON.stringify(shot.key)}: {\n` +
                `        src: ${JSON.stringify(srcOf(shot.key))},\n` +
                `        alt: ${JSON.stringify(shot.alt)},\n` +
                `        width: ${width},\n` +
                `        height: ${height},\n` +
                (mark
                    ? `        mark: { x: ${mark.x}, y: ${mark.y}, w: ${mark.w}, h: ${mark.h} },\n`
                    : "") +
                `    },`,
        );
    }
    const body = `/**
 * Product screenshots for the marketing site, captured from the real app's
 * demo businesses by \`e2e/marketing-shots/capture.ts\` (plan U20). Generated:
 * edit \`e2e/marketing-shots/shots.config.ts\` and re-run the capture instead.
 * \`width\` and \`height\` are the image's pixels (2× the CSS layout).
 * \`content/shots.ts\` reads this: a captured shot replaces the placeholder.
 * Help's \`help-…\` shots are read by \`content/help\` articles; \`mark\` is
 * where the step's control sits, in fractions of the image.
 */
export const CAPTURED: Record<
    string,
    {
        src: string;
        alt: string;
        width: number;
        height: number;
        mark?: { x: number; y: number; w: number; h: number };
    }
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
    const marks = readMarks();
    const browser = await chromium.launch();
    const failed: string[] = [];
    try {
        const sessions = new Map<Role, string | undefined>();
        for (const shot of shots) {
            let storageState = sessions.get(shot.role);
            if (!sessions.has(shot.role)) {
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
                if (shot.business) await open(page, shot.business);
                const { png, mark } = await capture(page, shot);
                const webp = await sharp(png).webp(WEBP).toBuffer();
                fs.mkdirSync(path.dirname(fileOf(shot.key)), {
                    recursive: true,
                });
                fs.writeFileSync(fileOf(shot.key), webp);
                if (mark) marks[shot.key] = mark;
                else delete marks[shot.key];
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
    await writeManifest(sharp, marks);
    const total = SHOTS.map((s) => fileOf(s.key))
        .filter((f) => fs.existsSync(f))
        .reduce((sum, f) => sum + fs.statSync(f).size, 0);
    console.log(`\n${(total / 1024 / 1024).toFixed(2)} MB of shots`);
    if (failed.length) {
        console.error(`Failed: ${failed.join(", ")}`);
        process.exitCode = 1;
    }
}

void main();
