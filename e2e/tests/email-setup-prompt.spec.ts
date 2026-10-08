// @covers app:/open app:/ app:/settings/providers api:communications api:home api:organizations api:capabilities api:billing
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * The prompt to connect the business's own email (#850, DEC-011 amended
 * 2026-10-07): with none, its customers get no emails and see their
 * updates only in their account. Its owner sees that on Home's Needs you
 * and on Settings › Providers, with Connect — or, on a plan that can't
 * connect one (DEC-091), See plans — and it goes once a provider is
 * connected.
 *
 * Owns its data: three of Asha's businesses the seed writes for this spec
 * alone (`packages/database/src/seed/email-prompt.ts`), with Communications
 * rolled out for them only (`MODULE_COMMUNICATIONS`, staff-only in
 * production). Desk and phone each have their own, since each connects an
 * email; the third, on an enforced entry plan, is only read.
 *
 * Who sees it (comms:manage, billing:read) and its words are covered by
 * `lib/communications/email-setup.test.ts` and the API's
 * `email-setup.spec.ts` / `home.email-setup.spec.ts`.
 */

const TITLE = "Your customers get no emails from you";
const MISSED =
    "No email provider is connected, so invoices, booking and order updates and review invitations aren't emailed. Your customers see their updates only in their account.";
const PLAN = "Connecting your own email comes with a paid plan.";

const orgOf = (key: "desk" | "phone" | "free") =>
    `seed_org_email-prompt_${key}`;

/** This browser's own business, connected and disconnected by it alone. */
const ownOrg = (testInfo: TestInfo) =>
    orgOf(testInfo.project.name.startsWith("phone") ? "phone" : "desk");

const api = (org: string, path: string) =>
    `${urls.API_URL}/organizations/${org}${path}`;

const headers = (org: string) => ({
    origin: urls.APP_URL,
    "x-organization-id": org,
});

async function emailSetup(page: Page, org: string) {
    const res = await page.request.get(
        api(org, "/comms-providers/email-setup"),
        {
            headers: headers(org),
        },
    );
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()) as {
        connected: boolean;
        canConnect: boolean | null;
    };
}

async function hasEmailRow(page: Page, org: string) {
    const res = await page.request.get(api(org, "/comms-providers"), {
        headers: headers(org),
    });
    expect(res.ok(), await res.text()).toBe(true);
    const rows = (await res.json()) as { channel: string }[];
    return rows.some((r) => r.channel === "EMAIL");
}

async function connectEmail(page: Page, org: string) {
    const res = await page.request.post(api(org, "/comms-providers"), {
        headers: headers(org),
        data: {
            channel: "EMAIL",
            provider: "SMTP",
            fromAddress: "hello@example.in",
            credentials: {
                host: "smtp.example.in",
                port: "587",
                user: "e2e",
                pass: "e2e-not-a-secret",
            },
        },
    });
    expect(res.ok(), await res.text()).toBe(true);
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

async function openHome(page: Page, org: string) {
    await page.goto(`/open/${org}`);
    await page.goto("/");
    const needs = page.getByRole("region", { name: "Needs you" });
    await expect(needs).toBeVisible();
    return needs;
}

async function openProviders(page: Page) {
    await page.goto("/settings/providers");
    await expect(
        page.getByRole("heading", { name: "Providers", level: 2 }),
    ).toBeVisible();
}

test("with no email provider, the owner is asked to connect one on Home and Providers, until it is", async ({
    page,
}, testInfo) => {
    await useSession(page, "founder");
    const org = ownOrg(testInfo);

    // A retry finds the email the first try connected: the seed is the only
    // way to remove it, so it is connected again and only "gone" is checked.
    if (await hasEmailRow(page, org)) {
        await connectEmail(page, org);
    } else {
        const setup = await emailSetup(page, org);
        expect(setup).toEqual({ connected: false, canConnect: true });

        // Home: one row in Needs you, saying what the customers miss.
        const needs = await openHome(page, org);
        const row = needs.getByRole("link", { name: new RegExp(TITLE) });
        await expect(row).toBeVisible();
        await expect(row).toContainText(MISSED);
        await expect(row).toHaveAttribute("href", "/settings/providers");
        await expect(needs).toContainText("To connect");
        await noSideways(page);

        // Settings › Providers: the same words, and Connect.
        await openProviders(page);
        const prompt = page.getByRole("region", { name: TITLE });
        await expect(prompt).toContainText(MISSED);
        const connect = prompt.getByRole("link", {
            name: "Connect your email",
        });
        await expect(connect).toHaveAttribute("href", "#connect-email");
        if (testInfo.project.name.startsWith("phone")) {
            // A real touch pointer, or the layout below proves nothing.
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

        await connectEmail(page, org);
    }

    // Connected: the prompt goes, here and on Home.
    expect((await emailSetup(page, org)).connected).toBe(true);
    await page.goto(`/open/${org}`);
    await openProviders(page);
    await expect(page.getByRole("region", { name: TITLE })).toHaveCount(0);
    await openHome(page, org);
    await expect(page.getByText(TITLE)).toHaveCount(0);
});

test("on a plan that can't connect one, it says a paid plan brings it, with See plans", async ({
    page,
}) => {
    await useSession(page, "founder");
    // Only read: nothing here changes it.
    const org = orgOf("free");
    expect(await emailSetup(page, org)).toEqual({
        connected: false,
        canConnect: false,
    });

    const needs = await openHome(page, org);
    const row = needs.getByRole("link", { name: new RegExp(TITLE) });
    await expect(row).toContainText(`${MISSED} ${PLAN}`);
    await expect(row).toHaveAttribute("href", "/settings/billing#change-plan");
    await expect(needs).toContainText("Paid plans");

    await openProviders(page);
    const prompt = page.getByRole("region", { name: TITLE });
    await expect(prompt).toContainText(`${MISSED} ${PLAN}`);
    await expect(
        prompt.getByRole("link", { name: "See plans" }),
    ).toHaveAttribute("href", "/settings/billing#change-plan");
    await expect(
        prompt.getByRole("link", { name: "Connect your email" }),
    ).toHaveCount(0);
    await noSideways(page);
});
