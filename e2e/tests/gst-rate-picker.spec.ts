// @covers app:/commerce/products app:/billing/invoices/new app:/billing/invoices app:/settings/organization api:products api:invoices api:organizations api:contacts
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    chooseRate,
    otherRate,
    rateChip,
    ratePicker,
} from "../fixtures/gst-rate";
import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { makeContact, northwind, NW_STORE, stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * The GST rate as buttons (DEC-176, #1160): 0%, 5%, 18% and 40% as the
 * main chips, the rest behind "Other rate", and 1.5% (cut and polished
 * diamonds) among them.
 *
 * - A product is saved at 1.5% through Other rate, and one at 12% opens
 *   again with Other rate shown and 12% chosen.
 * - An invoice line at 1.5% shows CGST and SGST at 0.75% each on the
 *   paper beside the form, and is issued at that rate.
 *
 * The rate is only asked of a GST-registered business, and Northwind's
 * seed is not one. Registering it changes what every order and invoice
 * test beside it reads, so this is `@serial` and puts Northwind back as
 * the seed leaves it (as `business-settings.spec.ts` does): not
 * registered, no tax ID, its address in Karnataka. The product and the
 * contact are this test's own; an issued invoice is never deleted, so it
 * is this test's own too.
 */

const NW: Storefront = { organizationId: NORTHWIND_ORG, storeId: NW_STORE };

/** A GSTIN in Karnataka's shape with a right check character. */
const GSTIN = "29ABCDE1234N1ZF";

/** Northwind's registered address as the seed writes it, state 29. */
const SEEDED_ADDRESS = {
    line1: "Plot 12, Peenya Industrial Area",
    city: "Bengaluru",
    postalCode: "560058",
};

async function setNorthwind(request: APIRequestContext, registered: boolean) {
    const res = await request.patch(
        `${urls.API_URL}/organizations/${NORTHWIND_ORG}`,
        {
            headers: {
                "x-organization-id": NORTHWIND_ORG,
                origin: urls.APP_URL,
            },
            data: {
                tax: { registered, state: "29" },
                profile: registered
                    ? { taxId: GSTIN, country: "IN" }
                    : { taxId: "", country: "" },
                registeredAddress: { ...SEEDED_ADDRESS, line2: "" },
            },
        },
    );
    expect(res.ok(), await res.text()).toBe(true);
}

/** A product of Northwind's, as the API reads it back. */
async function savedRate(page: Page, id: string): Promise<number | null> {
    const product = await northwind(page.request).get<{
        gstRate: string | null;
    }>(`/stores/${NW.storeId}/products/${id}`);
    return product.gstRate === null ? null : Number(product.gstRate);
}

async function openProduct(page: Page, id: string) {
    await page.goto(`/commerce/products/${id}/edit?storefront=${NW.storeId}`);
    const picker = ratePicker(page, "GST rate");
    await expect(picker).toBeVisible();
    return picker;
}

/** Save basics, and wait for the editor to say it is saved. */
async function saveBasics(page: Page) {
    await page
        .getByRole("button", { name: "Save basics" })
        .filter({ visible: true })
        .click();
    await expect(page.getByText("All changes saved")).toBeVisible({
        timeout: 15_000,
    });
}

/** The new invoice's paper, opened on a phone first. */
async function invoicePaper(page: Page) {
    const it = page.getByRole("article", { name: "How it will look" });
    if (onPhone(page)) {
        await pressUntil(
            page.getByRole("button", { name: "See how it will look" }),
            it,
        );
    }
    await expect(it).toBeVisible();
    return it;
}

test.describe("the GST rate as buttons (DEC-176)", { tag: "@serial" }, () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        await setNorthwind(page.request, true);
    });

    test.afterEach(async ({ page }) => {
        await setNorthwind(page.request, false);
    });

    test("a product saved at 1.5% through Other rate", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E GST 1.5 ${testInfo.project.name}`;
        try {
            const id = await takeProduct(page.request, NW, name, {
                price: "1000.00",
                status: "DRAFT",
            });
            const picker = await openProduct(page, id);
            // A registered business answers it: no "Not set".
            await expect(picker.getByRole("radio")).toHaveText([
                "0%",
                "5%",
                "18%",
                "40%",
            ]);
            await expect(otherRate(picker)).toHaveAttribute(
                "aria-expanded",
                "false",
            );
            await chooseRate(picker, "5");
            await chooseRate(picker, "1.5");
            // The chosen rate's own chip is lit; no main chip is.
            await expect(rateChip(picker, "5")).toHaveAttribute(
                "aria-checked",
                "false",
            );
            if (onPhone(page)) {
                await page.setViewportSize({ width: 320, height: 720 });
                // A text field scrolls its own long value; that is the
                // field's job (as qr-code-maker.spec.ts allows it).
                await expectNothingHiddenSideways(page, { allow: ["input"] });
            }
            await saveBasics(page);
            await expect.poll(() => savedRate(page, id)).toBe(1.5);
        } finally {
            await removeProducts(page.request, NW, name);
        }
    });

    test("a product saved at 12% opens again with Other rate shown", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E GST 12 ${testInfo.project.name}`;
        try {
            const id = await takeProduct(page.request, NW, name, {
                price: "800.00",
                status: "DRAFT",
            });
            let picker = await openProduct(page, id);
            await chooseRate(picker, "12");
            await saveBasics(page);
            await expect.poll(() => savedRate(page, id)).toBe(12);

            await page.reload();
            picker = ratePicker(page, "GST rate");
            await expect(otherRate(picker)).toHaveAttribute(
                "aria-expanded",
                "true",
            );
            await expect(rateChip(picker, "12")).toHaveAttribute(
                "aria-checked",
                "true",
            );
        } finally {
            await removeProducts(page.request, NW, name);
        }
    });

    test("an invoice line at 1.5%: CGST and SGST at 0.75% each, and issued", async ({
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        const tag = stamp(testInfo);
        const contact = await makeContact(page.request, {
            firstName: "Diamond",
            lastName: tag,
            email: `gst-picker.${tag}@example.com`,
        });
        await page.goto(`/billing/invoices/new?contactId=${contact.id}`);
        await expect(
            page.getByRole("heading", { level: 1, name: "New invoice" }),
        ).toBeVisible();
        await page
            .getByLabel("Line 1: what it's for")
            .fill(`Cut diamond ${tag}`);
        await page.getByLabel(/^Line 1: price each/).fill("10000");
        await page.getByLabel("Line 1: HSN or SAC").fill("7102");
        await expect(page).toHaveURL(/\/billing\/invoices\/[^/]+\/edit$/, {
            timeout: 15_000,
        });
        const id = /\/billing\/invoices\/([^/]+)\/edit$/.exec(page.url())?.[1];
        expect(id).toBeTruthy();

        const line = ratePicker(page, "Line 1: GST rate");
        // A line may wait for its rate until it is issued: "Not set" stays.
        await expect(line.getByRole("radio").first()).toHaveText("Not set");
        await chooseRate(line, "5");
        await chooseRate(line, "1.5");
        if (onPhone(page)) {
            // The line's name scrolls inside its own field, as a text
            // field does; nothing else may hide.
            await expectNothingHiddenSideways(page, { allow: ["input"] });
        }

        const paper = await invoicePaper(page);
        await expect(paper).toContainText("GST 1.5%");
        await expect(paper).toContainText("CGST 0.75%");
        await expect(paper).toContainText("SGST 0.75%");
        if (onPhone(page)) {
            await page
                .getByRole("button", { name: "Hide how it will look" })
                .click();
        }

        await page
            .getByRole("button", { name: /^Issue (and share|it)$/ })
            .filter({ visible: true })
            .click();
        await page.waitForURL(new RegExp(`/billing/invoices/${id}$`), {
            timeout: 30_000,
        });
        const issued = await northwind(page.request).get<{
            number: string | null;
            gst: { taxType: string; cgst: string; sgst: string } | null;
            lines: { gst?: { rate: string | null } | null }[];
        }>(`/invoices/${id}`);
        expect(issued.number).toBeTruthy();
        expect(Number(issued.lines[0]?.gst?.rate)).toBe(1.5);
        expect(issued.gst?.taxType).toBe("INTRA");
        expect(issued.gst?.cgst).toBe(issued.gst?.sgst);
    });
});
