// @covers web:/tools/link-preview web:/api/link-preview api:link-preview
import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { urls } from "../playwright.config";

/**
 * The link preview checker on saroh.in (resources plan U2), end to end:
 * saroh.in's route, the API's guarded fetch and its report, against pages
 * this spec serves itself on the test machine.
 *
 * The API refuses loopback addresses (its SSRF guard), so the stack names
 * 127.0.0.1 in `LINK_PREVIEW_TEST_HOSTS` — a test-only switch the API
 * refuses to boot with in production (`env.ts`). Each test sends its own
 * `x-real-ip`, which saroh.in signs into the relay, so each counts against
 * its own rate limit and they run beside each other.
 *
 * - the empty state, then a full address pasted: the scheme isn't doubled
 *   and the report gets its own `?url=`, which opens it again;
 * - a page with every tag right, one with none, and an address that
 *   doesn't answer, each in its own state;
 * - every call is a POST with the address in the body, never `?url=`;
 * - unlocking the fix-it report with an email (a stamped address), with
 *   no news tickbox;
 * - the API refuses either route called directly, without saroh.in's relay;
 * - at 390 wide, the six cards and no sideways scroll.
 */

const WEB = urls.WEB_URL;
const TOOL = `${WEB}/tools/link-preview`;

/** A PNG's first bytes: enough for the API to read its size. */
function pngHead(width: number, height: number): Buffer {
    const b = Buffer.alloc(33);
    b.writeUInt32BE(0x89504e47, 0);
    b.writeUInt32BE(0x0d0a1a0a, 4);
    b.writeUInt32BE(13, 8);
    b.write("IHDR", 12, "ascii");
    b.writeUInt32BE(width, 16);
    b.writeUInt32BE(height, 20);
    return b;
}

const GOOD = `<!doctype html><html><head>
<title>Fixture Bakery</title>
<meta name="description" content="Sourdough from the test machine, out by ten.">
<meta property="og:title" content="Fresh bread every morning">
<meta property="og:description" content="Sourdough from the test machine, out by ten.">
<meta property="og:image" content="/cover.png">
<meta property="og:url" content="/good">
<meta property="og:site_name" content="Fixture Bakery">
<meta name="twitter:card" content="summary_large_image">
</head><body><p>Fixture</p></body></html>`;

const SMALL = GOOD.replace("/cover.png", "/small.png").replace(
    '<meta name="twitter:card" content="summary_large_image">',
    "",
);

const BARE = "<!doctype html><html><head></head><body>No tags</body></html>";

let server: Server;
let origin: string;
let closedPort: number;

test.beforeAll(async () => {
    server = createServer((req, res) => {
        const send = (type: string, body: string | Buffer) => {
            res.writeHead(200, { "Content-Type": type });
            res.end(body);
        };
        if (req.url === "/good") return send("text/html; charset=utf-8", GOOD);
        if (req.url === "/small-picture")
            return send("text/html; charset=utf-8", SMALL);
        if (req.url === "/bare") return send("text/html; charset=utf-8", BARE);
        if (req.url === "/cover.png")
            return send("image/png", pngHead(1200, 630));
        if (req.url === "/small.png")
            return send("image/png", pngHead(600, 315));
        res.writeHead(404);
        res.end();
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    origin = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    // A port with nothing on it: listen, note it, close.
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    closedPort = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
});

test.afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Each test counts against its own limit (saroh.in signs this address). */
async function asOwnVisitor(page: Page, testInfo: TestInfo) {
    const n =
        (testInfo.workerIndex * 37 + testInfo.retry * 11 + Date.now()) % 250;
    await page.setExtraHTTPHeaders({ "x-real-ip": `198.51.100.${n + 1}` });
}

async function check(page: Page, address: string) {
    const field = page.getByLabel("Web address");
    await field.fill(address);
    await page.getByRole("button", { name: "Check link" }).click();
}

test.describe("link preview checker", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await asOwnVisitor(page, testInfo);
    });

    test("pastes a full address without doubling it, and the report has its own link", async ({
        page,
    }) => {
        await page.goto(TOOL);
        await expect(
            page.getByRole("heading", {
                level: 1,
                name: "Link preview checker",
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "A sample bakery site" }),
        ).toBeVisible();

        const call = page.waitForRequest(
            (r) => new URL(r.url()).pathname === "/api/link-preview",
        );
        await check(page, `http://${origin}/good`);
        // The address goes in the body: a query string lands in logs.
        const sent = await call;
        expect(sent.method()).toBe("POST");
        expect(new URL(sent.url()).search).toBe("");
        expect(sent.postDataJSON()).toMatchObject({
            url: `http://${origin}/good`,
        });
        await expect(page.getByLabel("Web address")).toHaveValue(
            `${origin}/good`,
        );
        await expect(page.locator("[data-scheme]")).toHaveText("http://");

        await expect(page.getByTestId("score-line")).toHaveText(
            "Looks right on all 6 apps. Nothing to fix.",
        );
        await expect(page.getByLabel(/: Looks right$/)).toHaveCount(6);
        expect(new URL(page.url()).searchParams.get("url")).toBe(
            `http://${origin}/good`,
        );

        // The report's own address opens it again, checked.
        await page.goto(page.url());
        await expect(page.getByTestId("score-line")).toHaveText(
            "Looks right on all 6 apps. Nothing to fix.",
        );
    });

    test("says what to fix, and unlocks the fixes with an email", async ({
        page,
    }, testInfo) => {
        await page.goto(TOOL);
        await check(page, `http://${origin}/small-picture`);
        await expect(page.getByTestId("score-line")).toHaveText(
            "Looks right on 3 of 6 apps. Fix 2 things to fix all 6.",
        );
        await expect(page.getByLabel(/, locked$/)).toHaveCount(4);

        // An unverified address can't say yes to news: no tickbox.
        await expect(page.getByRole("checkbox")).toHaveCount(0);
        await page.getByLabel("Email").fill("not-an-email");
        await page.getByRole("button", { name: "Unlock" }).click();
        await expect(page.getByRole("alert")).toHaveText(
            "That email doesn't look right. Check it and try again.",
        );

        await page
            .getByLabel("Email")
            .fill(`lp-${stamp(testInfo)}@example.test`);
        await page.getByRole("button", { name: "Unlock" }).click();
        await expect(
            page.getByRole("heading", { name: "Fix these 2" }),
        ).toBeVisible();
        await expect(page.getByText("Use a bigger picture.")).toBeVisible();
        await expect(
            page.getByText("Tell X to use a large card."),
        ).toBeVisible();
        await expect(page.getByLabel(/, locked$/)).toHaveCount(0);
    });

    test("the API refuses both routes without saroh.in's signed relay", async ({
        request,
    }) => {
        const check = await request.post(
            `${urls.API_URL}/public/tools/link-preview`,
            { data: { url: `http://${origin}/good` } },
        );
        expect(check.status()).toBe(401);
        const report = await request.post(
            `${urls.API_URL}/public/tools/link-preview/report`,
            {
                data: {
                    email: "direct@example.test",
                    url: `http://${origin}/good`,
                },
            },
        );
        expect(report.status()).toBe(401);
    });

    test("says when a page has no tags, and when a site doesn't answer", async ({
        page,
    }) => {
        await page.goto(TOOL);
        await check(page, `http://${origin}/bare`);
        await expect(page.getByRole("alert")).toContainText(
            "found no share tags",
        );

        await check(page, `http://127.0.0.1:${closedPort}/`);
        await expect(page.getByRole("alert")).toHaveText(
            `We couldn't reach 127.0.0.1:${closedPort}. Check the address, or try again in a minute.`,
        );

        await check(page, "not an address");
        await expect(page.getByRole("alert")).toHaveText(
            "That doesn't look like a web address. Try something like yourbusiness.in.",
        );
    });

    test("fits a 390-wide phone: six cards, nothing scrolls sideways", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(
            `${TOOL}?url=${encodeURIComponent(`http://${origin}/good`)}`,
        );
        await expect(page.getByTestId("score-line")).toBeVisible();
        await expect(page.getByLabel(/: Looks right$/)).toHaveCount(6);
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
    });
});
