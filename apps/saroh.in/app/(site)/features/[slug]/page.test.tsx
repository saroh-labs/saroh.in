// @vitest-environment jsdom
import { shownFeatures } from "@saroh/marketing/feature-switches";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { featureList, features } from "@/content/features";
import { SOLUTION_SLUGS } from "@/content/types";
import { featuresOff } from "@/lib/feature-switches";

import FeaturePage, { generateMetadata, generateStaticParams } from "./page";

// jsdom reads as a browser, so the server env is mocked: no preview, and
// no built-routes list (every route counts as built). Every release switch
// is off (unset outside `next dev`) unless a test sets one.
const env = vi.hoisted((): Record<string, string | undefined> => ({}));
vi.mock("@/env", () => ({ env }));
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

function found<T>(x: T | null | undefined): T {
    if (x == null) throw new Error("not found");
    return x;
}

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    for (const key of Object.keys(env)) delete env[key];
});

/** The page as it renders at `iso` (no preview; every route counts as built). */
async function renderAt(slug: string, iso: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    return render(await FeaturePage(params(slug)));
}

describe("/features/[slug]", () => {
    it("builds the shown feature pages and nothing else", () => {
        expect(generateStaticParams()).toEqual(
            shownFeatures(featuresOff()).map((slug) => ({ slug })),
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
            ...featureList.map((f) => `/features/${f.slug}`),
            ...SOLUTION_SLUGS.map((s) => `/solutions/${s}`),
        ]);
        for (const { slug } of featureList) {
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
        // The search title is the plain category, the brand last; the
        // share card keeps the page's own headline.
        expect(meta.title).toBe(
            "Order management software for small business · Saroh",
        );
        expect(meta.description).toBe(features.orders.seoDescription);
        expect(meta.alternates?.canonical).toBe("/features/orders");
        expect(meta.openGraph?.title).toBe(
            "Orders: Every order in one list, and none slip.",
        );
    });

    describe("Website's templates section (DEC-216, board VSWebsite)", () => {
        const section = () =>
            screen
                .queryByRole("heading", {
                    level: 2,
                    name: "Pick a template for your trade.",
                })
                ?.closest("section");

        it("is absent while templates are off, today's production", async () => {
            render(await FeaturePage(params("website")));
            expect(section()).toBeFalsy();
            expect(document.querySelector('a[href="/templates"]')).toBeNull();
        });

        it("sits between How it works and What it does when on, linking to /templates", async () => {
            env.NEXT_PUBLIC_TEMPLATES = "on";
            render(await FeaturePage(params("website")));
            const s = found(section());
            const how = found(
                screen
                    .getByRole("heading", { name: features.website.howTitle })
                    .closest("section"),
            );
            const what = found(
                screen
                    .getByRole("heading", { name: "What it does" })
                    .closest("section"),
            );
            const after = (a: Node, b: Node) =>
                Boolean(
                    a.compareDocumentPosition(b) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
                );
            expect(after(how, s)).toBe(true);
            expect(after(s, what)).toBe(true);
            expect(
                within(s)
                    .getByRole("link", { name: /See every template/ })
                    .getAttribute("href"),
            ).toBe("/templates");
            // Three points, and the two drawings say what they are.
            expect(s.querySelectorAll("ul > li")).toHaveLength(3);
            expect(s.querySelectorAll("figure figcaption")).toHaveLength(2);
        });

        it("draws only gallery templates, and claims no lossless switching", async () => {
            const { galleryTemplate } = await import("@/content/templates");
            const words = found(features.website.templates);
            for (const slug of words.picks) {
                expect(galleryTemplate(slug), slug).toBeTruthy();
            }
            expect(JSON.stringify(words)).not.toMatch(
                /without losing|any ?time/i,
            );
        });
    });

    it("/features/social and /features/ask-ai render every step", async () => {
        for (const slug of ["social", "ask-ai"] as const) {
            const { unmount } = render(await FeaturePage(params(slug)));
            const how = screen
                .getByRole("heading", { name: features[slug].howTitle })
                .closest("section");
            expect(how?.querySelectorAll("ol > li")).toHaveLength(
                features[slug].steps.length,
            );
            unmount();
        }
    });

    describe("/features/ai-apps (board VFAiApps)", () => {
        it("is not built while AI apps is off", () => {
            expect(generateStaticParams()).not.toContainEqual({
                slug: "ai-apps",
            });
        });

        it("draws the hero and step 3 as chats, the rest as shots", async () => {
            env.NEXT_PUBLIC_AI_APPS = "on";
            const { container } = render(await FeaturePage(params("ai-apps")));
            const chats = container.querySelectorAll("figure[data-chat]");
            expect(chats).toHaveLength(2);
            expect(chats[0].textContent).toContain("Draft to publish");
            expect(chats[1].textContent).toContain("Changed at once");
            expect(container.querySelector('[data-shot="ai-hero"]')).toBeNull();
            const how = found(
                screen
                    .getByRole("heading", {
                        name: features["ai-apps"].howTitle,
                    })
                    .closest("section"),
            );
            expect(how.querySelectorAll("ol > li")).toHaveLength(4);
            expect(how.querySelectorAll("[data-shot]")).toHaveLength(3);
        });

        it("lists only the live AI apps under Apps you can use", async () => {
            env.NEXT_PUBLIC_AI_APPS = "on";
            const { liveIntegrations, shownIntegrations } =
                await import("@/content/integrations");
            render(await FeaturePage(params("ai-apps")));
            const s = found(
                screen
                    .getByRole("heading", {
                        level: 2,
                        name: "Apps you can use",
                    })
                    .closest("section"),
            );
            const live = shownIntegrations([]).filter(
                (c) => c.category === "AI apps",
            );
            const hrefs = Array.from(s.querySelectorAll("li a")).map((a) =>
                a.getAttribute("href"),
            );
            expect(hrefs).toEqual(live.map((c) => c.href));
            // A card not walked on dev is never listed.
            for (const c of liveIntegrations.filter(
                (x) => x.category === "AI apps" && !x.liveOnDev,
            )) {
                expect(hrefs).not.toContain(c.href);
            }
            expect(s.textContent).toContain("Gemini CLI");
        });

        it("other feature pages have no app list", async () => {
            render(await FeaturePage(params("bookings")));
            expect(
                screen.queryByRole("heading", { name: "Apps you can use" }),
            ).toBeNull();
        });
    });

    it("Works with never links a switched-off feature", async () => {
        // Ask AI works with AI apps; with AI apps off the card is not drawn.
        expect(features["ask-ai"].worksWith).toContain("ai-apps");
        const { container } = render(await FeaturePage(params("ask-ai")));
        const shown = new Set(featureList.map((f) => `/features/${f.slug}`));
        for (const a of container.querySelectorAll('a[href^="/features/"]')) {
            expect(shown).toContain(a.getAttribute("href"));
        }
    });
});
