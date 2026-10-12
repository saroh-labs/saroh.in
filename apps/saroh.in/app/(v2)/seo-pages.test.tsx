// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { features } from "@/content/features";
import { home } from "@/content/home";
import { solutions } from "@/content/solutions";
import { WAITLIST_PAGE } from "@/content/waitlist";

// The first test loads the whole page, which takes several seconds on a
// loaded machine (CI, 12 Oct 2026): past the default five, a timeout there
// fails it and leaves the page mounted for every test after.
vi.setConfig({ testTimeout: 20_000 });

/**
 * The pages as a search engine meets them before launch (12 Oct 2026): the
 * two new pages in waitlist mode, Home and the waitlist with an h1 each,
 * the link preview page built once as a file, and the structured data each
 * page sends. `open-mode.test.tsx` holds the same pages after launch.
 */
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/lib/pricing", () => ({
    readLivePricing: () => Promise.resolve(null),
}));
vi.mock("@/lib/launch-offer", () => ({
    readLaunchOffer: () => Promise.resolve(null),
}));
vi.mock("next/navigation", () => ({
    usePathname: () => "/",
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
vi.mock("next/font/local", () => ({
    default: () => ({ variable: "font-local", className: "font-local" }),
}));

afterEach(cleanup);

const slug = (s: string) => ({ params: Promise.resolve({ slug: s }) });

/** What a visitor reads: the page without its JSON-LD. */
function words(container: HTMLElement): string {
    const copy = container.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("script").forEach((s) => s.remove());
    return copy.textContent;
}

/** Every JSON-LD object the page sends. */
function jsonLd(container: HTMLElement): Record<string, unknown>[] {
    return Array.from(
        container.querySelectorAll('script[type="application/ld+json"]'),
    ).flatMap((s) => {
        const data = JSON.parse(s.textContent) as unknown;
        return (Array.isArray(data) ? data : [data]) as Record<
            string,
            unknown
        >[];
    });
}

/** A plan's name, a price or a way to a plan. */
const PLAN_WORDS =
    /paid plan|\bGrow\b|\bPro\b|Free plan|upgrade|per month|a month|₹|pricing/i;

describe("/features/website, before launch", () => {
    async function page() {
        const { default: FeaturePage } = await import("./features/[slug]/page");
        return render(await FeaturePage(slug("website")));
    }

    it("has one h1, its breadcrumb and the category in its first screen", async () => {
        const { container } = await page();
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
            features.website.headline,
        );
        const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(
            within(crumb).getByText("Website").getAttribute("aria-current"),
        ).toBe("page");
        expect(words(container).toLowerCase()).toContain("website builder");
    });

    it("draws its steps with a demo business's own site and booking page", async () => {
        const { container } = await page();
        expect(
            Array.from(container.querySelectorAll("[data-shot]")).map((el) =>
                el.getAttribute("data-shot"),
            ),
        ).toEqual(["g-site", "d-site", "g-book"]);
    });

    it("names no plan and no price: the own-domain note waits for launch", async () => {
        const { container } = await page();
        const said = words(container);
        expect(said).toContain("Your own domain");
        expect(said).not.toContain("comes with a paid plan");
        // The page's own words; the band and the line under the hero are
        // the site's, and say only "free" and "move up".
        const own = JSON.stringify({
            ...features.website,
            points: features.website.points.map(({ openNote: _, ...p }) => p),
        });
        expect(own).not.toMatch(PLAN_WORDS);
        expect(container.querySelector('a[href^="/pricing"]')).toBeNull();
    });

    it("says nothing about a template, in either mode's words (DEC-135)", async () => {
        const { container } = await page();
        expect(words(container)).not.toMatch(/template/i);
        expect(JSON.stringify(features.website)).not.toMatch(/template/i);
    });

    it("claims nothing that waits for a switch: no shop, no account area, no second language", () => {
        const own = JSON.stringify(features.website);
        expect(own).not.toMatch(
            /checkout|\bbag\b|basket|online shop|sell online|Hindi|reminder|their account area|move or cancel/i,
        );
    });

    it("sends its breadcrumb as structured data, and nothing about price", async () => {
        const { container } = await page();
        const [trail] = jsonLd(container);
        expect(trail["@type"]).toBe("BreadcrumbList");
        expect(JSON.stringify(trail)).toContain(
            "https://www.saroh.in/features/website",
        );
        expect(container.innerHTML).not.toContain('"offers"');
    });
});

describe("/solutions/salons, before launch", () => {
    async function page() {
        const { default: SolutionPage } =
            await import("./solutions/[slug]/page");
        return render(await SolutionPage(slug("salons")));
    }

    it("has one h1 and says salon booking software in its first screen", async () => {
        const { container } = await page();
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
            solutions.salons.headline,
        );
        expect(words(container)).toContain("Salon booking software");
    });

    it("works without a screenshot: no frame, no placeholder, every problem still drawn", async () => {
        const { container } = await page();
        expect(container.querySelectorAll("[data-shot]")).toHaveLength(0);
        expect(container.querySelectorAll("img, [role='img']")).toHaveLength(0);
        for (const seg of solutions.salons.segments) {
            expect(
                screen.getByRole("heading", { level: 3, name: seg.title }),
            ).toBeTruthy();
        }
        // Not a copy of another trade's page.
        const others = [
            solutions.gyms,
            solutions.clinics,
            solutions.shops,
        ].flatMap((s) => s.segments.map((seg) => seg.title));
        for (const seg of solutions.salons.segments) {
            expect(others).not.toContain(seg.title);
        }
    });

    it("links each area's feature once, the Website page among them", async () => {
        const { container } = await page();
        const hrefs = Array.from(container.querySelectorAll("a"))
            .map((a) => a.getAttribute("href") ?? "")
            .filter((h) => h.startsWith("/features/"));
        expect(hrefs).toEqual([
            "/features/dashboard",
            "/features/bookings",
            "/features/customers",
            "/features/billing",
            "/features/website",
        ]);
    });

    it("draws no plan section and names no price before launch", async () => {
        const { container } = await page();
        expect(words(container)).not.toContain(solutions.salons.pricing.title);
        expect(container.querySelector("[data-plan]")).toBeNull();
        expect(container.querySelector('a[href^="/pricing"]')).toBeNull();
        const { pricing: _, ...own } = solutions.salons;
        expect(JSON.stringify(own)).not.toMatch(PLAN_WORDS);
    });

    it("says nothing about a template (DEC-135)", async () => {
        const { container } = await page();
        expect(words(container)).not.toMatch(/template/i);
        expect(JSON.stringify(solutions.salons)).not.toMatch(/template/i);
    });

    it("promises no reminder and no membership for one-to-one services", () => {
        const own = JSON.stringify(solutions.salons);
        expect(own).not.toMatch(/remind|WhatsApp message|SMS|membership/i);
    });
});

describe("Home and the waitlist", () => {
    it("each has one h1, and they are not the same words", async () => {
        const { default: HomePage } = await import("./page");
        render(await HomePage());
        const homeH1 = screen.getAllByRole("heading", { level: 1 });
        expect(homeH1).toHaveLength(1);
        expect(homeH1[0].getAttribute("aria-label")).toBe(home.headlineLabel);
        cleanup();

        const { default: WaitlistPage } =
            await import("../(standalone)/waitlist/page");
        render(await WaitlistPage());
        const waitlistH1 = screen.getAllByRole("heading", { level: 1 });
        expect(waitlistH1).toHaveLength(1);
        expect(waitlistH1[0].textContent).toBe(WAITLIST_PAGE.h1);
        expect(waitlistH1[0].textContent).not.toBe(home.headlineLabel);
        // The acronym line is still drawn, as the design has it.
        expect(
            screen.getByText(
                (_, el) =>
                    el?.tagName === "P" &&
                    el.textContent === home.headlineLabel,
            ),
        ).toBeTruthy();
    });

    it("Home says its category above the headline", async () => {
        const { default: HomePage } = await import("./page");
        const { container } = render(await HomePage());
        expect(words(container)).toContain("Small business software");
    });

    it("Home sends who makes Saroh and the site itself, with only set facts", async () => {
        const { default: HomePage } = await import("./page");
        const { container } = render(await HomePage());
        const sent = jsonLd(container);
        expect(sent.map((d) => d["@type"])).toEqual([
            "Organization",
            "WebSite",
            "SoftwareApplication",
        ]);
        const all = JSON.stringify(sent);
        expect(all).toContain("Virashi Softwares LLP");
        expect(all).toContain("contact@saroh.in");
        expect(all).not.toMatch(
            /"offers"|"price"|aggregateRating|"review"|telephone|GSTIN|LLPIN/,
        );
    });
});

describe("About and Contact", () => {
    it.each(["about", "contact"])(
        "/%s sends the organization, with no number that isn't published",
        async (name) => {
            const route = (await import(`./${name}/page`)) as {
                default: () => React.ReactElement;
            };
            const { container } = render(route.default());
            const sent = jsonLd(container);
            expect(sent.map((d) => d["@type"])).toEqual(["Organization"]);
            expect(sent[0].legalName).toBe("Virashi Softwares LLP");
            expect(JSON.stringify(sent)).not.toMatch(
                /telephone|GSTIN|LLPIN|"offers"|"price"/,
            );
        },
    );
});

describe("/tools/link-preview", () => {
    it("takes no searchParams and awaits nothing, so it is built once as a file", async () => {
        const route = await import("./tools/link-preview/page");
        const Page = route.default as (...args: unknown[]) => unknown;
        // No props: no `searchParams` to make the route dynamic.
        expect(Page.length).toBe(0);
        const drawn = Page();
        expect(drawn).not.toBeInstanceOf(Promise);
        expect("dynamic" in route).toBe(false);
        expect("revalidate" in route).toBe(false);
    });

    it("keeps its canonical on the clean address", async () => {
        const { metadata } = await import("./tools/link-preview/page");
        expect(metadata.alternates?.canonical).toBe("/tools/link-preview");
        expect(metadata.title).toBe(
            "Link preview checker for WhatsApp and Facebook · Saroh",
        );
    });

    it("draws the tool empty, whatever the address", async () => {
        window.history.replaceState(null, "", "/tools/link-preview");
        const { default: Page } = await import("./tools/link-preview/page");
        render((Page as () => React.ReactElement)());
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getByText("Not sure? Try one:")).toBeTruthy();
    });
});
