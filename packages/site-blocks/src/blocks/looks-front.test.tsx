import type { LookId } from "@saroh/block-contract";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Section } from "../section-renderer";
import { PageSections, pageProof } from "../section-renderer";
import { gridAreas } from "./hero-look";
import { initialsOf } from "./look-front";
import type { PublicService } from "./services-list";

/**
 * The front-door blocks under each look (DEC-172, plan U6, #1094): the
 * hero, services, people, proof and the closing band, as VA01/VD01/VB01
 * Home and VA04/VD04/VB04 About draw them.
 *
 * What holds on every look:
 * - With no photo the hero is led by its type: no `<img>`, no empty frame,
 *   and never "No photo yet" on a page a customer can reach. Only the
 *   owner's preview says it, where the photo would be.
 * - The headline is the page's one `h1`.
 * - The first screen's parts: the next booking's slot (or the shop's
 *   entry) and one proof line from the page's own testimonials, with no
 *   made-up time.
 * - One filled button: the hero's own, marked `data-site-primary`; every
 *   Book on a row or a card is an outline or a quiet edge.
 * - A person with no photo shows initials (`aria-hidden`), the name as
 *   text.
 * - A service row is a link through its name; Book is a 44px sibling link,
 *   never nested.
 * - Cards and photos take `rounded-site-s` and `rounded-site-photo`, never
 *   the button's `rounded-site` (a pill under Quiet).
 *
 * And Classic draws none of it.
 */

const LOOKS: LookId[] = ["folio", "quiet", "live"];

const PHOTO = {
    src: "https://media.test/studio.jpg",
    alt: "The studio from the door",
    width: 1600,
    height: 1067,
};

const hero = (extra: Record<string, unknown> = {}): Section => ({
    type: "hero",
    content: {
        heading: "Yoga at your pace.",
        subheading: "A small studio in HSR Layout, sixteen mats at most.",
        cta: { label: "Book a class", href: "/book", style: "primary" },
        imageBrief: "the studio from the door, morning",
        ...extra,
    },
});

const services: Section = {
    type: "servicesList",
    content: {
        heading: "Classes and services",
        serviceIds: ["svc_hatha", "svc_intro"],
    },
};

const SERVICES: PublicService[] = [
    {
        id: "svc_hatha",
        name: "Hatha yoga",
        description: "Slow, held poses and long breaths.",
        durationMinutes: 60,
        priceCents: 60_000,
        currency: "INR",
    },
    {
        id: "svc_intro",
        name: "Free intro class",
        description: null,
        durationMinutes: 30,
        priceCents: null,
        currency: null,
    },
];

const team: Section = {
    type: "person",
    content: {
        variant: "team",
        title: "The teachers",
        name: "Meera Iyer",
        role: "Founder · Hatha and Foundations",
        people: [
            { name: "Kabir Menon", role: "Teacher · Vinyasa flow" },
            { name: "Ananya Rao", role: "Teacher · Pranayama" },
        ],
    },
};

const quotes: Section = {
    type: "testimonials",
    content: {
        heading: "What people say",
        items: [
            {
                quote: "Meera notices when you're holding your breath.",
                name: "Divya S.",
                role: "Hatha with Meera",
            },
            {
                quote: "The 6 pm flow is the best hour of my week.",
                name: "Rohan K.",
            },
            { quote: "I sleep better on Pranayama days.", name: "Leela M." },
        ],
    },
};

const band: Section = {
    type: "cta",
    content: {
        heading: "Your first class is free.",
        label: "Book a free intro",
        href: "/book",
        style: "primary",
    },
};

function home(
    look: LookId | undefined,
    opts: {
        photo?: boolean;
        owner?: boolean;
        door?: "book" | "shop" | null;
    } = {},
) {
    const { photo = true, owner = false, door = "book" } = opts;
    return render(
        <PageSections
            sections={[
                hero(photo ? { image: PHOTO } : {}),
                services,
                team,
                quotes,
                band,
            ]}
            look={look}
            isOwnerPreview={owner}
            bookHref="/book"
            fixtures={{ services: SERVICES }}
            frontDoor={
                door === "book"
                    ? { kind: "book", href: "/book" }
                    : door === "shop"
                      ? { kind: "shop", href: "/shop" }
                      : null
            }
            siteName="Prana Yoga"
        />,
    );
}

/** An element the test needs to be there. */
function must<T>(el: T | null | undefined): T {
    if (el === null || el === undefined) throw new Error("not drawn");
    return el;
}

function heroOf(container: HTMLElement): HTMLElement {
    const found = container.querySelector<HTMLElement>("[data-site-look-hero]");
    if (!found) throw new Error("no look hero");
    return found;
}

describe.each(LOOKS)("%s: the hero", (look) => {
    it("with no photo: no img, no empty frame, no owner's words, the h1 is the headline", () => {
        const { container } = home(look, { photo: false });
        const h = heroOf(container);
        expect(h.querySelector("img")).toBeNull();
        expect(h.querySelector("[data-owner-photo-note]")).toBeNull();
        expect(container).not.toHaveTextContent("No photo yet");
        const h1s = container.querySelectorAll("h1");
        expect(h1s).toHaveLength(1);
        expect(h1s[0]).toHaveTextContent("Yoga at your pace.");
        // Nothing left over where the photo would be.
        h.querySelectorAll("div").forEach((div) => {
            if (div.className.includes("empty:hidden")) {
                expect(div.childElementCount).toBe(0);
            }
        });
    });

    it("in the owner's preview with no photo: says No photo yet, where it would be", () => {
        const { container } = home(look, { photo: false, owner: true });
        const note = heroOf(container).querySelector("[data-owner-photo-note]");
        expect(note).not.toBeNull();
        expect(note).toHaveTextContent("No photo yet");
        expect(note).toHaveTextContent("Only you see this");
        expect(note).toHaveTextContent("the studio from the door, morning");
    });

    it("with a photo: one picture, in the photo's corner, and no owner's note even in the preview", () => {
        const { container } = home(look, { owner: true });
        const h = heroOf(container);
        const imgs = h.querySelectorAll("img");
        expect(imgs).toHaveLength(1);
        expect(imgs[0]).toHaveAttribute("alt", "The studio from the door");
        expect(imgs[0].classList.contains("rounded-site-photo")).toBe(true);
        expect(imgs[0].classList.contains("rounded-site")).toBe(false);
        expect(h.querySelector("[data-owner-photo-note]")).toBeNull();
    });

    it("holds the next booking's slot, the plain way in and no made-up time", () => {
        const { container } = home(look);
        const slot = heroOf(container).querySelector<HTMLElement>(
            "[data-site-next-free]",
        );
        expect(slot).not.toBeNull();
        expect(slot?.className).toMatch(/min-h-\[\d+px\]/);
        const link = within(must(slot)).getByRole("link", {
            name: "See times",
        });
        expect(link).toHaveAttribute("href", "/book");
        // U8 fills it in the browser; the cached page carries no time.
        expect(slot?.textContent).not.toMatch(/\d/);
    });

    it("a site that sells and takes no bookings: the shop's entry instead", () => {
        const { container } = home(look, { door: "shop" });
        const h = heroOf(container);
        expect(h.querySelector("[data-site-next-free]")).toBeNull();
        const door = h.querySelector("[data-site-front-door='shop']");
        expect(door).not.toBeNull();
        expect(
            within(door as HTMLElement).getByRole("link", {
                name: "See the shop",
            }),
        ).toHaveAttribute("href", "/shop");
    });

    it("a site that does neither: no slot at all", () => {
        const { container } = home(look, { door: null });
        expect(
            heroOf(container).querySelector("[data-site-front-door]"),
        ).toBeNull();
    });

    it("carries one proof line: the page's first testimonial, as written", () => {
        const { container } = home(look);
        const proofs = heroOf(container).querySelectorAll("[data-site-proof]");
        expect(proofs).toHaveLength(1);
        expect(proofs[0]).toHaveTextContent(
            "“Meera notices when you're holding your breath.” Divya S.",
        );
    });

    it("has one filled button, marked as the page's main action", () => {
        const { container } = home(look);
        const h = heroOf(container);
        const filled = h.querySelectorAll(".bg-site-accent");
        expect(filled).toHaveLength(1);
        expect(filled[0]).toHaveAttribute("data-site-primary");
        expect(filled[0]).toHaveTextContent("Book a class");
        expect(h.querySelectorAll("[data-site-primary]")).toHaveLength(1);
    });

    it("a secondary button is not the main action", () => {
        const { container } = render(
            <PageSections
                sections={[
                    hero({
                        cta: {
                            label: "See the timetable",
                            href: "/timetable",
                            style: "secondary",
                        },
                    }),
                ]}
                look={look}
            />,
        );
        expect(container.querySelector("[data-site-primary]")).toBeNull();
        expect(container.querySelector(".bg-site-accent")).toBeNull();
    });

    it("a later hero is an h2, with no slot and no proof", () => {
        const { container } = render(
            <PageSections
                sections={[hero(), quotes, hero({ heading: "Visit us" })]}
                look={look}
                frontDoor={{ kind: "book", href: "/book" }}
            />,
        );
        expect(container.querySelectorAll("h1")).toHaveLength(1);
        const heroes = container.querySelectorAll("[data-site-look-hero]");
        expect(heroes).toHaveLength(2);
        expect(heroes[1].querySelector("h2")).toHaveTextContent("Visit us");
        expect(heroes[1].querySelector("[data-site-front-door]")).toBeNull();
        expect(heroes[1].querySelector("[data-site-proof]")).toBeNull();
    });
});

describe.each(LOOKS)("%s: the rest of the front door", (look) => {
    it("services: a row is a link through its name; Book is a 44px sibling, never nested", () => {
        const { container } = home(look);
        const section = must(
            container.querySelector<HTMLElement>(
                `[data-site-look-services="${look}"]`,
            ),
        );
        expect(section).not.toBeNull();
        const rows = section.querySelectorAll("[data-service-row]");
        expect(rows).toHaveLength(2);
        rows.forEach((row) => {
            const name = row.querySelector("[data-service-row-link]");
            expect(name).not.toBeNull();
            expect(name?.className).toContain("after:inset-0");
            const book = within(row as HTMLElement).getByRole("link", {
                name: /^Book: /,
            });
            expect(book.className).toContain("min-h-11");
            expect(book.className).toContain("z-10");
            expect(name?.getAttribute("href")).toBe(book.getAttribute("href"));
        });
        expect(
            section.querySelectorAll("a a, a button, button a, a [role=link]"),
        ).toHaveLength(0);
        expect(
            within(section).getByRole("link", { name: "Book: Hatha yoga" }),
        ).toHaveAttribute("href", "/book?service=svc_hatha");
        // One filled button a view: no Book on a row is filled.
        expect(section.querySelector(".bg-site-accent")).toBeNull();
        // No service has a photo, so no row has a thumbnail frame.
        expect(section.querySelector("img")).toBeNull();
    });

    it("people: initials for everyone with no photo, the name as text", () => {
        const { container } = home(look);
        const section = must(
            container.querySelector<HTMLElement>(
                `[data-site-look-team="${look}"]`,
            ),
        );
        expect(section).not.toBeNull();
        const plates = section.querySelectorAll("[data-initials-plate]");
        expect(Array.from(plates).map((p) => p.textContent)).toEqual([
            "MI",
            "KM",
            "AR",
        ]);
        plates.forEach((p) => expect(p).toHaveAttribute("aria-hidden", "true"));
        expect(
            within(section)
                .getAllByRole("heading", { level: 3 })
                .map((h) => h.textContent),
        ).toEqual(["Meera Iyer", "Kabir Menon", "Ananya Rao"]);
        expect(section.querySelector("img")).toBeNull();
        expect(section).not.toHaveTextContent("No photo yet");
    });

    it("people: names and roles alone take the Home grid; with their lines, the About rows", () => {
        const draw = (bio?: string) =>
            render(
                <PageSections
                    sections={[
                        {
                            type: "person",
                            content: { ...(team.content as object), bio },
                        },
                    ]}
                    look={look}
                />,
            ).container.querySelector(`[data-site-look-team="${look}"] ul`);
        const grid = must(draw());
        const rows = must(draw("Taught Hatha for twelve years."));
        if (look === "live") {
            // Live has one layout: cards either way.
            expect(rows.className).toBe(grid.className);
        } else {
            expect(rows.className).not.toBe(grid.className);
            expect(rows.className).not.toContain("min-[700px]:grid-cols-3");
            expect(grid.className).toContain("min-[700px]:grid-cols-3");
        }
    });

    it("people: a person's own photo is used when the owner set one", () => {
        const { container } = render(
            <PageSections
                sections={[
                    {
                        type: "person",
                        content: {
                            ...(team.content as object),
                            image: {
                                src: "https://media.test/meera.jpg",
                                alt: "Meera",
                            },
                        },
                    },
                ]}
                look={look}
            />,
        );
        const imgs = container.querySelectorAll("img");
        expect(imgs).toHaveLength(1);
        expect(imgs[0]).toHaveAttribute("alt", "Meera");
        expect(
            container.querySelectorAll("[data-initials-plate]"),
        ).toHaveLength(2);
    });

    it("one person with no photo: initials where the portrait would be", () => {
        for (const variant of [undefined, "portrait"]) {
            const { container, unmount } = render(
                <PageSections
                    sections={[
                        {
                            type: "person",
                            content: {
                                ...(variant ? { variant } : {}),
                                name: "Dr Anika Rao",
                                role: "Registered dietician",
                            },
                        },
                    ]}
                    look={look}
                />,
            );
            expect(
                container.querySelector("[data-initials-plate]"),
            ).toHaveTextContent("AR");
            expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
                "Dr Anika Rao",
            );
            unmount();
        }
    });

    it("testimonials: every quote kept, none filled, cards in the card corner", () => {
        const { container } = home(look);
        const section = must(
            container.querySelector<HTMLElement>(
                `[data-site-look-proof="${look}"]`,
            ),
        );
        expect(section).not.toBeNull();
        for (const words of [
            "Meera notices when you're holding your breath.",
            "The 6 pm flow is the best hour of my week.",
            "I sleep better on Pranayama days.",
        ]) {
            expect(section).toHaveTextContent(words);
        }
        expect(section.querySelector(".bg-site-accent")).toBeNull();
        section.querySelectorAll("figure").forEach((f) => {
            expect(f.classList.contains("rounded-site")).toBe(false);
        });
    });

    it("the closing band's button is its main action", () => {
        const { container } = home(look);
        const bandButton = within(
            must(
                container.querySelector<HTMLElement>(
                    "[data-site-ground='cta']",
                ),
            ),
        ).getByRole("link", { name: "Book a free intro" });
        expect(bandButton).toHaveAttribute("data-site-primary");
    });

    it("no card or photo takes the button's corner", () => {
        const { container } = home(look);
        container
            .querySelectorAll("img, li, figure, [data-initials-plate]")
            .forEach((el) => {
                expect(el.classList.contains("rounded-site")).toBe(false);
            });
    });
});

describe("Folio's proof keeps a phone's page short", () => {
    it("the pull quote, and the rest behind Read all", () => {
        const { container } = home("folio");
        const section = must(
            container.querySelector<HTMLElement>(
                "[data-site-look-proof='folio']",
            ),
        );
        const details = section.querySelector("details");
        expect(details).not.toBeNull();
        expect(details?.querySelector("summary")).toHaveTextContent(
            "Read all 3",
        );
    });

    it("a single quote has nothing to read all of", () => {
        const { container } = render(
            <PageSections
                sections={[
                    {
                        type: "testimonials",
                        content: {
                            items: [{ quote: "Calm.", name: "Asha" }],
                        },
                    },
                ]}
                look="folio"
            />,
        );
        expect(container.querySelector("details")).toBeNull();
    });
});

describe("Classic draws none of it", () => {
    it("no slot, no proof, no main-action marks, no plates, no owner's words", () => {
        const html = renderToStaticMarkup(
            <PageSections
                sections={[hero(), services, team, quotes, band]}
                isOwnerPreview
                bookHref="/book"
                fixtures={{ services: SERVICES }}
                frontDoor={{ kind: "book", href: "/book" }}
            />,
        );
        expect(html).not.toContain("data-site-look-hero");
        expect(html).not.toContain("data-site-front-door");
        expect(html).not.toContain("data-site-proof");
        expect(html).not.toContain("data-site-primary");
        expect(html).not.toContain("data-initials-plate");
        expect(html).not.toContain("No photo yet");
    });
});

describe("the page's proof line", () => {
    it("is the first quote of the first testimonials with words and a name", () => {
        expect(
            pageProof([
                hero(),
                { type: "testimonials", content: { items: [] } },
                quotes,
            ]),
        ).toEqual({
            quote: "Meera notices when you're holding your breath.",
            name: "Divya S.",
        });
    });

    it("is none on a page without testimonials", () => {
        expect(pageProof([hero(), services])).toBeNull();
        expect(pageProof([])).toBeNull();
    });
});

describe("initials", () => {
    it("take the first and last name, skipping a title", () => {
        expect(initialsOf("Meera Iyer")).toBe("MI");
        expect(initialsOf("Dr Anika Rao")).toBe("AR");
        expect(initialsOf("Kabir")).toBe("K");
        expect(initialsOf("ananya s rao")).toBe("AR");
        expect(initialsOf("  ")).toBe("");
        expect(initialsOf("(Meera) Iyer")).toBe("MI");
        expect(initialsOf("मीरा अय्यर")).toBe("मअ");
    });
});

describe("a hero's desk grid", () => {
    it("leaves no row for a part it hasn't", () => {
        expect(
            gridAreas([["h", "p"], false, null, ["c", "c"]]).gridTemplateAreas,
        ).toBe("'h p' 'c c'");
    });
});
