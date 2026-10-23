import type { APIResponse, Browser, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";
import { northwind, stamp } from "./own-data";
import { useSession } from "./sessions";

/**
 * One look on Northwind's website, set and put back (DEC-172, plan U2).
 *
 * Every per-look browser spec goes through this one helper, so they all
 * set a look the same way and none leaves Northwind changed:
 *
 * 1. Sam (`people.staff`) turns `SITE_LOOKS` on for Northwind alone, as
 *    admin → Flags does (a per-business override, `overrideNorthwindFlag`).
 *    The global flag and every other business are left alone.
 * 2. The demo owner saves Northwind's style with the look, to the draft.
 *    The spec publishes when it needs the live site to wear it.
 * 3. `restore()` saves the style Northwind had back (and publishes again
 *    if the spec published), and puts the override back as it was, or
 *    clears it if there was none.
 *
 * Quiet, Folio and Live are paid since 21 Oct (DEC-177: Classic is the
 * only free look), and Northwind's plan has no `themes` row. The save
 * still goes because the e2e seed leaves `PLAN_ENFORCEMENT` off for
 * Northwind, so no plan row is asked. A spec that turns it on and wants a
 * look saved grants the row with `grantNorthwindThemes`.
 *
 * A spec that uses it changes Northwind's site style, so it is tagged
 * `@serial` (the saroh-browser-tests skill), and calls `restore()` in a
 * `finally` or an `afterEach`.
 */

type LookId = "folio" | "quiet" | "live";

interface SiteRow {
    id: string;
}

interface SiteView {
    id: string;
    style: Record<string, unknown>;
}

interface FlagExplanation {
    value: boolean;
    source: string;
}

export interface NorthwindLook {
    /** The site the look was set on: Northwind's first. */
    siteId: string;
    /** The demo owner's Northwind API, for a spec that edits the draft too. */
    owner: ReturnType<typeof northwind>;
    /** Publish the draft, so the live site wears the look. */
    publish: () => Promise<void>;
    /**
     * Save Northwind's style as it was with `look` instead (null: Classic),
     * answering what the API answered: a spec checks a refusal with it.
     */
    saveLook: (look: LookId | null) => Promise<APIResponse>;
    /** Turn Northwind's `SITE_LOOKS` override on or off, mid-spec. */
    flag: (enabled: boolean) => Promise<void>;
    /** Put Northwind's style and its `SITE_LOOKS` override back. */
    restore: () => Promise<void>;
}

const FLAG = "SITE_LOOKS";

/**
 * Turn `SITE_LOOKS` on for Northwind and give its website `look` (or
 * Classic, for null), in the draft. See the module comment.
 */
export async function setNorthwindLook(
    browser: Browser,
    look: LookId | null,
    testInfo: TestInfo,
): Promise<NorthwindLook> {
    // Sam's side: the flag, through the one override helper (review #45).
    const flagged = await overrideNorthwindFlag(browser, FLAG, testInfo);

    // The owner's side.
    const ownerContext = await browser.newContext({
        baseURL: urls.APP_URL,
        ignoreHTTPSErrors,
    });
    const ownerPage = await ownerContext.newPage();
    await useSession(ownerPage, "owner");
    const nw = northwind(ownerPage.request);
    const site = (await nw.get<SiteRow[]>("/sites")).at(0);
    if (!site) throw new Error("Northwind has no website to set a look on");
    const { style } = await nw.get<SiteView>(`/sites/${site.id}`);
    const { look: _was, ...rest } = style;
    const saveLook = (next: LookId | null) =>
        ownerPage.request.put(
            `${urls.API_URL}/organizations/${NORTHWIND_ORG}/sites/${site.id}/style`,
            {
                headers: nw.headers,
                data: { ...rest, ...(next ? { look: next } : {}) },
            },
        );
    const saved = await saveLook(look);
    expect(saved.ok(), await saved.text()).toBe(true);

    let published = false;
    return {
        siteId: site.id,
        owner: nw,
        saveLook,
        flag: flagged.set,
        publish: async () => {
            await nw.post(`/sites/${site.id}/publish`, { override: true });
            published = true;
        },
        restore: async () => {
            await nw.put(`/sites/${site.id}/style`, style);
            if (published) {
                await nw.post(`/sites/${site.id}/publish`, { override: true });
            }
            await flagged.restore();
            await ownerContext.close();
        },
    };
}

/**
 * Turn one rollout flag on for Northwind alone, as Sam does in admin →
 * Flags (a per-business override), and give back how to put it as it was.
 * The shop's per-look spec turns `SITE_SHOP` on with it (plan U11), rather
 * than skipping where the stack wasn't prepared like `site-shop.spec.ts`.
 */
export async function overrideNorthwindFlag(
    browser: Browser,
    flagName: string,
    testInfo: TestInfo,
): Promise<{
    /** Turn the override on or off again, mid-spec. */
    set: (enabled: boolean) => Promise<void>;
    restore: () => Promise<void>;
}> {
    const key = (what: string) => `flag-${flagName}-${what}-${stamp(testInfo)}`;
    const reason = `Browser test: ${flagName} on Northwind`;
    const context = await browser.newContext({
        baseURL: urls.APP_URL,
        ignoreHTTPSErrors,
    });
    const page = await context.newPage();
    await useSession(page, "staff");
    const admin = page.request;
    const headers = { origin: urls.APP_URL };
    const flagUrl = `${urls.API_URL}/admin/flags/${flagName}`;
    const overrideUrl = `${flagUrl}/organizations/${NORTHWIND_ORG}`;

    const explained = await admin.get(
        `${flagUrl}/explain?organizationId=${NORTHWIND_ORG}`,
        { headers },
    );
    expect(explained.ok(), await explained.text()).toBe(true);
    const before = (await explained.json()) as FlagExplanation;
    let flips = 0;
    const set = async (enabled: boolean) => {
        const res = await admin.put(overrideUrl, {
            headers,
            data: { enabled, reason, idempotencyKey: key(`set${++flips}`) },
        });
        expect(res.ok(), await res.text()).toBe(true);
    };
    await set(true);

    return {
        set,
        restore: async () => {
            const back =
                before.source === "OVERRIDE"
                    ? await admin.put(overrideUrl, {
                          headers,
                          data: {
                              enabled: before.value,
                              reason,
                              idempotencyKey: key("back"),
                          },
                      })
                    : await admin.delete(overrideUrl, {
                          headers,
                          data: { reason, idempotencyKey: key("clear") },
                      });
            expect(back.ok(), await back.text()).toBe(true);
            await context.close();
        },
    };
}

/**
 * Give Northwind the plan's "Themes, fonts and templates" row (`themes`)
 * alone, as staff do on its admin page (a module override, kind `grant`),
 * and give back how to end it. Since 21 Oct Classic is the only free look
 * (DEC-177), so a spec that checks a paid look saving on a plan with the
 * row, under `PLAN_ENFORCEMENT`, grants it here rather than making looks
 * free in the seed. The seed's Northwind has no `themes` override of its
 * own; a grant replaces one if it had (one per row), and `restore()` ends
 * this grant only.
 *
 * Without `PLAN_ENFORCEMENT` (the e2e seed leaves it off for Northwind)
 * no plan row is asked, so `setNorthwindLook` saves any look without this.
 */
export async function grantNorthwindThemes(
    browser: Browser,
    testInfo: TestInfo,
): Promise<{ restore: () => Promise<void> }> {
    const key = (what: string) => `themes-${what}-${stamp(testInfo)}`;
    const reason = "Browser test: a paid look on a plan with themes";
    const context = await browser.newContext({
        baseURL: urls.APP_URL,
        ignoreHTTPSErrors,
    });
    const page = await context.newPage();
    await useSession(page, "staff");
    const headers = { origin: urls.APP_URL };
    const overrides = `${urls.API_URL}/admin/organizations/${NORTHWIND_ORG}/overrides`;
    const granted = await page.request.post(`${overrides}/modules`, {
        headers,
        data: {
            kind: "grant",
            moduleKey: "themes",
            reason,
            idempotencyKey: key("grant"),
        },
    });
    expect(granted.ok(), await granted.text()).toBe(true);
    const { id } = (await granted.json()) as { id: string };
    return {
        restore: async () => {
            const ended = await page.request.delete(`${overrides}/${id}`, {
                headers,
                data: { reason, idempotencyKey: key("end") },
            });
            expect(ended.ok(), await ended.text()).toBe(true);
            await context.close();
        },
    };
}
