// @vitest-environment jsdom
/**
 * "Where do visitors come from?" (plan U16, #1101; `IBFromD`, `IBFromP`):
 * each source's visits, paid and how many paid, in the source's own name;
 * small sources counted in Other sites and said so; the merchant's own
 * links under it when there are any.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SourcesRead } from "@/lib/insights/reads";

import { SourcesTable } from "./sources-table";

type Read = Pick<
    SourcesRead,
    "sources" | "folded" | "refs" | "moreRefs" | "siteId"
>;

const READ: Read = {
    sources: [
        { source: "instagram", visits: 455, paid: 52 },
        { source: "google", visits: 288, paid: 61 },
        { source: "whatsapp", visits: 166, paid: 31 },
        { source: "direct", visits: 133, paid: 12 },
        { source: "other", visits: 67, paid: 3 },
    ],
    folded: [],
    refs: [],
    moreRefs: 0,
    siteId: null,
};

function render(read: Partial<Read> = {}) {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
        <SourcesTable read={{ ...READ, ...read }} period="4w" />,
    );
    return host;
}

const rows = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLElement>("tbody tr")).map((tr) =>
        Array.from(tr.querySelectorAll<HTMLElement>("th, td")).map(
            (c) => c.textContent,
        ),
    );

describe("Where do visitors come from?", () => {
    it("lists each source by name with its visits, paid and how many paid", () => {
        const host = render();
        expect(host.textContent).toContain(
            "Instagram brings the most visits. Google search brings fewer, but more of them pay.",
        );
        expect(
            Array.from(host.querySelectorAll<HTMLElement>("thead th")).map(
                (th) => th.textContent,
            ),
        ).toEqual(["From", "Visits", "Paid", "How many paid"]);
        expect(rows(host)).toEqual([
            ["Instagram", "455", "52", "1 in 9"],
            ["Google search", "288", "61", "1 in 5"],
            ["WhatsApp links", "166", "31", "1 in 5"],
            ["Typed your address", "133", "12", "1 in 11"],
            ["Other sites", "67", "3", "1 in 22"],
        ]);
        // A count, never a percentage, in what is read.
        expect(host.textContent).not.toMatch(/%/);
        expect(host.querySelector('[data-testid="sources-note"]')).toBeNull();
        expect(host.querySelector('[data-testid="sources-refs"]')).toBeNull();
    });

    it("says which small sources are counted in Other sites", () => {
        const host = render({
            sources: [
                { source: "instagram", visits: 40, paid: 4 },
                { source: "other", visits: 7, paid: 1 },
            ],
            folded: ["whatsapp", "direct"],
        });
        expect(rows(host).map((r) => r[0])).toEqual([
            "Instagram",
            "Other sites",
        ]);
        expect(
            host.querySelector('[data-testid="sources-note"]')?.textContent,
        ).toBe(
            "WhatsApp links and Typed your address had too few visits to show apart, so they are counted in Other sites.",
        );
    });

    it("says paid is the whole business's when one website is chosen", () => {
        expect(
            render({ siteId: "site_1" }).querySelector(
                '[data-testid="sources-note"]',
            )?.textContent,
        ).toBe("Paid is counted for your whole business, not one website.");
    });

    it("lists the merchant's own links when any were visited", () => {
        const host = render({
            refs: [
                { ref: "diwali-post", visits: 120, paid: 9 },
                { ref: "bio", visits: 30, paid: 0 },
            ],
            moreRefs: 2,
        });
        const refs = host.querySelector('[data-testid="sources-refs"]');
        expect(refs?.querySelector("h4")?.textContent).toBe("Your own links");
        expect(
            Array.from(refs?.querySelectorAll<HTMLElement>("li") ?? []).map(
                (li) => li.textContent,
            ),
        ).toEqual(["diwali-post120 visits · 9 paid", "bio30 visits · 0 paid"]);
        expect(refs?.textContent).toContain("And 2 more links.");
    });

    it("draws no table with no source, the sentence saying so", () => {
        const host = render({ sources: [] });
        expect(host.querySelector("table")).toBeNull();
        expect(host.textContent).toContain(
            "No visits counted in the last 4 weeks.",
        );
    });

    it("marks a paid share it can't say, with no visit to say it of", () => {
        const host = render({
            sources: [{ source: "other", visits: 0, paid: 2 }],
        });
        expect(host.querySelector("[data-absent]")?.textContent).toContain(
            "Not known",
        );
    });
});
