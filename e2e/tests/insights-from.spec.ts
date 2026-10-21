// @covers app:/analytics api:analytics
import type {
    APIRequestContext,
    Browser,
    Page,
    TestInfo,
} from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import type { OwnBusiness } from "../fixtures/own-business";
import { makeBusiness, ownAddress } from "../fixtures/own-business";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Insights' "Where customers come from", now (DEC-171, plan U14, #1097;
 * boards `IBFromD`, `IBSiteD`, `IBFromP`, `IBSiteP`): today's website
 * figures for the page's one period, with Coming next (A9), a change on
 * each figure, every day of the period drawn (a day nobody came as a
 * baseline), the pages with their paths, and a site picker only when the
 * business has more than one website (a sheet on a phone).
 *
 * Northwind is read only (one website, ninety days of seeded visits). The
 * empty days and the picker are on a business of the spec's own
 * (`makeBusiness`, as Asha), so nothing another spec reads is written.
 *
 * A read that fails is named on the tab (`from-tab.test.tsx`): a browser
 * can't make the API fail on cue, so it isn't repeated here.
 */

const onPhone = () => test.info().project.name.startsWith("phone");

async function openFrom(page: Page, org: string, query: string) {
    await page.goto(`${urls.APP_URL}/open/${org}`);
    await page.goto(`${urls.APP_URL}/analytics?tab=from${query}`);
    await expect(
        page.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeVisible();
    await expect(
        page
            .getByRole("navigation", { name: "Insights" })
            .getByRole("link", { name: /^Where customers come from/ }),
    ).toHaveAttribute("aria-current", "page");
}

/** Nothing on the page is wider than the screen it was given. */
async function expectNoSidewaysScroll(page: Page) {
    const width = page.viewportSize()?.width ?? 0;
    await expect
        .poll(() =>
            page.evaluate(() => ({
                scroll: document.documentElement.scrollWidth,
                inner: window.innerWidth,
            })),
        )
        .toEqual({ scroll: width, inner: width });
    if (onPhone()) await expectNothingHiddenSideways(page);
}

const WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

/** Each day's bar, in order: no day is skipped between two drawn. */
async function expectEveryDay(page: Page, days: { min: number; max: number }) {
    const bars = page
        .getByRole("group", { name: /^Visits each day/ })
        .getByRole("button");
    const labels = await bars.evaluateAll((all) =>
        all.map((b) => b.getAttribute("aria-label") ?? ""),
    );
    expect(labels.length).toBeGreaterThanOrEqual(days.min);
    expect(labels.length).toBeLessThanOrEqual(days.max);
    const weekdays = labels.map((l) => WEEKDAYS.indexOf(l.split(" ")[0]!));
    expect(weekdays.every((d) => d >= 0)).toBe(true);
    for (let i = 1; i < weekdays.length; i++) {
        expect(weekdays[i], `${labels[i - 1]} then ${labels[i]}`).toBe(
            (weekdays[i - 1]! + 1) % 7,
        );
    }
    return labels;
}

test("a business with one website reads every figure for the period, with how it moved", async ({
    page,
}) => {
    await useSession(page);
    await openFrom(page, NORTHWIND_ORG, "&period=3m");
    const main = page.locator("main");

    // Coming next, and what works today (A9).
    await expect(page.getByTestId("from-next")).toContainText(
        "Coming next. Sources and the path from visit to paid need your site's links to be tracked.",
    );
    // One website: no picker.
    await expect(page.getByTestId("site-picker")).toHaveCount(0);

    const website = page.getByRole("region", { name: "Your website" });
    await expect(website).toContainText(
        "Last 3 months: visits, people, enquiries, and paid orders and bookings. Updated every hour.",
    );
    const figures = page.getByTestId("website-figures");
    for (const name of [
        "Visits",
        "People",
        "Enquiries",
        "Paid orders and bookings",
    ]) {
        await expect(figures).toContainText(name);
    }
    // Each says how it moved on the three months before, as a count.
    await expect(figures.getByRole("listitem")).toHaveCount(4);
    for (const item of await figures.getByRole("listitem").all()) {
        await expect(item).toContainText(
            /(more|fewer) than the 3 months before|Same as the 3 months before|None in the 3 months before/,
        );
    }
    await expect(
        figures.getByRole("link", { name: /^Enquiries/ }),
    ).toHaveAttribute("href", "/leads");
    await expect(
        figures.getByRole("link", { name: /^Paid orders and bookings/ }),
    ).toHaveAttribute(
        "href",
        /^\/commerce\/orders\?date=custom&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}&payment=paid$/,
    );

    // Every day of the three months, in order, each read by a tap.
    await expectEveryDay(page, { min: 89, max: 92 });
    const visits = page.getByTestId("website-visits");
    await expect(visits).toContainText(/^Visits each day[\d,]+ visits? from/);
    const firstDay = visits.getByRole("button").first();
    await firstDay.click();
    await expect(visits.locator("[aria-live=polite]")).toHaveText(
        /^\w+day \d+ \w{3} · (no visits|[\d,]+ visits? · [\d,]+ (person|people))$/,
    );

    // The pages, each named, its path kept under it.
    const pages = page.getByTestId("website-pages");
    await expect(pages).toContainText("Which pages do people open?");
    await expect(pages.getByRole("listitem").first()).toContainText(/\//);

    // How these are counted, as on every tab.
    await expect(main.getByText("How these are counted")).toBeVisible();
    await expect(main).not.toContainText(/\b\d{2}-\d{2}\b/);
    await expectNoSidewaysScroll(page);
});

/**
 * A module rolled out to the business by Sam: a business set up here has
 * none rolled out, so its owner can't turn one on until Saroh has
 * (DEC-057), as `providers-customer-emails.spec.ts` does for Payments.
 */
async function rollOut(
    browser: Browser,
    org: string,
    key: string,
    testInfo: TestInfo,
) {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    try {
        const staff = await context.newPage();
        await useSession(staff, "staff");
        const res = await staff.request.put(
            `${urls.API_URL}/admin/flags/MODULE_${key}/organizations/${org}`,
            {
                headers: { origin: urls.APP_URL },
                data: {
                    enabled: true,
                    reason: "Insights browser test (U14)",
                    idempotencyKey: `insf-${key}-${testInfo.project.name}-${testInfo.retry}-${org}`,
                },
            },
        );
        expect(res.ok(), `roll out ${key}: ${await res.text()}`).toBe(true);
    } finally {
        await context.close();
    }
}

/** The business's own module switched on, as its owner. */
async function turnOn(request: APIRequestContext, org: string, key: string) {
    const res = await request.put(
        `${urls.API_URL}/organizations/${org}/modules/${key}`,
        {
            headers: { "x-organization-id": org, origin: urls.APP_URL },
            data: { status: "ENABLED" },
        },
    );
    expect(res.ok(), `turn on ${key}: ${await res.text()}`).toBe(true);
}

/** A website made for the business, or why the stack wouldn't. */
async function addSite(
    request: APIRequestContext,
    business: OwnBusiness,
    address: string,
): Promise<{ id: string; name: string } | { refused: string }> {
    const name = `Site ${address}`;
    const res = await request.post(
        `${urls.API_URL}/organizations/${business.id}/sites`,
        {
            headers: {
                "x-organization-id": business.id,
                origin: urls.APP_URL,
            },
            data: { name, subdomain: address },
        },
    );
    if (res.status() === 409 || res.status() === 403) {
        return { refused: await res.text() };
    }
    expect(res.ok(), `add ${name}: ${await res.text()}`).toBe(true);
    const made = (await res.json()) as { id: string };
    return { id: made.id, name };
}

test("a business nobody has visited draws every day as a baseline, never an empty chart", async ({
    page,
    browser,
}, testInfo) => {
    const business = await makeBusiness(page, testInfo, "insf");
    await rollOut(browser, business.id, "INSIGHTS", testInfo);
    await turnOn(page.request, business.id, "INSIGHTS");
    await openFrom(page, business.id, "&period=7d");

    const labels = await expectEveryDay(page, { min: 7, max: 7 });
    expect(labels.every((l) => l.endsWith("· no visits"))).toBe(true);
    await expect(page.getByTestId("website-visits")).toContainText(
        "No visits to your website in the last 7 days.",
    );
    // Zero in words; the figures say none came before either.
    await expect(page.getByTestId("website-figures")).toContainText(
        "None in the 7 days before either",
    );
    await expect(page.getByTestId("website-orders-note")).toContainText(
        /^No paid orders (recorded )?in the last 7 days\./,
    );
    await expect(page.getByTestId("website-pages")).toContainText(
        "No page visits yet.",
    );
    await expectNoSidewaysScroll(page);
});

test("with more than one website the picker chooses one and keeps it in the address", async ({
    page,
    browser,
}, testInfo) => {
    const business = await makeBusiness(page, testInfo, "insp");
    await rollOut(browser, business.id, "INSIGHTS", testInfo);
    await rollOut(browser, business.id, "WEBSITE", testInfo);
    await turnOn(page.request, business.id, "INSIGHTS");
    await turnOn(page.request, business.id, "WEBSITE");
    // Two websites of its own; a stack that allows one per business
    // (ADR-006, the catalogue not governing websites) can't show a picker.
    const first = await addSite(
        page.request,
        business,
        ownAddress("inspa", testInfo),
    );
    const second = await addSite(
        page.request,
        business,
        ownAddress("inspb", testInfo),
    );
    test.skip(
        "refused" in second,
        "this stack allows one website per business; the picker is covered by site-picker.test.tsx and from-tab.test.tsx",
    );
    if ("refused" in second) return;

    await openFrom(page, business.id, "&period=7d");
    const picker = page.getByTestId("site-picker");
    await expect(picker).toHaveText("All your sites");
    await expect(
        page.getByRole("region", { name: "Your website" }),
    ).toContainText("for all your sites.");
    if (onPhone()) {
        // A real touch pointer, so the 44px rule is really checked.
        expect(
            await page.evaluate(
                () => window.matchMedia("(pointer: coarse)").matches,
            ),
        ).toBe(true);
        await expect
            .poll(async () => (await picker.boundingBox())?.height ?? 0)
            .toBeGreaterThanOrEqual(44);
    }

    await picker.click();
    const sheet = page.getByRole("dialog", { name: "Which website" });
    await expect(sheet).toBeVisible();
    // On a phone it rises from the foot of the screen; at a desk it comes
    // in from the right.
    const viewport = page.viewportSize()!;
    await expect
        .poll(async () => {
            const box = await sheet.boundingBox();
            if (!box) return null;
            return onPhone()
                ? Math.round(box.y + box.height) === viewport.height
                : Math.round(box.x + box.width) === viewport.width;
        })
        .toBe(true);
    const options = sheet.getByTestId("site-options").getByRole("link");
    await expect(options.first()).toHaveAttribute("aria-current", "true");
    await expect(options.first()).toContainText("All your sites");
    if (!("refused" in first)) {
        await expect(sheet).toContainText(first.name);
    }

    await sheet.getByRole("link", { name: new RegExp(second.name) }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`[?&]siteId=${second.id}(&|$)`));
    await expect(page).toHaveURL(/[?&]tab=from/);
    await expect(page).toHaveURL(/[?&]period=7d/);
    await expect(picker).toHaveText(second.name);
    await expect(page.getByTestId("website-orders-note")).toContainText(
        "counted for your whole business, not one website",
    );

    // The tab, the period and the website survive a refresh.
    await page.reload();
    await expect(page.getByTestId("site-picker")).toHaveText(second.name);
    await expectNoSidewaysScroll(page);
});
