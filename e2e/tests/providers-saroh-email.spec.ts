// @covers app:/settings/providers app:/open api:communications api:organizations api:billing
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { OwnBusiness } from "../fixtures/own-business";
import { makeBusiness } from "../fixtures/own-business";
import { urls } from "../playwright.config";

/**
 * Settings → Providers' "Booking emails" block (DEC-086, U4): while a
 * business has no email of its own, Saroh sends its booking emails, and the
 * owner sees that, the month's allowance and the way to connect their own.
 *
 * Each test runs on a business it sets up for itself (`makeBusiness`, as
 * Asha), so connecting and disconnecting email touches nobody else.
 *
 * The route is off unless a business's `SAROH_BUSINESS_EMAIL` flag is on,
 * plan limits are enforced, and its plan's catalogue version carries the
 * `saroh-emails` allowance — none of which the seed sets, since every other
 * spec reads what a booking emails. So the first test (route off: the
 * screen is as it was) always runs, and the second runs only where the
 * stack was prepared for it and says so with `E2E_SAROH_EMAIL=1`: the
 * `SAROH_BUSINESS_EMAIL` and `PLAN_ENFORCEMENT` global defaults on (admin →
 * Flags), a live catalogue version whose Free plan has `saroh-emails` with
 * a monthly number, and Communications available to a new business.
 *
 * The spec can't arrange that for itself: the flags and the catalogue are
 * written only through `/admin` (staff), and the e2e stack has no staff
 * session and no database access (DEV_LEARNINGS "a Shop page can't be shown
 * in the browser suite"). Until it does, the route-on proof is the API's
 * `saroh-email-state.db.spec.ts` (the state with the real defaults) and
 * `saroh-email-allowance.db.spec.ts`.
 *
 * The words for each state (near, paused, unread) and the Disconnect
 * warning are covered by `apps/app.saroh.in/lib/providers/rows.test.ts`;
 * the state itself by the API's `saroh-email-state.spec.ts`.
 */

const ROUTE_READY = process.env.E2E_SAROH_EMAIL === "1";

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
    // This business's switch is off unless the stack turned it on for all.
    test.skip(
        ROUTE_READY,
        "The stack sends booking emails for every new business",
    );
    const b = await makeBusiness(page, testInfo, "se-off");
    expect((await stateOf(page, b)).state).toBe("OFF");

    await openProviders(page, b);
    await expect(block(page)).toHaveCount(0);
    await expect(page.getByText("Saroh sends your booking emails")).toHaveCount(
        0,
    );
});

test.describe("with Saroh sending a business's booking emails", () => {
    test.skip(
        !ROUTE_READY,
        "Needs the stack prepared for Saroh's email (E2E_SAROH_EMAIL=1)",
    );

    test("the block says so above Available, then goes when the business connects its own email", async ({
        page,
    }, testInfo) => {
        const b = await makeBusiness(page, testInfo, "se-on");
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
