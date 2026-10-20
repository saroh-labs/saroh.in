// @covers app:/billing/invoices/new app:/billing/invoices app:/settings/organization api:invoices api:products api:organizations api:contacts
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { makeContact, northwind, stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * New invoice "on the paper", DEC-173 U15 #1127 (INVNewEdit and
 * INVNewEditPhone): the same draft as the form, written by pressing the
 * paper, with the style rail (Classic, Band, Compact and the colour) and
 * the GST fields a tax invoice must carry labelled and never removable.
 *
 * - Rye & Co. is GST-registered with a catalogue (Focaccia among it) and a
 *   film set nothing writes to: every save is stopped in the browser
 *   (`noWrites`), so what is checked is what the paper says and does.
 * - The look saved on the draft is checked on Northwind, for a contact the
 *   test makes; the draft is deleted after. The business's default is
 *   Northwind-wide, so that test is `@serial` and puts it back.
 */

const RYE = "seed_sc_rc_org";

/** Stop the draft's saves on Rye: a Server Action naming who it's for. */
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

async function openPaper(page: Page, org: string, query = "") {
    await useSession(page);
    await page.goto(`/open/${org}`);
    await page.goto(`/billing/invoices/new?mode=paper${query}`);
    await expect(
        page.getByRole("heading", { level: 1, name: "New invoice" }),
    ).toBeVisible();
    const paper = page.getByRole("article", {
        name: "The invoice: press a part to change it",
    });
    await expect(paper).toBeVisible();
    return paper;
}

/** A part's control on the paper, by the start of its name. */
const part = (page: Page, name: string | RegExp) =>
    page.getByRole("button", {
        name: typeof name === "string" ? new RegExp(`^${name}`) : name,
    });

/** The editor a part opened: a popover on the desk, a sheet on a phone. */
const editor = (page: Page) => page.getByRole("dialog").last();

/** The style rail: beside the paper on the desk, behind Style on a phone. */
async function styleRail(page: Page) {
    if (onPhone(page)) {
        await page.getByRole("button", { name: "Style", exact: true }).click();
        return page.getByRole("dialog", { name: "Style" });
    }
    return page.getByRole("complementary", { name: "Style" });
}

async function pickWho(page: Page) {
    await pressUntil(
        part(page, "Change who it's billed to"),
        page.getByRole("combobox", { name: "Who it's for" }),
    );
    await page.getByRole("combobox", { name: "Who it's for" }).click();
    await page.getByRole("option").first().click();
    await editor(page).getByRole("button", { name: "Done" }).click();
}

test.describe("New invoice on the paper", () => {
    test("Add a line by typing focac, change its quantity on the paper, and the totals follow", async ({
        page,
    }) => {
        await noWrites(page);
        const paper = await openPaper(page, RYE);
        await pickWho(page);

        await pressUntil(
            page.getByRole("button", { name: /^Add a line/ }),
            page.getByRole("dialog", { name: "Add a line" }),
        );
        await page
            .getByRole("dialog", { name: "Add a line" })
            .getByRole("combobox")
            .fill("focac");
        const focaccia = page
            .getByRole("option")
            .filter({ hasText: /Focaccia/ })
            .first();
        await expect(focaccia).toBeVisible();
        const name = (await focaccia.innerText()).split("\n")[0]?.trim() ?? "";
        await focaccia.click();
        await expect(paper).toContainText(name);
        await expect(paper).toContainText("1 × ₹");

        const totalOf = async () =>
            (await paper.locator('[data-part="sums"]').innerText()).replace(
                /\s+/g,
                " ",
            );
        const before = await totalOf();
        await part(page, `Change line 1: ${name}`).click();
        await editor(page).getByLabel("Qty").fill("24");
        await expect(paper).toContainText("24 × ₹");
        await expect.poll(totalOf).not.toBe(before);
        await editor(page).getByRole("button", { name: "Done" }).click();
        await expect(editor(page)).toBeHidden();
    });

    test("what was typed becomes a new line, opened for its price and GST", async ({
        page,
    }) => {
        await noWrites(page);
        const paper = await openPaper(page, RYE);
        await pressUntil(
            page.getByRole("button", { name: /^Add a line/ }),
            page.getByRole("dialog", { name: "Add a line" }),
        );
        await page
            .getByRole("dialog", { name: "Add a line" })
            .getByRole("combobox")
            .fill("Olive loaf tray");
        await page.getByRole("option", { name: /as a new line/ }).click();
        await expect(paper).toContainText("Olive loaf tray");
        await expect(paper).toContainText("Set its quantity and price");
        const line = editor(page);
        await expect(line).toContainText(/Line \d/);
        await line.getByLabel("Price each").fill("640");
        await line.getByRole("radio", { name: "5%" }).click();
        await expect(paper).toContainText("GST 5%");
        await expect(paper).toContainText("₹640");
    });

    test("the GSTIN, the number and the section 31 line are labelled and can't be removed", async ({
        page,
    }) => {
        await noWrites(page);
        const paper = await openPaper(page, RYE);
        for (const tag of [
            "Seller",
            "Next in series",
            "Name, address, GSTIN",
            "Required",
        ]) {
            await expect(
                paper.locator("[data-locked]").filter({ hasText: tag }),
            ).toBeVisible();
        }
        await expect(paper).toContainText(/GSTIN \w{15}/);
        await expect(paper).toContainText(
            "Tax invoice under section 31, CGST Act.",
        );
        await part(page, "The number").click();
        await expect(editor(page)).toContainText("can't be typed or taken off");
        await expect(
            editor(page).getByRole("button", { name: /Remove/ }),
        ).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(
            paper.locator('[data-part="footer"]').getByRole("button"),
        ).toHaveCount(0);
    });

    test("Band uses the colour across the top; Compact keeps every GST field", async ({
        page,
    }) => {
        await noWrites(page);
        const paper = await openPaper(page, RYE);
        await pickWho(page);
        const rail = await styleRail(page);
        await rail.getByRole("radio", { name: /^Band/ }).click();
        await rail.getByRole("radio", { name: "Colour #2F5D50" }).click();
        await expect(paper).toHaveAttribute("data-style", "BAND");
        await expect(paper.locator("[data-band]")).toHaveCSS(
            "background-color",
            "rgb(47, 93, 80)",
        );
        await rail.getByRole("radio", { name: /^Compact/ }).click();
        await expect(paper).toHaveAttribute("data-style", "COMPACT");
        for (const words of [
            /GSTIN \w{15}/,
            "Number when issued",
            "Billed to",
            "Place of supply",
            "Tax invoice under section 31, CGST Act.",
        ]) {
            await expect(paper).toContainText(words);
        }
        if (onPhone(page)) {
            await page.getByRole("button", { name: "Done" }).click();
        }

        // As the customer gets it: no labels, nothing to press.
        await page
            .getByRole("button", { name: /^See it as / })
            .filter({ visible: true })
            .first()
            .click();
        const seen = page.getByRole("dialog", { name: /will see it$/ });
        await expect(seen.locator("article")).toHaveAttribute(
            "data-style",
            "COMPACT",
        );
        await expect(seen.locator("[data-locked]")).toHaveCount(0);
    });

    test("switching between the form and the paper keeps the draft", async ({
        page,
    }) => {
        await noWrites(page);
        await useSession(page);
        await page.goto(`/open/${RYE}`);
        await page.goto("/billing/invoices/new");
        await page.getByRole("combobox", { name: "Who it's for" }).click();
        await page.getByRole("option").first().click();
        await page.getByLabel("Line 1: what it's for").fill("Tasting box");
        await page.getByLabel(/^Line 1: price each/).fill("900");
        await page.getByRole("radio", { name: "On the paper" }).click();
        await expect(page).toHaveURL(/mode=paper/);
        const paper = page.getByRole("article", {
            name: "The invoice: press a part to change it",
        });
        await expect(paper).toContainText("Tasting box");
        await page.getByRole("radio", { name: "Form" }).click();
        await expect(page.getByLabel("Line 1: what it's for")).toHaveValue(
            "Tasting box",
        );
    });

    test("the look chosen on the paper is saved with the draft", async ({
        page,
        request,
    }, testInfo) => {
        await useSession(page);
        const tag = stamp(testInfo);
        const contact = await makeContact(request, {
            firstName: "Paper",
            lastName: tag,
            email: `paper.${tag}@example.com`,
        });
        await page.goto(`/open/${NORTHWIND_ORG}`);
        await page.goto(
            `/billing/invoices/new?mode=paper&contactId=${contact.id}`,
        );
        await pressUntil(
            page.getByRole("button", { name: /^Add a line/ }),
            page.getByRole("dialog", { name: "Add a line" }),
        );
        await page
            .getByRole("dialog", { name: "Add a line" })
            .getByRole("combobox")
            .fill(`Platter ${tag}`);
        await page.getByRole("option", { name: /as a new line/ }).click();
        await editor(page).getByLabel("Price each").fill("450");
        await editor(page).getByRole("button", { name: "Done" }).click();
        await expect(page).toHaveURL(
            /\/billing\/invoices\/[^/]+\/edit\?mode=paper$/,
            { timeout: 15_000 },
        );
        const id = /\/billing\/invoices\/([^/]+)\/edit/.exec(page.url())?.[1];
        expect(id).toBeTruthy();

        const rail = await styleRail(page);
        await rail.getByRole("radio", { name: /^Band/ }).click();
        await rail.getByRole("radio", { name: "Colour #9B2C4A" }).click();
        try {
            await expect
                .poll(async () => {
                    const inv = await northwind(request).get<{
                        paperChoice?: {
                            style: string | null;
                            colour: string | null;
                        };
                    }>(`/invoices/${id}`);
                    return inv.paperChoice;
                })
                .toEqual({ style: "BAND", colour: "#9B2C4A" });

            // Back to the business's default.
            await rail.getByRole("button", { name: "Use my default" }).click();
            await expect
                .poll(async () => {
                    const inv = await northwind(request).get<{
                        paperChoice?: { style: string | null };
                    }>(`/invoices/${id}`);
                    return inv.paperChoice?.style ?? null;
                })
                .toBeNull();
        } finally {
            await northwind(request).delete(`/invoices/${id}`);
        }
    });

    test("on a phone: a part opens a sheet from the foot, thumb-sized, nothing sideways", async ({
        page,
    }) => {
        test.skip(!onPhone(page), "the phone's own layout");
        await page.setViewportSize({ width: 390, height: 844 });
        await noWrites(page);
        await openPaper(page, RYE);
        await expect(
            page.getByText("Tap any part to change it."),
        ).toBeVisible();
        await pressUntil(
            part(page, "The number"),
            page.locator("[data-header-sheet]"),
        );
        await page.getByRole("button", { name: "Close" }).last().click();
        for (const name of ["Style", /^See it as/, "Save draft"]) {
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

test.describe("the business's invoice style", { tag: "@serial" }, () => {
    test("Make this my default sets it for the business, and Settings reads it", async ({
        page,
        request,
    }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const nw = northwind(request);
        const before = await nw.get<{
            invoicePaper?: { style: string; colour: string | null };
        }>("/settings");
        await page.goto("/billing/invoices/new?mode=paper");
        try {
            const rail = await styleRail(page);
            await rail.getByRole("radio", { name: /^Compact/ }).click();
            await rail.getByRole("radio", { name: "Colour #3B4A8C" }).click();
            await rail
                .getByRole("button", { name: "Make this my default" })
                .click();
            await expect(rail).toContainText(
                "Your default look: Compact · #3B4A8C.",
            );
            await expect
                .poll(
                    async () =>
                        (
                            await nw.get<{
                                invoicePaper?: { style: string };
                            }>("/settings")
                        ).invoicePaper?.style,
                )
                .toBe("COMPACT");

            // In a page of its own: this one holds an unsaved draft.
            const settings = await page.context().newPage();
            await settings.goto("/settings/organization?section=tax");
            await expect(
                settings.locator("#business-invoice-style"),
            ).toContainText("Compact · #3B4A8C");
            await settings.close();
        } finally {
            await nw.patch("", {
                invoicePaper: {
                    style: before.invoicePaper?.style ?? "",
                    colour: before.invoicePaper?.colour ?? "",
                },
            });
        }
    });
});
