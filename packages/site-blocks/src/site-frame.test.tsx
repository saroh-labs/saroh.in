import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HeroSection from "./blocks/hero";
import { PageSections } from "./section-renderer";
import { SiteFooter, SiteHeader, withShopLink } from "./site-chrome";
import { fontPairStacks, SiteTheme } from "./site-theme";

/**
 * The chrome and layout a template sets beside its blocks (industry
 * templates, polish pass): a section's anchor and band, the header's
 * in-page entries, the footer's left row, one column width for the page,
 * the mono face, and a hero heading kept for screen readers only.
 */

const css = (variables?: Record<string, string>) =>
    render(<SiteTheme variables={variables} />).container.querySelector("style")
        ?.textContent ?? "";

const text = (extra: Record<string, unknown>) => ({
    type: "richText",
    content: { format: "html", value: "<p>Hello</p>", ...extra },
});

describe("a section's frame", () => {
    it("puts the anchor on the wrapper as its id, and the band beside it", () => {
        const { container } = render(
            <PageSections
                sections={[
                    text({ anchor: "visit", band: "inverse" }),
                    text({}),
                ]}
            />,
        );
        const [first, second] = Array.from(
            container.querySelectorAll("[data-site-section]"),
        );
        expect(first).toHaveAttribute("id", "visit");
        expect(first).toHaveAttribute("data-site-band", "inverse");
        // A section that sets nothing is what it was: no id, no band.
        expect(second).not.toHaveAttribute("id");
        expect(second).not.toHaveAttribute("data-site-band");
    });

    it("never writes an anchor or band that fails the contract", () => {
        const { container } = render(
            <PageSections
                sections={[text({ anchor: '"><b>x', band: "neon" })]}
            />,
        );
        const wrapper = container.querySelector("[data-site-section]");
        expect(wrapper).not.toHaveAttribute("id");
        expect(wrapper).not.toHaveAttribute("data-site-band");
    });
});

describe("SiteTheme's section rules", () => {
    it("swaps ink and paper inside an inverse band, through aliases", () => {
        const out = css({ "--site-bg": "40 30% 96%" });
        expect(out).toContain("--site-band-ink: var(--site-fg);");
        expect(out).toMatch(
            /\[data-site-band="inverse"\] \{[^}]*--site-bg: var\(--site-band-ink\);[^}]*--site-fg: var\(--site-band-paper\);[^}]*--site-accent-fg: var\(--site-band-ink\);/,
        );
        expect(out).toMatch(
            /\[data-site-band="accent"\] \{[^}]*--site-fg: var\(--site-band-accent-fg\);/,
        );
        expect(out).toMatch(
            /\[data-site-band\] \{[^}]*background-color: hsl\(var\(--site-bg\)\);/,
        );
    });

    it("sets definition lists in the site's colours, inside sections only", () => {
        const out = css();
        expect(out).toMatch(
            /\[data-site-section\] \.prose dt \{[^}]*color: hsl\(var\(--site-fg\)\);/,
        );
        expect(out).toContain("[data-site-section] .prose dd");
    });

    it("writes one column for the page only when a template sets one", () => {
        expect(css({ "--site-bg": "40 30% 96%" })).not.toContain(
            "max-width: var(--site-content-width)",
        );
        const out = css({ "--site-content-width": "820px" });
        expect(out).toContain("--site-content-width: 820px;");
        expect(out).toMatch(
            /\[data-site-section\] :is\(\.max-w-screen-md, \.max-w-screen-lg, \.max-w-screen-xl\) \{\s*max-width: var\(--site-content-width\);/,
        );
    });

    it("drops a column width that is not a plain pixel length", () => {
        const out = css({ "--site-content-width": "100vw" });
        expect(out).not.toContain("max-width: var(--site-content-width)");
    });
});

describe("the mono face", () => {
    it("is part of a pair that names one, from the loaded faces", () => {
        expect(
            fontPairStacks("geist", {
                "JetBrains Mono": "'__JetBrains_Mono_a1'",
            })?.mono,
        ).toMatch(/^'__JetBrains_Mono_a1', ui-monospace/);
        expect(fontPairStacks("newsreader")).not.toHaveProperty("mono");
    });

    it("is written as --site-font-mono from the pair's key", () => {
        const out = css({
            "--site-bg": "40 30% 96%",
            "--site-font-mono": "archivo-narrow",
        });
        expect(out).toMatch(/--site-font-mono: "IBM Plex Mono", /);
    });

    it("is left out for a pair without one, so facts take the body face", () => {
        const out = css({
            "--site-bg": "40 30% 96%",
            "--site-font-mono": "newsreader",
        });
        expect(out).not.toContain("--site-font-mono:");
    });
});

describe("the header's in-page entries", () => {
    const NAV = [
        { label: "Today's bread", href: "/#today" },
        { label: "Visit", href: "/#visit" },
        { label: "About", href: "/about" },
    ];

    // jsdom is on "/", the home page: its sections are on the page.
    const HOME = [
        text({ anchor: "today", navLabel: "Today's bread" }),
        text({ anchor: "visit", navLabel: "Visit" }),
    ];
    const home = () => (
        <>
            <SiteHeader name="Rye & Co." navigation={NAV} />
            <PageSections sections={HOME} />
        </>
    );

    it("lists them as links to the home page's sections, never as the current page", () => {
        render(home());
        const row = screen.getByRole("navigation", { name: "Site" });
        const links = Array.from(row.querySelectorAll("a"));
        expect(links.map((a) => a.getAttribute("href"))).toEqual([
            "/#today",
            "/#visit",
            "/about",
        ]);
        // jsdom is on "/": a section of it is not "the page you are on".
        for (const link of links) {
            expect(link).not.toHaveAttribute("aria-current");
        }
    });

    it("keeps them on the preview's own home under a base path", () => {
        render(
            <SiteHeader
                name="Rye & Co."
                navigation={NAV}
                basePath="/preview/tok"
            />,
        );
        const row = screen.getByRole("navigation", { name: "Site" });
        expect(
            Array.from(row.querySelectorAll("a")).map((a) =>
                a.getAttribute("href"),
            ),
        ).toEqual([
            "/preview/tok#today",
            "/preview/tok#visit",
            "/preview/tok/about",
        ]);
    });

    it("lists them in the phone menu too, which closes when one is chosen", () => {
        render(home());
        const button = screen.getByRole("button", { name: "Menu" });
        act(() => button.click());
        const list = document.getElementById(
            button.getAttribute("aria-controls") ?? "",
        );
        const visit = Array.from(list?.querySelectorAll("a") ?? []).find(
            (a) => a.textContent === "Visit",
        );
        expect(visit).toHaveAttribute("href", "/#visit");
        act(() => visit?.click());
        expect(button).toHaveAttribute("aria-expanded", "false");
    });

    it("drops one a page entry names, unless that page's module is off", () => {
        const nav = [
            { label: "Membership", href: "/#membership" },
            { label: "Visit", href: "/#visit" },
            { label: "Membership", href: "/prices", kind: "PRICES" },
        ];
        const sections = [
            text({ anchor: "membership", navLabel: "Membership" }),
            text({ anchor: "visit", navLabel: "Visit" }),
        ];
        const hrefs = () =>
            Array.from(
                screen
                    .getByRole("navigation", { name: "Site" })
                    .querySelectorAll("a"),
            ).map((a) => a.getAttribute("href"));
        const { unmount } = render(
            <>
                <SiteHeader name="Iron & Oak" navigation={nav} />
                <PageSections sections={sections} />
            </>,
        );
        expect(hrefs()).toEqual(["/#visit", "/prices"]);
        unmount();
        render(
            <>
                <SiteHeader
                    name="Iron & Oak"
                    navigation={nav}
                    modules={{ PRICES: "off" }}
                />
                <PageSections sections={sections} />
            </>,
        );
        expect(hrefs()).toEqual(["/#membership", "/#visit"]);
    });

    it("puts Shop after them, not in front", () => {
        expect(withShopLink(NAV, true).map((i) => i.label)).toEqual([
            "Today's bread",
            "Visit",
            "Shop",
            "About",
        ]);
    });
});

describe("the left footer", () => {
    it("is one row: the name in the heading face, the line, Made with Saroh on Free", () => {
        const { container } = render(
            <SiteFooter
                name="Rye & Co."
                footer={{
                    format: "markdown",
                    value: "14 Hill Road, Bandra West · Closed Mondays",
                    layout: "left",
                }}
                credit={{ href: "https://saroh.in/?ref=k7m2p9qa" }}
            />,
        );
        const footer = container.querySelector("footer");
        expect(footer?.querySelector(".text-center")).toBeNull();
        const parts = Array.from(
            footer?.querySelectorAll(".flex > *") ?? [],
        ).map((el) => el.textContent);
        expect(parts).toEqual([
            "Rye & Co.",
            "14 Hill Road, Bandra West · Closed Mondays",
            "Made with Saroh",
        ]);
        expect(screen.getByText("Rye & Co.")).toHaveClass("font-site-heading");
        expect(
            screen.getByRole("link", { name: "Made with Saroh" }),
        ).toHaveClass("ml-auto");
    });

    it("keeps its layout with no line written: the name and Made with Saroh", () => {
        const { container } = render(
            <SiteFooter
                name="Rye & Co."
                footer={{ format: "html", value: "", layout: "left" }}
                credit={{ href: "https://saroh.in/?ref=k7m2p9qa" }}
            />,
        );
        expect(
            Array.from(container.querySelectorAll(".flex > *")).map(
                (el) => el.textContent,
            ),
        ).toEqual(["Rye & Co.", "Made with Saroh"]);
    });

    it("draws a footer richer than a line above the row, left-aligned", () => {
        const { container } = render(
            <SiteFooter
                name="Rye & Co."
                footer={{
                    format: "html",
                    value: "<p>One</p><p>Two</p>",
                    layout: "left",
                }}
            />,
        );
        const block = container.querySelector(".prose");
        expect(block?.innerHTML).toBe("<p>One</p><p>Two</p>");
        expect(block).not.toHaveClass("mx-auto");
    });
});

describe("a hero heading for screen readers only", () => {
    const hero = (extra: Record<string, unknown>) => ({
        variant: "none",
        heading: "Rye & Co.",
        ...extra,
    });

    it("keeps the page's h1, hidden, and takes no room with no line", () => {
        const { container } = render(
            <HeroSection content={hero({ titleVisible: false })} />,
        );
        const h1 = screen.getByRole("heading", { level: 1, name: "Rye & Co." });
        expect(h1).toHaveClass("sr-only");
        expect(container.querySelector("section")).toBeNull();
    });

    it("still shows the line under a hidden heading", () => {
        render(
            <HeroSection
                content={hero({
                    titleVisible: false,
                    subheading: "Notes from the kiln",
                })}
            />,
        );
        expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
            "sr-only",
        );
        expect(screen.getByText("Notes from the kiln")).toBeVisible();
    });

    it("shows the heading as before when titleVisible is absent", () => {
        render(<HeroSection content={hero({})} />);
        expect(screen.getByRole("heading", { level: 1 })).not.toHaveClass(
            "sr-only",
        );
    });
});
