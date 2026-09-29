// @covers accounts:/login app:/open app:/settings/organization api:organizations api:audit
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Business settings, Tax and invoices: registering for GST (e890237c).
 *
 * A registration needs a GSTIN and a registered address, rules that span
 * fields. The form used to re-check only the field that changed, so a
 * refusal could stand — and Save stay off — after everything was filled
 * in. This walks it: GST on, a GSTIN too short (refused, Save off), then the
 * GSTIN and the address in full (Save back on), and saves.
 *
 * It runs on Northwind Supply, the base seed — Rye & Co. and Pulse Fitness
 * are kept camera-ready — and puts Northwind back as it found it: not
 * registered, no tax ID, no address, no state.
 */

const ORG = "seed_org";
// The API refuses a write with no Origin (#50).
const headers = { "x-organization-id": ORG, origin: urls.APP_URL };
const settingsUrl = `${urls.API_URL}/organizations/${ORG}/settings`;

async function signIn(page: Page) {
    await useSession(page);
}

interface TaxRead {
    profile: { taxId: string | null; country: string | null } | null;
    tax?: { registered: boolean; state: string | null };
    registeredAddress?: {
        line1: string | null;
        city: string | null;
        postalCode: string | null;
    };
}

async function readTax(request: APIRequestContext): Promise<TaxRead> {
    const res = await request.get(settingsUrl, { headers });
    expect(res.ok()).toBe(true);
    return (await res.json()) as TaxRead;
}

/** Northwind as the seed leaves it: not registered, nothing on file. */
async function putBack(request: APIRequestContext) {
    const res = await request.patch(`${urls.API_URL}/organizations/${ORG}`, {
        headers,
        data: {
            tax: { registered: false, state: "" },
            profile: { taxId: "", country: "" },
            registeredAddress: {
                line1: "",
                line2: "",
                city: "",
                postalCode: "",
            },
        },
    });
    expect(res.ok()).toBe(true);
}

test.describe("business settings", () => {
    test("registering for GST: Save comes back once the GSTIN and address are filled", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await signIn(page);
        await page.goto(`/open/${ORG}`);

        const before = await readTax(page.request);
        expect(before.tax?.registered).toBe(false);

        try {
            await page.goto("/settings/organization");
            await page.getByRole("tab", { name: "Tax and invoices" }).click();
            await page
                .getByRole("button", { name: "Edit tax and invoices" })
                .click();

            const card = page.getByRole("region", {
                name: "Tax and invoices",
            });
            const save = card.getByRole("button", { name: "Save" });

            // GST on: the registered address comes into the Tax card.
            await card.getByRole("switch", { name: "GST-registered" }).click();
            await expect(card.getByLabel("Address line 1")).toBeVisible();
            await expect(card.getByLabel("City")).toBeVisible();
            await expect(card.getByLabel("PIN code")).toBeVisible();

            // A GSTIN too short: refused, and Save off.
            const gstin = card.getByLabel("GSTIN");
            await gstin.fill("06ABCDE");
            if (await save.isEnabled()) await save.click();
            await expect(gstin).toHaveAttribute("aria-invalid", "true");
            await expect(card.getByText(/^7 of 15 characters/)).toBeVisible();
            await expect(save).toBeDisabled();

            // The GSTIN right, the address still missing: a refusal that
            // spans fields, on the address, and Save still off.
            await gstin.fill("06ABCDE1234N1ZN");
            await expect(gstin).not.toHaveAttribute("aria-invalid", "true");
            if (await save.isEnabled()) await save.click();
            await expect(card.getByLabel("Address line 1")).toHaveAttribute(
                "aria-invalid",
                "true",
            );
            await expect(save).toBeDisabled();

            // Everything a registration needs: Save comes back.
            await card.getByLabel("Address line 1").fill("Plot 14, Sector 44");
            await card.getByLabel("City").fill("Gurugram");
            await card.getByLabel("PIN code").fill("122001");
            await expect(save).toBeEnabled();
            await save.click();

            // Saved: the card reads again, and the API has it.
            await expect(
                page.getByRole("button", { name: "Edit tax and invoices" }),
            ).toBeVisible({ timeout: 30_000 });
            const after = await readTax(page.request);
            expect(after.tax?.registered).toBe(true);
            expect(after.profile?.taxId).toBe("06ABCDE1234N1ZN");
            expect(after.tax?.state).toBe("06");
            expect(after.registeredAddress).toMatchObject({
                line1: "Plot 14, Sector 44",
                city: "Gurugram",
                postalCode: "122001",
            });
        } finally {
            await putBack(page.request);
        }

        // Put back: a cleared tax ID reads "" where the seed had none.
        const restored = await readTax(page.request);
        expect(restored.tax?.registered).toBe(false);
        expect(restored.tax?.state ?? null).toBeNull();
        expect(restored.profile?.taxId ?? "").toBe("");
        expect(restored.registeredAddress?.line1 ?? null).toBeNull();
        expect(restored.registeredAddress?.city ?? null).toBeNull();
        expect(restored.registeredAddress?.postalCode ?? null).toBeNull();
    });

    /*
     * Undo on a save (F12): the toast offers Undo, which saves the previous
     * prefix back through the same write — so Activity records two changes.
     * An Undo whose field changed since (another tab) is refused, and the
     * newer value stands.
     */
    test("Undo on a save puts the prefix back, as a change of its own", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await signIn(page);
        await page.goto(`/open/${ORG}`);
        const was = await readPrefix(page.request);
        const since = new Date().toISOString();

        try {
            await savePrefixInUi(page, "UQ");
            await page
                .getByRole("button", { name: "Undo" })
                .click({ timeout: 10_000 });
            await expect
                .poll(() => readPrefix(page.request), { timeout: 15_000 })
                .toBe(was);

            const updates = (await readAudit(page.request)).filter(
                (e) =>
                    e.action === "profile.update" &&
                    e.createdAt >= since &&
                    JSON.stringify(e.metadata).includes("invoicePrefix"),
            );
            expect(updates.length).toBe(2);
        } finally {
            await setPrefix(page.request, was);
        }
    });

    test("Undo after another tab changed the prefix is refused", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await signIn(page);
        await page.goto(`/open/${ORG}`);
        const was = await readPrefix(page.request);

        try {
            await savePrefixInUi(page, "UQ");
            // Another tab saves over it before Undo is pressed.
            await setPrefix(page.request, "UZ");
            await page
                .getByRole("button", { name: "Undo" })
                .click({ timeout: 10_000 });
            await expect(page.getByText("Changed since — reload")).toBeVisible({
                timeout: 15_000,
            });
            expect(await readPrefix(page.request)).toBe("UZ");
        } finally {
            await setPrefix(page.request, was);
        }
    });
});

async function readPrefix(request: APIRequestContext): Promise<string> {
    const res = await request.get(settingsUrl, { headers });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
        tax?: { invoicePrefix: string | null };
    };
    return body.tax?.invoicePrefix ?? "";
}

async function setPrefix(request: APIRequestContext, prefix: string) {
    const res = await request.patch(`${urls.API_URL}/organizations/${ORG}`, {
        headers,
        data: { tax: { invoicePrefix: prefix } },
    });
    expect(res.ok()).toBe(true);
}

async function readAudit(request: APIRequestContext) {
    const res = await request.get(
        `${urls.API_URL}/organizations/${ORG}/audit?limit=20&actions=profile.update`,
        { headers },
    );
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
        events?: { action: string; createdAt: string; metadata: unknown }[];
    };
    return body.events ?? [];
}

/** Tax and invoices → Edit → a new prefix → Save, and wait for the toast. */
async function savePrefixInUi(page: Page, prefix: string) {
    await page.goto("/settings/organization");
    await page.getByRole("tab", { name: "Tax and invoices" }).click();
    await page.getByRole("button", { name: "Edit tax and invoices" }).click();
    const card = page.getByRole("region", { name: "Tax and invoices" });
    await card.getByLabel("Invoice prefix").fill(prefix);
    await card.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/^Tax and invoices saved/)).toBeVisible({
        timeout: 30_000,
    });
}
