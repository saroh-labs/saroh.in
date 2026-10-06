import type {
    RenderedBooking,
    RenderedContact,
    RenderedCtaSection,
    RenderedEnquiry,
    RenderedFaq,
    RenderedFeatures,
    RenderedGallery,
    RenderedHero,
    RenderedJournal,
    RenderedPacks,
    RenderedPlans,
    RenderedProductGrid,
    RenderedProjects,
    RenderedRichText,
    RenderedServicesList,
    RenderedTestimonials,
    RenderedVisitUs,
} from "@saroh/block-contract";
import { BLOCK_META, blockFixture } from "@saroh/block-contract";
import { act, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
    SAMPLE_PACKS,
    SAMPLE_PLANS,
    SAMPLE_POSTS,
    SAMPLE_PRODUCTS,
    SAMPLE_VISIT,
} from "./block-fixture-preview";
import BookingSection from "./blocks/booking";
import ContactSection from "./blocks/contact";
import CtaSection from "./blocks/cta";
import EnquirySection from "./blocks/enquiry";
import FaqSection from "./blocks/faq";
import FeaturesSection from "./blocks/features";
import GallerySection from "./blocks/gallery";
import HeroSection from "./blocks/hero";
import JournalSection from "./blocks/journal";
import PacksSection from "./blocks/packs";
import PlansSection from "./blocks/plans";
import ProductGridSection from "./blocks/product-grid";
import ProjectsSection from "./blocks/projects";
import RichTextSection from "./blocks/rich-text";
import ServicesListSection from "./blocks/services-list";
import TestimonialsSection from "./blocks/testimonials";
import VisitUsSection from "./blocks/visit-us";
import BookingFlow from "./booking-flow/booking-flow";
import type { BookingPageData } from "./booking-flow/model";
import { ModulePageUnavailable } from "./module-page-unavailable";
import { SiteTheme } from "./site-theme";
import { SITE_FONT_STACK, siteFontFamily } from "./tailwind-preset";

/**
 * Gate G5 (#252) — what these blocks draw must not change.
 *
 * They moved out of `apps/saroh.app/components/sections/` into this package,
 * and that path serves every published merchant site. A publication is
 * immutable: a site published last year renders through this code today, so a
 * change here is a change to pages their owners can no longer edit.
 *
 * The move itself was verbatim — `git mv`, then import lines only — so the diff
 * is its own proof. These snapshots are what protects the property AFTERWARDS,
 * when the next person edits a block for a good reason and does not realise
 * they moved a heading. A snapshot changing is not a failure; a snapshot
 * changing without anyone noticing is.
 *
 * Fixtures come from `@saroh/block-contract` — the same ones the catalog
 * previews and CI parses against each block's schema. One example, three jobs.
 */
describe("block rendering", () => {
    /*
     * The booking block asks for availability on mount now that its fixture
     * names a Service. Stubbed rather than left to hit the network: a snapshot
     * suite that depends on an API being up is a suite that fails for reasons
     * that have nothing to do with the markup.
     *
     * It resolves to no slots, which is the state the catalog shows too — the
     * fixture's Service id belongs to no Service.
     */
    const realFetch = globalThis.fetch;
    beforeAll(() => {
        globalThis.fetch = vi.fn(() =>
            Promise.resolve(
                // A BARE ARRAY: that is what the availability endpoint
                // returns. The first version of this stub sent
                // `{ slots: [] }` and the component crashed with "slots is not
                // iterable" — see #264, which is that crash, not this stub.
                new Response(JSON.stringify([]), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            ),
        );
    });
    afterAll(() => {
        globalThis.fetch = realFetch;
    });

    it("hero/centered", () => {
        const { container } = render(
            <HeroSection
                content={BLOCK_META.hero.fixtures.centered as RenderedHero}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("hero/split", () => {
        const { container } = render(
            <HeroSection
                content={BLOCK_META.hero.fixtures.split as RenderedHero}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("richText", () => {
        const { container } = render(
            <RichTextSection
                content={
                    BLOCK_META.richText.fixtures.default as RenderedRichText
                }
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    describe("richText with a photo (G7)", () => {
        const photo = BLOCK_META.richText.cases.photo as RenderedRichText;

        it("draws the photo beside the text, stacking on phones", () => {
            const { container } = render(<RichTextSection content={photo} />);
            expect(container.innerHTML).toMatchSnapshot();
            const img = screen.getByRole("img", {
                name: "The bakery counter at opening time",
            });
            expect(img.getAttribute("src")).toBe(photo.image?.src);
            // One column on a phone, two from md up.
            expect(img.parentElement?.className).toContain("md:grid-cols-2");
            expect(img.parentElement?.className).not.toMatch(
                /(^|\s)grid-cols-2/,
            );
        });

        it("puts the photo first on the left, last on the right", () => {
            const { rerender } = render(<RichTextSection content={photo} />);
            expect(screen.getByRole("img").className).not.toContain(
                "md:order-last",
            );
            rerender(
                <RichTextSection content={{ ...photo, imageSide: "right" }} />,
            );
            expect(screen.getByRole("img").className).toContain(
                "md:order-last",
            );
            // No side named is the right.
            rerender(
                <RichTextSection
                    content={{ ...photo, imageSide: undefined }}
                />,
            );
            expect(screen.getByRole("img").className).toContain(
                "md:order-last",
            );
        });

        it("draws exactly the old single column without a photo", () => {
            const plain = render(
                <RichTextSection
                    content={
                        BLOCK_META.richText.fixtures.default as RenderedRichText
                    }
                />,
            ).container.innerHTML;
            const sided = render(
                <RichTextSection
                    content={{
                        ...(BLOCK_META.richText.fixtures
                            .default as RenderedRichText),
                        imageSide: "left",
                    }}
                />,
            ).container.innerHTML;
            expect(sided).toBe(plain);
            expect(plain).not.toContain("<img");
        });
    });

    it("cta", () => {
        const { container } = render(
            <CtaSection
                content={BLOCK_META.cta.fixtures.default as RenderedCtaSection}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    // `blockFixture` narrows the literal-keyed fixture map, so a look id
    // coming from an array does not need a cast at every call site.
    // One per look: what changes between them is the arrangement, not the
    // content, so a snapshot each is what proves the variant does anything.
    it.each(["grid", "carousel", "masonry"])("gallery/%s", (look) => {
        const { container } = render(
            <GallerySection
                content={blockFixture("gallery", look) as RenderedGallery}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    /*
     * The #254 guarantee that matters most: a gallery@1 section carries
     * `layout` and no `variant`, and must keep the look it was published with.
     * Defaulting it to `grid` would silently restyle every published carousel.
     */
    it("renders a gallery@1 section on its old `layout` field", () => {
        const legacy = {
            layout: "carousel",
            images: [...BLOCK_META.gallery.fixtures.grid.images],
        };
        const { container } = render(
            <GallerySection content={legacy as unknown as RenderedGallery} />,
        );
        expect(container.innerHTML).toContain("snap-x");
    });

    /*
     * And the hero equivalent: a hero with an image and no variant was
     * two-column before #254 and must stay so. `centered` is hero's FIRST
     * declared variant, so a naive default would have flipped every published
     * hero carrying an image.
     */
    it("renders a variant-less hero with an image as split", () => {
        const legacy = {
            heading: "Fresh bread",
            image: { src: "data:image/svg+xml;utf8,%3Csvg/%3E", alt: "" },
        };
        const { container } = render(
            <HeroSection content={legacy as unknown as RenderedHero} />,
        );
        expect(container.innerHTML).toContain("lg:grid-cols-2");
    });

    it("enquiry", () => {
        const { container } = render(
            <EnquirySection
                content={BLOCK_META.enquiry.fixtures.default as RenderedEnquiry}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    // Async because the slot loader settles in an effect even with no
    // `serviceId` — it resolves straight to "ready, no slots" rather than
    // fetching, but it still lands after mount.
    it("booking", async () => {
        const { container } = render(
            <BookingSection
                content={BLOCK_META.booking.fixtures.default as RenderedBooking}
            />,
        );
        await act(async () => {
            await Promise.resolve();
        });
        expect(container.innerHTML).toMatchSnapshot();
    });

    it.each(["grid", "list", "steps"])("features/%s", (look) => {
        const { container } = render(
            <FeaturesSection
                content={blockFixture("features", look) as RenderedFeatures}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    /*
     * The two looks must actually differ. A variant system whose variants draw
     * the same markup is a field nobody needs — and the catalog would be
     * showing two pictures of one thing.
     */
    it("draws the two features looks differently", () => {
        const grid = render(
            <FeaturesSection
                content={blockFixture("features", "grid") as RenderedFeatures}
            />,
        ).container.innerHTML;
        const list = render(
            <FeaturesSection
                content={blockFixture("features", "list") as RenderedFeatures}
            />,
        ).container.innerHTML;
        expect(grid).toContain("lg:grid-cols-3");
        expect(list).not.toContain("lg:grid-cols-3");
    });

    it.each(["cards", "list"])("projects/%s", (look) => {
        const { container } = render(
            <ProjectsSection
                content={blockFixture("projects", look) as RenderedProjects}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("draws the two projects looks differently", () => {
        const cards = render(
            <ProjectsSection
                content={blockFixture("projects", "cards") as RenderedProjects}
            />,
        ).container.innerHTML;
        const list = render(
            <ProjectsSection
                content={blockFixture("projects", "list") as RenderedProjects}
            />,
        ).container.innerHTML;
        expect(cards).toContain("auto-fill");
        expect(list).not.toContain("auto-fill");
    });

    it("faq", () => {
        const { container } = render(
            <FaqSection
                content={BLOCK_META.faq.fixtures.default as RenderedFaq}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("testimonials", () => {
        const { container } = render(
            <TestimonialsSection
                content={
                    BLOCK_META.testimonials.fixtures
                        .default as RenderedTestimonials
                }
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("contact", () => {
        const { container } = render(
            <ContactSection
                content={BLOCK_META.contact.fixtures.default as RenderedContact}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    /*
     * Contact builds its links rather than drawing authored hrefs. These are the
     * ones a visitor taps, so they are asserted, not left to a snapshot.
     */
    it("builds the contact links a visitor taps", () => {
        const { container } = render(
            <ContactSection
                content={BLOCK_META.contact.fixtures.default as RenderedContact}
            />,
        );
        const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
            a.getAttribute("href"),
        );
        expect(hrefs).toEqual([
            "https://www.google.com/maps/search/?api=1&query=Unit%204%2C%20Riverside%20Trade%20Park%2C%20Leeds%20LS10%201AB",
            "tel:+441134960000",
            "mailto:hello@example.com",
            "https://wa.me/447700900000",
        ]);
    });

    it("keeps a map link that has no address beside it", () => {
        const { container } = render(
            <ContactSection
                content={{
                    phone: "+44 113 496 0000",
                    mapUrl: "https://maps.example.com/?q=riverside",
                }}
            />,
        );
        const link = container.querySelector(
            'a[href="https://maps.example.com/?q=riverside"]',
        );
        expect(link?.textContent).toBe("Open in maps");
    });

    it("draws no map link from an unsafe snapshot value", () => {
        const { container } = render(
            <ContactSection
                content={{
                    phone: "+44 113 496 0000",
                    mapUrl: "javascript:alert(1)",
                }}
            />,
        );
        expect(container.innerHTML).not.toContain("javascript:");
    });

    // Sample services rather than a fetch: fixture ids belong to no Service.
    it("servicesList", () => {
        const { container } = render(
            <ServicesListSection
                content={
                    BLOCK_META.servicesList.fixtures
                        .default as RenderedServicesList
                }
                services={[
                    {
                        id: "fixture-cut",
                        name: "Cut and finish",
                        description: "Wash, cut and blow-dry.",
                        durationMinutes: 45,
                        priceCents: 3800,
                        currency: "GBP",
                    },
                ]}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    // A sample place rather than a fetch, and a pinned clock: "Open now"
    // depends on the moment. Friday 25 Sep 2026, 10:00 in London.
    it("visitUs", () => {
        const { container } = render(
            <VisitUsSection
                content={BLOCK_META.visitUs.fixtures.default as RenderedVisitUs}
                visit={SAMPLE_VISIT}
                now={new Date("2026-09-25T09:00:00Z")}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    // Sample posts rather than a fetch: the page serving the site reads them
    // and hands them in (G10).
    it("journal", () => {
        const { container } = render(
            <JournalSection
                content={BLOCK_META.journal.fixtures.default as RenderedJournal}
                feed={{ posts: SAMPLE_POSTS, basePath: "/blog" }}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("journal, words only", () => {
        const { container } = render(
            <JournalSection
                content={BLOCK_META.journal.cases.plain as RenderedJournal}
                feed={{ posts: SAMPLE_POSTS, basePath: "/news" }}
            />,
        );
        expect(container.querySelector("img")).toBeNull();
        expect(container.innerHTML).toMatchSnapshot();
    });

    // Sample plans rather than a fetch: the page serving the site reads them
    // and hands them in (G9).
    it("plans", () => {
        const { container } = render(
            <PlansSection
                content={BLOCK_META.plans.fixtures.default as RenderedPlans}
                feed={{ plans: SAMPLE_PLANS, joinHref: "/contact#enquiry" }}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("plans, no highlight or descriptions, the merchant's button", () => {
        const { container } = render(
            <PlansSection
                content={BLOCK_META.plans.cases.plain as RenderedPlans}
                feed={{ plans: SAMPLE_PLANS, joinHref: "/" }}
            />,
        );
        expect(screen.queryByText("Most chosen")).toBeNull();
        expect(screen.getAllByText("Ask to join")).toHaveLength(3);
        expect(container.innerHTML).toMatchSnapshot();
    });

    // Sample packs rather than a fetch: the page serving the site reads them
    // and hands them in (G20).
    it("packs", () => {
        const { container } = render(
            <PacksSection
                content={BLOCK_META.packs.fixtures.default as RenderedPacks}
                feed={{
                    packs: SAMPLE_PACKS,
                    payOnline: false,
                    askHref: "/contact#enquiry",
                }}
            />,
        );
        expect(screen.getAllByRole("listitem")).toHaveLength(2);
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("packs, no descriptions, the merchant's button", () => {
        const { container } = render(
            <PacksSection
                content={BLOCK_META.packs.cases.plain as RenderedPacks}
                feed={{
                    packs: SAMPLE_PACKS,
                    payOnline: false,
                    askHref: "/",
                }}
            />,
        );
        expect(
            screen.queryByText("Any group class, mat or reformer."),
        ).toBeNull();
        expect(screen.getAllByText("Get this pack")).toHaveLength(2);
        expect(container.innerHTML).toMatchSnapshot();
    });

    // Sample products rather than a fetch: the page serving the site reads
    // each grid's own and hands them in (G12).
    it("productGrid", () => {
        const { container } = render(
            <ProductGridSection
                content={
                    BLOCK_META.productGrid.fixtures
                        .default as RenderedProductGrid
                }
                feed={{ products: SAMPLE_PRODUCTS, basePath: "/shop" }}
            />,
        );
        expect(screen.getAllByRole("listitem")).toHaveLength(3);
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("productGrid, picked, two, no prices", () => {
        const { container } = render(
            <ProductGridSection
                content={
                    BLOCK_META.productGrid.cases.picked as RenderedProductGrid
                }
                feed={{ products: SAMPLE_PRODUCTS, basePath: "/shop" }}
            />,
        );
        expect(screen.getAllByRole("listitem")).toHaveLength(2);
        expect(screen.queryByText("₹950")).toBeNull();
        expect(container.innerHTML).toMatchSnapshot();
    });

    /**
     * The forward-compatibility property, asserted rather than assumed: a
     * snapshot published against a newer contract, carrying a section type this
     * build has never heard of, degrades to nothing instead of crashing the
     * whole page.
     */
    it("renders nothing for an unknown block type", async () => {
        const { SectionRenderer } = await import("./index");
        const { container } = render(
            <SectionRenderer
                section={{ type: "notAThing", content: { heading: "x" } }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });
});

/**
 * A merchant's site is set in the merchant's type, never Saroh's (H1).
 *
 * The booking flow set its headings in Saroh's `font-display` and `saroh.app`
 * loaded Geist and Bricolage Grotesque, so every booking page wore Saroh's
 * typography. Gate G7 keeps the class out of the code; these pin what the
 * flow draws and what an unstyled publication falls back to.
 */
describe("the merchant's type (H1)", () => {
    const PAGE: BookingPageData = {
        businessName: "Pulse Fitness",
        open: true,
        timezone: "Asia/Kolkata",
        payOnline: false,
        rules: {
            bookAheadDays: 21,
            latestBookingMinutes: 120,
            freeCancelHours: 12,
        },
        services: [
            {
                id: "svc_pt",
                name: "Personal training",
                description: null,
                durationMinutes: 60,
                kind: "one",
                capacity: 1,
                priceCents: 120_000,
                currency: "INR",
                online: false,
                staff: ["Karan Mehta"],
            },
        ],
    };

    beforeAll(() => {
        window.matchMedia = vi.fn(() => ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })) as unknown as typeof window.matchMedia;
    });

    it("sets the booking flow's headings in font-site-heading", () => {
        render(
            <BookingFlow
                page={PAGE}
                apiUrl="https://api.test"
                account={{
                    customer: null,
                    options: {
                        businessName: "Pulse Fitness",
                        phone: null,
                        challenge: { required: false, siteKey: null },
                    },
                    signIn: {
                        requestCode: () =>
                            Promise.resolve({ ok: false, reason: "error" }),
                        verifyCode: () =>
                            Promise.resolve({ ok: false, reason: "error" }),
                    },
                    book: () =>
                        Promise.resolve({ ok: false, status: 0, message: "" }),
                    signOut: () => Promise.resolve({ ok: true }),
                }}
            />,
        );
        const title = screen.getByRole("heading", {
            name: "Book your appointment",
        });
        const step = screen.getByRole("heading", {
            name: "What would you like?",
        });
        for (const heading of [title, step]) {
            expect(heading).toHaveClass("font-site-heading");
            expect(heading.className).not.toMatch(
                /\bfont-(sans|display|mono)\b/,
            );
        }
    });

    it("sets the closed booking page's heading in font-site-heading", () => {
        render(
            <BookingFlow
                page={{ ...PAGE, open: false }}
                apiUrl="https://api.test"
                account={{
                    customer: null,
                    options: {
                        businessName: "Pulse Fitness",
                        phone: null,
                        challenge: { required: false, siteKey: null },
                    },
                    signIn: {
                        requestCode: () =>
                            Promise.resolve({ ok: false, reason: "error" }),
                        verifyCode: () =>
                            Promise.resolve({ ok: false, reason: "error" }),
                    },
                    book: () =>
                        Promise.resolve({ ok: false, status: 0, message: "" }),
                    signOut: () => Promise.resolve({ ok: true }),
                }}
            />,
        );
        expect(
            screen.getByRole("heading", {
                name: "Online booking isn't open right now",
            }),
        ).toHaveClass("font-site-heading");
    });

    /*
     * A publication from before #189 carries no styleVariables at all, and no
     * publication carries a font variable yet. Both must still get a real
     * face — the neutral stack — rather than an unset variable.
     */
    it("gives a publication with no variables the neutral type tokens", () => {
        const { container } = render(<SiteTheme variables={null} />);
        const css = container.querySelector("style")?.textContent ?? "";
        expect(css).toContain(`--site-font-heading: ${SITE_FONT_STACK};`);
        expect(css).toContain(`--site-font-body: ${SITE_FONT_STACK};`);
        expect(css).not.toMatch(/Geist|Bricolage|--font-(sans|display)/);
    });

    it("keeps the type tokens beside a publication's own colours", () => {
        const { container } = render(
            <SiteTheme variables={{ "--site-bg": "40 30% 96%" }} />,
        );
        const css = container.querySelector("style")?.textContent ?? "";
        expect(css).toContain(`--site-font-heading: ${SITE_FONT_STACK};`);
        expect(css).toContain("--site-bg: 40 30% 96%;");
    });

    it("falls back to the neutral stack where no SiteTheme is mounted", () => {
        for (const family of Object.values(siteFontFamily)) {
            expect(family).toHaveLength(1);
            expect(family[0]).toMatch(
                /^var\(--site-font-(heading|body|mono), /,
            );
            expect(family[0]).toContain(SITE_FONT_STACK);
        }
        expect(SITE_FONT_STACK).toContain('"Noto Sans Devanagari"');
        expect(SITE_FONT_STACK).not.toMatch(/Geist|Bricolage|Grotesk|Mono/);
    });
});

describe("a module page whose module is off (G15)", () => {
    it("says it isn't available right now, with a link home, naming no module", () => {
        const { container } = render(
            <ModulePageUnavailable business="Pulse Fitness" />,
        );
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "This isn't available right now",
            }),
        ).toBeInTheDocument();
        expect(container.textContent).toContain(
            "Pulse Fitness isn't offering this on their site at the moment.",
        );
        expect(container.textContent).not.toMatch(
            /Appointments|Commerce|Payments|module/i,
        );
        const home = screen.getByRole("link", { name: "Go to the home page" });
        expect(home).toHaveAttribute("href", "/");
        // The site's own palette, with visible focus and pressed states.
        expect(home).toHaveClass(
            "bg-site-accent",
            "text-site-accent-fg",
            "focus-visible:ring-2",
            "active:opacity-80",
        );
    });

    it("leads home inside a preview", () => {
        render(
            <ModulePageUnavailable
                business="Pulse Fitness"
                homeHref="/preview/tok"
            />,
        );
        expect(
            screen.getByRole("link", { name: "Go to the home page" }),
        ).toHaveAttribute("href", "/preview/tok");
    });
});

/**
 * A list section's display options (G16): Show as, Photos, Descriptions,
 * Prices, Highlight and the Button, as the Site Editor sets them. Each one
 * absent is what the block drew before (the snapshots above), so only what
 * each option changes is asserted here.
 */
describe("list sections' display options (G16)", () => {
    const SERVICES = [
        {
            id: "svc-cut",
            name: "Cut and finish",
            description: "Wash, cut and blow-dry.",
            durationMinutes: 45,
            priceCents: 3800,
            currency: "INR",
        },
        {
            id: "svc-colour",
            name: "Colour",
            description: "Root to tip.",
            durationMinutes: 90,
            priceCents: 6500,
            currency: "INR",
        },
    ];
    const WITH_PHOTO = SAMPLE_PRODUCTS.map((p, i) => ({
        ...p,
        image:
            i === 0
                ? { url: "https://img.test/loaf.jpg", alt: "A loaf" }
                : null,
    }));

    it("draws services as cards whose button opens the flow at each service", () => {
        render(
            <ServicesListSection
                content={{
                    serviceIds: ["svc-cut", "svc-colour"],
                    layout: "cards",
                    buttonLabel: "Choose a time",
                }}
                services={SERVICES}
                bookHref="/book"
            />,
        );
        const cut = screen.getByRole("link", {
            name: "Choose a time: Cut and finish",
        });
        expect(cut).toHaveAttribute("href", "/book?service=svc-cut");
        expect(screen.getAllByRole("listitem")).toHaveLength(2);
        expect(screen.getByText("Wash, cut and blow-dry.")).toBeTruthy();
    });

    it("switches Services to a list without prices or descriptions", () => {
        const { container } = render(
            <ServicesListSection
                content={{
                    serviceIds: ["svc-cut"],
                    layout: "list",
                    showPrices: false,
                    showDescriptions: false,
                }}
                services={SERVICES.slice(0, 1)}
                bookHref="/book"
            />,
        );
        expect(container.textContent).not.toContain("₹");
        expect(screen.queryByText("Wash, cut and blow-dry.")).toBeNull();
        // The list keeps each service's own "Book".
        expect(
            screen.getByRole("link", { name: "Book Cut and finish" }),
        ).toHaveAttribute("href", "/book?service=svc-cut");
    });

    it("shows the merchant's button words on the editor's canvas too", () => {
        render(
            <ServicesListSection
                content={{ serviceIds: ["svc-cut"], buttonLabel: "Reserve" }}
                services={SERVICES.slice(0, 1)}
            />,
        );
        expect(screen.getByText("Reserve")).toBeTruthy();
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("lays plans out one per row, without prices and with no highlight", () => {
        const { container } = render(
            <PlansSection
                content={{
                    layout: "list",
                    showPrices: false,
                    highlight: "none",
                }}
                feed={{ plans: SAMPLE_PLANS, joinHref: "/contact" }}
            />,
        );
        expect(container.querySelector("ul")?.className).toContain(
            "grid-cols-1",
        );
        expect(container.textContent).not.toContain("350");
        expect(screen.queryByText("Most chosen")).toBeNull();
    });

    it("draws products as a list with the photo on the left", () => {
        const { container } = render(
            <ProductGridSection
                content={{ layout: "list", buttonLabel: "Add to bag" }}
                feed={{ products: WITH_PHOTO, basePath: "/shop" }}
            />,
        );
        const rows = container.querySelectorAll("li > a");
        expect(rows[0].className).toContain(
            "[grid-template-columns:minmax(96px,28%)_minmax(0,1fr)]",
        );
        // No photo, no photo column.
        expect(rows[1].className).not.toContain("grid-template-columns");
        expect(screen.getAllByText("Add to bag")).toHaveLength(3);
    });

    it("hides products' photos and lines when asked", () => {
        const { container } = render(
            <ProductGridSection
                content={{ showPhotos: false, showDescriptions: false }}
                feed={{ products: WITH_PHOTO, basePath: "/shop" }}
            />,
        );
        expect(container.querySelector("img")).toBeNull();
        expect(
            container.querySelector("[aria-hidden='true'].h-\\[130px\\]"),
        ).toBeNull();
        expect(screen.queryByText("Slow rye, baked at dawn.")).toBeNull();
    });

    it("lists posts one per row, each ending in the merchant's button", () => {
        const { container } = render(
            <JournalSection
                content={{ layout: "list", buttonLabel: "Read" }}
                feed={{ posts: SAMPLE_POSTS, basePath: "/journal" }}
            />,
        );
        expect(container.querySelector("ul")?.className).toContain(
            "grid-cols-1",
        );
        expect(screen.getAllByText("Read").length).toBe(
            container.querySelectorAll("li").length,
        );
    });
});
