import type { BrowserContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

async function scenario(context: BrowserContext, value: string) {
    await context.addCookies([
        {
            name: "better-auth.session_token",
            value: "fixture-session",
            domain: "permissions-app.saroh.localhost",
            path: "/",
            secure: true,
        },
        {
            name: "permission_case",
            value,
            domain: "permissions-app.saroh.localhost",
            path: "/",
            secure: true,
        },
    ]);
}

test.beforeEach(async ({ page, isMobile }) => {
    if (isMobile) {
        expect(
            await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
        ).toBe(true);
    }
});

for (const role of ["MEMBER", "REVIEWER"]) {
    test(`${role} can reach Sites and read a site without an editable draft`, async ({
        page,
        context,
    }, testInfo) => {
        await scenario(context, role);
        await page.goto("/sites");
        await expect(
            page.getByRole("heading", { name: "Your sites", exact: true }),
        ).toBeVisible();
        await page.goto("/sites/site_1");
        await expect(
            page.getByRole("heading", {
                name: "Permission test site",
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Review notes", exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: /publish/i }),
        ).toHaveCount(0);
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);
        await page.screenshot({
            path: testInfo.outputPath("read-only-site.png"),
            fullPage: true,
        });
    });
}

test("production 403 uses the editor permission boundary", async ({
    page,
    context,
}) => {
    await scenario(context, "denied");
    await page.goto("/sites/site_1");
    await expect(
        page.getByRole("heading", {
            name: "You do not have access to this",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole("link", { name: "Back to sites", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /try again/i })).toHaveCount(
        0,
    );
});

test("settings does not swallow the forbidden interrupt", async ({
    page,
    context,
}) => {
    await scenario(context, "MEMBER");
    await page.goto("/settings/organization");
    await expect(
        page.getByRole("heading", {
            name: "You do not have access to this",
            exact: true,
        }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /try again/i })).toHaveCount(
        0,
    );
});

test("a server failure still offers retry", async ({ page, context }) => {
    await scenario(context, "failure");
    await page.goto("/settings/organization");
    await expect(
        page.getByRole("button", { name: /try again/i }),
    ).toBeVisible();
    await expect(
        page.getByRole("heading", {
            name: "You do not have access to this",
            exact: true,
        }),
    ).toHaveCount(0);
});

test("a disabled Website is distinct from a role denial", async ({
    page,
    context,
}) => {
    await scenario(context, "disabled");
    await page.goto("/sites");
    await expect(
        page.getByRole("heading", {
            name: "Website is turned off",
            exact: true,
        }),
    ).toBeVisible();
});

test("a denied module explains access instead of saying it is off", async ({
    page,
    context,
}) => {
    await scenario(context, "MEMBER");
    await page.goto("/contacts");
    await expect(
        page.getByRole("heading", {
            name: "You do not have access to CRM",
            exact: true,
        }),
    ).toBeVisible();
});
