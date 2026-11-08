import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

import { ignoreHTTPSErrors, urls } from "../playwright.config";
import type { OwnBusiness } from "./own-business";
import { makeBusiness } from "./own-business";
import { business, stamp } from "./own-data";
import { useSession } from "./sessions";

/**
 * The Global edition on the seeded stack (DEC-204): a second build of the
 * merchant app and accounts with `NEXT_PUBLIC_EDITION=GLOBAL`, at
 * `urls.GLOBAL_APP_URL` and `urls.GLOBAL_ACCOUNTS_URL`, against the same API.
 * The API takes a business's edition from the business, never from the
 * address it is called on (a bare-port host belongs to no edition, so
 * `assertEditionMatchesAddress` has no say), so a Global business is made
 * through Global's API host once (`makeBusiness`, country US) and every
 * later call reads it as Global.
 */
export const globalStack = Boolean(
    urls.GLOBAL_APP_URL && urls.GLOBAL_ACCOUNTS_URL,
);
export const GLOBAL_SKIP_WHY =
    "Needs the Global app and accounts (E2E_GLOBAL_APP_URL, E2E_GLOBAL_ACCOUNTS_URL): CI's browser shards and pnpm prepush --e2e start them.";

/**
 * A Global business of Asha's own (US, dollars), with the registered
 * address an issued invoice needs (DEC-068): a US one needs its state
 * (U3). She stays signed in.
 */
export async function globalBusiness(
    page: Page,
    testInfo: TestInfo,
    prefix: string,
): Promise<OwnBusiness> {
    const b = await makeBusiness(page, testInfo, prefix, { country: "US" });
    await business(page.request, b.id).patch("", {
        registeredAddress: {
            line1: `${stamp(testInfo)} Main Street`,
            city: "New York",
            region: "NY",
            postalCode: "10001",
        },
    });
    return b;
}

/** An issued $25 invoice to a stamped customer; answers who it bills. */
export async function globalInvoice(
    page: Page,
    b: OwnBusiness,
    testInfo: TestInfo,
): Promise<{ id: string; billedTo: string }> {
    const s = stamp(testInfo);
    const api = business(page.request, b.id);
    const lastName = `Global ${s}`;
    const contact = await api.post<{ id: string }>("/contacts", {
        email: `global-${s}@example.com`.toLowerCase(),
        firstName: "Jo",
        lastName,
    });
    const draft = await api.post<{ id: string }>("/invoices", {
        contactId: contact.id,
        currency: "USD",
        lines: [
            {
                description: `Consultation (${s})`,
                quantity: 1,
                unitPrice: "25",
            },
        ],
    });
    await api.post(`/invoices/${draft.id}/issue`);
    return { id: draft.id, billedTo: `Jo ${lastName}` };
}

/** Open the business on the Global app, as accounts' "Your businesses" does. */
export async function openGlobal(page: Page, b: OwnBusiness): Promise<void> {
    await useSession(page, "founder");
    await page.goto(`${urls.GLOBAL_APP_URL}/open/${b.id}`);
}

/**
 * Roll each release out to this business alone, as Sam would in admin
 * (a business set up here has none), then Asha turns Payments on.
 */
export async function rollOut(
    browser: Browser,
    page: Page,
    b: OwnBusiness,
    testInfo: TestInfo,
    flags: string[],
) {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    try {
        const staff = await context.newPage();
        await useSession(staff, "staff");
        for (const flag of flags) {
            const res = await staff.request.put(
                `${urls.API_URL}/admin/flags/${flag}/organizations/${b.id}`,
                {
                    headers: { origin: urls.APP_URL },
                    data: {
                        enabled: true,
                        reason: "Browser test of a business's own",
                        idempotencyKey: `${flag}-${b.id}-${stamp(testInfo)}`,
                    },
                },
            );
            expect(res.ok(), `roll out ${flag}: ${await res.text()}`).toBe(
                true,
            );
        }
    } finally {
        await context.close();
    }
    const on = await page.request.put(
        `${urls.API_URL}/organizations/${b.id}/modules/PAYMENTS`,
        {
            headers: { origin: urls.APP_URL, "x-organization-id": b.id },
            data: { status: "ENABLED", setup: {} },
        },
    );
    expect(on.ok(), `turn on Payments: ${await on.text()}`).toBe(true);
}

/** Turn a module on for the business, with what its setup asks. */
export async function turnOn(
    page: Page,
    b: OwnBusiness,
    key: string,
    setup: object = {},
) {
    const res = await page.request.put(
        `${urls.API_URL}/organizations/${b.id}/modules/${key}`,
        {
            headers: { origin: urls.APP_URL, "x-organization-id": b.id },
            data: { status: "ENABLED", setup },
        },
    );
    expect(res.ok(), `turn on ${key}: ${await res.text()}`).toBe(true);
}

/**
 * A published product priced 100,000 with a higher struck price (MRP in
 * India, the original price on Global), at the storefront Commerce made:
 * a figure that would show lakh grouping (1,00,000) if anything used it.
 * Answers its id and its address on the shop.
 */
export async function bigProduct(
    page: Page,
    b: OwnBusiness,
    testInfo: TestInfo,
): Promise<{ id: string; name: string; slug: string }> {
    const listed = await page.request.get(`${urls.API_URL}/stores`);
    expect(listed.ok(), await listed.text()).toBe(true);
    const store = (
        (await listed.json()) as {
            id: string;
            organizationId: string;
        }[]
    ).find((x) => x.organizationId === b.id);
    expect(store, "Commerce made the business's storefront").toBeTruthy();
    const api = business(page.request, b.id);
    const name = `Grand piano ${stamp(testInfo)}`;
    const made = await api.post<{ id: string }>(
        `/stores/${store?.id ?? ""}/products`,
        { name, price: "100000", mrp: "150000", status: "PUBLISHED" },
    );
    const read = await api.get<{
        slug?: string;
        product?: { slug: string };
    } | null>(`/stores/${store?.id ?? ""}/products/${made.id}`);
    const slug = read?.slug ?? read?.product?.slug ?? "";
    expect(slug, "the product has an address on the shop").not.toBe("");
    return { id: made.id, name, slug };
}
