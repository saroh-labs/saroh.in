import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OpeningHoursDay, Weekday } from "./lib/opening-hours";
import { weekdayIn } from "./lib/opening-hours";
import { SiteFooter } from "./site-chrome";
import type { SiteContact } from "./site-footer-contact";
import { hasFooterFacts } from "./site-footer-contact";
import { FooterHours } from "./site-footer-hours";

/**
 * The footer that helps someone reach the business (the starter site
 * work): the site's pages, each place with its address, directions and its
 * week by day with today marked, how to get in touch, and the closing line
 * unchanged in meaning. With all of the facts, some, none, and several
 * places.
 */

const DAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** Monday to Friday 9 to 6, Saturday 10 to 2, Sunday closed. */
const WEEK: OpeningHoursDay[] = DAYS.map((day) => ({
    day,
    open: day === "SAT" ? "10:00" : "09:00",
    close: day === "SAT" ? "14:00" : "18:00",
    closed: day === "SUN",
}));

const NAV = [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Shop", href: "/shop", kind: "SHOP" },
    { label: "Contact", href: "/contact", kind: "CONTACT" },
];

const ALL: SiteContact = {
    phone: "+919845012345",
    email: "hello@rye.example.com",
    address: null,
    places: [
        {
            name: "Indiranagar",
            address: "12th Main\nIndiranagar, Bengaluru",
            hours: WEEK,
        },
    ],
    social: [
        { network: "instagram", url: "https://www.instagram.com/rye" },
        { network: "whatsapp", url: "https://wa.me/919845012345" },
    ],
    timeZone: "Asia/Kolkata",
};

/** Wednesday 7 October 2026, 11:00 in India. */
const WEDNESDAY = new Date("2026-10-07T05:30:00Z");

const headings = (level: number) =>
    screen.queryAllByRole("heading", { level }).map((h) => h.textContent);

/** A week as listed: each line's days, its hours, and whether it is today's. */
function week(within_: Element | null) {
    return Array.from(
        within_?.querySelectorAll("[data-site-hours] dl > div") ?? [],
    ).map((line) => ({
        days: (line.querySelector("dt")?.firstChild?.textContent ?? "").trim(),
        hours: line.querySelector("dd")?.textContent,
        today: line.hasAttribute("data-today"),
    }));
}

describe("the footer with every fact", () => {
    const all = () =>
        render(
            <SiteFooter
                footer={{ format: "markdown", value: "Baked every morning" }}
                name="Rye & Co."
                contact={ALL}
                navigation={NAV}
                credit={{ href: "https://saroh.in/?ref=k7m2p9qa" }}
                now={WEDNESDAY}
            />,
        );

    it("leads with the name, then a column for each kind of fact", () => {
        all();
        const footer = screen.getByRole("contentinfo");
        expect(
            footer.querySelector("[data-site-footer-name]")?.textContent,
        ).toBe("Rye & Co.");
        expect(footer.querySelector("[data-site-footer-name]")).toHaveClass(
            "font-site-heading",
        );
        expect(headings(2)).toEqual(["Find us", "Get in touch", "Pages"]);
    });

    it("lists the site's menu, every page in it", () => {
        all();
        const pages = screen.getByRole("navigation", { name: "Pages" });
        const links = within(pages).getAllByRole("link");
        expect(links.map((a) => a.textContent)).toEqual([
            "Home",
            "About",
            "Shop",
            "Contact",
        ]);
        expect(links.map((a) => a.getAttribute("href"))).toEqual([
            "/",
            "/about",
            "/shop",
            "/contact",
        ]);
    });

    it("gives the address as an <address> with Get directions", () => {
        all();
        const address = document.querySelector("footer address");
        expect(address?.textContent).toBe("12th Main\nIndiranagar, Bengaluru");
        const directions = screen.getByRole("link", { name: "Get directions" });
        expect(directions).toHaveAttribute("target", "_blank");
        expect(directions).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("lays the week out by day, closed days stated, today marked", () => {
        all();
        const place = screen.getByRole("heading", { name: "Find us" });
        expect(week(place.parentElement)).toEqual([
            { days: "Monday to Friday", hours: "9am to 6pm", today: true },
            { days: "Saturday", hours: "10am to 2pm", today: false },
            { days: "Sunday", hours: "Closed", today: false },
        ]);
        // Today is marked by weight and by a word a screen reader says:
        // never by a tint of the footer's colour nobody checked.
        const today = document.querySelector("[data-today]");
        expect(today?.querySelector("dt")).toHaveClass("font-bold");
        expect(today?.querySelector("dd")).toHaveClass("font-bold");
        expect(today?.querySelector("dt .sr-only")?.textContent).toBe(
            ", today",
        );
        expect(document.querySelectorAll("[data-today]")).toHaveLength(1);
    });

    it("offers the phone, WhatsApp and the email, each its own kind of link", () => {
        all();
        expect(
            screen.getByRole("link", { name: "Call +91 98450 12345" }),
        ).toHaveAttribute("href", "tel:+919845012345");
        expect(
            screen.getByRole("link", { name: "Message on WhatsApp" }),
        ).toHaveAttribute("href", "https://wa.me/919845012345");
        expect(
            screen.getByRole("link", { name: "hello@rye.example.com" }),
        ).toHaveAttribute("href", "mailto:hello@rye.example.com");
        expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute(
            "href",
            "https://www.instagram.com/rye",
        );
    });

    it("keeps the closing line and the credit as they were", () => {
        all();
        const credit = screen.getByRole("link", { name: "Made with Saroh" });
        expect(credit).toHaveAttribute(
            "href",
            "https://saroh.in/?ref=k7m2p9qa",
        );
        expect(credit.closest("p")?.textContent).toBe(
            "Baked every morning · Made with Saroh",
        );
    });

    it("says the name once: it leads the columns, so the closing line doesn't repeat it", () => {
        render(
            <SiteFooter
                footer={null}
                name="Rye & Co."
                contact={ALL}
                credit={{ href: "https://saroh.in/?ref=k7m2p9qa" }}
            />,
        );
        const footer = screen.getByRole("contentinfo");
        expect(footer.textContent.match(/Rye & Co\./g)).toHaveLength(1);
        expect(
            screen.getByRole("link", { name: "Made with Saroh" }).closest("p")
                ?.textContent,
        ).toBe("Made with Saroh");
    });

    it("stacks on a phone and sits in columns from there up", () => {
        all();
        const grid = document.querySelector("[data-site-contact]");
        expect(grid).toHaveClass("grid", "grid-cols-1");
        expect(grid?.className).toContain(
            "sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]",
        );
    });

    it("draws every word in the footer's own colour at full strength", () => {
        all();
        const html = screen.getByRole("contentinfo").innerHTML;
        // A tint is for hairlines only: text is never a faded footer colour.
        expect(html).not.toMatch(/text-site-footer-fg\/\d/);
        // (A link may still fade while it is hovered or pressed.)
        expect(html).not.toMatch(/(?<![:\w-])opacity-\d/);
        expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(html).not.toMatch(/\b(?:bg|text)-(?:black|white)\b/);
    });
});

describe("the footer with some of the facts", () => {
    it("draws a column only for what is set", () => {
        render(
            <SiteFooter
                footer={null}
                name="Rye"
                contact={{ phone: "+919845012345", address: null }}
            />,
        );
        expect(headings(2)).toEqual(["Get in touch"]);
        expect(screen.queryByRole("navigation")).toBeNull();
        expect(document.querySelector("address")).toBeNull();
        expect(document.querySelector("[data-site-hours]")).toBeNull();
    });

    it("lists the pages alone for a site with a menu and no contact", () => {
        render(<SiteFooter footer={null} name="Rye" navigation={NAV} />);
        expect(headings(2)).toEqual(["Pages"]);
    });

    it("gives a place with no hours its address and directions, and no week", () => {
        render(
            <SiteFooter
                footer={null}
                name="Rye"
                contact={{
                    phone: null,
                    address: null,
                    places: [{ name: null, address: "12th Main", hours: null }],
                }}
            />,
        );
        expect(headings(2)).toEqual(["Find us"]);
        expect(headings(3)).toEqual([]);
        expect(
            screen.getByRole("link", { name: "Get directions" }),
        ).toBeInTheDocument();
    });

    it("lists no week for a place whose every day is closed", () => {
        render(
            <SiteFooter
                footer={null}
                name="Rye"
                contact={{
                    phone: null,
                    address: null,
                    places: [
                        {
                            name: null,
                            address: "12th Main",
                            hours: WEEK.map((d) => ({ ...d, closed: true })),
                        },
                    ],
                }}
            />,
        );
        expect(screen.queryByText("Opening hours")).toBeNull();
        expect(screen.queryByText("Closed")).toBeNull();
    });

    it("follows the modules, as the header's menu does", () => {
        render(
            <SiteFooter
                footer={null}
                name="Rye"
                navigation={NAV}
                modules={{ SHOP: "off" }}
            />,
        );
        expect(
            within(screen.getByRole("navigation", { name: "Pages" }))
                .getAllByRole("link")
                .map((a) => a.textContent),
        ).toEqual(["Home", "About", "Contact"]);
    });

    it("lists Shop while the shop serves, and keeps links inside a draft preview", () => {
        render(
            <SiteFooter
                footer={null}
                name="Rye"
                navigation={[
                    { label: "Home", href: "/" },
                    { label: "About", href: "/about" },
                ]}
                shopServes
                basePath="/preview/tok"
            />,
        );
        const links = within(
            screen.getByRole("navigation", { name: "Pages" }),
        ).getAllByRole("link");
        expect(links.map((a) => a.textContent)).toEqual([
            "Home",
            "Shop",
            "About",
        ]);
        expect(links.map((a) => a.getAttribute("href"))).toEqual([
            "/preview/tok",
            "/preview/tok/shop",
            "/preview/tok/about",
        ]);
    });
});

describe("the footer with none of the facts", () => {
    it("is one tidy line, with no column and no heading", () => {
        for (const contact of [
            null,
            { phone: null, email: null, address: null, places: [], social: [] },
            { phone: " ", email: "", address: "  " },
        ]) {
            const { unmount } = render(
                <SiteFooter
                    footer={null}
                    name="Kavi Dental"
                    contact={contact}
                />,
            );
            const footer = screen.getByRole("contentinfo");
            expect(footer.textContent).toBe("Kavi Dental");
            expect(screen.queryAllByRole("heading")).toEqual([]);
            expect(footer.querySelector("[data-site-contact]")).toBeNull();
            expect(footer.querySelector("[data-site-footer-name]")).toBeNull();
            expect(footer.querySelectorAll("p")).toHaveLength(1);
            // No hairline over a line with nothing above it.
            expect(footer.innerHTML).not.toContain("border-site-footer-fg");
            unmount();
        }
    });

    it("knows when there is nothing to lay out", () => {
        expect(hasFooterFacts(null)).toBe(false);
        expect(hasFooterFacts({ phone: " ", address: null }, [])).toBe(false);
        expect(hasFooterFacts(null, [{ label: "Home", href: "/" }])).toBe(true);
    });

    it("never draws a heading with nothing under it", () => {
        render(
            <SiteFooter
                footer={null}
                name="Rye"
                contact={{
                    phone: null,
                    address: null,
                    social: [
                        // Not Instagram's own address: never drawn.
                        { network: "instagram", url: "https://evil.example" },
                    ],
                }}
            />,
        );
        expect(screen.queryAllByRole("heading")).toEqual([]);
    });
});

describe("the footer with several places", () => {
    const TWO: SiteContact = {
        ...ALL,
        places: [
            { name: "Indiranagar", address: "12th Main", hours: WEEK },
            {
                name: "Koramangala",
                address: "80 Feet Road",
                hours: WEEK.map((d) => ({
                    ...d,
                    closed: d.closed || d.day === "MON",
                })),
                mapUrl: "https://maps.app.goo.gl/AbC123xyZ",
            },
            { name: "  ", address: "4 Church Street" },
        ],
    };

    it("lists each one under its own name, with its own address, directions and week", () => {
        render(
            <SiteFooter
                footer={null}
                name="Rye"
                contact={TWO}
                now={WEDNESDAY}
            />,
        );
        // A place with no name of its own is still a column: "Find us".
        expect(headings(2)).toEqual([
            "Indiranagar",
            "Koramangala",
            "Find us",
            "Get in touch",
        ]);
        expect(
            Array.from(document.querySelectorAll("footer address")).map(
                (a) => a.textContent,
            ),
        ).toEqual(["12th Main", "80 Feet Road", "4 Church Street"]);
        expect(
            screen.getAllByRole("link", { name: "Get directions" }),
        ).toHaveLength(3);

        const second = screen.getByRole("heading", { name: "Koramangala" });
        expect(week(second.parentElement)).toEqual([
            { days: "Monday", hours: "Closed", today: false },
            { days: "Tuesday to Friday", hours: "9am to 6pm", today: true },
            { days: "Saturday", hours: "10am to 2pm", today: false },
            { days: "Sunday", hours: "Closed", today: false },
        ]);
        // The place with no hours lists none.
        const third = screen.getByRole("heading", { name: "Find us" });
        expect(week(third.parentElement)).toEqual([]);
    });
});

describe("today, in the footer's week", () => {
    it("is the day on the business's clock, not the visitor's", () => {
        // 20:00 UTC on Wednesday is already Thursday in India, and still
        // Wednesday in New York (where this suite's clock is set).
        const late = new Date("2026-10-07T20:00:00Z");
        expect(weekdayIn(late, "Asia/Kolkata")).toBe("THU");
        expect(weekdayIn(late, "America/New_York")).toBe("WED");

        const split = WEEK.map((d) => ({
            ...d,
            close: d.day === "THU" ? "20:00" : d.close,
        }));
        const marked = (timeZone: string | null) => {
            const { container, unmount } = render(
                <FooterHours
                    hours={split}
                    timeZone={timeZone}
                    now={late}
                    labelClassName=""
                />,
            );
            const day = container
                .querySelector("[data-today] dt")
                ?.firstChild?.textContent?.trim();
            unmount();
            return day;
        };
        expect(marked("Asia/Kolkata")).toBe("Thursday");
        expect(marked("America/New_York")).toBe("Monday to Wednesday");
        // No zone known, or one that isn't a zone: India (DEC-033).
        expect(marked(null)).toBe("Thursday");
        expect(marked("Not/AZone")).toBe("Thursday");
    });

    it("marks no day on the server, where a kept page would be wrong tomorrow", () => {
        const html = renderToStaticMarkup(
            <FooterHours
                hours={WEEK}
                timeZone="Asia/Kolkata"
                labelClassName=""
            />,
        );
        // The whole week is in the HTML, with scripts off too.
        expect(html).toContain("Monday to Friday");
        expect(html).toContain("9am to 6pm");
        expect(html).toContain("Closed");
        expect(html).not.toContain("data-today");
        expect(html).not.toContain("today");
    });

    it("marks today in the browser once the page has loaded", () => {
        const { container } = render(
            <FooterHours
                hours={WEEK}
                timeZone="Asia/Kolkata"
                labelClassName=""
            />,
        );
        expect(container.querySelectorAll("[data-today]")).toHaveLength(1);
    });
});

describe("the left layout keeps its row under the columns", () => {
    it("draws the facts above the designs' row, which still carries the name", () => {
        const { container } = render(
            <SiteFooter
                footer={{
                    format: "markdown",
                    value: "Open daily",
                    layout: "left",
                }}
                name="Rye"
                contact={ALL}
                navigation={NAV}
                credit={{ href: "https://saroh.in/?ref=k7m2p9qa" }}
            />,
        );
        expect(headings(2)).toEqual(["Find us", "Get in touch", "Pages"]);
        // The row says the name, so nothing leads the columns with it.
        expect(container.querySelector("[data-site-footer-name]")).toBeNull();
        expect(screen.getByText("Rye")).toHaveClass("font-site-heading");
        expect(
            screen.getByRole("link", { name: "Made with Saroh" }),
        ).toHaveClass("ml-auto");
        expect(container.querySelector(".text-center")).toBeNull();
    });
});
