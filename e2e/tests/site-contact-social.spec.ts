// @covers app:/sites/[siteId]/settings site:/ api:organizations api:sites pkg:site-blocks
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, phone } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * A business's contact details and social links, from Website settings to
 * the foot of its site (DEC-128).
 *
 * The owner adds an Instagram link and a phone in Website › Settings ›
 * Contact and social, each in its own sheet, without leaving that screen.
 * A visitor's page then shows them in the footer: the phone as a `tel:`
 * link, Instagram as a named icon that opens instagram.com in a new tab.
 * No publish is needed: they are read live, as the phone always was. A
 * link to another site is refused in the sheet, which stays open. Cleared,
 * they are gone from the footer.
 *
 * `@serial`: the phone and the links are Northwind's own, shown on its one
 * site (ADR-006) and read by every test that opens it. Both are put back
 * in `finally` as they were found.
 */
const renderer = new URL(urls.RENDERER_URL);
const LIVE = `${renderer.protocol}//northwind.${renderer.host}`;

interface Settings {
    profile: { phone?: string | null } | null;
    socialLinks?: Partial<Record<string, string>>;
}

interface NorthwindSite {
    id: string;
    subdomain: string | null;
}

async function northwindSite(request: APIRequestContext): Promise<string> {
    const sites = await northwind(request).get<NorthwindSite[]>("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    return site?.id ?? "";
}

/** An Instagram name no other run shares: letters and digits only. */
const handle = () => `northwind${Math.random().toString(36).slice(2, 10)}`;

/** The visitor's footer, read afresh: the site keeps nothing between loads here. */
async function footerOf(site: Page) {
    await site.goto(`${LIVE}/`);
    return site.getByRole("contentinfo");
}

test.describe(
    "contact details and social links on a site (DEC-128)",
    { tag: "@serial" },
    () => {
        test("set in Website settings, shown in the footer at once, and gone when cleared", async ({
            page,
            browser,
        }) => {
            test.setTimeout(120_000);
            await useSession(page);
            const nw = northwind(page.request);
            const siteId = await northwindSite(page.request);
            // As they are found, to put back.
            const before = await nw.get<Settings>("/settings");
            const instagramBefore = before.socialLinks?.instagram ?? null;
            const phoneBefore = before.profile?.phone ?? null;
            // The site is live, or there is no footer to read.
            const { currentPublication } = await nw.get<{
                currentPublication: unknown;
            }>(`/sites/${siteId}`);
            if (!currentPublication) await nw.post(`/sites/${siteId}/publish`);

            const name = handle();
            const number = phone();
            const e164 = number.replace(/\s/g, "");
            const profile = `https://www.instagram.com/${name}`;

            const visitor = await browser.newContext({
                ignoreHTTPSErrors: true,
            });
            const site = await visitor.newPage();
            try {
                await page.goto(`/open/${NORTHWIND_ORG}`);
                await page.goto(`/sites/${siteId}/settings?section=contact`);

                // Social links: the business's own sheet, opened here.
                const socialRow = page.locator("#settings-contact-social");
                await expect(socialRow).toContainText("Social links");
                await socialRow
                    .getByRole("button", { name: /social links$/ })
                    .click();
                const social = page.getByRole("dialog", {
                    name: "Social links",
                });
                await expect(social).toBeVisible();
                await expect(page).toHaveURL(/\/sites\/[^/]+\/settings/);

                // Another site's address is refused, and the sheet stays.
                const facebook = social.getByLabel("Facebook");
                const facebookBefore = await facebook.inputValue();
                await facebook.fill("https://evil.example/northwind");
                await social.getByRole("button", { name: "Save" }).click();
                await expect(social).toBeVisible();
                await expect(social).toContainText(
                    "That isn't a Facebook link.",
                );
                await facebook.fill(facebookBefore);

                // A handle says where it will open before it is saved.
                await social.getByLabel("Instagram").fill(`@${name}`);
                await expect(social).toContainText(
                    `Opens instagram.com/${name}`,
                );
                await social.getByRole("button", { name: "Save" }).click();
                await expect(social).toBeHidden();
                await expect(socialRow).toContainText("Instagram");

                // The phone: its own sheet, here too.
                const phoneRow = page.locator("#settings-contact-phone");
                await phoneRow.getByRole("button", { name: /phone$/ }).click();
                const phoneSheet = page.getByRole("dialog", {
                    name: "Phone on your website",
                });
                await expect(phoneSheet).toBeVisible();
                await phoneSheet
                    .getByLabel("Phone on your website")
                    .fill(number);
                await phoneSheet.getByRole("button", { name: "Save" }).click();
                await expect(phoneSheet).toBeHidden();
                await expect(phoneRow).toContainText(number);

                // The API kept one address on Instagram's own host.
                await expect
                    .poll(
                        async () =>
                            (await nw.get<Settings>("/settings")).socialLinks
                                ?.instagram,
                    )
                    .toBe(profile);

                // The visitor's footer, with no publish in between.
                await expect(async () => {
                    const footer = await footerOf(site);
                    const instagram = footer.getByRole("link", {
                        name: "Instagram",
                    });
                    await expect(instagram).toHaveAttribute("href", profile);
                    await expect(instagram).toHaveAttribute("target", "_blank");
                    await expect(instagram).toHaveAttribute(
                        "rel",
                        "noopener noreferrer me",
                    );
                    await expect(
                        footer.getByRole("link", { name: `Call ${number}` }),
                    ).toHaveAttribute("href", `tel:${e164}`);
                }).toPass({ timeout: 30_000 });

                // And the home page names both to search engines.
                await expect
                    .poll(async () =>
                        (
                            await site
                                .locator('script[type="application/ld+json"]')
                                .allTextContents()
                        ).join("\n"),
                    )
                    .toContain(profile);

                // Cleared: the link in its sheet, the phone in its own.
                await page.reload();
                await socialRow
                    .getByRole("button", { name: "Edit social links" })
                    .click();
                await expect(social).toBeVisible();
                await social.getByLabel("Instagram").fill("");
                await social.getByRole("button", { name: "Save" }).click();
                await expect(social).toBeHidden();
                await expect(socialRow).not.toContainText("Instagram");

                await phoneRow
                    .getByRole("button", { name: "Edit phone" })
                    .click();
                await expect(phoneSheet).toBeVisible();
                await phoneSheet.getByLabel("Phone on your website").fill("");
                await phoneSheet.getByRole("button", { name: "Save" }).click();
                await expect(phoneSheet).toBeHidden();
                await expect(phoneRow).toContainText(
                    "None. Your website shows no Call link.",
                );

                await expect(async () => {
                    const footer = await footerOf(site);
                    await expect(footer).toBeVisible();
                    await expect(
                        footer.getByRole("link", { name: "Instagram" }),
                    ).toHaveCount(0);
                    await expect(
                        footer.getByRole("link", { name: /^Call / }),
                    ).toHaveCount(0);
                }).toPass({ timeout: 30_000 });
            } finally {
                await visitor.close();
                // As they were found.
                await nw.patch("", {
                    socialLinks: { instagram: instagramBefore ?? "" },
                    profile: { phone: phoneBefore ?? "" },
                });
            }
        });
    },
);
