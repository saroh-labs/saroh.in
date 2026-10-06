// @covers app:/settings/providers app:/open api:communications api:organizations api:billing
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { OwnBusiness } from "../fixtures/own-business";
import { makeBusiness } from "../fixtures/own-business";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Settings → Providers' "Booking emails" block (DEC-086, U4): while a
 * business has no email of its own, Saroh sends its booking emails, and the
 * owner sees that, the month's allowance and the way to connect their own.
 *
 * Route off: a business the test sets up for itself (`makeBusiness`, as
 * Asha), which no flag reaches, so the screen is as it was.
 *
 * Route on: the route needs the business's `SAROH_BUSINESS_EMAIL` flag on,
 * plan limits enforced (`PLAN_ENFORCEMENT`) and a live catalogue version
 * whose plan has a `saroh-emails` allowance — written only through
 * `/admin` in production, and the stack has no staff session. So the seed
 * writes them (`packages/database/src/seed/saroh-email.ts`) for two of
 * Asha's businesses that nothing else reads, one per browser
 * (`seed_org_saroh-email_desk` / `_phone`), since each connects and
 * disconnects an email: the flags are on for those two alone, the
 * allowance is the sample catalogue's made-up number. Every other business
 * reads what it did. The test puts its business back to where the seed
 * left it first (no email of its own, no contact email), so a retry starts
 * clean.
 *
 * The words for each state (near, paused, unread) and the Disconnect
 * warning are covered by `apps/app.saroh.in/lib/providers/rows.test.ts`;
 * the state itself by the API's `saroh-email-state.spec.ts` and, with the
 * real defaults, `saroh-email-state.db.spec.ts`.
 */

type SarohEmailState =
    | { state: "OFF"; takesOver: boolean }
    | { state: "UNREAD" }
    | {
          state: "SENDING" | "NEAR" | "PAUSED";
          used: number;
          cap: number;
          resetsOn: string;
          sender: { name: string; address: string };
          replyTo: string | null;
      };

const api = (b: OwnBusiness, path: string) =>
    `${urls.API_URL}/organizations/${b.id}${path}`;

const headers = (b: OwnBusiness) => ({
    origin: urls.APP_URL,
    "x-organization-id": b.id,
});

async function stateOf(page: Page, b: OwnBusiness): Promise<SarohEmailState> {
    const res = await page.request.get(api(b, "/comms-providers/saroh-email"), {
        headers: headers(b),
    });
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()) as SarohEmailState;
}

async function openProviders(page: Page, b: OwnBusiness) {
    await page.goto(`/open/${b.id}`);
    await page.goto("/settings/providers");
    await expect(
        page.getByRole("heading", { name: "Providers", level: 2 }),
    ).toBeVisible();
}

const block = (page: Page) =>
    page.getByRole("region", { name: "Booking emails" });

/** Never sideways, at the width the project set. */
async function noSideways(page: Page) {
    const width = page.viewportSize()?.width ?? 0;
    // A phone widens innerWidth to fit content that overflows.
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
}

test("with Saroh's route off, Providers is as it was: no booking-emails block", async ({
    page,
}, testInfo) => {
    // No flag reaches a business made here: Saroh's route is off for it.
    const b = await makeBusiness(page, testInfo, "se-off");
    expect((await stateOf(page, b)).state).toBe("OFF");

    await openProviders(page, b);
    await expect(block(page)).toHaveCount(0);
    await expect(page.getByText("Saroh sends your booking emails")).toHaveCount(
        0,
    );
});

/**
 * The seeded business this browser's copy of the test owns (`saroh-email.ts`
 * in the seed), put back to how the seed left it: no email of its own and
 * no contact email.
 */
async function sarohEmailBusiness(
    page: Page,
    testInfo: TestInfo,
): Promise<OwnBusiness> {
    await useSession(page, "founder");
    const browser = testInfo.project.name.startsWith("phone")
        ? "phone"
        : "desk";
    const b: OwnBusiness = {
        id: `seed_org_saroh-email_${browser}`,
        address: `saroh-email-${browser}`,
        name: "Asha's Pottery",
    };
    const before = await stateOf(page, b);
    if (before.state === "OFF" && before.takesOver) {
        const off = await page.request.delete(
            api(b, "/comms-providers/EMAIL"),
            { headers: headers(b) },
        );
        expect(off.ok(), await off.text()).toBe(true);
    }
    const cleared = await page.request.patch(api(b, ""), {
        headers: headers(b),
        data: { profile: { contactEmail: "" } },
    });
    expect(cleared.ok(), await cleared.text()).toBe(true);
    return b;
}

test.describe("with Saroh sending a business's booking emails", () => {
    test("the block says so above Available, then goes when the business connects its own email", async ({
        page,
    }, testInfo) => {
        const b = await sarohEmailBusiness(page, testInfo);
        const state = await stateOf(page, b);
        expect(state.state).toBe("SENDING");
        if (state.state !== "SENDING") return;

        await openProviders(page, b);
        const card = block(page);
        await expect(card).toBeVisible();
        await expect(card).toContainText(
            "Saroh sends your booking emails for now",
        );
        await expect(card).toContainText(
            `${state.used} of ${state.cap.toLocaleString("en-IN")} this month · starts again ${state.resetsOn}`,
        );
        await expect(card).toContainText(
            `"${state.sender.name}" <${state.sender.address}>`,
        );

        // Its own block, above Available, never in Connected.
        const connected = page.getByRole("region", { name: "Connected" });
        await expect(connected).not.toContainText("Saroh");
        const available = page.getByRole("region", { name: "Available" });
        const cardBox = await card.boundingBox();
        const availableBox = await available.boundingBox();
        if (!cardBox || !availableBox) throw new Error("not laid out");
        expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(availableBox.y);

        // No contact email yet: replies have nowhere to go, so it asks.
        const add = card.getByRole("link", { name: "Add a contact email" });
        await expect(add).toHaveAttribute(
            "href",
            "/settings/organization?section=contact",
        );
        const contact = `hi-${b.address.slice(-12)}@example.in`;
        const saved = await page.request.patch(api(b, ""), {
            headers: headers(b),
            data: { profile: { contactEmail: contact } },
        });
        expect(saved.ok(), await saved.text()).toBe(true);
        await page.reload();
        await expect(card.getByText("Replies go to")).toBeVisible();
        await expect(card.getByText(contact)).toBeVisible();
        await expect(add).toHaveCount(0);

        // Connect jumps to the first email provider on offer.
        await card.getByRole("link", { name: "Connect your email" }).click();
        await expect(page).toHaveURL(/#connect-email$/);
        await expect(page.locator("#connect-email")).toBeInViewport();

        await noSideways(page);

        // Dark is defined, not inherited: the card has a surface of its own.
        await page.emulateMedia({ colorScheme: "dark" });
        await expect
            .poll(() =>
                card
                    .locator("div")
                    .first()
                    .evaluate((el) => getComputedStyle(el).backgroundColor),
            )
            .not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
        await page.emulateMedia({ colorScheme: "light" });

        // The business connects its own email: the block goes, and the
        // Disconnect warning says Saroh would take over, counted.
        const connect = await page.request.post(api(b, "/comms-providers"), {
            headers: headers(b),
            data: {
                channel: "EMAIL",
                provider: "SMTP",
                fromAddress: contact,
                credentials: {
                    host: "smtp.example.in",
                    port: "587",
                    user: "e2e",
                    pass: "e2e-not-a-secret",
                },
            },
        });
        expect(connect.ok(), await connect.text()).toBe(true);
        expect(await stateOf(page, b)).toEqual({
            state: "OFF",
            takesOver: true,
        });
        await page.reload();
        await expect(block(page)).toHaveCount(0);

        const smtp = connected.getByRole("button", {
            name: "Disconnect SMTP relay",
        });
        await smtp.click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText(
            "Booking emails switch to Saroh's email straight away and count against your plan's monthly allowance. All other email stops being sent.",
        );
        await confirm.getByRole("button", { name: "Disconnect" }).click();

        // Disconnected: the row says Saroh sends booking emails, and the
        // block is back.
        await expect(block(page)).toBeVisible();
        await expect(connected).toContainText(
            "Disconnected — Saroh sends your booking emails for now, counted against your plan",
        );
    });
});
