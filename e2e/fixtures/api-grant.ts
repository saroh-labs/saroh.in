import type { Browser, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";
import { stamp } from "./own-data";
import { useSession } from "./sessions";

/** The catalogue rows a business needs to make API keys (`api-keys.service.ts`). */
const ROWS = ["api-storefront", "api-secret", "api-keys"];

/**
 * Give Northwind the public API's rows, as staff do on its admin page (a
 * module override, kind `grant`, per row), and give back how to end them.
 * Keys are paid-plan only and the sample catalogue's plans leave the rows
 * off, so a spec that makes keys grants them here. A granted `api-keys`
 * row has no cap. A grant replaces the row's live one, so a spec using
 * this is `@serial`, and calls `restore()` in a `finally`.
 */
export async function grantNorthwindApi(
    browser: Browser,
    testInfo: TestInfo,
): Promise<{ restore: () => Promise<void> }> {
    const key = (what: string) => `api-${what}-${stamp(testInfo)}`;
    const reason = "Browser test: the public API on a plan with it";
    const context = await browser.newContext({ ignoreHTTPSErrors });
    const page = await context.newPage();
    await useSession(page, "staff");
    const headers = { origin: urls.APP_URL };
    const overrides = `${urls.API_URL}/admin/organizations/${NORTHWIND_ORG}/overrides`;
    const ids: string[] = [];
    const restore = async () => {
        for (const id of ids) {
            const ended = await page.request.delete(`${overrides}/${id}`, {
                headers,
                data: { reason, idempotencyKey: key(`end-${id}`) },
            });
            expect(ended.ok(), await ended.text()).toBe(true);
        }
        await context.close();
    };
    try {
        for (const moduleKey of ROWS) {
            const granted = await page.request.post(`${overrides}/modules`, {
                headers,
                data: {
                    kind: "grant",
                    moduleKey,
                    reason,
                    idempotencyKey: key(`grant-${moduleKey}`),
                },
            });
            expect(granted.ok(), await granted.text()).toBe(true);
            ids.push(((await granted.json()) as { id: string }).id);
        }
    } catch (e) {
        await restore();
        throw e;
    }
    return { restore };
}
