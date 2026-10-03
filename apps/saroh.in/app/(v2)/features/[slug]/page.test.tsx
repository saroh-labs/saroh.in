// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FEATURE_SLUGS, SOLUTION_SLUGS } from "@/content/types";

import FeaturePage, { generateMetadata, generateStaticParams } from "./page";

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

afterEach(cleanup);

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
