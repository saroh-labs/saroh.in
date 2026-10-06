import type { RenderedServicesList } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { act, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JournalFeed } from "./blocks/journal";
import type { PlansFeed } from "./blocks/plans";
import {
    sectionRendersNothing,
    withoutEmptyInPageEntries,
} from "./section-empty";
import { PageSections } from "./section-renderer";
import { SiteHeader } from "./site-chrome";
import { inPageTargetShown } from "./site-header-menu";

/**
 * The header never offers a jump to a section that shows nothing
 * (industry templates, polish pass): the server leaves out what it knows
 * (feed-backed blocks), the header hides what the browser learns.
 */

const POST = {
    title: "Spring opening hours",
    slug: "spring-hours",
    excerpt: null,
    content: "<p>Open late.</p>",
    publishedAt: "2026-03-01T09:00:00.000Z",
};
const posts = (n: number): JournalFeed => ({
    posts: Array.from({ length: n }, (_, i) => ({
        ...POST,
        slug: `post-${i}`,
    })),
    basePath: "/journal",
});
const noPlans: PlansFeed = { plans: [], joinHref: null };

const journal = {
    type: "journal",
    content: { anchor: "journal", navLabel: "Journal" },
};
const plans = {
    type: "plans",
    content: { anchor: "plans", navLabel: "Plans" },
};
const visit = {
    type: "richText",
    content: {
        format: "html",
        value: "<p>Find us</p>",
        anchor: "visit",
        navLabel: "Visit",
    },
};

function rowLabels(): string[] {
    const row = screen.getByRole("navigation", { name: "Site" });
    return Array.from(row.querySelectorAll("a")).map((a) => a.textContent);
}

describe("sectionRendersNothing", () => {
    it("knows a feed-backed block with nothing in its feed draws nothing", () => {
        expect(sectionRendersNothing(journal, { journal: posts(0) })).toBe(
            true,
        );
        expect(sectionRendersNothing(plans, { plans: noPlans })).toBe(true);
        expect(
            sectionRendersNothing(
                { type: "productGrid", content: {} },
                { productGrid: { products: [] } as never },
            ),
        ).toBe(true);
    });

    it("says nothing about a block without its feed, or one with something", () => {
        expect(sectionRendersNothing(journal, {})).toBe(false);
        expect(sectionRendersNothing(journal, { journal: posts(2) })).toBe(
            false,
        );
        expect(sectionRendersNothing(visit, {})).toBe(false);
    });

    it("follows the journal's look: under a lead, one post leaves nothing", () => {
        const afterLead = {
            type: "journal",
            content: { afterLead: true },
        };
        expect(sectionRendersNothing(afterLead, { journal: posts(1) })).toBe(
            true,
        );
        expect(sectionRendersNothing(afterLead, { journal: posts(2) })).toBe(
            false,
        );
    });
});

describe("withoutEmptyInPageEntries (the server's half)", () => {
    const NAV = [
        { label: "Journal", href: "/#journal" },
        { label: "Plans", href: "/#plans" },
        { label: "Visit", href: "/#visit" },
        { label: "About", href: "/about" },
    ];

    it("drops the entry to a feed-backed section with nothing to show, keeping the order", async () => {
        const read = vi.fn(() =>
            Promise.resolve({ journal: posts(0), plans: undefined }),
        );
        const menu = await withoutEmptyInPageEntries(
            NAV,
            [journal, plans, visit],
            read,
        );
        expect(menu.map((i) => i.label)).toEqual(["Plans", "Visit", "About"]);
        // Only the linked, feed-backed sections were read.
        expect(read).toHaveBeenCalledWith([journal, plans]);
    });

    it("reads nothing when no entry jumps to a feed-backed section", async () => {
        const read = vi.fn();
        const nav = [NAV[2], NAV[3]];
        expect(
            await withoutEmptyInPageEntries(nav, [journal, visit], read),
        ).toEqual(nav);
        expect(read).not.toHaveBeenCalled();
    });

    it("keeps the menu as it was when the read fails", async () => {
        const menu = await withoutEmptyInPageEntries(NAV, [journal], () =>
            Promise.reject(new Error("down")),
        );
        expect(menu).toEqual(NAV);
    });
});

describe("PageSections leaves a known-empty section out", () => {
    it("draws no wrapper, so no anchor, for a journal with no posts", () => {
        const { container } = render(
            <PageSections sections={[journal, visit]} journal={posts(0)} />,
        );
        expect(container.querySelector("#journal")).toBeNull();
        expect(container.querySelector("#visit")).not.toBeNull();
        expect(container.querySelectorAll("[data-site-section]")).toHaveLength(
            1,
        );
    });

    it("keeps one that has posts", () => {
        const { container } = render(
            <PageSections sections={[journal]} journal={posts(2)} />,
        );
        expect(container.querySelector("#journal")).not.toBeNull();
    });
});

describe("the header hides a jump to a section that shows nothing (the browser's half)", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    const services = {
        type: "servicesList",
        content: {
            ...(BLOCK_META.servicesList.fixtures
                .default as RenderedServicesList),
            anchor: "services",
            navLabel: "Services",
        },
    };
    const NAV = [
        { label: "Services", href: "/#services" },
        { label: "Visit", href: "/#visit" },
        { label: "About", href: "/about" },
    ];

    async function homeWithServices(body: unknown) {
        globalThis.fetch = vi.fn(() =>
            Promise.resolve(
                new Response(JSON.stringify(body), { status: 200 }),
            ),
        );
        render(
            <>
                <SiteHeader name="Rye & Co." navigation={NAV} />
                <PageSections sections={[services, visit]} />
            </>,
        );
        await act(async () => {
            await Promise.resolve();
        });
    }

    it("hides it once a block that reads in the browser settles on nothing", async () => {
        await homeWithServices([]);
        expect(rowLabels()).toEqual(["Visit", "About"]);
        // The phone menu too.
        act(() => screen.getByRole("button", { name: "Menu" }).click());
        const list = document.getElementById(
            screen
                .getByRole("button", { name: "Menu" })
                .getAttribute("aria-controls") ?? "",
        );
        expect(
            Array.from(list?.querySelectorAll("a") ?? []).map(
                (a) => a.textContent,
            ),
        ).toEqual(["Visit", "About"]);
    });

    it("keeps it when the block loads something to show", async () => {
        await homeWithServices([
            {
                id: "fixture-cut",
                name: "Cut and finish",
                description: null,
                durationMinutes: 45,
                priceCents: 3800,
                currency: "GBP",
            },
        ]);
        expect(rowLabels()).toEqual(["Services", "Visit", "About"]);
    });

    it("shows it again when an empty section fills in later", async () => {
        let fill: () => void = () => undefined;
        function Later() {
            const [ready, setReady] = useState(false);
            useEffect(() => {
                fill = () => setReady(true);
            }, []);
            return ready ? <p>Classes this week</p> : null;
        }
        render(
            <>
                <SiteHeader name="Rye & Co." navigation={[NAV[0], NAV[2]]} />
                <div id="services">
                    <Later />
                </div>
            </>,
        );
        await act(async () => {
            await Promise.resolve();
        });
        expect(rowLabels()).toEqual(["About"]);
        await act(async () => {
            fill();
            await Promise.resolve();
        });
        expect(rowLabels()).toEqual(["Services", "About"]);
    });

    it("keeps a jump to another page's section: that page can't be seen from here", () => {
        expect(inPageTargetShown("/#journal", document, "/about")).toBe(true);
        expect(inPageTargetShown("/#journal", document, "/")).toBe(false);
        expect(
            inPageTargetShown("/preview/tok#journal", document, "/preview/tok"),
        ).toBe(false);
        expect(inPageTargetShown("/about", document, "/")).toBe(true);
    });
});
