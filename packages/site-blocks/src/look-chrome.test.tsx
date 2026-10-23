import type { LookId } from "@saroh/block-contract";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetLiveReads } from "./live/use-live-read";
import { dockTabs, withVisitUs } from "./look-chrome";
import { todayLine } from "./look-menu";
import { SiteFooter, SiteHeader } from "./site-chrome";
import type { SiteContact } from "./site-footer-contact";
import type { SiteHeaderAction } from "./site-header-menu";
import { chromeActionShows, chromePageKind } from "./site-primary-action";
import { pagePrimaries, StickyActions } from "./sticky-actions";
import { viewport } from "./test-viewport";

/**
 * The chrome under a look (DEC-172, plan U5, #1092): header, phone menu,
 * one fixed bar, footer and Live's dock, for Folio, Quiet and Live, and
 * Classic left exactly as it was.
 *
 * jsdom loads no Tailwind and lays nothing out, so what CSS decides (an
 * outline that fills, a width) is checked by the classes that decide it;
 * what a browser decides (one filled button in the first view, at most one
 * fixed bar, real 44px boxes) is `e2e/tests/site-looks-chrome.spec.ts`.
 */

const LOOKS: LookId[] = ["folio", "quiet", "live"];

const MENU = [
    { label: "Home", href: "/" },
    { label: "Classes", href: "/classes" },
    { label: "About", href: "/about" },
    { label: "Book a class", href: "/book", kind: "BOOK" },
];
const BOOK: SiteHeaderAction = { kind: "book", label: "Book", href: "/book" };

const CONTACT: SiteContact = {
    phone: "+919845012345",
    email: "hello@example.com",
    address: null,
    places: [
        {
            name: null,
            address: "27th Main, HSR Layout\nBengaluru 560102",
            hours: [
                { day: "MON", open: "06:00", close: "20:30", closed: false },
                { day: "TUE", open: "06:00", close: "20:30", closed: false },
                { day: "WED", open: "06:00", close: "20:30", closed: false },
                { day: "THU", open: "06:00", close: "20:30", closed: false },
                { day: "FRI", open: "06:00", close: "20:30", closed: false },
                { day: "SAT", open: "07:00", close: "12:00", closed: false },
                { day: "SUN", open: "00:00", close: "00:00", closed: true },
            ],
        },
    ],
    social: [{ network: "whatsapp", url: "https://wa.me/919845012345" }],
    timeZone: "Asia/Kolkata",
};

/** A filled button's class: the accent's fill, unconditionally. */
const FILLED = /(?:^|\s)bg-site-accent(?:\s|$)/;
/** Every target size a look's chrome may use, all 44px or more. */
const TALL =
    /(?:^|\s)(?:min-h-11|h-11|size-11|h-\[52px\]|min-h-\[52px\]|h-\[54px\])(?:\s|$)/;

function header(look: LookId | undefined, extra = {}) {
    return render(
        <SiteHeader
            name="Prana Yoga"
            navigation={MENU}
            action={BOOK}
            look={look}
            contact={CONTACT}
            session={{ signedIn: false, bookings: true }}
            {...extra}
        />,
    );
}

function go(path: string) {
    window.history.replaceState(null, "", path);
}

/** A stand-in for the browser's IntersectionObserver that a test drives. */
class FakeObserver {
    static all: FakeObserver[] = [];
    readonly watched = new Set<Element>();
    constructor(
        readonly callback: (
            entries: { target: Element; isIntersecting: boolean }[],
        ) => void,
    ) {
        FakeObserver.all.push(this);
    }
    observe(el: Element) {
        this.watched.add(el);
    }
    unobserve(el: Element) {
        this.watched.delete(el);
    }
    disconnect() {
        this.watched.clear();
    }
    static see(el: Element, on: boolean) {
        for (const io of FakeObserver.all) {
            if (io.watched.has(el)) {
                io.callback([{ target: el, isIntersecting: on }]);
            }
        }
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
    FakeObserver.all = [];
    document.documentElement.removeAttribute("data-site-primary");
    document.documentElement.removeAttribute("data-site-bar");
});

describe("Classic stays as it was", () => {
    it("draws Classic's header and footer when there is no look", () => {
        const { container } = header(undefined);
        expect(container.querySelector("[data-site-look-header]")).toBeNull();
        expect(screen.queryByText("Visit us")).toBeNull();
        render(
            <SiteFooter footer={null} name="Prana Yoga" contact={CONTACT} />,
        );
        expect(document.querySelector("[data-site-look-footer]")).toBeNull();
        expect(screen.queryByText("Your account")).toBeNull();
    });

    it("draws Classic for a look this build doesn't know", () => {
        const { container } = header("corner" as LookId);
        expect(container.querySelector("[data-site-look-header]")).toBeNull();
    });
});

describe.each(LOOKS)("%s's header", (look) => {
    it("names the look, keeps Visit us in the menu and draws Book as an outline", () => {
        const { container } = header(look);
        expect(
            container.querySelector(`[data-site-look-header="${look}"]`),
        ).not.toBeNull();
        const visit = screen.getAllByRole("link", { name: "Visit us" });
        expect(visit[0]).toHaveAttribute("href", "#site-visit");
        const book = screen.getByRole("link", { name: "Book" });
        // Outline until the page's own action has scrolled away.
        expect(book.className).not.toMatch(FILLED);
        expect(book.className).toContain(
            "[html[data-site-primary=gone]_&]:bg-site-accent",
        );
        // The menu doesn't list the booking page beside the Book button.
        expect(screen.queryByText("Book a class")).toBeNull();
    });

    it("holds every header control to 44px", () => {
        viewport("phone");
        const { container } = header(look, {
            bag: <button aria-label="Your bag, 2 items" className="size-10" />,
        });
        const controls = container.querySelectorAll<HTMLElement>(
            "[data-site-header] a, [data-site-header] button",
        );
        expect(controls.length).toBeGreaterThan(2);
        for (const control of Array.from(controls)) {
            // The bag and the account are the site's own controls, held to
            // 44px by the slot around them.
            const slot = control.closest("[class*='[&_button]:min-h-11']");
            if (slot) continue;
            expect(control.className, control.outerHTML).toMatch(TALL);
        }
    });

    it("shows the bag alone on the shop's pages, and no Book on /book", () => {
        go("/shop");
        const { unmount } = header(look, {
            bag: <button aria-label="Your bag, 2 items" />,
        });
        expect(screen.getByRole("button", { name: /Your bag/ })).toBeVisible();
        expect(screen.queryByRole("link", { name: "Book" })).toBeNull();
        unmount();

        go("/shop/sourdough");
        const product = header(look);
        expect(screen.queryByRole("link", { name: "Book" })).toBeNull();
        product.unmount();

        go("/book");
        header(look);
        expect(screen.queryByRole("link", { name: "Book" })).toBeNull();
    });
});

describe("Visit us", () => {
    it("is added once, never beside the merchant's own Visit us", () => {
        const own = [{ label: "Visit us", href: "/#visit" }];
        expect(withVisitUs(own, true)).toEqual(own);
        expect(withVisitUs(MENU, true).at(-1)).toEqual({
            label: "Visit us",
            href: "#site-visit",
        });
    });

    it("is left out when the business has nothing to visit", () => {
        expect(withVisitUs(MENU, false)).toEqual(MENU);
        header("quiet", { contact: null });
        expect(screen.queryByText("Visit us")).toBeNull();
    });
});

describe("the phone menu", () => {
    beforeEach(() => viewport("phone"));

    it("is a dialog that holds focus, closes on Escape and gives focus back", () => {
        const { container } = header("quiet");
        const button = screen.getByRole("button", { name: "Menu" });
        expect(button).toHaveAttribute("aria-haspopup", "dialog");
        fireEvent.click(button);

        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-modal", "true");
        const close = within(dialog).getByRole("button", {
            name: "Close menu",
        });
        expect(close).toHaveFocus();
        // The page behind can't be reached.
        expect(container).toHaveAttribute("inert");

        // Tab from the last stop comes round to the first.
        const stops = dialog.querySelectorAll<HTMLElement>(
            "a[href], button:not([disabled])",
        );
        const last = Array.from(stops).at(-1);
        last?.focus();
        fireEvent.keyDown(dialog, { key: "Tab" });
        expect(close).toHaveFocus();
        fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
        expect(last).toHaveFocus();

        fireEvent.keyDown(dialog, { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(container).not.toHaveAttribute("inert");
        expect(button).toHaveFocus();
    });

    it("holds the pages, Visit us with today's hours, Sign in, Call, WhatsApp and one filled Book", () => {
        header("folio");
        fireEvent.click(screen.getByRole("button", { name: "Menu" }));
        const dialog = screen.getByRole("dialog");
        const pages = within(dialog).getByRole("navigation", { name: "Pages" });
        expect(
            within(pages)
                .getAllByRole("link")
                .map((a) => a.textContent),
        ).toEqual(["Home", "Classes", "About", "Visit us"]);
        expect(
            within(dialog).getByText("27th Main, HSR Layout, Bengaluru 560102"),
        ).toBeVisible();
        expect(
            within(dialog).getByText(/^(Today: |Closed today)/),
        ).toBeVisible();
        expect(
            within(dialog).getByRole("link", { name: "Sign in" }),
        ).toHaveAttribute("href", "/account");
        expect(
            within(dialog).getByRole("link", { name: "Call +91 98450 12345" }),
        ).toHaveAttribute("href", "tel:+919845012345");
        expect(
            within(dialog).getByRole("link", { name: "Message on WhatsApp" }),
        ).toHaveAttribute("href", "https://wa.me/919845012345");
        const filled = Array.from(dialog.querySelectorAll("a, button")).filter(
            (el) => FILLED.test(el.className),
        );
        expect(filled.map((el) => el.textContent)).toEqual(["Book"]);
        for (const control of Array.from(
            dialog.querySelectorAll<HTMLElement>("a, button"),
        )) {
            expect(control.className, control.outerHTML).toMatch(
                /(?:^|\s)(?:min-h-11|size-11|h-\[52px\]|min-h-\[52px\])(?:\s|$)/,
            );
        }
    });

    it("says Your account to someone signed in, and nothing without accounts", () => {
        const { unmount } = header("live", { session: { signedIn: true } });
        fireEvent.click(screen.getByRole("button", { name: "Menu" }));
        expect(
            screen.getByRole("link", { name: "Your account" }),
        ).toBeVisible();
        expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        unmount();

        header("live", { session: null });
        fireEvent.click(screen.getByRole("button", { name: "Menu" }));
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).queryByText("Sign in")).toBeNull();
        expect(within(dialog).queryByText("Your account")).toBeNull();
    });

    it("reads today on the business's clock", () => {
        const hours = CONTACT.places?.[0]?.hours ?? null;
        // A Sunday evening in Bengaluru.
        expect(
            todayLine(hours, "Asia/Kolkata", new Date("2026-10-18T13:00:00Z")),
        ).toBe("Closed today");
        expect(
            todayLine(hours, "Asia/Kolkata", new Date("2026-10-19T03:00:00Z")),
        ).toBe("Today: 6am to 8:30pm");
        expect(todayLine(null, null, new Date())).toBeNull();
    });
});

describe("one filled button, one fixed bar", () => {
    beforeEach(() => {
        viewport("phone");
        vi.stubGlobal("IntersectionObserver", FakeObserver);
    });

    function page(look: LookId, extra: React.ReactNode = null) {
        return render(
            <>
                <main>
                    <a
                        href="/book"
                        className="bg-site-accent"
                        data-testid="hero-book"
                    >
                        Book a class
                    </a>
                    {extra}
                </main>
                <StickyActions
                    look={look}
                    action={BOOK}
                    dock={dockTabs({
                        home: "/",
                        // Classes only: About is a page the dock doesn't open.
                        pages: MENU.slice(1, 2),
                        action: BOOK,
                        accountHref: "/account",
                    })}
                />
            </>,
        );
    }

    it.each(["folio", "quiet"] as const)(
        "%s: the Book bar comes only once the page's own Book has scrolled away",
        (look) => {
            go("/about");
            page(look);
            const hero = screen.getByTestId("hero-book");
            act(() => FakeObserver.see(hero, true));
            expect(document.documentElement).toHaveAttribute(
                "data-site-primary",
                "shown",
            );
            expect(document.querySelector("[data-site-chrome-bar]")).toBeNull();
            expect(document.documentElement).toHaveAttribute(
                "data-site-bar",
                "none",
            );

            act(() => FakeObserver.see(hero, false));
            expect(document.documentElement).toHaveAttribute(
                "data-site-primary",
                "gone",
            );
            const bar = document.querySelector('[data-site-chrome-bar="book"]');
            expect(bar).not.toBeNull();
            expect(
                within(bar as HTMLElement).getByRole("link", { name: "Book" }),
            ).toHaveAttribute("href", "/book");
            expect(document.documentElement).toHaveAttribute(
                "data-site-bar",
                "book",
            );
        },
    );

    describe("the Book bar's Next free (U8)", () => {
        const realFetch = globalThis.fetch;
        afterEach(() => {
            resetLiveReads();
            globalThis.fetch = realFetch;
        });

        /** The Book bar, drawn. */
        function theBar(): HTMLElement {
            const el = document.querySelector<HTMLElement>(
                '[data-site-chrome-bar="book"]',
            );
            if (!el) throw new Error("no Book bar");
            return el;
        }

        function barPage(action: SiteHeaderAction) {
            return render(
                <>
                    <main>
                        <a
                            href="/book"
                            className="bg-site-accent"
                            data-testid="hero-book"
                        >
                            Book a class
                        </a>
                    </main>
                    <StickyActions
                        look="quiet"
                        action={action}
                        live={{
                            siteId: "site_1",
                            apiUrl: "https://api.example.com",
                        }}
                    />
                </>,
            );
        }

        it("says the next free time beside Book, read in the browser", async () => {
            globalThis.fetch = vi.fn<typeof fetch>(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({
                            timezone: "Asia/Kolkata",
                            date: "2026-10-20",
                            appointments: true,
                            classes: true,
                            items: [],
                            hours: null,
                            closedDates: [],
                            nextFree: {
                                kind: "class",
                                serviceId: "svc_1",
                                serviceName: "Vinyasa flow",
                                durationMinutes: 60,
                                startAt: "2026-10-20T12:30:00.000Z",
                                date: "2026-10-20",
                                time: "18:00",
                                staffName: null,
                                placesLeft: 4,
                            },
                        }),
                        { status: 200 },
                    ),
                ),
            );
            go("/about");
            barPage(BOOK);
            act(() => FakeObserver.see(screen.getByTestId("hero-book"), false));
            const bar = theBar();
            expect(
                await within(bar).findByText("Next free: today, 6:00 pm"),
            ).toBeInTheDocument();
            expect(
                within(bar).getByRole("link", { name: "Book" }),
            ).toHaveAttribute("href", "/book");
            expect(globalThis.fetch).toHaveBeenCalledWith(
                "https://api.example.com/public/sites/site_1/today",
                expect.objectContaining({ cache: "no-store" }),
            );
        });

        it("keeps Book where it is when the read fails, with an empty line", async () => {
            globalThis.fetch = vi.fn<typeof fetch>(() =>
                Promise.resolve(new Response("no", { status: 500 })),
            );
            go("/about");
            barPage(BOOK);
            act(() => FakeObserver.see(screen.getByTestId("hero-book"), false));
            const bar = theBar();
            await vi.waitFor(() =>
                expect(bar.querySelector("[data-live-fact]")).toHaveAttribute(
                    "data-live-state",
                    "failed",
                ),
            );
            expect(bar.querySelector("[data-live-fact]")?.textContent).toBe("");
            expect(
                within(bar).getByRole("link", { name: "Book" }),
            ).toBeInTheDocument();
        });

        it("reads nothing when the bar's action is not booking", () => {
            globalThis.fetch = vi.fn<typeof fetch>();
            go("/about");
            barPage({ kind: "shop", label: "Shop", href: "/shop" });
            act(() => FakeObserver.see(screen.getByTestId("hero-book"), false));
            expect(
                document.querySelector(
                    '[data-site-chrome-bar="book"] [data-live-fact]',
                ),
            ).toBeNull();
            expect(globalThis.fetch).not.toHaveBeenCalled();
        });
    });

    it("waits while the consent banner is open: it is the bar then", () => {
        go("/about");
        page("quiet", <div data-site-consent="">Cookies?</div>);
        const hero = screen.getByTestId("hero-book");
        act(() => FakeObserver.see(hero, false));
        expect(document.querySelector("[data-site-chrome-bar]")).toBeNull();
        expect(document.documentElement).toHaveAttribute(
            "data-site-bar",
            "none",
        );
    });

    it("waits while a sheet is open", () => {
        go("/about");
        page(
            "folio",
            <div role="dialog" aria-modal="true">
                Your bag
            </div>,
        );
        act(() => FakeObserver.see(screen.getByTestId("hero-book"), false));
        expect(document.querySelector("[data-site-chrome-bar]")).toBeNull();
    });

    it("draws no Book bar on /book or the shop's pages", () => {
        for (const path of ["/book", "/shop/sourdough", "/checkout"]) {
            go(path);
            const { unmount } = page("quiet");
            act(() => FakeObserver.see(screen.getByTestId("hero-book"), false));
            expect(document.querySelector("[data-site-chrome-bar]")).toBeNull();
            unmount();
        }
    });

    it("Live: the dock lights a tab only on its own page, and hides for a sheet", () => {
        go("/about");
        const { unmount } = page("live");
        const dock = screen.getByRole("navigation", { name: "Quick links" });
        expect(dock.querySelector("[aria-current]")).toBeNull();
        expect(
            within(dock)
                .getAllByRole("link")
                .map((a) => a.textContent),
        ).toEqual(["Home", "Classes", "Book", "You"]);
        // The dock's Book fills only while the page's own is off screen.
        const book = within(dock).getByRole("link", { name: "Book" });
        expect(book.className).not.toMatch(FILLED);
        for (const tab of within(dock).getAllByRole("link")) {
            expect(tab.className).toMatch(TALL);
        }
        unmount();

        go("/");
        page(
            "live",
            <div role="dialog" aria-modal="true">
                Menu
            </div>,
        );
        expect(
            screen.queryByRole("navigation", { name: "Quick links" }),
        ).toBeNull();
    });

    describe("on the account's pages (U12)", () => {
        /** The account's own bar, as `AccountLookFrame` draws it. */
        const accountBar = (
            <nav aria-label="Your account" data-site-chrome-bar="account">
                <a href="/account">Home</a>
            </nav>
        );

        it.each(["folio", "live"] as const)(
            "%s: the account's tabs are the one bar, never Book's or the dock",
            (look) => {
                go("/account/bookings");
                page(look, accountBar);
                act(() =>
                    FakeObserver.see(screen.getByTestId("hero-book"), false),
                );
                expect(
                    document.querySelectorAll("[data-site-chrome-bar]"),
                ).toHaveLength(1);
                expect(
                    document.querySelector('[data-site-chrome-bar="account"]'),
                ).not.toBeNull();
                expect(document.documentElement).toHaveAttribute(
                    "data-site-bar",
                    "account",
                );
                // Room under the footer for it.
                expect(
                    document.querySelector("[data-site-bar-room]"),
                ).not.toBeNull();
            },
        );

        it("signed out under Folio: no bar at all, and no room for one", () => {
            go("/account");
            page("folio");
            act(() => FakeObserver.see(screen.getByTestId("hero-book"), false));
            expect(document.querySelector("[data-site-chrome-bar]")).toBeNull();
            expect(document.querySelector("[data-site-bar-room]")).toBeNull();
        });

        it("the account's bar steps aside while a sheet is open", () => {
            go("/account/me");
            page(
                "live",
                <>
                    {accountBar}
                    <div role="dialog" aria-modal="true">
                        Sheet
                    </div>
                </>,
            );
            expect(document.documentElement).toHaveAttribute(
                "data-site-bar",
                "none",
            );
        });

        it("Quiet keeps Book's bar: its tabs sit at the top", () => {
            go("/account/bookings");
            page("quiet");
            act(() => FakeObserver.see(screen.getByTestId("hero-book"), false));
            expect(
                document.querySelector('[data-site-chrome-bar="book"]'),
            ).not.toBeNull();
        });
    });

    it("Live on the home: Home is the lit tab", () => {
        go("/");
        page("live");
        const dock = screen.getByRole("navigation", { name: "Quick links" });
        expect(
            within(dock).getByRole("link", { name: "Home" }),
        ).toHaveAttribute("aria-current", "page");
    });
});

describe("the page's own buttons", () => {
    afterEach(() => {
        document.documentElement.removeAttribute("data-site-primary");
        document.body.innerHTML = "";
    });

    it("never counts the root, which says whether one is shown", () => {
        document.documentElement.setAttribute("data-site-primary", "shown");
        document.body.innerHTML =
            '<main><a href="/book" data-site-primary="">Book</a></main>';
        const found = pagePrimaries(document);
        expect(found).toHaveLength(1);
        expect(found[0]?.tagName).toBe("A");
    });
});

describe("the dock's tabs", () => {
    it("keeps Home, the action, the shop and You before any page, five at most", () => {
        const tabs = dockTabs({
            home: "/",
            pages: [
                { label: "Timetable", href: "/timetable" },
                { label: "Plans", href: "/plans" },
                { label: "Gallery", href: "/gallery" },
                { label: "Jump", href: "/#visit" },
            ],
            action: BOOK,
            shopHref: "/shop",
            accountHref: "/account",
        });
        expect(tabs.map((t) => t.label)).toEqual([
            "Home",
            "Timetable",
            "Book",
            "Shop",
            "You",
        ]);
        expect(tabs.filter((t) => t.primary).map((t) => t.label)).toEqual([
            "Book",
        ]);
    });

    it("puts the action in the middle, as board VB lays it", () => {
        const tabs = dockTabs({
            home: "/",
            pages: [
                { label: "Timetable", href: "/timetable" },
                { label: "Plans", href: "/plans" },
            ],
            action: BOOK,
            accountHref: "/account",
        });
        expect(tabs.map((t) => t.label)).toEqual([
            "Home",
            "Timetable",
            "Book",
            "Plans",
            "You",
        ]);
    });
});

describe("chrome page kinds", () => {
    it("knows the booking page, the shop's pages and every other page", () => {
        expect(chromePageKind("/book")).toBe("book");
        expect(chromePageKind("/book/")).toBe("book");
        expect(chromePageKind("/shop")).toBe("shop");
        expect(chromePageKind("/shop/sourdough")).toBe("shop");
        expect(chromePageKind("/checkout/abc")).toBe("shop");
        expect(chromePageKind("/about")).toBe("page");
        expect(chromePageKind("/bookshelf")).toBe("page");
        expect(chromePageKind("/preview/t/book", "/preview/t")).toBe("book");
        expect(chromePageKind(null)).toBeNull();
        expect(chromeActionShows(null, BOOK)).toBe(true);
        expect(chromeActionShows("/about", BOOK)).toBe(true);
        expect(chromeActionShows("/book", BOOK)).toBe(false);
        expect(chromeActionShows("/contact", { href: "/contact" })).toBe(false);
        expect(chromeActionShows("/about", null)).toBe(false);
    });
});

describe.each(LOOKS)("%s's footer", (look) => {
    const footer = (session: { signedIn: boolean } | null) => (
        <SiteFooter
            look={look}
            footer={{ format: "markdown", value: "Yoga at your pace." }}
            name="Prana Yoga"
            contact={CONTACT}
            navigation={MENU}
            action={BOOK}
            session={session}
            credit={{
                href: "https://saroh.in/?ref=x",
                reportHref: "https://saroh.in/report",
            }}
            cookieChoices
        />
    );

    it("puts no account link and no name in the HTML a cache keeps", () => {
        const html = renderToString(footer({ signedIn: false }));
        expect(html).not.toContain("/account");
        expect(html).not.toContain("Sign in");
        expect(html).not.toContain("Your account");
        // Visit us lands on the footer's facts.
        expect(html).toContain('id="site-visit"');
    });

    it("follows the session in the browser: never Sign in to someone signed in", () => {
        const { unmount } = render(footer({ signedIn: false }));
        const account = screen.getByRole("navigation", {
            name: "Your account",
        });
        expect(
            within(account).getByRole("link", { name: "Sign in" }),
        ).toHaveAttribute("href", "/account");
        unmount();

        render(footer({ signedIn: true }));
        const mine = screen.getByRole("navigation", { name: "Your account" });
        expect(
            within(mine).queryByRole("link", { name: "Sign in" }),
        ).toBeNull();
        expect(
            within(mine).getByRole("link", { name: "Your account" }),
        ).toBeVisible();
    });

    it("keeps the business's WhatsApp chat, the facts and the credit, with 44px rows", () => {
        render(footer(null));
        const foot = screen.getByRole("contentinfo");
        expect(
            within(foot).getByRole("link", { name: "Message on WhatsApp" }),
        ).toHaveAttribute("href", "https://wa.me/919845012345");
        expect(
            within(foot).getByRole("link", { name: "Get directions" }),
        ).toBeVisible();
        expect(
            within(foot).getByRole("link", { name: /^Call / }),
        ).toBeVisible();
        expect(
            within(foot).getByRole("link", { name: "Made with Saroh" }),
        ).toBeVisible();
        expect(
            within(foot).getByRole("button", { name: "Cookie choices" }),
        ).toBeVisible();
        expect(within(foot).getByText("Yoga at your pace.")).toBeVisible();
        // No accounts on this site: no column for them.
        expect(within(foot).queryByText("Your account")).toBeNull();
        // The footer's Book is an outline: the view's filled button is the
        // page's own. Live's has none: its dock and page carry Book (VB).
        if (look === "live") {
            expect(
                within(foot).queryByRole("link", { name: "Book" }),
            ).toBeNull();
        } else {
            const book = within(foot).getByRole("link", { name: "Book" });
            expect(book.className).not.toMatch(FILLED);
        }
        for (const link of within(foot).getAllByRole("link")) {
            const row =
                TALL.test(link.className) ||
                link.closest("[class*='[&_a]:min-h-11']") !== null;
            expect(row, link.outerHTML).toBe(true);
        }
    });
});
