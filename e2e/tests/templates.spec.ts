// @covers web:/templates web:/templates/[slug] web:/waitlist
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { urls } from "../playwright.config";

/**
 * The Templates gallery on saroh.in (industry templates plan U13, Resources
 * plan U6): what only a running site shows.
 *
 * - /templates draws a card per gallery template, each linking to its page,
 *   and the Creators chip narrows them to the creators' templates;
 * - /templates/gym: the save button carries `template=gym` to the waitlist,
 *   the page switcher and the Phone toggle change the frame, the facts have
 *   no Plan row, and every related card answers 200;
 * - /waitlist?template=gym says the Gym template is being saved (the form
 *   is not sent: read-only);
 * - nothing hides sideways, at desk or on the phone.
 *
 * The gallery publishes on 17 Oct (KTD-2): before then the pages are 404
 * unless the site runs with `RESOURCES_PREVIEW=1` (local and preview
 * only), so the spec skips when /templates isn't there.
 */

const WEB = urls.WEB_URL;

async function galleryIsLive(request: APIRequestContext) {
    return (await request.get(`${WEB}/templates`)).status() === 200;
}

test.beforeEach(async ({ request }) => {
    test.skip(
        !(await galleryIsLive(request)),
        "Templates is unpublished until 17 Oct; run the site with RESOURCES_PREVIEW=1",
    );
});

/** The drawing or the 2× render inside a frame: decorative, never a sideways scroller. */
const PREVIEWS = ["[data-template-preview]", "[data-template-view]"];

test("/templates lists each template, and a chip narrows them", async ({
    page,
}) => {
    await page.goto(`${WEB}/templates`);
    await expect(
        page.getByRole("heading", {
            level: 1,
            name: "Pick a site that looks like your business.",
        }),
    ).toBeVisible();
    const cards = page.locator("main a[data-template]");
    await expect(cards).toHaveCount(7);
    await expect(page.locator('main a[data-template="gym"]')).toHaveAttribute(
        "href",
        "/templates/gym",
    );
    await expect(
        page.getByText(
            "Every business shown is a sample, made up to show the template.",
        ),
    ).toBeVisible();
    // No chip for a kind with no template: Salons aren't built.
    const chips = page.getByRole("group", { name: "Kind of business" });
    await expect(chips.getByRole("button", { name: "Salons" })).toHaveCount(0);

    await chips.getByRole("button", { name: "Creators" }).click();
    await expect(
        chips.getByRole("button", { name: "Creators" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(cards).toHaveCount(4);
    await expect(page.locator('main a[data-template="gym"]')).toHaveCount(0);

    await expectNothingHiddenSideways(page, { allow: PREVIEWS });
});

test("/templates/gym saves Gym for early access, and shows its pages", async ({
    page,
    request,
}) => {
    await page.goto(`${WEB}/templates/gym`);
    await expect(
        page.getByRole("heading", {
            level: 1,
            name: "Gym: the week's classes, first.",
        }),
    ).toBeVisible();
    const save = page
        .getByRole("link", { name: "Save Gym for early access" })
        .first();
    await expect(save).toHaveAttribute(
        "href",
        /^\/waitlist\?template=gym&src=templates-gym$/,
    );

    const frame = page.locator("[data-template-view]");
    await expect(frame).toHaveAttribute("data-template-view", "/:desktop");
    await page
        .getByRole("group", { name: "Pages" })
        .getByRole("button", { name: "Timetable" })
        .click();
    await expect(frame).toHaveAttribute(
        "data-template-view",
        "/timetable:desktop",
    );
    await page
        .getByRole("group", { name: "Show it on" })
        .getByRole("button", { name: "Phone" })
        .click();
    await expect(frame).toHaveAttribute(
        "data-template-view",
        "/timetable:phone",
    );

    await expect(page.locator("main dt")).toHaveText([
        "Pages",
        "Uses",
        "Type",
        "Colours",
    ]);
    await expect(page.locator("main")).not.toContainText("₹");

    for (const href of await page
        .locator("main section a[data-template]")
        .evaluateAll((links) =>
            links.map((a) => (a as HTMLAnchorElement).getAttribute("href")),
        )) {
        expect((await request.get(`${WEB}${href}`)).status()).toBe(200);
    }

    await expectNothingHiddenSideways(page, { allow: PREVIEWS });
});

test("a template that isn't in the gallery is a 404", async ({ request }) => {
    expect((await request.get(`${WEB}/templates/starter`)).status()).toBe(404);
});

test("the waitlist says the saved template is kept (not sent)", async ({
    page,
}) => {
    await page.goto(`${WEB}/waitlist?template=gym&src=templates-gym`);
    await expect(page.getByTestId("waitlist-template")).toHaveText(
        "Saving the Gym template for your invite.",
    );
    await page.goto(`${WEB}/waitlist?template=not-a-template`);
    await expect(
        page.getByRole("heading", { name: "Join the waitlist" }),
    ).toBeVisible();
    await expect(page.getByTestId("waitlist-template")).toHaveCount(0);
});
