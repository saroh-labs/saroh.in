// @covers admin:/team api:admin
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { people, useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * The Team screen on the operator console (DEC-169, admin console U17,
 * R30–R32): Teammates (the counts, the people with the job filter and the
 * Table · Cards switch, businesses without a manager), Console roles (the
 * plain-words table and Show permission codes) and Payouts, at the desk
 * and on a phone.
 *
 * Staff is Sam (`people.staff`), a Platform owner. Reads only: the Add a
 * teammate sheet is opened and cancelled, Assign…
 * are opened and closed, and nothing is sent, so the seeded team and
 * businesses every other spec reads are never changed. The writes and
 * their rules are `admin-team-list.db.spec.ts`'s,
 * `admin-account-managers.db.spec.ts`'s and `team.test.tsx`'s.
 */
const ADMIN = urls.ADMIN_URL;

test.describe("Team on the operator console", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page, "staff");
    });

    test("Teammates lists the team with their jobs, and the filter narrows it", async ({
        page,
    }) => {
        await page.goto(`${ADMIN}/team`);
        await expect(
            page.getByRole("heading", { level: 1, name: "Team" }),
        ).toBeVisible();
        await expect(page.getByText("Not authorized")).toHaveCount(0);
        await expect(
            page.getByRole("link", { name: "Teammates" }),
        ).toHaveAttribute("aria-current", "page");

        const summary = page.getByRole("group", { name: "Team in numbers" });
        await expect(summary.getByText("People")).toBeVisible();
        await expect(summary.getByText("Account managers")).toBeVisible();

        const list = page.getByRole("list", { name: "People on the team" });
        await expect(
            list.getByText(people.staff.email, { exact: true }),
        ).toBeVisible();

        const works = page.getByRole("radiogroup", { name: "Works as" });
        await works.getByRole("radio", { name: /^Everyone/ }).click();
        await expect(
            works.getByRole("radio", { name: /^Everyone/ }),
        ).toHaveAttribute("aria-checked", "true");

        await page.getByRole("radio", { name: "Cards" }).click();
        await expect(page.getByRole("article").first()).toBeVisible();

        if (test.info().project.name.startsWith("phone")) {
            await expectNothingHiddenSideways(page);
        }
    });

    test("businesses without a manager offer Assign…", async ({ page }) => {
        await page.goto(`${ADMIN}/team`);
        const section = page.locator("#unassigned");
        await expect(
            section.getByRole("heading", {
                name: /^Businesses without a manager · \d+$/,
            }),
        ).toBeVisible();
        const assign = section.getByRole("button", { name: "Assign…" });
        if ((await assign.count()) === 0) {
            await expect(
                section.getByText("Every business has a manager."),
            ).toBeVisible();
            return;
        }
        await expect(
            section.getByRole("button", { name: /Share out/ }),
        ).toHaveCount(0);
        await section.getByRole("button", { name: "Assign…" }).first().click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "Cancel" })
            .click();
    });

    test("Add a teammate suggests a role from the job", async ({ page }) => {
        await page.goto(`${ADMIN}/team`);
        await page.getByRole("button", { name: "Add a teammate" }).click();
        const sheet = page.getByRole("dialog", { name: "Add a teammate" });
        await expect(sheet).toBeVisible();
        await expect(
            sheet.getByRole("checkbox", { name: /^Account manager/ }),
        ).toBeChecked();
        await sheet.getByRole("radio", { name: /^Something else/ }).click();
        await expect(
            sheet.getByRole("checkbox", { name: /^Support/ }),
        ).toBeChecked();
        await expect(sheet.getByText("Access ends")).toBeVisible();
        await sheet.getByRole("button", { name: "Cancel" }).click();
        await expect(sheet).toHaveCount(0);
    });

    test("Console roles reads in words, with the codes on asking", async ({
        page,
    }) => {
        await page.goto(`${ADMIN}/team/roles`);
        await expect(
            page.getByRole("link", { name: "Console roles" }),
        ).toHaveAttribute("aria-current", "page");
        const roles = page.getByRole("list", { name: "Roles" });
        await expect(roles.getByText("Platform owner")).toBeVisible();
        await expect(
            page.getByText("Who has access to this console").first(),
        ).toBeVisible();
        await expect(page.getByText("staff:grant")).toHaveCount(0);
        await page.getByLabel("Show permission codes").click();
        await expect(
            page.getByText(/staff:read · staff:grant/).first(),
        ).toBeVisible();

        if (test.info().project.name.startsWith("phone")) {
            await expectNothingHiddenSideways(page);
        }
    });

    test("Payouts opens for a Platform owner", async ({ page }) => {
        await page.goto(`${ADMIN}/team/payouts`);
        await expect(
            page.getByRole("heading", { level: 1, name: "Team" }),
        ).toBeVisible();
        await expect(page.getByText("Not authorized")).toHaveCount(0);
    });
});
