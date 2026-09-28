import type { BrowserContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { appHost, appIsSecure } from "../permissions.config";

/**
 * The host and scheme come from the config, not from a literal (#287): this
 * suite runs on portless hostnames locally and on a bare port in CI, and a
 * cookie set on the wrong domain is simply never sent — which would show up as
 * every role being logged out rather than as a configuration mistake.
 */
async function scenario(context: BrowserContext, value: string) {
    await context.addCookies([
        {
            name: "better-auth.session_token",
            value: "fixture-session",
            domain: appHost,
            path: "/",
            secure: appIsSecure,
        },
        {
            name: "permission_case",
            value,
            domain: appHost,
            path: "/",
            secure: appIsSecure,
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
        // Website from the rail lands on the site itself: its Pages tab, which
        // sends a reader on to Review.
        await page.goto("/sites");
        await expect(page).toHaveURL(/\/sites\/site_1\/review$/);
        await expect(
            page.getByRole("heading", { name: "Website", exact: true }),
        ).toBeVisible();
        /*
         * The editor's own route, which redirects a caller without
         * `section:write` to the reading screen (#275). Asserted from the link
         * a merchant actually follows rather than from the destination, so a
         * redirect that stops working is a failure here.
         */
        await page.goto("/sites/site_1");
        await expect(page).toHaveURL(/\/sites\/site_1\/review$/);
        await expect(
            page.getByRole("heading", {
                name: "Permission test site",
                exact: true,
            }),
        ).toBeVisible();
        // The draft, drawn by the live site's blocks — not a list of titles.
        await expect(
            page.getByRole("heading", { name: "Racking that fits" }),
        ).toBeVisible();
        // Nothing that writes: the editor's draft load is a 403 for both roles.
        await expect(
            page.getByRole("button", { name: /publish/i }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: /add section/i }),
        ).toHaveCount(0);
        /*
         * The one difference between the two roles on this screen: a REVIEWER
         * may say something, a MEMBER may only look.
         */
        await expect(
            page.getByRole("button", { name: "Comment on sections" }),
        ).toHaveCount(role === "REVIEWER" ? 1 : 0);
        await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(
            role === "REVIEWER" ? 1 : 0,
        );
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

test("REVIEWER's Home is what was sent to them for review, and nothing about the business", async ({
    page,
    context,
}) => {
    await scenario(context, "REVIEWER");
    await page.goto("/");
    await expect(
        page.getByRole("heading", { name: "Sent to you for review" }),
    ).toBeVisible();
    // A row per page waiting, opening the Review tab on that page.
    const row = page.getByRole("link", { name: /Home.*From Priya Raman/ });
    await expect(row).toHaveAttribute(
        "href",
        "/sites/site_1/review?page=page_1",
    );
    await expect(row).toContainText("2 notes open");
    // None of the business's bands.
    for (const band of ["Needs you", "Today", "This week"]) {
        await expect(
            page.getByRole("heading", { name: band, exact: true }),
        ).toHaveCount(0);
    }
    await row.click();
    await expect(page).toHaveURL(/\/sites\/site_1\/review\?page=page_1$/);
});

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
        page.getByRole("link", { name: "Back to Website", exact: true }),
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

test("a Reviewer opening Bookings sees the locked card, not an error", async ({
    page,
    context,
}) => {
    await scenario(context, "REVIEWER");
    // Every route under Bookings, deep links included (E5).
    for (const path of ["/bookings", "/bookings/all"]) {
        await page.goto(path);
        await expect(
            page.getByRole("heading", {
                name: "You can't open bookings",
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByText(
                "Your role is Reviewer, which can see the website but not bookings. An owner or admin can change that in Team.",
            ),
        ).toBeVisible();
        await expect(
            page.getByRole("link", { name: "Back to Home", exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: /try again/i }),
        ).toHaveCount(0);
    }
});

test("a denied module explains access instead of saying it is off", async ({
    page,
    context,
}) => {
    // A Reviewer: a Member reads contacts since DEC-020.
    await scenario(context, "REVIEWER");
    await page.goto("/contacts");
    await expect(
        page.getByRole("heading", {
            name: "You do not have access to CRM",
            exact: true,
        }),
    ).toBeVisible();
});

test("someone who can't read or stage orders sees the locked card", async ({
    page,
    context,
}) => {
    // A Reviewer holds neither `order:read` nor `order:stage` (B7).
    await scenario(context, "REVIEWER");
    await page.goto("/commerce/orders");
    await expect(
        page.getByRole("heading", { name: "Orders", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("heading", {
            name: "You do not have access to this",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByText(
            "Your role in Permission tests is Reviewer, which covers one website and nothing about the business around it. Orders are not part of it.",
        ),
    ).toBeVisible();
    await expect(
        page.getByText(
            "The rail does not offer Sell to this role, so you have reached it by address. Ask an Owner or Admin of Permission tests if you need it.",
        ),
    ).toBeVisible();
    // A denial, not a failure: nothing to retry, and no tabs.
    await expect(page.getByRole("button", { name: /try again/i })).toHaveCount(
        0,
    );
    await expect(page.getByText("Couldn't load orders")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Orders" })).toHaveCount(
        0,
    );

    // Order Detail's locked card, from a deep link.
    await page.goto("/commerce/orders/ord_1");
    await expect(
        page.getByRole("heading", {
            name: "You can't open orders",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByText(
            "Your role is Reviewer, which can see the website but not this. An owner or admin can change that in Team.",
        ),
    ).toBeVisible();
    await expect(
        page.getByRole("link", { name: "Back to Home", exact: true }),
    ).toBeVisible();
});

test("a failed Orders read says so, and is never an empty list", async ({
    page,
    context,
}) => {
    await scenario(context, "orders-failure");
    await page.goto("/commerce/orders");
    await expect(
        page.getByRole("heading", {
            name: "Couldn't load orders",
            exact: true,
        }),
    ).toBeVisible();
    // Announced as an alert, not drawn as an empty list.
    await expect(
        page.getByRole("alert").filter({
            hasText:
                "Orders that were placed are still there and nothing has been changed",
        }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("No orders yet")).toHaveCount(0);
    // No tabs or counts around the message: none of them would be true.
    await expect(page.getByRole("navigation", { name: "Orders" })).toHaveCount(
        0,
    );
});

test("a business with no orders yet is empty, not failed", async ({
    page,
    context,
}) => {
    await scenario(context, "MEMBER");
    await page.goto("/commerce/orders");
    await expect(
        page.getByRole("heading", { name: "No orders yet", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Couldn't load orders")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /try again/i })).toHaveCount(
        0,
    );
});
