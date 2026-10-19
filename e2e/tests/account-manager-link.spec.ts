// @covers web:/ app:/onboarding api:organizations
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import {
    answerFirst,
    answerKind,
    answerName,
    continueSetup,
    SETUP_WORDS,
    setupHeading,
} from "../fixtures/walk-setup";
import { urls } from "../playwright.config";

/**
 * An account manager's link and code at sign-up (DEC-169, admin console
 * U19). saroh.in keeps `?am=` in the `saroh_am` cookie with when it was
 * kept, and cuts it from the address; setup carries it to the API with the
 * business and clears it once the business is made; the name step asks,
 * on one quiet line, whether someone from Saroh is helping, for their
 * code, and points out one that can't be a code.
 *
 * The code here names nobody on the stack (no teammate is seeded), which is
 * the path a browser can check: the business is made all the same, and
 * nothing tells the owner whether a code counted. Which manager a business
 * is linked to, and how it was proved, is `account-manager.db.spec.ts`; the
 * business's own read of its manager comes with U26.
 *
 * As Asha (`founder`): each test sets up a business of its own, with a
 * stamped name, so it runs beside everything else. Nothing is saved on a
 * demo store.
 */

const CODE = "ABCD2345";

function aName(prefix: string, testInfo: TestInfo) {
    return `${prefix} ${stamp(testInfo)}`;
}

/** The `saroh_am` cookie the app's host would be sent, if any. */
async function keptOnApp(page: Page) {
    const cookies = await page.context().cookies(urls.APP_URL);
    return cookies.find((cookie) => cookie.name === "saroh_am");
}

test.describe("an account manager's link and code (DEC-169)", () => {
    test("saroh.in keeps ?am= with when it was kept, and cuts it from the address", async ({
        page,
    }) => {
        const before = Math.floor(Date.now() / 1000) - 5;
        await page.goto(`${urls.WEB_URL}/?am=abcd-2345&utm_source=e2e`);

        let value: string | undefined;
        await expect
            .poll(async () => {
                const cookies = await page.context().cookies(urls.WEB_URL);
                value = cookies.find((c) => c.name === "saroh_am")?.value;
                return value;
            })
            .toBeTruthy();
        const [code, seconds] = (value ?? "").split(".");
        expect(code).toBe(CODE);
        expect(Number(seconds)).toBeGreaterThanOrEqual(before);
    });

    test("setup carries the link and a typed code, makes the business, and clears the link", async ({
        page,
    }, testInfo) => {
        await useSession(page, "founder");
        // What saroh.in leaves on the domain it shares with the workspace.
        const keptAt = Math.floor(Date.now() / 1000) - 60;
        await page.context().addCookies([
            {
                name: "saroh_am",
                value: `${CODE}.${keptAt}`,
                url: urls.APP_URL,
                sameSite: "Lax",
            },
        ]);
        await page.goto("/onboarding");
        await expect(page).toHaveTitle(/Set up Saroh/);
        await answerKind(page);

        // One quiet line until it is asked for.
        const words = SETUP_WORDS["A business"];
        await expect(setupHeading(page, words.nameHeading)).toBeVisible();
        await expect(
            page.getByLabel("Code from your Saroh contact"),
        ).toHaveCount(0);
        await page
            .getByRole("button", { name: "Is someone from Saroh helping you?" })
            .click();
        const field = page.getByLabel("Code from your Saroh contact");
        await expect(field).toBeFocused();

        // A code that can't be one is pointed out on its step.
        const name = aName("Rye Bakery", testInfo);
        await page.getByLabel(words.nameLabel).fill(name);
        await field.fill("hello");
        await continueSetup(page);
        await expect(
            page.getByText("A code is 8 letters and numbers.", {
                exact: false,
            }),
        ).toBeVisible();
        await expect(page).toHaveURL(/[?&]step=name/);

        // A code shaped like one goes on, whoever it names.
        await field.fill("wxyz 6789");
        await answerName(page, { name });
        await answerFirst(page, { goal: /^Decide later/ });

        // The business is made, and the link is spent.
        await expect
            .poll(async () => {
                const res = await page.request.get(
                    `${urls.API_URL}/organizations`,
                );
                const rows = (await res.json()) as { name: string }[];
                return rows.some((row) => row.name === name);
            })
            .toBe(true);
        expect(await keptOnApp(page)).toBeUndefined();
    });
});
