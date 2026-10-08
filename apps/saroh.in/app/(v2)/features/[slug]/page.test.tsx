// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { features } from "@/content/features";
import { FEATURE_SLUGS, SOLUTION_SLUGS } from "@/content/types";

import FeaturePage, { generateMetadata, generateStaticParams } from "./page";

// jsdom reads as a browser, so the server env is mocked: no preview, and
// no built-routes list (every route counts as built).
vi.mock("@/env", () => ({ env: {} }));
vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));

// No API in a unit test: the pages show the placeholder free-plan line.
vi.mock("@/lib/pricing", () => ({
    readLivePricing: () => Promise.resolve(null),
}));

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

/** The page as it renders at `iso` (no preview; every route counts as built). */
async function renderAt(slug: string, iso: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    return render(await FeaturePage(params(slug)));
}

describe("/features/[slug]", () => {
    it("builds the eight feature pages and nothing else", () => {
        expect(generateStaticParams()).toEqual(
            FEATURE_SLUGS.map((slug) => ({ slug })),
        );
    });

    it("/features/billing renders its headline, 3 steps and 6 points", async () => {
        render(await FeaturePage(params("billing")));
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Invoices you don't have to write.",
            }),
        ).toBeTruthy();
        const how = screen
            .getByRole("heading", { name: "Made, sent and paid." })
            .closest("section");
        expect(how?.querySelectorAll("ol > li")).toHaveLength(3);
        const does = screen
            .getByRole("heading", { name: "What it does" })
            .closest("section");
        expect(does?.querySelectorAll("li")).toHaveLength(6);
        const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(
            within(crumb).getByText("Billing").getAttribute("aria-current"),
        ).toBe("page");
    });

    it("links only to feature and solution pages that exist", async () => {
        const known = new Set([
            ...FEATURE_SLUGS.map((s) => `/features/${s}`),
            ...SOLUTION_SLUGS.map((s) => `/solutions/${s}`),
        ]);
        for (const slug of FEATURE_SLUGS) {
            const { container, unmount } = render(
                await FeaturePage(params(slug)),
            );
            const hrefs = Array.from(container.querySelectorAll("a"))
                .map((a) => a.getAttribute("href") ?? "")
                .filter((h) => /^\/(features|solutions)\//.test(h));
            expect(hrefs.length).toBeGreaterThan(0);
            for (const h of hrefs) expect(known).toContain(h);
            expect(hrefs).not.toContain(`/features/${slug}`);
            unmount();
        }
    });

    it("links its Help articles only once Help is published (17 Oct, India)", async () => {
        const before = await renderAt("bookings", "2026-10-16T18:29:59.999Z");
        expect(
            before.container.querySelectorAll('a[href^="/help"]'),
        ).toHaveLength(0);
        before.unmount();

        await renderAt("bookings", "2026-10-16T18:30:00.000Z");
        const how = screen
            .getByRole("heading", { name: features.bookings.howTitle })
            .closest("section");
        const links = Array.from(
            how?.querySelectorAll('a[href^="/help"]') ?? [],
        ).map((a) => [a.textContent, a.getAttribute("href")]);
        expect(links).toEqual([
            ["How to set your team's hours", "/help/set-your-teams-hours"],
            [
                "How to take a deposit when they book",
                "/help/take-a-deposit-when-they-book",
            ],
        ]);
    });

    it("an unknown slug is a 404", async () => {
        await expect(FeaturePage(params("unknown"))).rejects.toThrow(
            "NEXT_NOT_FOUND",
        );
        expect(await generateMetadata(params("unknown"))).toEqual({});
    });

    it("gives each page its title, description and canonical", async () => {
        const meta = await generateMetadata(params("orders"));
        expect(meta.title).toBe(
            "Orders — Every order in one list, and none slip. · Saroh",
        );
        expect(meta.alternates?.canonical).toBe("/features/orders");
        expect(meta.openGraph?.title).toBe(
            "Orders — Every order in one list, and none slip.",
        );
    });
});
