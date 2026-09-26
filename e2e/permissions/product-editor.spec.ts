import type { BrowserContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { appHost, appIsSecure } from "../permissions.config";

/**
 * The product editor by role (#525), against the fixture API: a stock-only
 * custom role changes the Stock section and nothing else, with Track stock
 * locked; a role that can't see products is told so at the door.
 */
async function scenario(context: BrowserContext, value: string) {
    await context.addCookies(
        ["better-auth.session_token", "permission_case"].map((name) => ({
            name,
            value: name === "permission_case" ? value : "fixture-session",
            domain: appHost,
            path: "/",
            secure: appIsSecure,
        })),
    );
}

const EDIT = "/commerce/products/prod_1/edit?storefront=store_1";

test("a stock-only role saves Stock, and nothing else", async ({
    page,
    context,
}, testInfo) => {
    await scenario(context, "STOCK");
    await page.goto(EDIT);

    await expect(
        page.getByText(
            "You're viewing as Packer. You can read this product but not change it — an owner or admin can change your role in Team. Only the Stock section below can be changed.",
        ),
    ).toBeVisible();

    // Basics reads, and has no save.
    const basics = page.getByRole("region", { name: "Basics" });
    await expect(basics.locator("#pe-name")).toBeDisabled();
    await expect(
        basics.getByRole("button", { name: "Save basics" }),
    ).toHaveCount(0);

    // Track stock is shown, locked, and says why.
    const stock = page.getByRole("region", { name: "Stock" });
    await expect(
        stock.getByRole("switch", { name: "Track stock for this product" }),
    ).toBeDisabled();
    await expect(
        stock.getByText(
            "Only an owner or admin can turn Track stock on or off.",
        ),
    ).toBeVisible();

    // The count is theirs to change, and to save.
    const onHand = stock.locator("#pe-qty");
    await expect(onHand).toBeEnabled();
    await onHand.fill("9");
    await page.screenshot({
        path: testInfo.outputPath("stock-only.png"),
        fullPage: true,
    });
    await stock.getByRole("button", { name: "Save stock" }).click();
    await expect(page.getByText("Stock saved.").first()).toBeVisible();
});

test("an older product: counted whole, a variant on its own title, sold at two storefronts", async ({
    page,
    context,
}, testInfo) => {
    await scenario(context, "OWNER");
    await page.goto("/commerce/products/prod_2/edit?storefront=store_1");

    // Counted as a whole: shown and editable, not "No stock count yet".
    const stock = page.getByRole("region", { name: "Stock" });
    await expect(stock.locator("#pe-qty")).toHaveValue("16");
    await expect(stock.getByText(/^No stock count yet/)).toHaveCount(0);
    await expect(
        stock.getByRole("button", { name: "Count each variant instead" }),
    ).toBeVisible();
    await expect(stock.getByText("Counted at Hill Road.")).toBeVisible();

    // A variant with no option value keeps its title, and needs no fix.
    const variants = page.getByRole("region", { name: "Variants" });
    await expect(variants.getByText(/is not a size/)).toHaveCount(0);
    await expect(
        variants.getByText("Kept as “500mm” until you pick a size."),
    ).toBeVisible();

    // Two storefronts: where it is sold, under More.
    await expect(
        variants.getByText("Shows the cover · Hill Road, Online"),
    ).toBeVisible();
    await variants.getByRole("button", { name: "More" }).click();
    const where = variants.getByRole("group", { name: "Where 500mm is sold" });
    await where.getByRole("button", { name: "Online" }).click();
    await expect(where.getByRole("button", { name: "Online" })).toHaveAttribute(
        "aria-pressed",
        "false",
    );
    await expect(variants.getByText("Unsaved")).toBeVisible();
    await expect(page.getByText("Variants is unsaved")).toBeVisible();

    await page.screenshot({
        path: testInfo.outputPath("older-product.png"),
        fullPage: true,
    });
});

test("the description isn't unsaved when the editor opens", async ({
    page,
    context,
}) => {
    await scenario(context, "STOCK");
    await page.goto(EDIT);
    // The saved description, in the editor, with its toolbar — not the empty
    // box it stayed when the toolbar's state waited on a transaction that a
    // description already in Tiptap's spelling never makes.
    const description = page.getByRole("textbox", { name: "Description" });
    await expect(description).toBeVisible();
    await expect(description).toHaveAttribute("contenteditable", "false");
    await expect(description).toContainText("Baked each morning.");
    await expect(description.getByRole("listitem")).toHaveText("Long ferment");
    await expect(
        page.getByRole("toolbar", { name: "Formatting" }),
    ).toBeVisible();
    await expect(page.getByText("All changes saved")).toBeVisible();
    await expect(
        page.getByRole("region", { name: "Description" }).getByText("Unsaved"),
    ).toHaveCount(0);
});

test("a role that can't see products is told so", async ({ page, context }) => {
    await scenario(context, "NOREAD");
    await page.goto(EDIT);
    await expect(
        page.getByRole("heading", {
            name: "You can't open this product",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByText(
            "You're signed in as Front desk in Permission tests. That role doesn't include seeing products. An owner or admin can give you access in Team.",
        ),
    ).toBeVisible();
    await expect(
        page.getByRole("link", { name: "Go to Home", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /try again/i })).toHaveCount(
        0,
    );
});
