// @covers web:/gst web:/guides web:/downloads web:/api/downloads/unlock api:tools pkg:search-pages
import fs from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { urls } from "../playwright.config";

/**
 * The GST pages, guides and downloads on saroh.in (plan 2026-10-31-002,
 * U10): what only the running site shows, desk and phone.
 *
 * The stack builds saroh.in as a preview (`RESOURCES_PREVIEW=1`) and its
 * API has no page live, so every page is built, says Draft and is
 * `noindex`; a hub with no live page is `noindex` too.
 *
 * The one write is a download unlock with this test's own example.com
 * address: the stack has no Turnstile keys, so the API asks no bot check,
 * and the lead it stores is this test's alone.
 */

const WEB = urls.WEB_URL;
const CONTENT = path.resolve(__dirname, "../../packages/search-pages/content");

/** One frontmatter field of a content file, as written (quotes dropped). */
function field(kind: string, slug: string, key: string): string {
    const text = fs.readFileSync(
        path.join(CONTENT, kind, `${slug}.mdx`),
        "utf8",
    );
    const line = text.split("\n").find((l) => l.startsWith(`${key}: `));
    if (!line) throw new Error(`${kind}/${slug} has no ${key}`);
    return line.slice(key.length + 2).replace(/^"(.*)"$/, "$1");
}

/** Every guide's H1 and its trades, from the files. */
function guides(): { h1: string; trades: string[] }[] {
    return fs
        .readdirSync(path.join(CONTENT, "guides"))
        .filter((f) => f.endsWith(".mdx"))
        .map((f) => {
            const slug = f.slice(0, -4);
            return {
                h1: field("guides", slug, "h1"),
                trades: field("guides", slug, "trades")
                    .replace(/[[\]]/g, "")
                    .split(",")
                    .map((t) => t.trim()),
            };
        });
}

const DRAFT = "Draft — not published yet";
const NOT_TAX_ADVICE =
    "A guide, not tax advice: check with your CA for your own case.";

const PAGES = [
    {
        path: "/gst/salon-and-beauty-services",
        kind: "gst",
        slug: "salon-and-beauty-services",
    },
    {
        path: "/guides/reduce-no-shows",
        kind: "guides",
        slug: "reduce-no-shows",
    },
    {
        path: "/downloads/gst-invoice-format",
        kind: "downloads",
        slug: "gst-invoice-format",
    },
] as const;

async function expectNoindex(page: Page) {
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
    );
}

/** The trail's first link is Home. */
async function expectTrailFromHome(page: Page) {
    const trail = page.locator("main").getByRole("navigation", {
        name: "Breadcrumb",
    });
    await expect(trail.getByRole("link").first()).toHaveText("Home");
    await expect(trail.getByRole("link").first()).toHaveAttribute("href", "/");
}

test.describe("GST pages, guides and downloads", () => {
    for (const p of PAGES) {
        test(`${p.path} renders as a Draft, noindex, its trail from Home`, async ({
            page,
        }) => {
            await page.goto(`${WEB}${p.path}`);
            await expect(page.getByRole("heading", { level: 1 })).toHaveText(
                field(p.kind, p.slug, "h1"),
            );
            await expect(page.getByText(DRAFT, { exact: true })).toBeVisible();
            await expectNoindex(page);
            await expectTrailFromHome(page);
            if (p.kind === "gst")
                await expect(
                    page.getByText(NOT_TAX_ADVICE, { exact: true }),
                ).toBeVisible();
        });
    }

    test("/gst renders, noindex, its trail from Home", async ({ page }) => {
        await page.goto(`${WEB}/gst`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
            "GST for service businesses in India, in plain words",
        );
        await expectNoindex(page);
        await expectTrailFromHome(page);
        await expect(
            page.locator('main a[href="/gst/salon-and-beauty-services"]'),
        ).toBeVisible();
    });

    test("/guides' chips: a trade keeps its guides, an unknown one shows all", async ({
        page,
    }) => {
        const all = guides();
        const cards = page.locator("main .sp-hc-grid > li");
        const chips = page.getByRole("navigation", {
            name: "Guides for your trade",
        });

        await page.goto(`${WEB}/guides?for=clinics`);
        // `?for=` is read in the browser: the first draw is All.
        await expect(
            chips.getByRole("link", { name: "Clinics" }),
        ).toHaveAttribute("aria-current", "page");
        const clinics = all.filter((g) => g.trades.includes("clinics"));
        await expect(cards).toHaveCount(clinics.length);
        for (const g of clinics)
            await expect(cards.getByRole("link", { name: g.h1 })).toBeVisible();

        await page.goto(`${WEB}/guides?for=not-a-trade`);
        await expect(chips.getByRole("link", { name: "All" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        await expect(chips.locator("[aria-current]")).toHaveCount(1);
        await expect(cards).toHaveCount(all.length);
    });

    test("the download form switches between WhatsApp and Email, and a short number sends nothing", async ({
        page,
    }) => {
        const unlocks: string[] = [];
        page.on("request", (r) => {
            if (
                r.method() === "POST" &&
                r.url().endsWith("/api/downloads/unlock")
            )
                unlocks.push(r.url());
        });
        await page.goto(`${WEB}/downloads/gst-invoice-format`);
        const gate = page.getByRole("form", { name: "Get the files" });
        const phone = gate.getByRole("textbox", { name: "WhatsApp number" });
        const email = gate.getByRole("textbox", { name: "Email address" });

        // WhatsApp first, with its +91 and its own note.
        await expect(
            gate.getByRole("radio", { name: "WhatsApp" }),
        ).toBeChecked();
        await expect(phone).toBeVisible();
        await expect(gate.getByText("+91", { exact: true })).toBeVisible();
        await expect(gate).toContainText("never message it");

        await pressUntil(gate.getByRole("radio", { name: "Email" }), email);
        await expect(phone).toHaveCount(0);
        await expect(gate.getByText("+91", { exact: true })).toHaveCount(0);
        await expect(gate).toContainText("No newsletter");

        await gate.getByRole("radio", { name: "WhatsApp" }).check();
        await expect(phone).toBeVisible();
        await expect(email).toHaveCount(0);

        await phone.fill("98765");
        await gate.getByRole("button", { name: "Send me the files" }).click();
        await expect(gate.getByRole("alert")).toHaveText(
            "That number should be 10 digits, like 98765 43210.",
        );
        await expect(phone).toHaveAttribute("aria-invalid", "true");
        expect(unlocks).toEqual([]);
    });

    test("an email gets the file here, and nothing says a WhatsApp message is coming", async ({
        page,
    }, testInfo) => {
        const address = `${stamp(testInfo).toLowerCase()}@example.com`;
        await page.goto(`${WEB}/downloads/gst-invoice-format`);
        const gate = page.getByRole("form", { name: "Get the files" });
        const email = gate.getByRole("textbox", { name: "Email address" });
        await pressUntil(gate.getByRole("radio", { name: "Email" }), email);
        await email.fill(address);

        const unlocked = page.waitForResponse(
            (r) =>
                r.url().endsWith("/api/downloads/unlock") &&
                r.request().method() === "POST",
        );
        const download = page.waitForEvent("download");
        await gate.getByRole("button", { name: "Send me the files" }).click();
        const res = await unlocked;
        expect(res.request().postDataJSON()).toEqual({
            slug: "gst-invoice-format",
            email: address,
        });
        expect(res.status()).toBe(200);
        expect((await download).suggestedFilename()).toBe(
            "gst-invoice-format.xlsx",
        );

        const done = page.locator("main").getByRole("status");
        await expect(done).toContainText("Your files are downloading.");
        await expect(done).not.toContainText("WhatsApp");
        // The other format is a link; the first already downloaded.
        await expect(
            page.getByRole("link", { name: "Get the Word file (.docx)" }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Use another email" }),
        ).toBeVisible();
    });
});
