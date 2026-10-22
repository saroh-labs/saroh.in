import type { LookId } from "@saroh/block-contract";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CreditFor } from "../booking-flow/api";
import type { PublicTimetable, TimetableSession } from "../lib/timetable-read";
import { resetLiveReads } from "../live/use-live-read";
import { lookRules } from "../look-theme";
import type { Section } from "../section-renderer";
import { PageSections } from "../section-renderer";
import type { JournalFeed } from "./journal-posts";
import { photoPlace, stepPhoto } from "./lightbox";
import type { PublicPack } from "./packs";
import type { PublicPlan } from "./plans";
import { weeksWords } from "./prices-look";
import { placesLine, waitlistHref } from "./timetable-look";
import type { PublicVisit } from "./visit-us";

/**
 * The content blocks under each look (DEC-172, plan U7, #1096): the
 * gallery and its lightbox, the journal, the timetable with prices, plans
 * and packs, Visit us and the blocks restyled by tokens, as VA/VD/VB 02,
 * 05, 06, 07, 09 and 10 draw them.
 *
 * What holds on every look:
 * - The lightbox is a real dialog: named, modal, focus kept inside it,
 *   the arrow keys move along, Escape closes it and focus goes back to
 *   the photo that was open.
 * - A timetable row says its price (or "1 pack class" for a signed-in
 *   customer, read in the browser), and its action is an outline of
 *   44px: Book, or Join the waitlist on a full class. "Full" is said in
 *   full-strength text, never faded. Places left only when 5 or fewer.
 * - One filled button: the highlighted plan's Join (or, alone, the first
 *   pack's Buy) is marked `data-site-primary`; nothing else here is.
 * - A post with no photo is a text card; a gallery with no photos draws
 *   nothing for a customer.
 * - Cards and photos take `rounded-site-s` / `rounded-site-photo`.
 * - Labels are 12px at least.
 *
 * And Classic draws none of it (the `classic-pin` snapshots hold that).
 */

const LOOKS: LookId[] = ["folio", "quiet", "live"];

const IMAGES = [
    {
        src: "https://media.test/studio.jpg",
        alt: "The studio in the morning",
        caption: "Prana studio wide, morning",
        width: 1600,
        height: 1067,
    },
    {
        src: "https://media.test/class.jpg",
        alt: "A class in progress",
        caption: "Class in progress, hatha",
        width: 1200,
        height: 1500,
    },
    {
        src: "https://media.test/mat.jpg",
        alt: "Hands on a mat",
        width: 1200,
        height: 1200,
    },
];

const gallery = (extra: Record<string, unknown> = {}): Section => ({
    type: "gallery",
    content: { images: IMAGES, ...extra },
});

/** Every class name a node and its children carry. */
function classesIn(root: Element): string[] {
    return [root, ...Array.from(root.querySelectorAll("*"))].flatMap((el) =>
        (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean),
    );
}

/** No text smaller than 12px is set anywhere under `root` (VA-23). */
function noTinyText(root: Element) {
    const tiny = classesIn(root).filter((c) => {
        const m = /^text-\[(\d+(?:\.\d+)?)px\]$/.exec(c);
        return m ? Number(m[1]) < 12 : c === "text-xs";
    });
    expect(tiny).toEqual([]);
}

/** A card or a photo never takes the button's radius (a pill on Quiet). */
function noButtonRadiusOn(elements: Element[]) {
    for (const el of elements) {
        const names = (el.getAttribute("class") ?? "").split(/\s+/);
        expect(names).not.toContain("rounded-site");
    }
}

function page(sections: Section[], look?: LookId, extra = {}) {
    return render(
        <PageSections
            sections={sections}
            look={look}
            bookHref="/book"
            siteName="Prana Yoga"
            {...extra}
        />,
    );
}

// ── Gallery ─────────────────────────────────────────────────────────────

describe("the lightbox's words", () => {
    it("says where the photo is, and moves round the set", () => {
        expect(photoPlace(3, 9)).toBe("4 of 9");
        expect(stepPhoto(8, 1, 9)).toBe(0);
        expect(stepPhoto(0, -1, 9)).toBe(8);
        expect(stepPhoto(2, 1, 9)).toBe(3);
    });
});

describe.each(LOOKS)("%s: the gallery", (look) => {
    it("draws every photo as a button that opens it, in the photo's corners", () => {
        const { container } = page([gallery()], look);
        const tiles = screen.getAllByRole("button", { name: /^Open photo/ });
        expect(tiles).toHaveLength(3);
        expect(tiles[0]).toHaveAccessibleName(
            "Open photo 1 of 3: Prana studio wide, morning",
        );
        expect(tiles[2]).toHaveAccessibleName(
            "Open photo 3 of 3: Hands on a mat",
        );
        const imgs = Array.from(container.querySelectorAll("img"));
        expect(imgs).toHaveLength(3);
        imgs.forEach((img) =>
            expect(img.className).toContain("rounded-site-photo"),
        );
        noButtonRadiusOn([...imgs, ...tiles]);
        // No album tabs: photos have no tags (DEC-172).
        expect(screen.queryByRole("tablist")).toBeNull();
        noTinyText(container);
    });

    it("opens a photo as a real dialog: named, modal, focus on Close", () => {
        page([gallery()], look);
        fireEvent.click(
            screen.getByRole("button", { name: /^Open photo 2 of 3/ }),
        );
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(dialog).toHaveAccessibleName("Photo 2 of 3");
        expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
        expect(within(dialog).getByRole("img")).toHaveAttribute(
            "alt",
            "A class in progress",
        );
        expect(dialog).toHaveTextContent("Class in progress, hatha");
        // The page behind can't be reached.
        expect(
            document
                .querySelector("[data-site-look-gallery]")
                ?.closest("[inert]"),
        ).not.toBeNull();
    });

    it("moves with the arrow keys, round the set, and with Previous and Next", () => {
        page([gallery()], look);
        fireEvent.click(
            screen.getByRole("button", { name: /^Open photo 3 of 3/ }),
        );
        const dialog = () => screen.getByRole("dialog");
        fireEvent.keyDown(dialog(), { key: "ArrowRight" });
        expect(dialog()).toHaveAccessibleName("Photo 1 of 3");
        fireEvent.keyDown(dialog(), { key: "ArrowLeft" });
        expect(dialog()).toHaveAccessibleName("Photo 3 of 3");
        fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
        expect(dialog()).toHaveAccessibleName("Photo 2 of 3");
        fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
        expect(dialog()).toHaveAccessibleName("Photo 3 of 3");
    });

    it("keeps Tab inside the dialog", () => {
        page([gallery()], look);
        fireEvent.click(
            screen.getByRole("button", { name: /^Open photo 1 of 3/ }),
        );
        const dialog = screen.getByRole("dialog");
        const next = screen.getByRole("button", { name: "Next photo" });
        next.focus();
        fireEvent.keyDown(dialog, { key: "Tab" });
        expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
        fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
        expect(next).toHaveFocus();
    });

    it("closes on Escape and gives focus back to the photo that was open", async () => {
        page([gallery()], look);
        fireEvent.click(
            screen.getByRole("button", { name: /^Open photo 1 of 3/ }),
        );
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: /^Open photo 2 of 3/ }),
            ).toHaveFocus(),
        );
        expect(document.querySelector("[inert]")).toBeNull();
    });

    it("draws nothing for a customer with no photos, and the brief in the owner's preview", () => {
        const empty = gallery({
            images: [],
            imageBrief: "the studio, morning",
        });
        const { container, unmount } = page([empty], look);
        expect(container.querySelector("[data-site-look-gallery]")).toBeNull();
        expect(container).not.toHaveTextContent("No photo yet");
        unmount();
        page([empty], look, { isOwnerPreview: true });
        expect(screen.getByText(/No photo yet/)).toBeInTheDocument();
        expect(screen.getByText(/the studio, morning/)).toBeInTheDocument();
    });

    it("keeps a carousel the merchant chose as a strip that scrolls in itself", () => {
        const { container } = page([gallery({ variant: "carousel" })], look);
        const list = container.querySelector("[data-site-look-gallery] ul");
        expect(list?.className).toContain("overflow-x-auto");
        expect(
            screen.getAllByRole("button", { name: /^Open photo/ }),
        ).toHaveLength(3);
    });
});

describe("Classic's gallery", () => {
    it("is unchanged: no buttons, no lightbox", () => {
        page([gallery()]);
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        expect(document.querySelector("[data-site-look-gallery]")).toBeNull();
    });
});

// ── Timetable ───────────────────────────────────────────────────────────

const session = (over: Partial<TimetableSession>): TimetableSession => ({
    serviceId: "svc_hatha",
    serviceName: "Hatha yoga",
    durationMinutes: 60,
    startAt: "2026-10-21T01:30:00.000Z",
    date: "2026-10-21",
    time: "07:00",
    staffName: "Meera",
    placesLeft: 9,
    capacity: 12,
    priceCents: 60_000,
    currency: "INR",
    gst: null,
    ...over,
});

const WEEK: PublicTimetable = {
    timezone: "Asia/Kolkata",
    days: [
        "2026-10-21",
        "2026-10-22",
        "2026-10-23",
        "2026-10-24",
        "2026-10-25",
        "2026-10-26",
        "2026-10-27",
    ],
    sessions: [
        session({}),
        session({
            serviceId: "svc_flow",
            serviceName: "Vinyasa flow",
            startAt: "2026-10-21T12:30:00.000Z",
            time: "18:00",
            staffName: "Kabir",
            placesLeft: 3,
            priceCents: 70_000,
        }),
        session({
            serviceId: "svc_flow",
            serviceName: "Vinyasa flow",
            startAt: "2026-10-22T12:30:00.000Z",
            date: "2026-10-22",
            time: "18:00",
            staffName: "Kabir",
            placesLeft: 0,
            priceCents: 70_000,
        }),
        session({
            serviceId: "svc_breath",
            serviceName: "Pranayama",
            startAt: "2026-10-22T14:00:00.000Z",
            date: "2026-10-22",
            time: "19:30",
            staffName: "Ananya",
            placesLeft: 1,
            priceCents: null,
            currency: null,
        }),
    ],
};

const timetable: Section = {
    type: "timetable",
    content: { title: "This week" },
};

function week(look?: LookId, credit?: CreditFor) {
    return page([timetable], look, {
        fixtures: { timetable: WEEK },
        credit,
    });
}

describe("the timetable's words", () => {
    it("says places only when true and five or fewer, and Full always", () => {
        expect(placesLine({ placesLeft: 6 }, true)).toBeNull();
        expect(placesLine({ placesLeft: 5 }, true)?.text).toBe("5 places left");
        expect(placesLine({ placesLeft: 1 }, true)?.text).toBe("Last place");
        expect(placesLine({ placesLeft: 0 }, true)?.text).toBe("Full");
        // Places hidden by the merchant: only Full is said.
        expect(placesLine({ placesLeft: 2 }, false)).toBeNull();
        expect(placesLine({ placesLeft: 0 }, false)?.text).toBe("Full");
    });

    it("sends a full class to the booking page's When, for its waitlist", () => {
        const href = waitlistHref("/book", session({ placesLeft: 0 }));
        const url = new URL(href, "https://site.test");
        expect(url.pathname).toBe("/book");
        expect(url.searchParams.get("service")).toBe("svc_hatha");
        expect(url.searchParams.get("date")).toBe("2026-10-21");
        expect(url.searchParams.get("step")).toBe("when");
    });
});

describe.each(LOOKS)("%s: the timetable", (look) => {
    /** The desk's week (the phone's tabs carry the same rows). */
    const desk = (container: HTMLElement) =>
        must(
            container.querySelector<HTMLElement>(
                "[data-site-look-timetable] .grid-cols-7",
            ),
        );

    it("says each row's price, and none as none (never ₹0)", () => {
        const { container } = week(look);
        const w = desk(container);
        const prices = Array.from(
            w.querySelectorAll("[data-timetable-price]"),
        ).map((el) => el.textContent);
        expect(prices).toEqual(["₹600", "₹700", "₹700"]);
        expect(w).not.toHaveTextContent("₹0");
    });

    it("gives every class an outline Book of 44px, never filled", () => {
        const { container } = week(look);
        const books = within(desk(container)).getAllByRole("link", {
            name: /^Book /,
        });
        expect(books).toHaveLength(3);
        for (const book of books) {
            expect(book.className).toContain("min-h-11");
            // Folio's is a text link: as wide as a fingertip too.
            if (look === "folio") expect(book.className).toContain("min-w-11");
            expect(book.className).not.toContain("bg-site-accent ");
            expect(book).not.toHaveAttribute("data-site-primary");
            expect(book.getAttribute("href")).toMatch(
                /^\/book\?service=.*&step=details$/,
            );
        }
        expect(
            container.querySelectorAll(
                "[data-site-look-timetable] [data-site-primary]",
            ),
        ).toHaveLength(0);
    });

    it("says Full in full-strength words and offers Join the waitlist", () => {
        const { container } = week(look);
        const w = desk(container);
        const full = must(
            w.querySelector<HTMLElement>('[data-timetable-places="full"]'),
        );
        expect(full).toHaveTextContent("Full");
        expect(full.className).toContain("text-site-fg");
        const row = must(full.closest<HTMLElement>("[data-timetable-row]"));
        expect(row.className).not.toMatch(/opacity-/);
        const join = within(row).getByRole("link", {
            name: /^Join the waitlist: Vinyasa flow/,
        });
        expect(join).toHaveTextContent("Join the waitlist");
        expect(join.className).toContain("min-h-11");
        expect(join.getAttribute("href")).toContain("step=when");
        expect(within(row).queryByRole("link", { name: /^Book / })).toBeNull();
    });

    it("says places left only when five or fewer; the last one in the accent's text", () => {
        const { container } = week(look);
        const w = desk(container);
        expect(w).toHaveTextContent("3 places left");
        const last = must(
            w.querySelector<HTMLElement>('[data-timetable-places="last"]'),
        );
        expect(last).toHaveTextContent("Last place");
        expect(last.className).toContain("text-site-accent-text");
        // Nine left: nothing said, the line's height kept.
        expect(w).not.toHaveTextContent("9 places");
        const quiet = w.querySelectorAll('[data-timetable-places=""]');
        expect(quiet.length).toBeGreaterThan(0);
        // Live's tag row is 24 tall (VB09), the others' line 20.
        const height = look === "live" ? "min-h-[24px]" : "min-h-[20px]";
        quiet.forEach((el) => expect(el.className).toContain(height));
    });

    it("says 1 pack class for a class the signed-in customer's pack covers, asked once a class", async () => {
        const credit = vi.fn<CreditFor>(({ serviceId }) =>
            Promise.resolve(
                serviceId === "svc_flow"
                    ? {
                          ok: true as const,
                          value: {
                              credit: {
                                  kind: "PACK" as const,
                                  id: "pp_1",
                                  name: "10 classes",
                                  left: 7,
                                  useBy: "2026-12-01",
                              },
                          },
                      }
                    : { ok: true as const, value: { credit: null } },
            ),
        );
        const { container } = week(look, credit);
        const w = desk(container);
        await waitFor(() => expect(w).toHaveTextContent("1 pack class"));
        // Once per class with a place, never once per session.
        expect(credit).toHaveBeenCalledTimes(3);
        const flows = Array.from(w.querySelectorAll("[data-timetable-row]"))
            .filter((r) => r.textContent.includes("Vinyasa flow"))
            .map((r) => r.querySelector("[data-timetable-price]")?.textContent);
        expect(flows).toEqual(["1 pack class", "1 pack class"]);
        // The rest keep their price.
        expect(w).toHaveTextContent("₹600");
    });

    it("keeps the price when the credit read fails", async () => {
        const credit = vi.fn<CreditFor>(() =>
            Promise.reject(new Error("offline")),
        );
        const { container } = week(look, credit);
        await act(() => Promise.resolve());
        expect(desk(container)).toHaveTextContent("₹700");
        expect(desk(container)).not.toHaveTextContent("pack");
    });

    it("on a phone, the days are real tabs that the arrow keys move along", () => {
        const { container } = week(look);
        const tabs = must(
            container.querySelector<HTMLElement>(
                '[data-site-look-timetable] [role="tablist"]',
            ),
        );
        const all = within(tabs).getAllByRole("tab");
        expect(all).toHaveLength(7);
        expect(all[0]).toHaveAttribute("aria-selected", "true");
        all.forEach((t) => expect(t.className).toContain("min-h-[64px]"));
        fireEvent.keyDown(tabs, { key: "ArrowRight" });
        expect(all[1]).toHaveAttribute("aria-selected", "true");
        expect(all[1]).toHaveFocus();
        const panel = must(
            container.querySelector<HTMLElement>(
                '[data-site-look-timetable] [role="tabpanel"]',
            ),
        );
        expect(panel).toHaveTextContent("Thursday 22 Oct");
        expect(panel).toHaveTextContent("Pranayama");
        fireEvent.keyDown(tabs, { key: "ArrowLeft" });
        fireEvent.keyDown(tabs, { key: "ArrowLeft" });
        expect(all[6]).toHaveAttribute("aria-selected", "true");
    });

    it("sets no label under 12px", () => {
        const { container } = week(look);
        noTinyText(must(container.querySelector("[data-site-look-timetable]")));
    });

    it("carries no rows and no pack words in the page a cache keeps", () => {
        // A live page: the week is read in the browser, so the server's
        // HTML has none of it, and never a customer's pack.
        const html = renderToStaticMarkup(
            <PageSections
                sections={[timetable]}
                look={look}
                bookHref="/book"
                siteId="site_live"
                apiUrl="https://api.test"
                credit={vi.fn<CreditFor>()}
            />,
        );
        expect(html).not.toContain("data-timetable-row");
        expect(html).not.toMatch(/pack class|membership/i);
    });
});

describe.each(LOOKS)("%s: the timetable as a live fact (U8)", (look) => {
    const live = () =>
        render(
            <PageSections
                sections={[timetable]}
                look={look}
                bookHref="/book"
                siteId="site_live"
                apiUrl="https://api.test"
            />,
        );

    it("reads the week once in the browser, and says when the places were checked", async () => {
        resetLiveReads();
        const fetched = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(WEEK), {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        );
        try {
            const { container } = live();
            // Loading first: the box, no rows.
            expect(
                container.querySelector('[data-live-state="loading"]'),
            ).not.toBeNull();
            await waitFor(() =>
                expect(
                    container.querySelector("[data-timetable-row]"),
                ).not.toBeNull(),
            );
            expect(fetched).toHaveBeenCalledTimes(1);
            expect(fetched).toHaveBeenCalledWith(
                "https://api.test/public/sites/site_live/timetable",
                expect.objectContaining({ cache: "no-store" }),
            );
            expect(
                container.querySelector("[data-timetable-checked]"),
            ).toHaveTextContent(/^Places checked /);
            expect(container).toHaveTextContent("3 places left");
        } finally {
            fetched.mockRestore();
            resetLiveReads();
        }
    });

    it("says the read failed with Try again, never an empty week", async () => {
        resetLiveReads();
        const fetched = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("{}", { status: 500 }));
        try {
            live();
            expect(
                await screen.findByText(/couldn.t load this week/),
            ).toBeInTheDocument();
            fireEvent.click(screen.getByRole("button", { name: "Try again" }));
            await waitFor(() => expect(fetched).toHaveBeenCalledTimes(2));
        } finally {
            fetched.mockRestore();
            resetLiveReads();
        }
    });
});

describe("Classic's timetable", () => {
    it("is unchanged: no prices, no waitlist, a full class not a link", () => {
        const { container } = week(undefined);
        expect(
            container.querySelector("[data-site-look-timetable]"),
        ).toBeNull();
        expect(container).not.toHaveTextContent("Join the waitlist");
        expect(container).not.toHaveTextContent("₹600");
    });
});

describe("Live's list: VB01's Next free", () => {
    it("draws every class in one row of cards, not the week across", () => {
        const { container } = page(
            [
                {
                    ...timetable,
                    content: { title: "Next free", variant: "list" },
                },
            ],
            "live",
            { fixtures: { timetable: WEEK } },
        );
        const rail = must(container.querySelector("[data-timetable-rail]"));
        expect(container.querySelector(".grid-cols-7")).toBeNull();
        expect(container.querySelector('[role="tablist"]')).toBeNull();
        const cards = rail.querySelectorAll("[data-timetable-row]");
        expect(cards).toHaveLength(WEEK.sessions.length);
        expect(cards[0]).toHaveTextContent("Today");
        expect(cards[0]).toHaveTextContent("Meera · 1 hr · ₹600");
        expect(cards[2]).toHaveTextContent("Thu 22 Oct");
        expect(cards[2]).toHaveTextContent("Full · waitlist open");
        expect(cards[2]).toHaveTextContent("Join the waitlist");
        // Folio and Quiet keep the week for the same section.
        const folio = page(
            [
                {
                    ...timetable,
                    content: { title: "Next free", variant: "list" },
                },
            ],
            "folio",
            { fixtures: { timetable: WEEK } },
        );
        expect(
            folio.container.querySelector("[data-timetable-rail]"),
        ).toBeNull();
    });
});

// ── Journal ─────────────────────────────────────────────────────────────

const FEED: JournalFeed = {
    basePath: "/journal",
    posts: [
        {
            title: "What to eat before a 7 am class",
            slug: "eat-before-class",
            excerpt: "A little, and early.",
            content:
                "<p>Most people ask me the same thing.</p><p>A banana is plenty.</p>",
            image: "https://media.test/tea.jpg",
            author: "Meera Iyer",
            publishedAt: "2026-10-12T04:00:00.000Z",
        },
        {
            title: "Why the 6 pm class has no music",
            slug: "no-music",
            excerpt: null,
            content: "<p>Quiet helps.</p>",
            image: null,
            author: "Kabir Menon",
            publishedAt: "2026-10-05T04:00:00.000Z",
        },
    ],
};

const journal = (extra: Record<string, unknown> = {}): Section => ({
    type: "journal",
    content: { title: "From the journal", ...extra },
});

describe.each(LOOKS)("%s: the journal", (look) => {
    it("draws a post with a photo in the photo's corners, and one without as a text card", () => {
        const { container } = page([journal({ variant: "default" })], look, {
            journal: FEED,
        });
        const cards = Array.from(
            container.querySelectorAll<HTMLElement>("[data-journal-card]"),
        );
        expect(cards.map((c) => c.dataset.journalCard)).toEqual([
            "photo",
            "text",
        ]);
        expect(cards[0].querySelector("img")?.className).toContain(
            "rounded-site-photo",
        );
        expect(cards[1].querySelector("img")).toBeNull();
        expect(cards[1]).toHaveTextContent("Why the 6 pm class has no music");
        expect(cards[1]).toHaveTextContent("Kabir Menon · 1 min");
        noButtonRadiusOn(
            Array.from(
                container.querySelectorAll(
                    "[data-journal-card] a, [data-journal-card] img",
                ),
            ),
        );
        noTinyText(container);
        expect(screen.getByRole("link", { name: "All posts" })).toHaveAttribute(
            "href",
            "/journal",
        );
    });

    it("draws the lead post in depth, its photo wide", () => {
        const { container } = page([journal({ variant: "lead" })], look, {
            journal: FEED,
        });
        expect(
            screen.getByRole("link", {
                name: "What to eat before a 7 am class",
            }),
        ).toHaveAttribute("href", "/journal/eat-before-class");
        expect(container).toHaveTextContent("A banana is plenty.");
        expect(
            screen.getByRole("link", { name: /^Continue reading/ }),
        ).toBeInTheDocument();
        expect(container.querySelector("img")?.className).toContain(
            "rounded-site-photo",
        );
    });

    it("draws the archive as the look's rows, every post dated", () => {
        const { container } = page([journal({ variant: "archive" })], look, {
            journal: FEED,
        });
        const rows = container.querySelectorAll(
            "[data-site-look-journal] ol li",
        );
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent("12 Oct 2026");
        noTinyText(container);
    });
});

// ── Plans and packs ─────────────────────────────────────────────────────

const PLANS: PublicPlan[] = [
    {
        id: "p_unlimited",
        name: "Unlimited monthly",
        description: "Every class, studio and live online.",
        price: "4500.00",
        currency: "INR",
        interval: "MONTH",
        mostChosen: true,
    },
    {
        id: "p_twice",
        name: "Twice a week",
        description: null,
        price: "3000.00",
        currency: "INR",
        interval: "MONTH",
        mostChosen: false,
    },
];

const TEN: PublicPack = {
    id: "pack_10",
    name: "10-class pack",
    description: null,
    credits: 10,
    validityDays: 90,
    price: "5500.00",
    currency: "INR",
    kind: "CLASSES",
    singlePrice: "700.00",
};

const plans: Section = { type: "plans", content: { title: "Memberships" } };
const packs: Section = { type: "packs", content: { title: "Class packs" } };

describe("the rules' words", () => {
    it("says the weeks a member may pause as the API gives them", () => {
        expect(weeksWords([2, 4, 8])).toBe("2, 4 or 8 weeks");
        expect(weeksWords([4])).toBe("4 weeks");
        expect(weeksWords([])).toBeNull();
    });
});

describe.each(LOOKS)("%s: plans and packs", (look) => {
    it("fills only the highlighted plan's Join, and says how long a member may pause", () => {
        const { container } = page([plans, packs], look, {
            plans: {
                plans: PLANS,
                joinHref: "/contact#enquiry",
                pauseWeeks: [2, 4, 8],
            },
            packs: { packs: [TEN], payOnline: false, askHref: "/contact" },
        });
        const primary = container.querySelectorAll("[data-site-primary]");
        expect(primary).toHaveLength(1);
        expect(primary[0]).toHaveAccessibleName(
            "Ask about joining: Unlimited monthly",
        );
        const columns = container.querySelectorAll("[data-plan-column]");
        expect(columns[0]).toHaveTextContent("Pause for 2, 4 or 8 weeks");
        expect(columns[0]).toHaveTextContent("Most chosen");
        // Beside plans, the pack's Buy is an outline, and says a
        // membership is used first.
        const pack = must(container.querySelector("[data-pack-column]"));
        expect(pack).toHaveTextContent("A membership is used before a pack.");
        expect(pack.querySelector("[data-site-primary]")).toBeNull();
        noButtonRadiusOn(Array.from(columns));
        noTinyText(container);
    });

    it("says nothing about pausing when the business doesn't allow it", () => {
        const { container } = page([plans], look, {
            plans: { plans: PLANS, joinHref: "/contact#enquiry" },
        });
        expect(container).not.toHaveTextContent(/pause/i);
    });

    it("fills the first pack's Buy on a page with no plans", () => {
        const { container } = page([packs], look, {
            packs: {
                packs: [TEN, { ...TEN, id: "pack_5", name: "5-class pack" }],
                payOnline: false,
                askHref: "/contact",
            },
        });
        const primary = container.querySelectorAll("[data-site-primary]");
        expect(primary).toHaveLength(1);
        expect(primary[0]).toHaveAccessibleName(/10-class pack$/);
        expect(container).not.toHaveTextContent("membership");
    });
});

describe("Live's plans and packs: one row (VB01)", () => {
    const feeds = {
        plans: { plans: PLANS.slice(0, 1), joinHref: "/contact#enquiry" },
        packs: { packs: [TEN], payOnline: false, askHref: "/contact" },
    };
    it("draws the pack, then the ink membership, in the plans' one row", () => {
        const { container } = page([plans, packs], "live", feeds);
        const lists = container.querySelectorAll(
            "[data-site-look-prices] ul:not([data-price-rules])",
        );
        expect(lists).toHaveLength(1);
        const cards = lists[0].querySelectorAll(
            "[data-pack-column], [data-plan-column]",
        );
        expect(cards[0]).toHaveAttribute("data-pack-column");
        expect(cards[1]).toHaveAttribute("data-plan-column");
        expect(cards[1].className).toContain("bg-site-cta-bg");
        // Its one filled button stays the plan's Join.
        expect(container.querySelectorAll("[data-site-primary]")).toHaveLength(
            1,
        );
        expect(container).not.toHaveTextContent("Class packs");
    });

    it("keeps two sections under Folio and Quiet", () => {
        for (const look of ["folio", "quiet"] as const) {
            const { container, unmount } = page([plans, packs], look, feeds);
            expect(
                container.querySelectorAll("[data-site-look-prices]"),
            ).toHaveLength(2);
            unmount();
        }
    });
});

// ── Visit us ────────────────────────────────────────────────────────────

const VISIT: PublicVisit = {
    source: "business",
    storeId: null,
    name: "Prana Yoga",
    address: "3 Hill Road\nHSR Layout, Bengaluru",
    phone: "+919845012345",
    hours: [
        { day: "MON", open: "06:00", close: "20:30", closed: false },
        { day: "TUE", open: "06:00", close: "20:30", closed: false },
        { day: "SUN", open: "00:00", close: "00:00", closed: true },
    ],
    timezone: "Asia/Kolkata",
};

describe.each(LOOKS)("%s: Visit us", (look) => {
    it("keeps Get directions as a link with a pin, no map, nothing filled", () => {
        const { container } = page(
            [{ type: "visitUs", content: { title: "Visit us" } }],
            look,
            {
                fixtures: {
                    visit: VISIT,
                    // A Monday at 9 am in Bengaluru.
                    now: "2026-10-19T03:30:00.000Z",
                },
            },
        );
        const directions = screen.getByRole("link", { name: "Get directions" });
        expect(directions.getAttribute("href")).toContain("google.com/maps");
        expect(directions.querySelector("svg")).not.toBeNull();
        expect(directions.className).toContain("min-h-11");
        expect(
            screen.getByRole("link", { name: /^Call / }),
        ).toBeInTheDocument();
        expect(container.querySelector("iframe")).toBeNull();
        expect(container.querySelector("[data-site-primary]")).toBeNull();
        expect(container).toHaveTextContent("Open now");
        expect(container).toHaveTextContent("Mon · today");
        expect(container).toHaveTextContent("Closed");
        noTinyText(container);
    });
});

// ── The rest, by tokens ─────────────────────────────────────────────────

describe("the blocks a look restyles by tokens", () => {
    it.each(LOOKS)(
        "%s: cards and photos take the look's card and photo radius",
        (look) => {
            const css = lookRules(":root", look, null);
            expect(css).toContain(
                '[class*="rounded-[calc(var(--site-radius)*1.4)]"]',
            );
            // Live's cards are 24, its photo radius (board VB).
            expect(css).toContain(
                look === "live"
                    ? "border-radius: var(--site-radius-photo)"
                    : "border-radius: var(--site-radius-s)",
            );
            expect(css).toContain('img[class*="rounded-[var(--site-radius)]"]');
            expect(css).toContain("border-radius: var(--site-radius-photo)");
        },
    );

    it.each(LOOKS)(
        "%s: the enquiry's Send is the page's one filled button",
        (look) => {
            const { container } = page(
                [
                    {
                        type: "enquiry",
                        content: {
                            title: "Ask us anything",
                            formId: "form_1",
                            fields: [
                                { name: "name", label: "Name", type: "text" },
                                {
                                    name: "message",
                                    label: "Message",
                                    type: "textarea",
                                },
                            ],
                        },
                    },
                ],
                look,
            );
            const send = screen.getByRole("button", { name: "Send" });
            expect(send).toHaveAttribute("data-site-primary");
            expect(
                container.querySelectorAll("[data-site-primary]"),
            ).toHaveLength(1);
            container
                .querySelectorAll("input, textarea")
                .forEach((field) =>
                    expect(field.className).toContain("rounded-site-s"),
                );
        },
    );

    it("Classic's enquiry is unchanged", () => {
        page([
            {
                type: "enquiry",
                content: {
                    formId: "form_1",
                    fields: [{ name: "name", label: "Name", type: "text" }],
                },
            },
        ]);
        expect(
            screen.getByRole("button", { name: "Send" }),
        ).not.toHaveAttribute("data-site-primary");
    });
});

/** An element the test needs to be there. */
function must<T>(el: T | null | undefined): T {
    if (el === null || el === undefined) throw new Error("not drawn");
    return el;
}
