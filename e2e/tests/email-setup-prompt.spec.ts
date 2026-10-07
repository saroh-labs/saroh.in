// @covers app:/open app:/ app:/settings/providers api:communications api:home api:organizations api:capabilities api:billing
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { OwnBusiness } from "../fixtures/own-business";
import { makeBusiness } from "../fixtures/own-business";
import { urls } from "../playwright.config";

/**
 * The prompt to connect the business's own email (#850, DEC-011 amended
 * 2026-10-07): with none, its customers get no emails and see their
 * updates only in their account. Its owner sees that on Home's Needs you
 * and on Settings › Providers, with Connect — or, on a plan that can't
 * connect one (DEC-091), See plans — and it goes once a provider is
 * connected.
 *
 * Owns its data: a business the test sets up for itself (`makeBusiness`,
 * as Asha, its owner), with Communications turned on, so it runs beside
 * everything else on desk and phone. Which of the two prompts it gets is
 * the API's answer for that business's plan, read first.
 *
 * Who sees it (comms:manage, billing:read) and its words are covered by
 * `lib/communications/email-setup.test.ts` and the API's
 * `email-setup.spec.ts` / `home.email-setup.spec.ts`.
 */

const TITLE = "Your customers get no emails from you";
const MISSED =
    "No email provider is connected, so invoices, booking and order updates and review invitations aren't emailed. Your customers see their updates only in their account.";
const PLAN = "Connecting your own email comes with a paid plan.";

const api = (b: OwnBusiness, path: string) =>
    `${urls.API_URL}/organizations/${b.id}${path}`;

const headers = (b: OwnBusiness) => ({
    origin: urls.APP_URL,
    "x-organization-id": b.id,
});

async function emailSetup(page: Page, b: OwnBusiness) {
    const res = await page.request.get(api(b, "/comms-providers/email-setup"), {
        headers: headers(b),
    });
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()) as {
        connected: boolean;
        canConnect: boolean | null;
    };
}

/** Never sideways, at the width the project set. */
async function noSideways(page: Page) {
    const width = page.viewportSize()?.width ?? 0;
    // A phone widens innerWidth to fit content that overflows.
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
}

test("with no email provider, the owner is asked to connect one on Home and Providers, until it is", async ({
    page,
}, testInfo) => {
    const b = await makeBusiness(page, testInfo, "mail");
    const on = await page.request.put(api(b, "/modules/COMMUNICATIONS"), {
        headers: headers(b),
        data: { status: "ENABLED" },
    });
    expect(on.ok(), await on.text()).toBe(true);

    const setup = await emailSetup(page, b);
    expect(setup.connected).toBe(false);
    const plans = setup.canConnect === false;

    // Home: one row in Needs you, saying what the customers miss.
    await page.goto(`/open/${b.id}`);
    await page.goto("/");
    const needs = page.getByRole("region", { name: "Needs you" });
    await expect(needs).toBeVisible();
    const row = needs.getByRole("link", { name: new RegExp(TITLE) });
    await expect(row).toBeVisible();
    await expect(row).toContainText(plans ? `${MISSED} ${PLAN}` : MISSED);
    await expect(row).toHaveAttribute(
        "href",
        plans ? "/settings/billing#change-plan" : "/settings/providers",
    );
    await expect(needs).toContainText(plans ? "Paid plans" : "To connect");
    await noSideways(page);

    // Settings › Providers: the same words, with the way to fix it.
    await page.goto("/settings/providers");
    await expect(
        page.getByRole("heading", { name: "Providers", level: 2 }),
    ).toBeVisible();
    const prompt = page.getByRole("region", { name: TITLE });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(plans ? `${MISSED} ${PLAN}` : MISSED);
    if (plans) {
        await expect(
            prompt.getByRole("link", { name: "See plans" }),
        ).toHaveAttribute("href", "/settings/billing#change-plan");
        await noSideways(page);
        return;
    }
    const connect = prompt.getByRole("link", { name: "Connect your email" });
    await expect(connect).toHaveAttribute("href", "#connect-email");
    if (testInfo.project.name.startsWith("phone")) {
        // A real touch pointer, or the size below proves nothing.
        expect(
            await page.evaluate(
                () => window.matchMedia("(pointer: coarse)").matches,
            ),
        ).toBe(true);
    }
    await connect.click();
    await expect(page).toHaveURL(/#connect-email$/);
    await expect(page.locator("#connect-email")).toBeInViewport();
    await noSideways(page);

    // Connected: the prompt goes, here and on Home.
    const connected = await page.request.post(api(b, "/comms-providers"), {
        headers: headers(b),
        data: {
            channel: "EMAIL",
            provider: "SMTP",
            fromAddress: `hi-${b.address.slice(-12)}@example.in`,
            credentials: {
                host: "smtp.example.in",
                port: "587",
                user: "e2e",
                pass: "e2e-not-a-secret",
            },
        },
    });
    expect(connected.ok(), await connected.text()).toBe(true);
    expect((await emailSetup(page, b)).connected).toBe(true);

    await page.reload();
    await expect(
        page.getByRole("heading", { name: "Providers", level: 2 }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: TITLE })).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Needs you" })).toBeVisible();
    await expect(page.getByText(TITLE)).toHaveCount(0);
});
