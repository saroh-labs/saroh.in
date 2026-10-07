import { BLOCK_META } from "@saroh/block-contract";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    SAMPLE_POSTS,
    SAMPLE_PRODUCTS,
    SAMPLE_TIMETABLE,
    SAMPLE_VISIT,
} from "../block-fixture-preview";
import { placesWord } from "../lib/timetable-read";
import { PageSections } from "../section-renderer";
import { SiteHeader } from "../site-chrome";
import GallerySection from "./gallery";
import HeroSection from "./hero";
import FullBleedHero from "./hero-full-bleed";
import HoursSection, { hoursRows } from "./hours";
import JournalSection from "./journal";
import PersonSection from "./person";
import ProductGridSection from "./product-grid";
import ProjectsSection from "./projects";
import TimetableSection from "./timetable";

/**
 * The blocks and looks the industry templates need (U2). States are said in
 * words — Sold out, Full, Closed — never by colour alone, and a block with
 * nothing to show renders nothing rather than a heading over an empty box.
 */

afterEach(() => {
    vi.unstubAllGlobals();
});

// Tuesday 6 Oct 2026, 10:00 in London (09:00 UTC).
const TUESDAY_MORNING = new Date("2026-10-06T09:00:00.000Z");

describe("hero: full-bleed and none", () => {
    it("draws the photo edge to edge with the words over it", () => {
        const { container } = render(
            <HeroSection content={BLOCK_META.hero.fixtures.fullBleed} />,
        );
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Bread, the slow way",
            }),
        ).toBeTruthy();
        expect(
            screen.getByAltText(
                "Loaves cooling on the counter in morning light",
            ),
        ).toBeTruthy();
        expect(
            container.querySelector('[data-hero-look="fullBleed"]'),
        ).not.toBeNull();
        // Over the wash, the button's words take the page's paper.
        expect(
            screen.getByRole("link", { name: "See what's on the counter" })
                .className,
        ).toContain("text-site-bg");
    });

    it("says whether the business is open now, in words, from the one rule", () => {
        render(
            <FullBleedHero
                content={BLOCK_META.hero.fixtures.fullBleed}
                visit={SAMPLE_VISIT}
                now={TUESDAY_MORNING}
            />,
        );
        expect(screen.getByText("Open now · closes 5pm")).toBeTruthy();
    });

    it("says nothing about opening when the switch is off or no hours are saved", () => {
        const { rerender } = render(
            <FullBleedHero
                content={{
                    ...BLOCK_META.hero.fixtures.fullBleed,
                    onToday: false,
                }}
                visit={SAMPLE_VISIT}
                now={TUESDAY_MORNING}
            />,
        );
        expect(screen.queryByText(/Open now|Closed/)).toBeNull();
        rerender(
            <FullBleedHero
                content={BLOCK_META.hero.fixtures.fullBleed}
                visit={{ ...SAMPLE_VISIT, hours: null }}
                now={TUESDAY_MORNING}
            />,
        );
        expect(screen.queryByText(/Open now|Closed/)).toBeNull();
    });

    it("draws a hero shipped as a brief without any image, and never shows the brief", () => {
        const { container } = render(
            <HeroSection content={BLOCK_META.hero.cases.brief} />,
        );
        expect(container.querySelector("img")).toBeNull();
        expect(screen.queryByText(/Morning light/)).toBeNull();
        expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });

    it("draws No hero as the page's h1 and its line, without the button or photo", () => {
        const { container } = render(
            <HeroSection
                content={{
                    ...BLOCK_META.hero.fixtures.none,
                    cta: { label: "Go", href: "/x" },
                    image: { src: "/a.jpg", alt: "A" },
                }}
            />,
        );
        expect(
            screen.getByRole("heading", { level: 1, name: "Writing" }),
        ).toBeTruthy();
        expect(screen.queryByRole("link")).toBeNull();
        expect(container.querySelector("img")).toBeNull();
    });
});

describe("the header over a full-bleed hero", () => {
    const hero = { type: "hero", content: BLOCK_META.hero.fixtures.fullBleed };
    const text = { type: "richText", content: { value: "<p>Hi</p>" } };

    it("marks the page when it opens with a full-bleed hero, and only then", () => {
        const first = render(<PageSections sections={[hero, text]} />);
        expect(
            first.container.querySelectorAll("[data-site-first-hero]"),
        ).toHaveLength(1);
        first.unmount();

        const second = render(<PageSections sections={[text, hero]} />);
        expect(
            second.container.querySelector("[data-site-first-hero]"),
        ).toBeNull();
        second.unmount();

        const centred = render(
            <PageSections
                sections={[
                    {
                        type: "hero",
                        content: BLOCK_META.hero.fixtures.centered,
                    },
                ]}
            />,
        );
        expect(
            centred.container.querySelector("[data-site-first-hero]"),
        ).toBeNull();
    });

    it("keys the header's overlay off the mark alone", () => {
        render(<SiteHeader name="Rye" navigation={[]} />);
        const header = screen.getByRole("banner");
        // Its own look stays: the overlay applies only under the mark.
        expect(header.className).toContain("sticky");
        expect(header.className).toContain(
            "[body:has([data-site-first-hero])_&]:bg-transparent",
        );
        expect(header.className).toContain(
            "[body:has([data-site-first-hero])_&]:from-site-fg/75",
        );
    });
});

describe("productGrid: lead", () => {
    it("gives the first product twice the room, and says Sold out in words", () => {
        render(
            <ProductGridSection
                content={BLOCK_META.productGrid.fixtures.lead}
                feed={{ products: SAMPLE_PRODUCTS, basePath: "/shop" }}
            />,
        );
        const items = screen.getAllByRole("listitem");
        expect(items[0].className).toContain("sm:col-span-2");
        expect(items[1].className).not.toContain("sm:col-span-2");
        expect(within(items[1]).getByText("Sold out")).toBeTruthy();
        expect(within(items[0]).getByRole("link").getAttribute("href")).toBe(
            "/shop/sourdough",
        );
    });

    it("renders nothing with no products", () => {
        const { container } = render(
            <ProductGridSection
                content={BLOCK_META.productGrid.fixtures.lead}
                feed={{ products: [], basePath: "/shop" }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });
});

describe("journal: archive", () => {
    it("lists every post, dated, whatever the count", () => {
        const many = [...SAMPLE_POSTS, ...SAMPLE_POSTS].map((p, i) => ({
            ...p,
            slug: `${p.slug}-${i}`,
        }));
        const { container } = render(
            <JournalSection
                content={{ variant: "archive", title: "All writing", count: 3 }}
                feed={{ posts: many, basePath: "/blog" }}
            />,
        );
        expect(screen.getAllByRole("listitem")).toHaveLength(6);
        const time = container.querySelector("time");
        expect(time?.getAttribute("dateTime")).toBe("2026-09-18");
        expect(time?.textContent).toBe("18 Sep 2026");
        expect(container.querySelector("img")).toBeNull();
    });

    it("renders nothing with no posts", () => {
        const { container } = render(
            <JournalSection
                content={{ variant: "archive" }}
                feed={{ posts: [], basePath: "/blog" }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });
});

describe("captions and briefs", () => {
    it("draws a line under a gallery photo", () => {
        render(<GallerySection content={BLOCK_META.gallery.cases.captions} />);
        expect(screen.getByText("The counter, 6am").tagName).toBe("FIGCAPTION");
    });

    it("keeps a gallery without captions exactly as it was: no figures", () => {
        const { container } = render(
            <GallerySection content={BLOCK_META.gallery.fixtures.grid} />,
        );
        expect(container.querySelector("figure")).toBeNull();
    });

    it("renders nothing for a gallery shipped as a brief", () => {
        const { container } = render(
            <GallerySection
                content={{ images: [], imageBrief: "Six workshop photos" }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("draws a project's caption beside its photo, and a brief as no photo", () => {
        const { container } = render(
            <ProjectsSection content={BLOCK_META.projects.cases.captions} />,
        );
        expect(screen.getByText("Photographed on site")).toBeTruthy();
        expect(container.querySelectorAll("img")).toHaveLength(1);
        expect(screen.queryByText(/shopfront at dusk/)).toBeNull();
    });
});

describe("timetable", () => {
    it("says Full in words and makes only sessions with places links", () => {
        render(
            <TimetableSection
                content={{ variant: "list", title: "This week" }}
                timetable={SAMPLE_TIMETABLE}
                bookHref="/book"
            />,
        );
        expect(screen.getByText("Full")).toBeTruthy();
        expect(screen.getByText("Fills fast · 2 left")).toBeTruthy();
        const links = screen.getAllByRole("link");
        // Seven sessions, one full.
        expect(links).toHaveLength(6);
        expect(links[0].getAttribute("href")).toBe(
            "/book?service=sample-strength&date=2026-10-05&start=07%3A00",
        );
        // Every day of the week is named, a day with none says so.
        expect(screen.getAllByText("No classes.").length).toBeGreaterThan(0);
    });

    it("draws the week as a table of days and times for the grid look", () => {
        render(
            <TimetableSection
                content={{ variant: "grid" }}
                timetable={SAMPLE_TIMETABLE}
            />,
        );
        const table = screen.getByRole("table");
        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((h) => h.textContent),
        ).toContain("Mon 5 Oct");
        expect(
            within(table).getByRole("rowheader", { name: "18:30" }),
        ).toBeTruthy();
    });

    it("hides who and how many when asked, but never Full", () => {
        render(
            <TimetableSection
                content={{
                    variant: "list",
                    showTrainer: false,
                    showPlacesLeft: false,
                }}
                timetable={SAMPLE_TIMETABLE}
            />,
        );
        expect(screen.queryByText(/With Meera/)).toBeNull();
        expect(screen.queryByText(/left|places/)).toBeNull();
        expect(screen.getByText("Full")).toBeTruthy();
    });

    it("renders nothing with no sessions this week", () => {
        const { container } = render(
            <TimetableSection
                content={{ variant: "grid" }}
                timetable={{ ...SAMPLE_TIMETABLE, sessions: [] }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("reads the week live, for the classes named", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify(SAMPLE_TIMETABLE), { status: 200 }),
            );
        vi.stubGlobal("fetch", fetchMock);
        render(
            <TimetableSection
                content={{ variant: "list", serviceIds: ["a", "b"] }}
                siteId="site_gym"
                apiUrl="https://api.test"
            />,
        );
        await waitFor(() => expect(screen.getByText("Full")).toBeTruthy());
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.test/public/sites/site_gym/timetable?services=a%2Cb",
            expect.anything(),
        );
    });

    it("draws nothing on a live page that could not tell its site", () => {
        const { container } = render(
            <TimetableSection content={{}} siteId={null} />,
        );
        expect(container.innerHTML).toBe("");
    });
});

describe("placesWord", () => {
    it("says Full, Fills fast or the places, by what is left", () => {
        expect(placesWord({ placesLeft: 0, capacity: 12 }, true)?.text).toBe(
            "Full",
        );
        expect(placesWord({ placesLeft: 2, capacity: 12 }, true)?.text).toBe(
            "Fills fast · 2 left",
        );
        expect(placesWord({ placesLeft: 9, capacity: 12 }, true)?.text).toBe(
            "9 places",
        );
        expect(placesWord({ placesLeft: 9, capacity: 12 }, false)).toBeNull();
        expect(placesWord({ placesLeft: 0, capacity: 12 }, false)?.text).toBe(
            "Full",
        );
    });
});

describe("hours", () => {
    it("lists the week with closed days stated, today marked, and open now", () => {
        render(
            <HoursSection
                content={BLOCK_META.hours.fixtures.default}
                visit={SAMPLE_VISIT}
                now={TUESDAY_MORNING}
            />,
        );
        const sunday = screen.getByRole("rowheader", { name: "Sunday" });
        expect(sunday.parentElement?.textContent).toContain("Closed");
        const today = screen
            .getAllByRole("row")
            .find((r) => r.getAttribute("aria-current") === "date");
        expect(today?.textContent).toContain("Tuesday");
        expect(today?.textContent).toContain("7:30am – 5pm");
        expect(screen.getByText("Open now · closes 5pm")).toBeTruthy();
    });

    it("leaves closed days out when asked", () => {
        render(
            <HoursSection
                content={{ showClosed: false }}
                visit={SAMPLE_VISIT}
                now={TUESDAY_MORNING}
            />,
        );
        expect(screen.queryByRole("rowheader", { name: "Sunday" })).toBeNull();
        expect(screen.getAllByRole("row")).toHaveLength(6);
    });

    it("renders nothing with no hours saved, never seven Closed rows", () => {
        const { container } = render(
            <HoursSection
                content={{}}
                visit={{ ...SAMPLE_VISIT, hours: null }}
            />,
        );
        expect(container.innerHTML).toBe("");
        expect(
            hoursRows(
                (SAMPLE_VISIT.hours ?? []).map((d) => ({ ...d, closed: true })),
                true,
            ),
        ).toBeNull();
    });

    it("reads the business's own place when no shop is chosen", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify(SAMPLE_VISIT), { status: 200 }),
            );
        vi.stubGlobal("fetch", fetchMock);
        render(
            <HoursSection
                content={{}}
                siteId="site_rye"
                apiUrl="https://api.test"
                now={TUESDAY_MORNING}
            />,
        );
        await waitFor(() =>
            expect(
                screen.getByRole("rowheader", { name: /Monday/ }),
            ).toBeTruthy(),
        );
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.test/public/sites/site_rye/visit",
            expect.anything(),
        );
    });

    it("renders nothing when the place is gone", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(new Response("{}", { status: 404 })),
        );
        const { container } = render(
            <HoursSection
                content={{ storeId: "gone" }}
                siteId="site_rye"
                apiUrl="https://api.test"
            />,
        );
        await waitFor(() => expect(container.innerHTML).toBe(""));
    });
});

describe("person", () => {
    it("draws the name as a heading, the role, the qualifications and the bio", () => {
        render(<PersonSection content={BLOCK_META.person.fixtures.default} />);
        expect(
            screen.getByRole("heading", { level: 2, name: "Dr Anika Rao" }),
        ).toBeTruthy();
        expect(screen.getByText("Clinical dietician")).toBeTruthy();
        const list = screen.getByRole("list", { name: "Qualifications" });
        expect(within(list).getAllByRole("listitem")).toHaveLength(3);
        expect(screen.getByText(/Every plan starts/)).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "Book a consultation" })
                .getAttribute("href"),
        ).toBe("/book");
    });

    it("draws words only for a person shipped as a brief", () => {
        const { container } = render(
            <PersonSection content={BLOCK_META.person.cases.brief} />,
        );
        expect(container.querySelector("img")).toBeNull();
        expect(screen.queryByText(/plain portrait/)).toBeNull();
    });
});
