// @covers app:/open app:/commerce/products/import api:imports
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";

/**
 * Import products (Products audit, 16 Oct): a spreadsheet that writes its
 * status in lower case ("draft", "live") and its prices with a rupee sign
 * and thousands commas is read as it was meant — every good row is ready,
 * and the first rows read as the products they'll become. A status the
 * screen doesn't take is one grouped problem, numbered as the spreadsheet
 * numbers its rows.
 *
 * Northwind Supply, the base seed. It only previews: nothing is imported,
 * so there is nothing to take away.
 */

const ORG = "seed_org";
const STORE = "seed_store";

test.describe("Import products", () => {
    test("a lower-case-status file previews its rows as ready", async ({
        page,
    }, testInfo) => {
        const tag = testInfo.project.name;
        const tape = `E2E Import Tape ${tag}`;
        const csv = [
            "Title,Selling price,MRP,GST,Status",
            `${tape},₹120,150,18,draft`,
            `"E2E Import Bottle ${tag}","₹1,299","1,599",18,live`,
            `E2E Import Gloves ${tag},80,,5,Draft`,
            `E2E Import Wrap ${tag},45,,18,pending`,
        ].join("\n");

        await useSession(page);
        await page.goto(`/open/${ORG}`);
        await page.goto(`/commerce/products/import?storefront=${STORE}`);

        // Before the file: what it reads, and a file to start from.
        await expect(
            page.getByRole("button", { name: "Drop a CSV here or choose one" }),
        ).toBeVisible();
        await expect(
            page.getByText("Name and Price are needed. The rest is optional."),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Download a sample file" }),
        ).toBeVisible();

        await page.locator("input#csv-file").setInputFiles({
            name: "northwind.csv",
            mimeType: "text/csv",
            buffer: Buffer.from(csv, "utf8"),
        });

        // The file once, with its rows; the columns matched from headings.
        await expect(page.getByText("northwind.csv")).toHaveCount(1);
        await expect(page.getByText(/4 rows/)).toBeVisible();
        await expect(
            page.getByText("Matched from your headings.", { exact: false }),
        ).toBeVisible();
        await expect(
            page.getByText(
                "Category, SKU and stock can't be imported yet. Set them on each product after.",
            ),
        ).toBeVisible();

        // Lower-case status and rupee amounts are ready; "pending" isn't.
        await expect(
            page.getByRole("button", { name: "Import 3 rows" }),
        ).toBeVisible();
        await expect(
            page.getByText(/E2E Import Tape .*₹120.*MRP ₹150.*GST 18%.*Draft/),
        ).toBeVisible();
        await expect(
            page.getByText(/E2E Import Bottle .*₹1,299.*MRP ₹1,599.*Live/),
        ).toBeVisible();
        const problems = page
            .getByRole("listitem")
            .filter({ hasText: "Status is Draft, Live or Archived." });
        await expect(problems).toHaveCount(1);
        await expect(problems).toContainText("'pending' isn't one.");
        await expect(problems).toContainText("Row 5 in your file");
        await expect(
            page.getByText(
                "The other 3 rows can still come in. Fix these in your file and import it again.",
            ),
        ).toBeVisible();
    });
});
