import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RenderedCtaSection } from "@saroh/block-contract";

import { PageSections } from "../section-renderer";
import type { CtaSurface } from "./cta";
import CtaSection, { CtaButton, ctaClasses } from "./cta";
import { ctaBandWords, ctaTarget } from "./cta-words";

/**
 * The closing band always has words (the starter site work): a heading and
 * a line beside its button, the content's own or composed from what the
 * button does and whose site it is. And the states every shared button
 * carries.
 */

const band = (
    over: Partial<RenderedCtaSection> & Record<string, unknown>,
): RenderedCtaSection => ({ label: "Get started", href: "/contact", ...over });

describe("what a band's button does", () => {
    it("reads the action's kind, then the address", () => {
        const cases: [Parameters<typeof ctaTarget>[0], string][] = [
            [{ href: "/book" }, "book"],
            [{ href: "/book/?service=cut#times" }, "book"],
            [{ href: "/preview/tok/book" }, "book"],
            [{ href: "/shop" }, "shop"],
            [{ href: "/contact/" }, "contact"],
            [{ href: "tel:+919845012345" }, "call"],
            [{ href: "+919845012345", action: { kind: "call" } }, "call"],
            [{ href: "https://wa.me/919845012345" }, "whatsapp"],
            [{ href: "/x", action: { kind: "whatsapp" } }, "whatsapp"],
            [{ href: "mailto:hi@rye.example.com" }, "email"],
            [{ href: "/about" }, "other"],
            [{ href: "/booking-terms" }, "other"],
            [{ href: "https://example.com/book" }, "other"],
            [{ href: "//example.com/shop" }, "other"],
            [{ href: "" }, "other"],
        ];
        for (const [content, target] of cases) {
            expect(ctaTarget(content), content.href).toBe(target);
        }
    });
});

describe("the band's composed words", () => {
    it("says what the button does, and whose site it is", () => {
        const cases: [string, string, string][] = [
            [
                "/book",
                "Book a time with Pulse Fitness",
                "Choose a time that suits you.",
            ],
            [
                "/shop",
                "Order from Pulse Fitness",
                "Take a look at what we have.",
            ],
            [
                "/contact",
                "Get in touch with Pulse Fitness",
                "Ask a question, or tell us what you need.",
            ],
            [
                "tel:+919845012345",
                "Call Pulse Fitness",
                "Talk to us on the phone.",
            ],
            [
                "https://wa.me/919845012345",
                "Message Pulse Fitness on WhatsApp",
                "Send a message to start the conversation.",
            ],
            [
                "mailto:hi@pulse.example.com",
                "Email Pulse Fitness",
                "Write to us with your question.",
            ],
        ];
        for (const [href, heading, text] of cases) {
            expect(ctaBandWords(band({ href }), "Pulse Fitness"), href).toEqual(
                { heading, text },
            );
        }
    });

    it("doesn't say the name twice when the button already does", () => {
        // What every existing starter site's band holds.
        expect(
            ctaBandWords(
                band({ label: "Work with Northwind Supply" }),
                "Northwind Supply",
            ),
        ).toEqual({
            heading: "Get in touch",
            text: "Ask a question, or tell us what you need.",
        });
        expect(
            ctaBandWords(
                band({ label: "BOOK WITH PULSE FITNESS", href: "/book" }),
                "Pulse Fitness",
            ).heading,
        ).toBe("Book a time");
    });

    it("names no one when it isn't told whose site it is", () => {
        for (const name of [undefined, null, "", "   "]) {
            expect(ctaBandWords(band({ href: "/book" }), name)).toEqual({
                heading: "Book a time",
                text: "Choose a time that suits you.",
            });
        }
    });

    it("says only the name over a button it can't read, and adds no line", () => {
        expect(
            ctaBandWords(
                band({ label: "Read our story", href: "/about" }),
                "Rye & Co.",
            ),
        ).toEqual({ heading: "Rye & Co.", text: null });
        // With no name either, the button's own words are all that's true.
        expect(
            ctaBandWords(band({ label: "Read our story", href: "/about" })),
        ).toEqual({ heading: "Read our story", text: null });
    });

    it("never invents a promise", () => {
        const promises =
            /\b(free|fast|quick|best|guarantee|instant|today|always|within|24|reply|respond|expert|trusted|quality)\b/i;
        for (const href of [
            "/book",
            "/shop",
            "/contact",
            "tel:+91",
            "https://wa.me/91",
            "mailto:a@b.example.com",
            "/about",
        ]) {
            const { heading, text } = ctaBandWords(band({ href }), "Rye");
            expect(`${heading} ${text ?? ""}`, href).not.toMatch(promises);
            expect(`${heading} ${text ?? ""}`).not.toContain("!");
        }
    });

    it("uses the content's own heading and line when it gives them", () => {
        expect(
            ctaBandWords(
                band({
                    href: "/book",
                    heading: "  Come in this week  ",
                    text: "We open at six.",
                }),
                "Pulse",
            ),
        ).toEqual({ heading: "Come in this week", text: "We open at six." });
        // A written heading stands alone: no line is composed beside it.
        expect(
            ctaBandWords(band({ href: "/book", heading: "Come in" }), "Pulse"),
        ).toEqual({ heading: "Come in", text: null });
        // A written line keeps a composed heading over it.
        expect(
            ctaBandWords(band({ href: "/book", text: "We open at six." }), "P"),
        ).toEqual({ heading: "Book a time with P", text: "We open at six." });
        // Anything that isn't words is no words.
        expect(
            ctaBandWords(band({ href: "/book", heading: 3, text: {} }), "P")
                .heading,
        ).toBe("Book a time with P");
    });
});

describe("the closing band", () => {
    it("is never a lone button: a heading, a line and the button", () => {
        const { container } = render(
            <CtaSection
                content={band({ label: "Work with Northwind Supply" })}
                siteName="Northwind Supply"
            />,
        );
        const heading = screen.getByRole("heading", { level: 2 });
        expect(heading.textContent).toBe("Get in touch");
        expect(heading).toHaveClass("font-site-heading", "text-balance");
        expect(
            screen.getByText("Ask a question, or tell us what you need."),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Work with Northwind Supply" }),
        ).toHaveAttribute("href", "/contact");

        // On the band's own colours, edge to edge, and never the accent.
        const section = container.querySelector("section");
        expect(section).toHaveClass(
            "bg-site-cta-bg",
            "text-site-cta-fg",
            "w-full",
        );
        expect(section).toHaveAttribute("data-site-ground", "cta");
        expect(container.innerHTML).not.toContain("site-accent");
        // Words beside the button at the desk, above it on a phone.
        expect(section?.firstElementChild).toHaveClass(
            "flex-col",
            "md:flex-row",
            "max-w-screen-xl",
        );
    });

    it("has a heading even when nothing says whose site it is", () => {
        render(<CtaSection content={band({ href: "/shop" })} />);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
            "Browse the shop",
        );
    });

    it("takes the site's name from the page it is on", () => {
        render(
            <PageSections
                sections={[{ type: "cta", content: band({ href: "/book" }) }]}
                siteName="Pulse Fitness"
            />,
        );
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
            "Book a time with Pulse Fitness",
        );
    });
});

describe("the states every shared button carries", () => {
    const STYLES = ["primary", "secondary", "link"] as const;
    const SURFACES: CtaSurface[] = ["page", "hero", "band", "photo"];

    it("has hover, focus-visible, pressed and disabled on every style and surface", () => {
        for (const surface of SURFACES) {
            for (const style of STYLES) {
                const classes = ctaClasses(style, surface);
                const at = `${style} on ${surface}`;
                expect(classes, at).toMatch(/\bhover:/);
                expect(classes, at).toContain("focus-visible:ring-2");
                expect(classes, at).toContain("focus-visible:ring-offset-2");
                expect(classes, at).toContain("focus-visible:outline-none");
                expect(classes, at).toContain("active:scale-[0.98]");
                expect(classes, at).toContain("disabled:opacity-55");
                expect(classes, at).toContain("disabled:pointer-events-none");
                expect(classes, at).toContain("aria-disabled:opacity-55");
                // A full target under a thumb.
                expect(classes, at).toContain("coarse:min-h-11");
            }
        }
    });

    it("draws each surface's ring in a colour that surface's palette holds against it", () => {
        const ring = (surface: CtaSurface) =>
            ctaClasses("primary", surface)
                .split(" ")
                .filter(
                    (c) =>
                        c.startsWith("focus-visible:ring-") &&
                        c.includes("site"),
                )
                .sort();
        expect(ring("page")).toEqual([
            "focus-visible:ring-offset-site-bg",
            "focus-visible:ring-site-accent",
        ]);
        expect(ring("hero")).toEqual([
            "focus-visible:ring-offset-site-hero-bg",
            "focus-visible:ring-site-hero-fg",
        ]);
        expect(ring("band")).toEqual([
            "focus-visible:ring-offset-site-cta-bg",
            "focus-visible:ring-site-cta-fg",
        ]);
        expect(ring("photo")).toEqual([
            "focus-visible:ring-offset-site-fg",
            "focus-visible:ring-site-bg",
        ]);
    });

    it("moves on one short curve, never everything at once", () => {
        const classes = ctaClasses("primary");
        expect(classes).toContain("duration-150");
        expect(classes).toContain("ease-[cubic-bezier(0.2,0.8,0.2,1)]");
        expect(classes).not.toContain("transition-all");
    });

    it("draws nothing of Saroh's, and no black or white, in any of them", () => {
        for (const surface of SURFACES) {
            for (const style of STYLES) {
                const classes = ctaClasses(style, surface);
                expect(classes).not.toMatch(
                    /\b(?:bg|text|border|ring)-(?:primary|brand|foreground|background|black|white)\b/,
                );
            }
        }
    });

    it("says a button that goes nowhere is unavailable, and looks it", () => {
        render(<CtaButton content={{ label: "Book now", href: "  " }} />);
        const dead = screen.getByText("Book now");
        expect(dead.tagName).toBe("SPAN");
        expect(dead).toHaveAttribute("aria-disabled", "true");
        expect(dead).not.toHaveAttribute("href");
        expect(dead.className).toContain("aria-disabled:opacity-55");
    });
});
