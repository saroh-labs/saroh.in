// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HOME_FAQ } from "@/content/faq";
import { featureList } from "@/content/features";
import { SOLUTION_SLUGS } from "@/content/types";
import { freePlanLine } from "@/lib/plan-teasers";
import { fakeCatalog } from "@/lib/pricing.fixture";

import HomePage, { metadata } from "./page";

const read = vi.hoisted(() => ({
    catalog: null as ReturnType<typeof fakeCatalog> | null,
}));

// No server env in a unit test: the published Resources (templates,
// developers) read as none, as before the owner turns them on.
vi.mock("@/env", () => ({ env: {} }));

// The example sites' own fonts: next/font is a build step.
vi.mock("next/font/local", () => ({
    default: () => ({ variable: "font-site" }),
}));

// No API in a unit test: each case says which catalogue the page reads.
vi.mock("@/lib/pricing", () => ({
    readLivePricing: () => Promise.resolve(read.catalog),
}));

// No /for/ page is live here (DEC-193): solutions link to /solutions/.
vi.mock("@/lib/search-pages", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    solutionLink: (slug: string) => `/solutions/${slug}`,
    isPublished: () => false,
}));

/** The site's launch switch (plan KTD-16); the plan section shows once open. */
const launch = vi.hoisted((): { mode: "waitlist" | "open" } => ({
    mode: "open",
}));
vi.mock("@/lib/links", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    get LAUNCH_MODE() {
        return launch.mode;
    },
}));

function section(container: HTMLElement, id: string): HTMLElement {
    const el = container.querySelector<HTMLElement>(`#${id}`);
    if (!el) throw new Error(`no #${id}`);
    return el;
}

/** Everything the page sends as structured data. */
const ldText = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
        .map((el) => el.textContent)
        .join("");

/** A currency sign (written as an escape: no sign in the repo). */
const RUPEE = new RegExp("\\u20B9");

afterEach(() => {
    cleanup();
    read.catalog = null;
    launch.mode = "open";
});

describe("/ (Home)", () => {
    it("before launch draws no plan and no link to Pricing (Gate W)", async () => {
        launch.mode = "waitlist";
        read.catalog = fakeCatalog();
        const { container } = render(await HomePage());
        expect(container.querySelector("#pricing")).toBeNull();
        expect(container.querySelector('a[href^="/pricing"]')).toBeNull();
    });

    it("before launch says nothing of a catalogue published early (DEC-136)", async () => {
        launch.mode = "waitlist";
        read.catalog = fakeCatalog();
        const { container } = render(await HomePage());
        // Not in the answers, the plan line or the structured data. (The
        // example world's own prices, a bakery's ₹360 bun box, are drawn.)
        expect(section(container, "faq").innerHTML).not.toMatch(RUPEE);
        expect(ldText(container)).not.toMatch(RUPEE);
        expect(container.innerHTML).not.toMatch(/Plan [ABC]\b/);
        expect(container.innerHTML).not.toContain('"offers"');
        expect(container.innerHTML).not.toContain("/pricing");
        expect(container.textContent).toContain(
            "Move to a paid plan when you need more.",
        );
        expect(container.textContent).not.toContain("announced at launch");
    });

    it("reads the headline whole and has the anchors other pages link to", async () => {
        const { container } = render(await HomePage());
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Your website and orders, sorted before you open.",
            }),
        ).toBeTruthy();
        for (const id of [
            "features",
            "solutions",
            "pricing",
            "faq",
            "online",
            "orders",
            "money",
            "day",
        ]) {
            expect(container.querySelector(`#${id}`)).not.toBeNull();
        }
        expect(metadata.alternates?.canonical).toBe("/");
    });

    it("lists the shown features, Dashboard first, and the four solutions", async () => {
        const { container } = render(await HomePage());
        const features = container.querySelector("#features");
        const hrefs = Array.from(features?.querySelectorAll("a") ?? []).map(
            (a) => a.getAttribute("href"),
        );
        expect(hrefs).toEqual(featureList.map((f) => `/features/${f.slug}`));
        expect(hrefs[0]).toBe("/features/dashboard");
        // The "Works for" chips, and each trade's card folded under them.
        const solutions = container.querySelector("#solutions");
        expect(
            new Set(
                Array.from(solutions?.querySelectorAll("a") ?? []).map((a) =>
                    a.getAttribute("href"),
                ),
            ),
        ).toEqual(new Set(SOLUTION_SLUGS.map((s) => `/solutions/${s}`)));
        const worksFor = screen.getByRole("navigation", { name: "Works for" });
        expect(within(worksFor).getAllByRole("link")).toHaveLength(4);
    });

    it("no tour video: no 'See it in action' and no #video", async () => {
        const { container } = render(await HomePage());
        expect(container.textContent).not.toContain("See it in action");
        expect(container.querySelector("#video")).toBeNull();
    });

    it("without a catalogue: the plan line, no plan cards, no figure and no price", async () => {
        const { container } = render(await HomePage());
        const pricing = section(container, "pricing");
        // The plan cards are /pricing's (PlanLine, DEC-221).
        expect(pricing.querySelectorAll("[data-plan]")).toHaveLength(0);
        expect(pricing.textContent).toContain(
            "Set up free. Move up when you need more.",
        );
        expect(
            within(pricing).getByRole("link", { name: /Compare plans/ }),
        ).toBeTruthy();
        expect(pricing.textContent).not.toMatch(/\d/);
        expect(section(container, "faq").textContent).not.toMatch(RUPEE);
        expect(ldText(container)).not.toMatch(RUPEE);
    });

    it("with a catalogue: the free plan's own line and the worded answer, still no price drawn", async () => {
        read.catalog = fakeCatalog();
        const { container } = render(await HomePage());
        const pricing = section(container, "pricing");
        expect(pricing.textContent).toContain(freePlanLine(fakeCatalog()));
        expect(pricing.textContent).not.toMatch(RUPEE);
        const faq = within(section(container, "faq"));
        expect(faq.getByText(/^The Plan A plan is/)).toBeTruthy();
    });

    it("keeps every question in the markup, a phone folding all but three", async () => {
        const { container } = render(await HomePage());
        const rows = section(container, "faq").querySelectorAll(
            "details:not([data-more])",
        );
        // AI apps' question shows while AI apps does (on under next dev).
        expect(rows.length).toBe(
            HOME_FAQ.filter(
                (id) =>
                    id !== "ai-apps" ||
                    featureList.some((f) => f.slug === "ai-apps"),
            ).length,
        );
        for (const row of Array.from(rows).slice(3)) {
            expect(row.parentElement?.parentElement?.className).toContain(
                "max-[759px]:hidden",
            );
        }
        expect(
            section(container, "faq").querySelector("details[data-more]"),
        ).not.toBeNull();
    });

    it("sends the answers it draws, the worded one too, as a FAQPage", async () => {
        read.catalog = fakeCatalog();
        const { container } = render(await HomePage());
        const drawn = Array.from(
            section(container, "faq").querySelectorAll(
                "details:not([data-more])",
            ),
        ).map((d) => ({
            "@type": "Question",
            name: d.querySelector("summary")?.textContent,
            acceptedAnswer: {
                "@type": "Answer",
                text: d.querySelector("p")?.textContent,
            },
        }));
        const sent = JSON.parse(
            container.querySelector('script[type="application/ld+json"]')
                ?.textContent ?? "[]",
        ) as Record<string, unknown>[];
        const faq = sent.find((d) => d["@type"] === "FAQPage");
        expect(faq?.mainEntity).toEqual(drawn);
        expect(JSON.stringify(faq)).toContain("The Plan A plan is");
    });
});
