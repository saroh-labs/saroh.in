// @covers accounts:/login app:/open app:/billing/invoices app:/settings/organization api:invoices api:organizations
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { makeContact, northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * The registered address before the first invoice (DEC-068), on Northwind:
 * with its address taken away, Issue on a draft is refused by the API, and
 * the app asks for the address in place — "Add your business details" —
 * saves it to the business profile and issues the invoice, without the
 * merchant leaving the page.
 *
 * It owns its data: a contact and a draft made for the test. It changes
 * Northwind's own business details, which every invoice and order test
 * reads, so it is `@serial` and puts the address back in `finally`.
 */

interface Settings {
    tax?: { registered: boolean; state: string | null };
    registeredAddress?: {
        line1: string | null;
        line2: string | null;
        city: string | null;
        postalCode: string | null;
        state: string | null;
    };
}

const ADDRESS = {
    line1: "Plot 12, Peenya Industrial Area",
    city: "Bengaluru",
    postalCode: "560058",
};

/** The page's own action, drawn once per layout: the one on screen. */
const action = (page: Page, name: string) =>
    page
        .getByRole("button", { name, exact: true })
        .filter({ visible: true })
        .first();

test.describe(
    "business details before the first invoice (DEC-068)",
    {
        tag: "@serial",
    },
    () => {
        test("Issue asks for the address in place, then the invoice issues", async ({
            page,
        }, testInfo) => {
            test.setTimeout(120_000);
            await useSession(page);
            await page.goto(`/open/${NORTHWIND_ORG}`);
            const nw = northwind(page.request);
            const before = await nw.get<Settings>("/settings");
            expect(
                before.tax?.registered,
                "Northwind is not GST-registered",
            ).toBe(false);

            try {
                // No registered address on file, and no state.
                await nw.patch("", {
                    tax: { state: "" },
                    registeredAddress: {
                        line1: "",
                        line2: "",
                        city: "",
                        postalCode: "",
                    },
                });

                const s = stamp(testInfo);
                const contact = await makeContact(page.request, {
                    firstName: "Asha",
                    lastName: `Details ${s}`,
                    email: `m3-${s}@example.test`,
                });
                const draft = await nw.post<{ id: string }>("/invoices", {
                    contactId: contact.id,
                    currency: "INR",
                    lines: [
                        {
                            description: `Birthday cake (${s})`,
                            quantity: 1,
                            unitPrice: "900",
                        },
                    ],
                    dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
                });

                await page.goto(`/billing/invoices/${draft.id}`);
                await action(page, "Issue it").click();
                const confirm = page.getByRole("alertdialog");
                await confirm.getByRole("button", { name: "Issue it" }).click();

                // Refused for want of the address: asked for in place.
                const sheet = page.getByRole("dialog", {
                    name: "Add your business details",
                });
                await expect(sheet).toBeVisible();
                await expect(sheet).toContainText(
                    "Every invoice prints your registered address. Add it once and we'll issue it.",
                );
                const save = sheet.getByRole("button", {
                    name: "Save and issue",
                });
                await expect(save).toHaveCSS("cursor", "pointer");

                // Saving it half-filled says what is left, on the fields.
                await sheet.getByLabel("Address line 1").fill(ADDRESS.line1);
                await save.click();
                await expect(sheet.getByText("Add the city.")).toBeVisible();
                await expect(
                    sheet.getByText("Choose your state."),
                ).toBeVisible();

                await sheet.getByLabel("City").fill(ADDRESS.city);
                await sheet.getByLabel("PIN code").fill(ADDRESS.postalCode);
                await sheet.getByRole("combobox", { name: "State" }).click();
                await page.getByRole("option", { name: "Karnataka" }).click();
                await save.click();

                // Saved, and the invoice issued: no second click.
                await expect(sheet).toHaveCount(0);
                await expect
                    .poll(
                        async () =>
                            (
                                await nw.get<{ status: string }>(
                                    `/invoices/${draft.id}`,
                                )
                            ).status,
                        { timeout: 15_000 },
                    )
                    .toBe("ISSUED");
                const issued = await nw.get<{ number: string | null }>(
                    `/invoices/${draft.id}`,
                );
                expect(issued.number).toBeTruthy();
                await expect(
                    page.getByText(`${issued.number ?? ""} issued`).first(),
                ).toBeVisible();

                const after = await nw.get<Settings>("/settings");
                expect(after.registeredAddress).toMatchObject({
                    ...ADDRESS,
                    state: "29",
                });
            } finally {
                // Northwind's details as they were.
                const was = before.registeredAddress;
                await nw.patch("", {
                    tax: { state: before.tax?.state ?? "" },
                    registeredAddress: {
                        line1: was?.line1 ?? "",
                        line2: was?.line2 ?? "",
                        city: was?.city ?? "",
                        postalCode: was?.postalCode ?? "",
                    },
                });
            }
        });
    },
);
