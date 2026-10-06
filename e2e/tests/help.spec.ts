// @covers web:/help
import type { APIRequestContext, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { urls } from "../playwright.config";

/**
 * Help on saroh.in (Resources plan U5): what only a running site shows.
 *
 * - /help lists "Add your first product" under Sell products, and the
 *   search finds it;
 * - the article draws its five real screenshots (each loaded, not a
 *   placeholder), rings the controls it names, and carries HowTo JSON-LD;
 * - at 390 the product areas are a Topics menu, and nothing hides sideways;
 * - the other articles draw a ringed real screen for every step, at desk
 *   and phone width where the spec says so;
 * - every Next link and every link in the side nav answers 200.
 *
 * Help publishes on 17 Oct (KTD-2): before then the pages are 404 unless
 * the site runs with `RESOURCES_PREVIEW=1` (local and preview only), so
 * the spec skips when /help isn't there. Read-only.
 */

const WEB = urls.WEB_URL;
const ARTICLE = "/help/add-your-first-product";

const isPhone = (testInfo: TestInfo) =>
    testInfo.project.name.startsWith("phone");

async function helpIsLive(request: APIRequestContext) {
    return (await request.get(`${WEB}/help`)).status() === 200;
}

test.beforeEach(async ({ request }) => {
    test.skip(
        !(await helpIsLive(request)),
        "Help is unpublished until 17 Oct; run the site with RESOURCES_PREVIEW=1",
    );
});

test("/help lists the first article, and search finds it", async ({ page }) => {
    await page.goto(`${WEB}/help`);
    await expect(
        page.getByRole("heading", { level: 1, name: "How can we help?" }),
    ).toBeVisible();
    const group = page
        .locator("main div")
        .filter({
            has: page.getByRole("heading", { level: 3, name: "Sell products" }),
        })
        .last();
    await expect(
        group.getByRole("link", { name: "Add your first product" }),
    ).toHaveAttribute("href", ARTICLE);

    await page
        .getByRole("searchbox", { name: "Search help" })
        .fill("add product");
    const results = page.getByRole("list", { name: "Results" });
    await results.getByRole("link", { name: /Add your first product/ }).click();
    await expect(page).toHaveURL(new RegExp(`${ARTICLE}$`));
});

test("the article draws its five real screens, ringed where a step names a control", async ({
    page,
}) => {
    await page.goto(`${WEB}${ARTICLE}`);
    await expect(
        page.getByRole("heading", { level: 1, name: "Add your first product" }),
    ).toBeVisible();
    const shots = page.locator("main [data-shot^='help-add-product-']");
    await expect(shots).toHaveCount(5);
    for (const shot of await shots.all()) {
        const img = shot.locator("img");
        await img.scrollIntoViewIfNeeded();
        await expect
            .poll(() =>
                img.evaluate(
                    (el) =>
                        (el as HTMLImageElement).complete &&
                        (el as HTMLImageElement).naturalWidth,
                ),
            )
            .toBeGreaterThan(0);
        await expect(shot.locator("[data-marker]")).toHaveCount(1);
    }
    await expect(page.locator("main figcaption")).toHaveCount(5);

    const ld = await page
        .locator('script[type="application/ld+json"]')
        .allTextContents();
    const howTo = ld
        .map((t) => JSON.parse(t) as { "@type"?: string; step?: unknown[] })
        .find((d) => d["@type"] === "HowTo");
    expect(howTo?.step).toHaveLength(5);
});

/** The setup, orders and payment articles, each with how many steps it has. */
const SETUP_AND_PAY = [
    ["create-your-business", 5],
    ["add-your-gstin", 5],
    ["take-your-first-order", 6],
    ["connect-razorpay", 4],
    ["connect-cashfree", 5],
] as const;

for (const [slug, steps] of SETUP_AND_PAY) {
    test(`${slug} draws a real, ringed screen for each of its ${steps} steps`, async ({
        page,
    }) => {
        await page.goto(`${WEB}/help/${slug}`);
        const shots = page.locator(`main [data-shot^='help-']`);
        await expect(shots).toHaveCount(steps);
        for (const shot of await shots.all()) {
            const img = shot.locator("img");
            await img.scrollIntoViewIfNeeded();
            await expect
                .poll(() =>
                    img.evaluate(
                        (el) =>
                            (el as HTMLImageElement).complete &&
                            (el as HTMLImageElement).naturalWidth,
                    ),
                )
                .toBeGreaterThan(0);
            await expect(shot.locator("[data-marker]")).toHaveCount(1);
        }
    });
}

test("every link in the side nav and Next answers, and none is the page itself", async ({
    page,
    request,
}, testInfo) => {
    test.skip(isPhone(testInfo), "the links are the same on the phone");
    await page.goto(`${WEB}${ARTICLE}`);
    const nav = page.getByRole("navigation", { name: "Help topics" });
    await expect(nav.locator('[aria-current="page"]')).toHaveText(
        "Add your first product",
    );
    const hrefs = await page
        .locator(
            'nav[aria-label="Help topics"] a[href], nav[aria-labelledby="next"] a[href]',
        )
        .evaluateAll((els) =>
            els.map((el) => new URL((el as HTMLAnchorElement).href).pathname),
        );
    expect(hrefs).not.toContain(ARTICLE);
    for (const href of hrefs) {
        expect((await request.get(`${WEB}${href}`)).status(), href).toBe(200);
    }
});

test("at 390 the areas are a Topics menu, and nothing hides sideways", async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}${ARTICLE}`);
    const nav = page.getByRole("navigation", { name: "Help topics" });
    const topics = nav.getByRole("button", { name: "Topics" });
    await expect(topics).toBeVisible();
    await expect(nav.locator('[aria-current="page"]')).toBeHidden();
    await topics.click();
    await expect(topics).toHaveAttribute("aria-expanded", "true");
    await expect(nav.locator('[aria-current="page"]')).toBeVisible();
    await expect(
        page.getByRole("navigation", { name: "On this page" }),
    ).toBeHidden();
    await expectNothingHiddenSideways(page);

    await page.goto(`${WEB}/help`);
    await page.getByRole("searchbox", { name: "Search help" }).fill("product");
    await expect(page.getByRole("list", { name: "Results" })).toBeVisible();
    await expectNothingHiddenSideways(page);
});

/** The bookings, plans and website articles: each step's real screen, ringed. */
const MORE = [
    { slug: "set-your-teams-hours", title: "Set your team's hours", steps: 6 },
    {
        slug: "take-a-deposit-when-they-book",
        title: "Take a deposit when they book",
        steps: 5,
    },
    { slug: "set-up-a-monthly-plan", title: "Set up a monthly plan", steps: 6 },
    {
        slug: "connect-your-own-domain",
        title: "Connect your own domain",
        steps: 5,
    },
    {
        slug: "make-your-link-look-right-when-shared",
        title: "Make your link look right when shared",
        steps: 4,
    },
];

for (const a of MORE) {
    test(`${a.title}: every step's screen loads, ringed, and nothing hides sideways`, async ({
        page,
    }) => {
        await page.goto(`${WEB}/help/${a.slug}`);
        await expect(
            page.getByRole("heading", { level: 1, name: a.title }),
        ).toBeVisible();
        const shots = page.locator("main [data-shot^='help-']");
        await expect(shots).toHaveCount(a.steps);
        for (const shot of await shots.all()) {
            const img = shot.locator("img");
            await img.scrollIntoViewIfNeeded();
            await expect
                .poll(() =>
                    img.evaluate(
                        (el) =>
                            (el as HTMLImageElement).complete &&
                            (el as HTMLImageElement).naturalWidth,
                    ),
                )
                .toBeGreaterThan(0);
            await expect(shot.locator("[data-marker]")).toHaveCount(1);
        }
        await expectNothingHiddenSideways(page);
    });
}
