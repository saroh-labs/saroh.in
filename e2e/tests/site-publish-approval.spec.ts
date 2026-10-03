// @covers app:/sites/[siteId]/settings app:/sites api:sites
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * "Publishing needs approval" on the site's settings (DEC-071, T13).
 *
 * The owner turns it on with the switch, it holds across a reload, and
 * from then on the API refuses a direct publish (409 `APPROVAL_REQUIRED`)
 * — the refusal the editor's Publish tells the merchant about. Then the
 * owner turns it off again, and it's turned off whatever happens, so the
 * site is left as it was found.
 *
 * `@serial`: it changes how Northwind's one site (ADR-006) publishes, which
 * every spec that publishes it would read. On Northwind, where the seed has
 * test releases on. The refused publish writes nothing.
 */

/** Northwind's one site. */
async function northwindSite(request: APIRequestContext): Promise<string> {
    const sites =
        await northwind(request).get<
            { id: string; subdomain: string | null }[]
        >("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    return site?.id ?? "";
}

/** The setting, as the API reads it. */
async function isOn(request: APIRequestContext, siteId: string) {
    const site = await northwind(request).get<{
        publishNeedsApproval?: boolean;
    }>(`/sites/${siteId}`);
    return site.publishNeedsApproval === true;
}

/** Set it through the API, as the owner. */
function setOn(request: APIRequestContext, siteId: string, on: boolean) {
    return northwind(request).patch(`/sites/${siteId}/settings`, {
        publishNeedsApproval: on,
    });
}

/** The owner's switch, drawn once on every width. */
const approvalSwitch = (page: Page) =>
    page
        .getByRole("switch", { name: "Publishing needs approval" })
        .filter({ visible: true });

test(
    "the owner turns publishing approval on and off",
    { tag: "@serial" },
    async ({ page }) => {
        await useSession(page);
        await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
        const siteId = await northwindSite(page.request);
        // Off to begin with, whatever an earlier run left behind.
        await setOn(page.request, siteId, false);

        try {
            await page.goto(`${urls.APP_URL}/sites/${siteId}/settings`);
            const toggle = approvalSwitch(page);
            await expect(toggle).toHaveCount(1);
            await expect(toggle).toHaveAttribute("aria-checked", "false");
            await expect(
                page
                    .getByText(
                        "Only an approved test release can go live. You can still go live without approval; it's recorded.",
                    )
                    .filter({ visible: true }),
            ).toHaveCount(1);

            await toggle.click();
            await expect(
                page.getByText("Publishing now needs approval."),
            ).toBeVisible();
            await expect.poll(() => isOn(page.request, siteId)).toBe(true);

            // It holds across a reload: it isn't draft state.
            await page.reload();
            await expect(approvalSwitch(page)).toHaveAttribute(
                "aria-checked",
                "true",
            );

            // The editor's Publish says so before it is pressed (T11): it
            // reads "Needs approval". On a phone it sits in the "Status,
            // view and publish" menu.
            await page.goto(`${urls.APP_URL}/sites/${siteId}`);
            const publish = page
                .getByRole("button", { name: /^Needs approval/ })
                .filter({ visible: true });
            await expect(async () => {
                if (
                    (page.viewportSize()?.width ?? 1440) < 760 &&
                    !(await publish.first().isVisible())
                ) {
                    await page
                        .getByRole("button", {
                            name: "Status, view and publish",
                        })
                        .click();
                }
                await expect(publish).toHaveCount(1, { timeout: 2_000 });
            }).toPass({ timeout: 30_000 });
            await expect(
                page.getByRole("button", { name: /^Publish( \d+)?$/ }).filter({
                    visible: true,
                }),
            ).toHaveCount(0);
            await page.goto(`${urls.APP_URL}/sites/${siteId}/settings`);

            // A direct publish is now refused, and nothing is written.
            const refused = await page.request.post(
                `${urls.API_URL}/organizations/${NORTHWIND_ORG}/sites/${siteId}/publish`,
                { headers: northwind(page.request).headers, data: {} },
            );
            expect(refused.status()).toBe(409);
            expect(await refused.text()).toContain("APPROVAL_REQUIRED");

            await approvalSwitch(page).click();
            await expect(
                page.getByText("Publishing no longer needs approval."),
            ).toBeVisible();
            await expect.poll(() => isOn(page.request, siteId)).toBe(false);
            await expect(approvalSwitch(page)).toHaveAttribute(
                "aria-checked",
                "false",
            );
        } finally {
            await setOn(page.request, siteId, false);
        }
    },
);
