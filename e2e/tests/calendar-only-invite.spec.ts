// @covers accounts:/login app:/settings/people api:organizations api:staff
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";

/**
 * Giving someone on the diary a login (#868; owner decision 2026-10-08).
 *
 * The test puts its own person on Northwind's diary with no login, then, as
 * the owner, invites them from Team: picking them under "On the diary as"
 * picks Calendar only, the invite goes out at that role, and the waiting
 * row says who on the diary it is for. Afterwards it cancels the invite and
 * takes the person off the diary.
 *
 * @serial — a person on the diary takes a team seat (DEC-105), which every
 * Team count in the business reads.
 */

/** Two Toasters are mounted (one per theme); only one is ever shown. */
const shown = (page: import("@playwright/test").Page, text: string | RegExp) =>
    page.getByText(text).locator("visible=true").first();

test(
    "a diary person is invited as Calendar only by default",
    { tag: "@serial" },
    async ({ page }, testInfo) => {
        test.setTimeout(90_000);
        await useSession(page, "owner");
        // Opening the business makes it the one the workspace shows.
        await page.goto("/open/seed_org");
        const nw = northwind(page.request);
        const tag = stamp(testInfo);
        const name = `E2E Diary ${tag}`;
        const email = `e2e-calendar-only-${tag}@example.com`;
        const person = await nw.post<{ id: string }>("/staff", { name });

        try {
            await page.goto("/settings/people");
            await page.getByRole("button", { name: /Invite someone/ }).click();
            const dialog = page.getByRole("dialog");
            await dialog.getByLabel("Email").fill(email);

            await dialog
                .getByRole("combobox", { name: /On the diary as/ })
                .click();
            await page.getByRole("option", { name }).click();
            // Calendar only is picked for them, and says what it is.
            await expect(
                dialog.getByRole("radio", {
                    name: /Calendar only/,
                    checked: true,
                }),
            ).toBeAttached();
            await expect(dialog.getByText(/uses no extra seat/)).toBeVisible();

            await dialog.getByRole("button", { name: "Send invite" }).click();
            await expect(
                shown(page, /they join as Calendar only/),
            ).toBeVisible();

            const waiting = page
                .getByRole("region", { name: "Invited, not joined yet" })
                .getByRole("listitem")
                .filter({ hasText: email });
            await expect(waiting).toContainText(`for ${name} on the diary`);
            await expect(waiting).toContainText("Calendar only");
        } finally {
            const invites =
                await nw.get<{ id: string; email: string }[]>("/invitations");
            for (const invite of invites.filter((i) => i.email === email)) {
                await nw.delete(`/invitations/${invite.id}`);
            }
            await nw.delete(`/staff/${person.id}`);
        }
    },
);
