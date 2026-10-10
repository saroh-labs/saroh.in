// @covers web:/tools/qr-code-maker web:/api/qr-code-maker api:tools api:waitlist pkg:ui
import type { APIRequestContext, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { stamp } from "../fixtures/own-data";
import { urls } from "../playwright.config";

/**
 * The free QR code maker on saroh.in (QR codes plan U9), end to end: the
 * page, saroh.in's unlock route and the API's email gate.
 *
 * - typing a link redraws the code, and a full address pasted in isn't
 *   doubled;
 * - a colour too light to scan says so;
 * - an incomplete email is refused in the page; a real one (a stamped
 *   address) unlocks PNG and SVG, the request carries the email and nothing
 *   about the code, and the SVG is saved as `my-qr-code.svg`;
 * - the API refuses the route called directly, without saroh.in's relay;
 * - at 390 wide nothing scrolls or hides sideways.
 *
 * The page publishes on 17 Oct (KTD-2): before then it is a 404 unless the
 * site runs with `RESOURCES_PREVIEW=1` (CI and `pnpm prepush --e2e` do), so
 * the spec skips when it isn't there. Each test sends its own
 * `cf-connecting-ip` (standing in for Cloudflare), which saroh.in signs
 * into the relay, so each counts against its own rate limit and they run
 * beside each other. The stamped address is the only thing a test stores.
 */

const WEB = urls.WEB_URL;
const TOOL = `${WEB}/tools/qr-code-maker`;

async function toolIsLive(request: APIRequestContext) {
    return (await request.get(TOOL)).status() === 200;
}

/** Each test counts against its own limit (saroh.in signs this address). */
async function asOwnVisitor(page: Page, testInfo: TestInfo) {
    const n =
        (testInfo.workerIndex * 37 + testInfo.retry * 11 + Date.now()) % 250;
    await page.setExtraHTTPHeaders({
        "cf-connecting-ip": `198.51.100.${n + 1}`,
    });
}

/** The code's dots, as drawn: they change when the link does. */
const dots = (page: Page) =>
    page.locator("svg[data-qr-art] path").first().getAttribute("d");

test.describe("QR code maker", () => {
    test.beforeEach(async ({ page, request }, testInfo) => {
        test.skip(
            !(await toolIsLive(request)),
            "The QR code maker is unpublished until 17 Oct; run the site with RESOURCES_PREVIEW=1",
        );
        await asOwnVisitor(page, testInfo);
        await page.goto(TOOL);
    });

    test("draws the code from the link as it is typed", async ({ page }) => {
        await expect(
            page.getByRole("heading", { level: 1, name: "QR code maker" }),
        ).toBeVisible();
        await expect(
            page.getByRole("img", {
                name: "A sample QR code that opens this page",
            }),
        ).toBeVisible();
        const sample = await dots(page);

        const field = page.getByLabel("Web address");
        await field.fill("https://example.com/book");
        // The field already shows "https://": a pasted one isn't doubled.
        await expect(field).toHaveValue("example.com/book");
        await expect(
            page.getByRole("img", {
                name: "QR code for https://example.com/book",
            }),
        ).toBeVisible();
        await expect.poll(() => dots(page)).not.toBe(sample);
        const first = await dots(page);

        await field.fill("example.com/menu");
        await expect.poll(() => dots(page)).not.toBe(first);

        await page.getByLabel("Label (optional)").fill("Scan to book");
        await expect(page.locator("[data-qr-label]")).toHaveText(
            "Scan to book",
        );
    });

    test("says when a colour is too light to scan", async ({ page }) => {
        await page.getByRole("button", { name: "Saffron" }).click();
        await expect(page.locator("main").getByRole("alert")).toHaveText(
            "Too light to scan reliably. Pick a darker colour.",
        );
        await page.getByRole("button", { name: "Navy" }).click();
        await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    });

    test("refuses an incomplete email, then unlocks the downloads with a real one", async ({
        page,
    }, testInfo) => {
        await page.getByLabel("Web address").fill("example.com/book");
        const png = page.getByRole("button", { name: "Download PNG" });
        await expect(png).toHaveCount(0);
        // An unverified address can't say yes to news: no tickbox.
        await expect(page.getByRole("checkbox")).toHaveCount(0);

        await page.getByLabel("Email").fill("owner@shop");
        await page.getByRole("button", { name: "Get my QR" }).click();
        await expect(page.locator("main").getByRole("alert")).toHaveText(
            "That email looks incomplete. Check it and try again.",
        );
        await expect(png).toHaveCount(0);

        const email = `qr-${stamp(testInfo)}@example.test`;
        const call = page.waitForRequest(
            (r) => new URL(r.url()).pathname === "/api/qr-code-maker/unlock",
        );
        await page.getByLabel("Email").fill(email);
        await page.getByRole("button", { name: "Get my QR" }).click();
        // The email, and nothing about the code: not the link, not the label.
        const sent = await call;
        expect(sent.method()).toBe("POST");
        expect(sent.postDataJSON()).toEqual({ email });

        await expect(png).toBeVisible();
        const svg = page.getByRole("button", { name: "Download SVG" });
        await expect(svg).toBeVisible();
        await expect(page.locator("main").getByRole("alert")).toHaveCount(0);

        // The file is made in the page and saved under the tool's name.
        const download = page.waitForEvent("download");
        await svg.click();
        expect((await download).suggestedFilename()).toBe("my-qr-code.svg");
    });

    test("the API refuses the unlock without saroh.in's signed relay", async ({
        request,
    }) => {
        const direct = await request.post(
            `${urls.API_URL}/public/tools/qr-code-maker/unlock`,
            { data: { email: "direct@example.test" } },
        );
        expect(direct.status()).toBe(401);
    });

    test("fits a 390-wide phone: nothing scrolls or hides sideways", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(TOOL);
        await page
            .getByLabel("Web address")
            .fill("example.com/a-long-address/for-a-small-screen");
        await page
            .getByLabel("Label (optional)")
            .fill("Scan to book your next visit with us");
        await expect(page.locator("[data-qr-label]")).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Get my QR" }),
        ).toBeVisible();
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        document.documentElement.scrollWidth -
                        window.innerWidth,
                ),
            )
            .toBeLessThanOrEqual(0);
        // A text field scrolls its own long value; that is the field's job.
        await expectNothingHiddenSideways(page, { allow: ["input"] });
    });
});
