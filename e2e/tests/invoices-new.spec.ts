// @covers accounts:/login app:/open app:/billing/invoices/new app:/billing/invoices api:invoices api:products api:organizations api:contacts
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { makeContact, northwind, stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * New invoice (A), DEC-173 U14 #1126 (INVNewA and INVNewAPhone): the form
 * with its paper beside it, products to pick, Due with the day it lands on,
 * saving as it is typed, the GST-rate step before issuing and the one leave
 * guard. Writing one by hand and issuing it is `invoices.spec.ts`.
 *
 * - Rye & Co. is GST-registered with a catalogue, and a film set nothing
 *   writes to: every save the form would send there is stopped in the
 *   browser (`noWrites`), so what is checked is what the screen says and
 *   asks, and the draft never reaches the API.
 * - Saving as it is typed is checked on Northwind, for a contact the test
 *   makes, and the draft it makes is deleted after.
 */

const RYE = "seed_sc_rc_org";

/**
 * Stop the form's saves on Rye: a Server Action carrying a draft (it names
 * who it's for) is aborted, so autosave says "Not saved" and nothing is
 * written. The product search, which sends only what was typed, goes on.
 */
async function noWrites(page: Page) {
    await page.route("**/billing/invoices/**", async (route) => {
        const req = route.request();
        if (
            req.method() === "POST" &&
            (req.postData() ?? "").includes("contactId")
        ) {
            await route.abort();
            return;
        }
        await route.continue();
    });
}

async function open(page: Page, org: string) {
    await useSession(page);
    await page.goto(`/open/${org}`);
    await page.goto("/billing/invoices/new");
    await expect(
        page.getByRole("heading", { level: 1, name: "New invoice" }),
    ).toBeVisible();
}

/** "2 Nov": the day `days` from today in India, as the paper says it. */
function dayIn(days: number): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Kolkata",
    }).format(new Date(Date.now() + days * 86_400_000));
}

/** The paper, opened on a phone first. */
async function paper(page: Page) {
    const it = page.getByRole("article", { name: "How it will look" });
    if (onPhone(page)) {
        // Pressed until the paper shows: a single look at the toggle can
        // land before it is drawn, and then nothing opens the paper.
        await pressUntil(
            page.getByRole("button", { name: "See how it will look" }),
            it,
        );
    }
    await expect(it).toBeVisible();
    return it;
}

test.describe("New invoice (A)", () => {
    test("pick a product: its price, GST rate and HSN fill the line, and the paper shows it", async ({
        page,
    }) => {
        await noWrites(page);
        await open(page, RYE);
        await page.getByRole("combobox", { name: "Who it's for" }).click();
        await page.getByRole("option").first().click();

        // The product search is the answer, not any listbox: the one for
        // who it's for can still be closing, and would answer for it.
        await pressUntil(
            page.getByRole("button", { name: "+ Pick from your products" }),
            page.getByPlaceholder("Search names and SKUs"),
        );
        const option = page
            .getByRole("option")
            .filter({ hasText: /HSN \d{4,8}/ })
            .first();
        await expect(option).toBeVisible();
        const said = (await option.innerText()).split("\n");
        const name = said[0]?.trim() ?? "";
        const hsn = /HSN (\d{4,8})/.exec(said.join(" "))?.[1] ?? "";
        const rate = /GST (\d+(?:\.\d+)?)%|Nil-rated/.exec(said.join(" "));
        await option.click();

        await expect(page.getByLabel("Line 1: what it's for")).toHaveValue(
            name,
        );
        await expect(page.getByLabel(/^Line 1: price each/)).not.toHaveValue(
            "",
        );
        await expect(page.getByLabel("Line 1: HSN or SAC")).toHaveValue(hsn);
        if (rate?.[1]) {
            await expect(page.getByLabel("Line 1: GST rate")).toContainText(
                `${rate[1]}%`,
            );
        }
        await expect((await paper(page)).getByText(name)).toBeVisible();
    });

    test("Due in 14 days: the chip and the paper say the day it lands on", async ({
        page,
    }) => {
        await noWrites(page);
        await open(page, RYE);
        const fourteen = page.getByRole("radio", { name: /^14 days/ });
        await expect(fourteen).toHaveAttribute("aria-checked", "true");
        await expect(fourteen).toHaveText(`14 days · ${dayIn(14)}`);
        await pressUntil(
            page.getByRole("radio", { name: /^30 days/ }),
            async () =>
                (await page
                    .getByRole("radio", { name: /^30 days/ })
                    .getAttribute("aria-checked")) === "true",
        );
        await expect(await paper(page)).toContainText(`Due ${dayIn(30)}`);
        await page.getByRole("radio", { name: "On receipt" }).click();
        await expect(await paper(page)).toContainText("Due on receipt");
    });

    test("a line with no GST rate is asked for in place, and nothing is issued", async ({
        page,
    }) => {
        await noWrites(page);
        await open(page, RYE);
        await page.getByRole("combobox", { name: "Who it's for" }).click();
        await page.getByRole("option").first().click();
        await page.getByLabel("Line 1: what it's for").fill("Tasting box");
        await page.getByLabel(/^Line 1: price each/).fill("900");
        const issue = page.getByRole("button", {
            name: /^Issue (and share|it)$/,
        });
        await expect(issue).toBeEnabled();
        await issue.click();
        await expect(
            page.getByText(
                "Choose this line's GST rate. Pick 0% if it's exempt or nil-rated.",
            ),
        ).toBeVisible();
        await expect(page.getByLabel("Line 1: GST rate")).toHaveAttribute(
            "aria-invalid",
            "true",
        );
        await expect(page).toHaveURL(/\/billing\/invoices\/new$/);
    });

    test("leaving with typed work that isn't saved asks once", async ({
        page,
    }) => {
        await noWrites(page);
        await open(page, RYE);
        await page.getByRole("combobox", { name: "Who it's for" }).click();
        await page.getByRole("option").first().click();
        await page.getByLabel("Line 1: what it's for").fill("Tasting box");
        await page.getByLabel(/^Line 1: price each/).fill("900");
        // The save is stopped: the form says so.
        await expect(
            page.getByText("Not saved", { exact: true }).first(),
        ).toBeVisible({ timeout: 15_000 });
        await page
            .getByRole("navigation", { name: "Breadcrumb" })
            .getByRole("link", { name: "Invoices" })
            .click();
        const ask = page.getByRole("alertdialog", {
            name: "Leave without saving?",
        });
        await expect(ask).toBeVisible();
        await ask.getByRole("button", { name: "Stay" }).click();
        await expect(ask).toBeHidden();
        await expect(page).toHaveURL(/\/billing\/invoices\/new$/);
        await expect(page.getByLabel("Line 1: what it's for")).toHaveValue(
            "Tasting box",
        );
    });

    test("saved as it is typed: the draft is made once, at its own address", async ({
        page,
    }, testInfo) => {
        await useSession(page);
        // The page's own request context: it carries the session just added.
        // Playwright's `request` fixture is a context of its own, signed out.
        const request = page.request;
        const tag = stamp(testInfo);
        const contact = await makeContact(request, {
            firstName: "Invoice",
            lastName: tag,
            email: `invoice.${tag}@example.com`,
        });
        await page.goto(`/open/${NORTHWIND_ORG}`);
        await page.goto(`/billing/invoices/new?contactId=${contact.id}`);
        await expect(
            page.getByRole("heading", { level: 1, name: "New invoice" }),
        ).toBeVisible();
        await page.getByLabel("Line 1: what it's for").fill(`Platter ${tag}`);
        await page.getByLabel(/^Line 1: price each/).fill("450");
        await expect(page).toHaveURL(/\/billing\/invoices\/[^/]+\/edit$/, {
            timeout: 15_000,
        });
        await expect(
            page.getByText("Draft · saved").filter({ visible: true }).first(),
        ).toBeVisible();
        const id = /\/billing\/invoices\/([^/]+)\/edit$/.exec(page.url())?.[1];
        expect(id).toBeTruthy();

        // Another change goes to the same draft.
        await page.getByLabel("Line 1: quantity").fill("2");
        await expect
            .poll(async () => {
                const inv = await northwind(request).get<{
                    lines: { quantity: number }[];
                }>(`/invoices/${id}`);
                return inv.lines[0]?.quantity;
            })
            .toBe(2);
        const drafts = await northwind(request).get<
            { id: string; contact: { id: string } | null }[]
        >(`/invoices?contactId=${contact.id}`);
        expect(drafts.map((d) => d.id)).toEqual([id]);

        // Save draft goes to its page.
        await page
            .getByRole("button", { name: "Save draft" })
            .filter({ visible: true })
            .click();
        await page.waitForURL(new RegExp(`/billing/invoices/${id}$`));

        const gone = await northwind(request).delete(`/invoices/${id}`);
        expect(gone.ok()).toBe(true);
    });

    test("on a phone: one column, the paper behind See it, thumb-sized buttons, nothing sideways", async ({
        page,
    }) => {
        test.skip(!onPhone(page), "the phone's own layout");
        expect(
            await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
        ).toBe(true);
        await page.setViewportSize({ width: 390, height: 844 });
        await noWrites(page);
        await open(page, RYE);

        const sheet = page.getByRole("article", { name: "How it will look" });
        await expect(sheet).toBeHidden();
        await page
            .getByRole("button", { name: "See how it will look" })
            .click();
        await expect(sheet).toBeVisible();
        await page
            .getByRole("button", { name: "Hide how it will look" })
            .click();
        await expect(sheet).toBeHidden();

        for (const name of [
            "Save draft",
            /^Issue (and share|it)$/,
            "+ Add a line",
        ]) {
            const box = await page
                .getByRole("button", { name })
                .filter({ visible: true })
                .first()
                .boundingBox();
            expect(box?.height ?? 0, String(name)).toBeGreaterThanOrEqual(44);
        }
        await expectNothingHiddenSideways(page);
    });
});
