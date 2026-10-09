// @covers app:/sites/[siteId]/settings api:domains
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Your own domain on the site's settings (#861): the screen follows the
 * api's hosting state (#859) and stops showing the DNS records once the
 * domain is live.
 *
 * | state             | the merchant sees                                    |
 * | ----------------- | ---------------------------------------------------- |
 * | waiting to verify | both records to copy, Check now                      |
 * | not pointed yet   | the CNAME, "Visitors don't reach your site yet"      |
 * | live              | "Live at ‹domain›", records folded under DNS records |
 * | problem           | the records again, with what is wrong in words       |
 *
 * The first test reads Northwind's seeded domain (northwindsupply.in,
 * PENDING) and presses nothing that saves, so it runs on today's stack.
 *
 * The other three need a stack whose API can verify a domain and report
 * where it stands without DNS or Cloudflare. They run only with
 * `E2E_DOMAIN_HOSTING=fake`, which says the API runs with the test-only
 * `DOMAIN_HOSTING_FAKE=1`: a verifier that passes `.example.com` hostnames
 * and a fake hosting provider that puts a hostname in the state its first
 * label names (`live-…` ACTIVE, `problem-…` FAILED, anything else
 * PENDING). CI's browser stack and `scripts/prepush.sh` set both.
 * Northwind's seeded plan (the paid `pro`) includes custom domains. Each
 * makes its own stamped domain on Northwind's site and removes it again;
 * verifying routes the site to it meanwhile, so they run `@serial`.
 */

const SITE = "seed_site_0";
const SEEDED = "northwindsupply.in";
const HOSTING_FAKE = process.env.E2E_DOMAIN_HOSTING === "fake";

async function openSettings(page: Page) {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    await page.goto(`/sites/${SITE}/settings`);
    await expect(
        page.getByRole("heading", { name: "Your own domain" }),
    ).toBeVisible();
}

function block(page: Page, hostname: string): Locator {
    return page.locator(`[data-domain="${hostname}"]`);
}

/** On the phone project, the pointer really is coarse (browser-tests skill). */
async function phoneChecks(page: Page, testInfo: TestInfo) {
    if (!testInfo.project.name.startsWith("phone")) return;
    expect(
        await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);
    await expectNothingHiddenSideways(page);
}

test("waiting to verify: both records to copy, and Check now", async ({
    page,
}, testInfo) => {
    await openSettings(page);
    const own = block(page, SEEDED);
    await expect(own).toBeVisible();

    await expect(own.getByText("Waiting for DNS")).toBeVisible();
    await expect(own.getByRole("button", { name: "Check now" })).toBeVisible();
    await expect(
        own.locator(`code[title="_saroh-verification.${SEEDED}"]`),
    ).toBeVisible();
    await expect(own.locator('code:text-is("CNAME")')).toBeVisible();
    // Never drawn as live, and nothing folded away.
    await expect(own.getByText(/^Live at/)).toHaveCount(0);
    await expect(own.getByRole("button", { name: "DNS records" })).toHaveCount(
        0,
    );

    await own.scrollIntoViewIfNeeded();
    await phoneChecks(page, testInfo);
});

// @serial: verifying routes Northwind's one site to the new domain until it
// is removed, so every other test reading the site's address would see it.
test.describe(
    "once verified, with hosting (#859's fake)",
    { tag: "@serial" },
    () => {
        test.skip(
            !HOSTING_FAKE,
            "Needs E2E_DOMAIN_HOSTING=fake: an API run with DOMAIN_HOSTING_FAKE=1 (the fake verifier and hosting).",
        );

        /** A stamped domain on Northwind's site, verified through the API. */
        async function verifiedDomain(
            page: Page,
            testInfo: TestInfo,
            kind: "live" | "pending" | "problem",
        ) {
            const hostname = `${kind}-${stamp(testInfo)}.example.com`;
            const api = northwind(page.request);
            const claimed = await api.post<{ domain: { id: string } }>(
                "/domains",
                {
                    hostname,
                    siteId: SITE,
                },
            );
            const id = claimed.domain.id;
            await api.post(`/domains/${id}/verify`);
            return {
                hostname,
                remove: async () => {
                    await api.delete(`/domains/${id}`);
                },
            };
        }

        test("not pointed yet: the CNAME, and visitors don't reach the site yet", async ({
            page,
        }, testInfo) => {
            await useSession(page);
            const d = await verifiedDomain(page, testInfo, "pending");
            try {
                await openSettings(page);
                const own = block(page, d.hostname);
                await expect(
                    own.getByText("Not live yet", { exact: true }),
                ).toBeVisible();
                await expect(
                    own.getByText("Visitors don't reach your site yet.", {
                        exact: false,
                    }),
                ).toBeVisible();
                await expect(
                    own.locator('code:text-is("CNAME")'),
                ).toBeVisible();
                await expect(
                    own.locator(`code[title^="_saroh-verification."]`),
                ).toHaveCount(0);
                await expect(
                    own.getByRole("button", { name: "Check again" }),
                ).toBeVisible();
                await own.scrollIntoViewIfNeeded();
                await phoneChecks(page, testInfo);
            } finally {
                await d.remove();
            }
        });

        test("live: Live at the domain, with the records folded under DNS records", async ({
            page,
        }, testInfo) => {
            await useSession(page);
            const d = await verifiedDomain(page, testInfo, "live");
            try {
                await openSettings(page);
                const own = block(page, d.hostname);
                await expect(
                    own.getByText("Live", { exact: true }),
                ).toBeVisible();
                const link = own.getByRole("link", { name: d.hostname });
                await expect(link).toHaveAttribute(
                    "href",
                    `https://${d.hostname}`,
                );

                const toggle = own.getByRole("button", { name: "DNS records" });
                await expect(toggle).toHaveAttribute("aria-expanded", "false");
                await expect(own.locator('code:text-is("CNAME")')).toBeHidden();
                await expect(
                    own.getByRole("button", { name: /^Check/ }),
                ).toHaveCount(0);

                await toggle.click();
                await expect(toggle).toHaveAttribute("aria-expanded", "true");
                await expect(
                    own.locator('code:text-is("CNAME")'),
                ).toBeVisible();
                await expect(
                    own.locator(`code[title^="_saroh-verification."]`),
                ).toBeVisible();
                await own.scrollIntoViewIfNeeded();
                await phoneChecks(page, testInfo);
            } finally {
                await d.remove();
            }
        });

        test("problem: the records again, with what is wrong in words", async ({
            page,
        }, testInfo) => {
            await useSession(page);
            const d = await verifiedDomain(page, testInfo, "problem");
            try {
                await openSettings(page);
                const own = block(page, d.hostname);
                await expect(own.getByText("Needs attention")).toBeVisible();
                // The api's words (#859's HOSTING_WORDS), whichever it chose.
                await expect(
                    own.getByText(/couldn't|blocked|didn't accept/),
                ).toBeVisible();
                await expect(
                    own.locator('code:text-is("CNAME")'),
                ).toBeVisible();
                await expect(
                    own.locator(`code[title^="_saroh-verification."]`),
                ).toBeVisible();
                await expect(own.getByText(/^Live at/)).toHaveCount(0);
                await own.scrollIntoViewIfNeeded();
                await phoneChecks(page, testInfo);
            } finally {
                await d.remove();
            }
        });
    },
);
