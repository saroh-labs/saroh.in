// @covers site:/ site:/shop site:/book site:/account site:/[slug] site:/test-release-gate api:sites api:contacts api:enquiry pkg:site-blocks
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, ORDER_LINE, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";
import { asNewVisitor } from "./site-codes";

/**
 * A test release on its own host (DEC-071, T5).
 *
 * The owner freezes Northwind's draft into a release through the API, with a
 * stamped name, and a visitor opens its link on
 * `test--northwind.<renderer>`. The link's token moves into a cookie for that
 * host and leaves the address; every page carries the Test release bar and
 * `noindex`; a browser without the link sees the gate; a link taken back
 * says so; and the live site never shows the bar.
 *
 * Each test makes its own release, so any two run side by side: making one
 * changes nothing the live site or another test reads. `SITE_TEST_RELEASES`
 * is on for Northwind in the seed.
 *
 * T6: on the test host a new visitor walks the contact form, the booking
 * page and (where the shop is on) the bag to the point where each would
 * become real, and sees the stop instead. Nothing is sent: no enquiry, no
 * booking, no order, and no contact with the test's stamp on Northwind.
 */

const renderer = new URL(urls.RENDERER_URL);
const LIVE = `${renderer.protocol}//northwind.${renderer.host}`;
const TEST = `${renderer.protocol}//test--northwind.${renderer.host}`;

interface Made {
    release: { id: string; name: string };
    link: { id: string; url: string | null };
}

/** Northwind's one site (ADR-006). */
async function northwindSite(request: APIRequestContext): Promise<string> {
    const sites =
        await northwind(request).get<
            { id: string; subdomain: string | null }[]
        >("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    return site?.id ?? "";
}

/** A release of Northwind's draft, made for this test, and its token. */
async function makeRelease(
    page: Page,
    name: string,
): Promise<{ siteId: string; made: Made; token: string }> {
    await useSession(page);
    const siteId = await northwindSite(page.request);
    const made = await northwind(page.request).post<Made>(
        `/sites/${siteId}/test-releases`,
        { name },
    );
    expect(made.release.name).toBe(name);
    // The link as the API wrote it names the host it runs on in production;
    // the token opens the same release on whichever host this run serves.
    const token = new URL(made.link.url ?? "").searchParams.get("release");
    expect(token, "the new release's link carries its token").toBeTruthy();
    return { siteId, made, token: token ?? "" };
}

const bar = (page: Page) => page.getByRole("region", { name: "Test release" });

test.describe("a test release on its own host (T5)", () => {
    test("opens behind its link, with the bar and noindex on every page", async ({
        page,
    }, testInfo) => {
        const name = `E2E release ${stamp(testInfo)}`;
        const { token } = await makeRelease(page, name);

        const opened = await page.goto(`${TEST}/?release=${token}`);
        // The token leaves the address once it is in the host's cookie.
        await expect.poll(() => page.url()).toBe(`${TEST}/`);
        expect(opened?.headers()["x-robots-tag"]).toContain("noindex");
        expect(opened?.headers()["referrer-policy"]).toBe("no-referrer");
        await expect(bar(page)).toContainText(name);
        await expect(bar(page)).toContainText(
            "Nothing here takes a real order, booking or payment.",
        );
        // No share card on a test host.
        await expect(page.locator('meta[property="og:title"]')).toHaveCount(0);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
            "content",
            /noindex/,
        );

        // "What's live" lists what the release doesn't freeze (R6).
        await bar(page).getByText("What’s live").click();
        await expect(bar(page)).toContainText("Products, prices and stock");
        await expect(bar(page)).toContainText("Opening hours");

        // The whole site: each page answers on the test host as it does on
        // the live one (the shop and the account area may be switched off
        // on this stack, and then both are "not found"), and every page the
        // live site draws in its chrome is drawn under the bar.
        for (const path of ["/shop", "/book", "/account"]) {
            const live = await page.goto(`${LIVE}${path}`);
            const drawn = await page.locator("header.sticky").count();
            const res = await page.goto(`${TEST}${path}`);
            expect(res?.status(), `${path} on the test host`).toBe(
                live?.status(),
            );
            expect(res?.headers()["x-robots-tag"]).toContain("noindex");
            await expect(page.locator("header.sticky")).toHaveCount(drawn);
            if (drawn > 0) await expect(bar(page)).toContainText(name);
        }
        // Northwind takes bookings, so /book at least is drawn.
        await page.goto(`${TEST}/book`);
        await expect(bar(page)).toContainText(name);
    });

    test("without the link, the host shows the gate; the live site has no bar", async ({
        browser,
        page,
    }, testInfo) => {
        await makeRelease(page, `E2E release ${stamp(testInfo)}`);

        const stranger = await browser.newContext({ ignoreHTTPSErrors });
        try {
            const visitor = await stranger.newPage();
            const res = await visitor.goto(`${TEST}/`);
            expect(res?.headers()["x-robots-tag"]).toContain("noindex");
            await expect(
                visitor.getByRole("heading", {
                    name: "Open this test release from its link.",
                }),
            ).toBeVisible();
            await expect(bar(visitor)).toHaveCount(0);

            const live = await visitor.goto(`${LIVE}/`);
            expect(live?.headers()["x-robots-tag"]).toBeUndefined();
            await expect(visitor.locator("header").first()).toBeVisible();
            await expect(bar(visitor)).toHaveCount(0);
        } finally {
            await stranger.close();
        }
    });

    test("a link taken back says so", async ({ page }, testInfo) => {
        const name = `E2E release ${stamp(testInfo)}`;
        const { siteId, made, token } = await makeRelease(page, name);

        await page.goto(`${TEST}/?release=${token}`);
        await expect(bar(page)).toContainText(name);

        await northwind(page.request).post(
            `/sites/${siteId}/test-releases/links/${made.link.id}/revoke`,
        );
        await page.reload();
        await expect(
            page.getByRole("heading", {
                name: "This test release link was taken back.",
            }),
        ).toBeVisible();
        await expect(bar(page)).toHaveCount(0);
    });

    test("the bar wraps at 320px, and the site's header sticks below it", async ({
        page,
    }, testInfo) => {
        const name = `E2E release ${stamp(testInfo)}`;
        const { token } = await makeRelease(page, name);
        await page.setViewportSize({ width: 320, height: 700 });
        await page.goto(`${TEST}/?release=${token}`);
        await expect(bar(page)).toContainText(name);

        // No sideways scroll: measured against the width set, since a phone
        // viewport widens innerWidth to fit content that overflows.
        await expect
            .poll(() =>
                page.evaluate(() => ({
                    scroll: document.documentElement.scrollWidth,
                    inner: window.innerWidth,
                })),
            )
            .toEqual({ scroll: 320, inner: 320 });

        // The header's sticky top is the bar's height, so it is never under it.
        await expect
            .poll(() =>
                page.evaluate(() => {
                    const barBox = document
                        .querySelector("[data-test-release-bar]")
                        ?.getBoundingClientRect();
                    const header = document.querySelector("header.sticky");
                    if (!barBox || !header) return null;
                    return (
                        Math.round(parseFloat(getComputedStyle(header).top)) ===
                        Math.round(barBox.height)
                    );
                }),
            )
            .toBe(true);
    });
});

/** A browser write from here on: a server action, or a public API POST. */
function watchWrites(page: Page): string[] {
    const writes: string[] = [];
    page.on("request", (request) => {
        if (request.method() !== "POST") return;
        if (
            request.headers()["next-action"] ||
            new URL(request.url()).pathname.startsWith("/public/")
        ) {
            writes.push(request.url());
        }
    });
    return writes;
}

const stop = (page: Page) =>
    page.locator("[data-test-release-stop]").filter({ visible: true });

test.describe("flows stop short on a test release (T6)", () => {
    test("the contact form and the booking page stop, and nothing reaches the business", async ({
        page,
    }, testInfo) => {
        const mark = stamp(testInfo);
        const email = `t6-${mark}@example.in`.toLowerCase();
        const { token } = await makeRelease(page, `E2E release ${mark}`);
        await asNewVisitor(page);
        await page.goto(`${TEST}/?release=${token}`);
        await expect(bar(page)).toContainText(mark);

        // The contact form: filled in and sent, it posts nothing.
        await page.goto(`${TEST}/contact`);
        await page.getByLabel("Your name").fill(`Tester ${mark}`);
        await page.getByLabel("Email").fill(email);
        await page.getByLabel("What do you need?").fill(`Stamp ${mark}`);
        const formWrites = watchWrites(page);
        await page.getByRole("button", { name: "Send enquiry" }).click();
        await expect(stop(page)).toContainText(
            "Nothing is sent on a test release.",
        );
        await expect(page.getByLabel("What do you need?")).toHaveValue(
            `Stamp ${mark}`,
        );
        expect(formWrites).toEqual([]);

        // The booking page: live times, and the stop where signing in
        // would be. No booking, no hold.
        await page.goto(`${TEST}/book`);
        await expect(
            page.getByRole("heading", { name: "Make a booking" }),
        ).toBeVisible();
        await page
            .getByRole("radio", { name: /Warehouse walkthrough/ })
            .click();
        const times = page.locator('[role="radiogroup"] button[role="radio"]', {
            hasText: /^\d{2}:\d{2}$/,
        });
        await expect(times.first()).toBeVisible({ timeout: 15_000 });
        await times.first().click();
        await page.getByLabel("Name").fill(`Tester ${mark}`);
        const bookWrites = watchWrites(page);
        await page
            .getByRole("button", { name: "Continue to sign in" })
            .filter({ visible: true })
            .first()
            .click();
        const sheet = page.getByRole("dialog", {
            name: "This is a test release",
        });
        await expect(sheet).toContainText(
            /the customer signs in here and books Warehouse walkthrough, /,
        );
        await expect(sheet).toContainText(
            "Nothing is booked on a test release.",
        );
        // Signing in is where the live site would go next; here it doesn't.
        await expect(page.getByLabel("Email")).toHaveCount(0);
        expect(bookWrites).toEqual([]);
        await sheet.getByRole("button", { name: "Back" }).click();
        await expect(sheet).toHaveCount(0);

        // Nothing reached Northwind with this test's stamp.
        const found = await northwind(page.request).get<{ id: string }[]>(
            `/contacts/search?q=${encodeURIComponent(email)}`,
        );
        expect(found).toEqual([]);
    });

    test("the bag is priced, then stops before signing in: no order", async ({
        page,
    }, testInfo) => {
        const mark = stamp(testInfo);
        const { token } = await makeRelease(page, `E2E release ${mark}`);
        await asNewVisitor(page);
        await page.goto(`${TEST}/?release=${token}`);
        await expect(bar(page)).toContainText(mark);

        const shop = await page.goto(`${TEST}/shop`);
        test.skip(
            shop?.status() === 404,
            "Northwind's shop is switched off on this stack",
        );
        const product = page
            .getByRole("link", { name: new RegExp(ORDER_LINE) })
            .first();
        test.skip(
            (await product.count()) === 0,
            `${ORDER_LINE} isn't on sale on Northwind's site here`,
        );
        await product.click();
        const add = page.getByRole("button", { name: "Add to bag" });
        test.skip(
            (await add.count()) === 0,
            "Northwind's site doesn't take online orders on this stack",
        );
        await add.click();
        await page.getByRole("button", { name: /^Your bag, / }).click();
        const bag = page.getByRole("dialog");
        await expect(
            bag.getByRole("heading", { name: "Your bag" }),
        ).toBeVisible();
        const pickUp = bag.getByRole("radio", { name: /Pick-up/ });
        if (await pickUp.isVisible()) await pickUp.click();
        const cont = bag.getByRole("button", { name: /^Continue · / });
        await expect(cont).toBeEnabled({ timeout: 15_000 });
        const total = ((await cont.innerText()).split("·")[1] ?? "").trim();

        const writes = watchWrites(page);
        await cont.click();
        const sheet = page.getByRole("dialog", {
            name: "This is a test release",
        });
        await expect(sheet).toContainText(
            `the customer signs in here and pays ${total} for 1 item.`,
        );
        await expect(sheet).toContainText(
            "Nothing is ordered on a test release.",
        );
        expect(writes).toEqual([]);
    });
});

/**
 * The API's own refusal, through the real bootstrap (release review): the
 * renderer's stops above never let a test host post, so this is the only
 * check that `main.ts` wires `TestHostWriteGuard` in. A public write whose
 * Origin is the test host is a 409 `TEST_RELEASE` before any route runs;
 * the same write from the live host passes the guard and reaches the
 * route, which answers for its unknown form.
 */
test.describe("the API refuses a test host's public write (KTD-8)", () => {
    const submit = (request: APIRequestContext, origin: string) =>
        request.post(`${urls.API_URL}/public/forms/e2e_no_such_form/submit`, {
            headers: { Origin: origin },
            data: {
                data: { name: "Test host", email: "test-host@example.in" },
            },
            ignoreHTTPSErrors,
            failOnStatusCode: false,
        });

    test("an enquiry from the test host is a 409 TEST_RELEASE; from the live host it reaches the form", async ({
        request,
    }) => {
        const refused = await submit(request, TEST);
        expect(refused.status()).toBe(409);
        const body = (await refused.json()) as {
            error?: { details?: { code?: string } };
        };
        expect(body.error?.details?.code).toBe("TEST_RELEASE");

        const live = await submit(request, LIVE);
        expect(live.status()).toBe(404);
    });
});
