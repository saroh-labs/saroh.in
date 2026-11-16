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
                // jsdom spaces out the Saffron mark's span; a browser doesn't.
                name: /^Invoices you don't have to write ?\.$/,
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
            // No "Used by" or "Works with" chips any more (BUGS #37-#39): a page
            // may link no other feature or trade, but never a missing one.
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

        it("folds its words under the looks when on, linking to /templates", async () => {
            env.NEXT_PUBLIC_TEMPLATES = "on";
            const { container } = render(await FeaturePage(params("website")));
            const words = found(features.website.templates);
            // The redesign (FWDesk) folds the section into the looks: its
            // title is the fold's label, its lead and points inside it.
            const fold = found(
                Array.from(container.querySelectorAll("details")).find((d) =>
                    d
                        .querySelector("summary")
                        ?.textContent.includes(words.title),
                ),
            );
            expect(fold.textContent).toContain(words.lead);
            expect(fold.querySelectorAll("ul > li")).toHaveLength(
                words.points.length,
            );
            expect(
                within(fold as HTMLElement)
                    .getByRole("link", { name: /See every template/ })
                    .getAttribute("href"),
            ).toBe("/templates");
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

    it("/features/social draws every step's picture in the HTML (Steps A)", async () => {
        render(await FeaturePage(params("social")));
        const how = found(
            screen
                .getByRole("heading", { name: features.social.howTitle })
                .closest("section"),
        );
        // Four steps, no heading-only card, each picture under its step.
        expect(how.querySelector("ol")?.children).toHaveLength(4);
        const pictures = how.querySelectorAll("[data-step-picture]");
        expect(pictures).toHaveLength(4);
        for (const p of Array.from(pictures))
            expect(p.textContent.trim() || p.querySelector("img")).toBeTruthy();
        // Share's are its captured shots.
        expect(
            Array.from(how.querySelectorAll("[data-shot]")).map((el) =>
                el.getAttribute("data-shot"),
            ),
        ).toEqual(features.social.steps.map((st) => st.shot));
    });

    it("/features/ask-ai plays one drawn conversation through its steps, whole in the HTML (overdrive, #49)", async () => {
        render(await FeaturePage(params("ask-ai")));
        const how = found(
            screen
                .getByRole("heading", { name: features["ask-ai"].howTitle })
                .closest("section"),
        );
        // Four steps, every step's words, one panel and no captured shot.
        expect(how.querySelector("ol")?.children).toHaveLength(4);
        for (const st of features["ask-ai"].steps)
            expect(how.textContent).toContain(st.title);
        expect(how.querySelectorAll("[data-step-picture]")).toHaveLength(0);
        expect(how.querySelectorAll("[data-shot]")).toHaveLength(0);
        const panel = found(how.querySelector("[data-step-panel]"));
        expect(panel.getAttribute("role")).toBe("region");
        // The finished story: the answer's rows, two of them Ready (and the card's "Then"), and the card done.
        expect(panel.textContent).toContain("ORD-1046");
        expect(panel.textContent).toContain("Mark as ready for pick-up");
        expect(panel.textContent.match(/Ready/g)?.length).toBe(3);
        expect(panel.textContent).toContain("Undo");
    });

    describe("/features/ai-apps (board VFAiApps)", () => {
        it("is not built while AI apps is off", () => {
            expect(generateStaticParams()).not.toContainEqual({
                slug: "ai-apps",
            });
        });

        it("How it works is one section: Saroh's address with Copy, the steps and each app's guide (variant I)", async () => {
            env.NEXT_PUBLIC_AI_APPS = "on";
            render(await FeaturePage(params("ai-apps")));
            const how = found(
                screen
                    .getByRole("heading", {
                        level: 2,
                        name: features["ai-apps"].howTitle,
                    })
                    .closest("section"),
            );
            // Shown without https://, copied whole.
            expect(how.querySelector("code")?.textContent).toBe(
                "mcp.saroh.in/mcp",
            );
            expect(
                within(how).getByRole("button", { name: "Copy" }),
            ).toBeTruthy();
            expect(
                Array.from(how.querySelectorAll("ol > li h3")).map(
                    (h) => h.textContent,
                ),
            ).toEqual(features["ai-apps"].steps.map((st) => st.title));
            // No pictures in it now, and no separate app list after it.
            expect(how.querySelectorAll("[data-step-picture]")).toHaveLength(0);
            expect(
                screen.queryByRole("heading", { name: "Apps you can use" }),
            ).toBeNull();
            expect(how.textContent).toContain("Gemini CLI");
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
