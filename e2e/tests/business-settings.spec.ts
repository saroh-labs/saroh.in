// @covers accounts:/login app:/open app:/settings/organization app:/settings/activity api:organizations api:audit
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Business settings, Tax and invoices: registering for GST (e890237c).
 *
 * A registration needs a GSTIN and a registered address, rules that span
 * fields. The form used to re-check only the field that changed, so a
 * refusal could stand after everything was filled in. This walks it in the
 * GST row's sheet (the tab is read first, owner 10 Oct): GST on, a GSTIN
 * too short (Save refuses it, the sheet stays open), then the GSTIN right
 * and the address still missing (refused on the address), then both in
 * full, and Save closes the sheet.
 *
 * It runs on Northwind Supply, the base seed — Rye & Co. and Pulse Fitness
 * are kept camera-ready. It clears Northwind's address first, so the
 * address is missing when GST goes on, and puts Northwind back as the seed
 * leaves it: not registered, no tax ID, its address in Karnataka.
 */

const ORG = "seed_org";
// The API refuses a write with no Origin (#50).
const headers = { "x-organization-id": ORG, origin: urls.APP_URL };
const settingsUrl = `${urls.API_URL}/organizations/${ORG}/settings`;

async function signIn(page: Page) {
    await useSession(page);
}

/**
 * A row's Edit, pressed until its sheet opens: a press before hydration
 * does nothing. The sheet draws at page level, outside the tab's region.
 */
async function openSheet(page: Page, edit: string, name: string) {
    const sheet = page.getByRole("dialog", { name });
    await expect(async () => {
        if (!(await sheet.isVisible())) {
            await page.getByRole("button", { name: edit }).click();
        }
        await expect(sheet).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    return sheet;
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

/**
 * Northwind's registered address as the seed writes it
 * (`NORTHWIND_ADDRESS`, packages/database/src/seed/data.ts), state 29.
 */
const SEEDED_ADDRESS = {
    line1: "Plot 12, Peenya Industrial Area",
    city: "Bengaluru",
    postalCode: "560058",
};

/** Northwind unregistered, with its address as given ("" clears it). */
async function setNorthwind(
    request: APIRequestContext,
    address: { line1: string; city: string; postalCode: string },
    state: string,
) {
    const res = await request.patch(`${urls.API_URL}/organizations/${ORG}`, {
        headers,
        data: {
            tax: { registered: false, state },
            profile: { taxId: "", country: "" },
            registeredAddress: { ...address, line2: "" },
        },
    });
    expect(res.ok()).toBe(true);
}

/** Northwind as the seed leaves it: not registered, its address on file. */
async function putBack(request: APIRequestContext) {
    await setNorthwind(request, SEEDED_ADDRESS, "29");
}

// @serial: GST registration and the invoice prefix are Northwind's own,
// read by every order and invoice test running beside it.
test.describe("business settings", { tag: "@serial" }, () => {
    test("registering for GST: Save goes through once the GSTIN and address are filled", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await signIn(page);
        await page.goto(`/open/${ORG}`);

        const before = await readTax(page.request);
        expect(before.tax?.registered).toBe(false);

        try {
            // No address on file, so GST brings its fields into the sheet.
            await setNorthwind(
                page.request,
                { line1: "", city: "", postalCode: "" },
                "",
            );
            await page.goto("/settings/organization?section=tax");
            const card = page.getByRole("region", {
                name: "Tax and invoices",
            });
            // Read first: the row says what is saved, with nothing to type in.
            await expect(card.locator("#business-gst")).toContainText(
                "Not registered",
            );
            await expect(card.getByRole("textbox")).toHaveCount(0);

            const sheet = await openSheet(
                page,
                "Change GST registration",
                "GST registration",
            );
            const save = sheet.getByRole("button", { name: "Save" });

            // GST on: the GSTIN and the registered address come into the
            // sheet, so one Save covers both.
            await sheet.getByRole("switch", { name: "GST-registered" }).click();
            const gstin = sheet.getByLabel("GSTIN", { exact: true });
            await expect(gstin).toBeVisible();
            await expect(sheet.getByLabel("Address line 1")).toBeVisible();
            await expect(sheet.getByLabel("City")).toBeVisible();
            await expect(sheet.getByLabel("PIN code")).toBeVisible();

            // A GSTIN too short: Save refuses it, and the sheet stays open.
            await gstin.fill("06ABCDE");
            await save.click();
            await expect(gstin).toHaveAttribute("aria-invalid", "true");
            await expect(sheet.getByText(/^7 of 15 characters/)).toBeVisible();

            // The GSTIN right, the address still missing: a refusal that
            // spans fields, on the address, and nothing is saved.
            await gstin.fill("06ABCDE1234N1ZN");
            await expect(gstin).not.toHaveAttribute("aria-invalid", "true");
            await save.click();
            await expect(sheet.getByLabel("Address line 1")).toHaveAttribute(
                "aria-invalid",
                "true",
            );
            await expect(sheet).toBeVisible();
            expect((await readTax(page.request)).tax?.registered).toBe(false);

            // Everything a registration needs: Save goes through.
            await sheet.getByLabel("Address line 1").fill("Plot 14, Sector 44");
            await sheet.getByLabel("City").fill("Gurugram");
            await sheet.getByLabel("PIN code").fill("122001");
            await save.click();

            // Saved: the sheet closes, the row reads it, and the API has it.
            await expect(sheet).toBeHidden({ timeout: 30_000 });
            await expect(card.locator("#business-gst")).toContainText(
                "Registered",
            );
            await expect(card.locator("#business-tax-id")).toContainText(
                "06ABCDE1234N1ZN",
            );
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
        expect(restored.tax?.state).toBe("29");
        expect(restored.profile?.taxId ?? "").toBe("");
        expect(restored.registeredAddress).toMatchObject(SEEDED_ADDRESS);
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

// @serial: what Northwind is set up as changes the words every screen of
// it reads, Home's first run and the settings tab among them.
test.describe(
    "what you're setting up (DEC-070, K5)",
    { tag: "@serial" },
    () => {
        test("change to Just me: the tab reads Your details, Activity records it, and back", async ({
            page,
        }) => {
            test.setTimeout(120_000);
            await signIn(page);
            await page.goto(`/open/${ORG}`);
            expect(await readKind(page.request)).toBe("BUSINESS");
            const since = new Date().toISOString();
            // The settings tabs are a column on the desk and a row on a phone.
            const tab = (name: string) =>
                page
                    .getByRole("navigation", { name: "Settings" })
                    .getByRole("link", { name: new RegExp(`^${name}`) })
                    .filter({ visible: true });

            try {
                await page.goto("/settings/organization");
                await expect(tab("Business")).toBeVisible();
                await saveKindInUi(page, "Just me");

                // The tab, the page's heading and the card speak as "you".
                await expect(tab("Your details")).toBeVisible({
                    timeout: 30_000,
                });
                await expect(tab("Business")).toHaveCount(0);
                await expect(
                    page.getByRole("heading", { name: "Your details" }),
                ).toBeVisible();
                const card = page.getByRole("region", { name: "Identity" });
                await expect(card).toContainText("Just me");
                await expect(card).toContainText("Your name or brand");
                await expect.poll(() => readKind(page.request)).toBe("SOLO");

                // Activity: an audited change, with before and after.
                await expect
                    .poll(
                        async () =>
                            (await readAudit(page.request)).some(
                                (e) =>
                                    e.createdAt >= since &&
                                    JSON.stringify(e.metadata).includes(
                                        '"SOLO"',
                                    ),
                            ),
                        { timeout: 15_000 },
                    )
                    .toBe(true);
                await page.goto("/settings/activity");
                await expect(
                    page
                        .getByText(/changed what you're setting up to Just me/)
                        .filter({ visible: true })
                        .first(),
                ).toBeVisible({ timeout: 30_000 });

                // And back to A business, the way it was changed.
                await page.goto("/settings/organization");
                await saveKindInUi(page, "A business");
                await expect(tab("Business")).toBeVisible({ timeout: 30_000 });
                await expect
                    .poll(() => readKind(page.request))
                    .toBe("BUSINESS");
            } finally {
                await setKind(page.request, "BUSINESS");
            }
        });
    },
);

async function readKind(request: APIRequestContext): Promise<string> {
    const res = await request.get(settingsUrl, { headers });
    expect(res.ok()).toBe(true);
    return ((await res.json()) as { kind?: string }).kind ?? "BUSINESS";
}

async function setKind(request: APIRequestContext, kind: string) {
    const res = await request.patch(`${urls.API_URL}/organizations/${ORG}`, {
        headers,
        data: { kind },
    });
    expect(res.ok()).toBe(true);
}

/**
 * Identity → "What this is" → Change → one of the three answers → Save,
 * and wait for the toast and for the sheet to slide shut.
 */
async function saveKindInUi(page: Page, answer: string) {
    const sheet = await openSheet(page, "Change what this is", "What this is");
    const choice = sheet.getByRole("radio", {
        name: new RegExp(`^${answer}`),
    });
    await choice.click();
    await expect(choice).toHaveAttribute("aria-checked", "true");
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/^What this is saved/)).toBeVisible({
        timeout: 30_000,
    });
    await expect(sheet).toBeHidden();
}

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

/**
 * Tax and invoices → Invoice numbers → Edit → a new prefix → Save, and
 * wait for the toast and for the sheet to slide shut (Undo is pressed next).
 */
async function savePrefixInUi(page: Page, prefix: string) {
    await page.goto("/settings/organization?section=tax");
    const sheet = await openSheet(
        page,
        "Edit invoice numbers",
        "Invoice numbers",
    );
    await sheet.getByLabel("Invoice prefix").fill(prefix);
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/^Invoice numbers saved/)).toBeVisible({
        timeout: 30_000,
    });
    await expect(sheet).toBeHidden();
}

// Read only: nothing here is saved.
test.describe("business settings tabs", () => {
    test('the address tab is "Registered address" (DEC-069, DEC-073)', async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${ORG}`);
        await page.goto("/settings/organization");
        // The tabs are drawn: before they are, no "Address" tab says nothing.
        await expect(
            page.getByRole("tab", { name: "Registered address" }),
        ).toBeVisible();
        await expect(
            page.getByRole("tab", { name: "Address", exact: true }),
        ).toHaveCount(0);
        // Pressed until it takes: the tabs are drawn by the server, and a
        // press before hydration does nothing — the panel stays on Identity,
        // so there is no "Registered address" region to find (#846).
        const address = page.getByRole("tab", { name: "Registered address" });
        await expect(async () => {
            await address.click();
            await expect(address).toHaveAttribute("aria-selected", "true", {
                timeout: 2_000,
            });
        }).toPass({ timeout: 20_000 });
        await expect(
            page.getByRole("region", { name: "Registered address" }),
        ).toContainText("Printed under your legal name");
    });

    test("a row's Edit opens its sheet, Cancel saves nothing, and a link opens the right one", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${ORG}`);
        const was = await readTax(page.request);
        await page.goto("/settings/organization?section=address");
        const card = page.getByRole("region", { name: "Registered address" });
        const row = card.locator("#business-registered-address");
        await expect(row).toContainText(SEEDED_ADDRESS.line1);
        // Read first: nothing to type in until the row's Edit.
        await expect(card.getByRole("textbox")).toHaveCount(0);

        const sheet = await openSheet(
            page,
            "Edit registered address",
            "Registered address",
        );
        const city = sheet.getByLabel("City");
        await expect(city).toHaveValue(SEEDED_ADDRESS.city);
        await city.fill("Not saved");
        await sheet.getByRole("button", { name: "Cancel" }).click();
        // Sheets slide shut: wait before the next press.
        await expect(sheet).toBeHidden();
        await expect(row).toContainText(SEEDED_ADDRESS.city);
        expect((await readTax(page.request)).registeredAddress).toMatchObject(
            was.registeredAddress ?? {},
        );

        // Opened again, it starts from what is saved; Escape drops it too.
        await page
            .getByRole("button", { name: "Edit registered address" })
            .click();
        await expect(sheet.getByLabel("City")).toHaveValue(SEEDED_ADDRESS.city);
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();

        // A link from a step elsewhere lands on the tab with the sheet open,
        // and closing it leaves the tab's own address.
        await page.goto("/settings/organization?section=identity&edit=logo");
        const logo = page.getByRole("dialog", { name: "Logo" });
        await expect(logo).toBeVisible();
        // The upload is in the sheet: nothing sends her to another page.
        await expect(
            logo.getByRole("button", { name: /^(Upload logo|Replace)$/ }),
        ).toBeVisible();
        await logo.getByRole("button", { name: "Cancel" }).click();
        await expect(logo).toBeHidden();
        await expect(page).toHaveURL(
            /\/settings\/organization\?section=identity$/,
        );
    });
});
