import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

import { urls } from "../playwright.config";
import { stamp } from "./own-data";
import { useSession } from "./sessions";

/**
 * A business a test sets up for itself, through onboarding's own endpoint
 * (`POST /organizations`), as Asha (`founder`), who is seeded with none.
 *
 * For a test that changes something every other spec reads about a
 * business — its web address above all: Northwind's is read by every site,
 * pay and share spec, and the film sets are never written to. The business
 * is Asha's alone, so it runs beside everything else.
 *
 * Its address is stamped, so desk, phone and every run get their own. It
 * keeps time in Kolkata, so a date the screen names is a day there.
 */
export interface OwnBusiness {
    id: string;
    /** The web address it was set up with, without `.saroh.app`. */
    address: string;
    name: string;
}

/** A stamped address: lowercase, single hyphens, well under 57. */
export function ownAddress(prefix: string, testInfo: TestInfo): string {
    return `${prefix}-${stamp(testInfo)}`.toLowerCase().replace(/-{2,}/g, "-");
}

/**
 * Who Saroh bills for a business set up through the API (DEC-167, R7): an
 * owner with a billing profile must choose one, so this is the first of
 * the signed-in person's, or nothing for someone with none (their first
 * is made from the business).
 */
export async function billingChoice(
    page: Page,
): Promise<{ billingProfileId: string } | Record<string, never>> {
    const res = await page.request.get(`${urls.API_URL}/billing-profiles`);
    expect(res.ok(), `billing profiles: ${await res.text()}`).toBe(true);
    const first = ((await res.json()) as { id: string }[]).at(0);
    return first ? { billingProfileId: first.id } : {};
}

export async function makeBusiness(
    page: Page,
    testInfo: TestInfo,
    prefix = "own",
): Promise<OwnBusiness> {
    await useSession(page, "founder");
    const address = ownAddress(prefix, testInfo);
    const name = `Own ${address}`;
    const res = await page.request.post(`${urls.API_URL}/organizations`, {
        headers: { origin: urls.APP_URL },
        data: {
            name,
            kind: "BUSINESS",
            address,
            profile: { country: "IN", timezone: "Asia/Kolkata" },
            ...(await billingChoice(page)),
        },
    });
    expect(res.ok(), `set up ${name}: ${await res.text()}`).toBe(true);
    const made = (await res.json()) as { id: string; slug: string };
    expect(made.slug).toBe(address);
    return { id: made.id, address, name };
}
