import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CtaSection from "./cta";
import HeroSection from "./hero";
import { DESK_ONLY, PHONE_ONLY, phoneVersion } from "./phone-text";
import RichTextSection from "./rich-text";

/**
 * Phone text (U7, KD9, DEC-227): both versions in the page, one shown per
 * width by a class that is `display: none` on the other, so a button's
 * accessible name is the label on screen. Empty phone text draws the desk's
 * words alone. The h1 never has a phone version.
 */

/** The words a width shows: the element's text without the other width's copy. */
function shown(el: Element, hide: string): string {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll(`[class~="${hide}"]`).forEach((n) => n.remove());
    return copy.textContent;
}

describe("phoneVersion", () => {
    it("is null for nothing, whitespace, an empty paragraph or the same words", () => {
        expect(phoneVersion(undefined, "Book a chair")).toBeNull();
        expect(phoneVersion("", "Book a chair")).toBeNull();
        expect(phoneVersion("   ", "Book a chair")).toBeNull();
        expect(phoneVersion("<p> </p>", "<p>Long</p>")).toBeNull();
        expect(phoneVersion("Book a chair ", "Book a chair")).toBeNull();
        expect(phoneVersion("Book", "Book a chair")).toBe("Book");
    });
});

describe("a button with a phone label", () => {
    it("has both labels in the page, one per width, and its name is the one on screen", () => {
        render(
            <CtaSection
                content={{
                    label: "Book a chair",
                    phoneLabel: "Book",
                    href: "/book",
                }}
            />,
        );
        const link = screen.getByRole("link");
        const desk = link.querySelector(`[class~="${DESK_ONLY}"]`);
        const phone = link.querySelector(`[class~="${PHONE_ONLY}"]`);
        expect(desk?.textContent).toBe("Book a chair");
        expect(phone?.textContent).toBe("Book");
        // `hidden` is display:none, which leaves the accessible name.
        expect(DESK_ONLY).toBe("max-[699px]:hidden");
        expect(PHONE_ONLY).toBe("min-[700px]:hidden");
        expect(shown(link, PHONE_ONLY)).toBe("Book a chair");
        expect(shown(link, DESK_ONLY)).toBe("Book");
    });

    it("draws the desk label alone when the phone label is empty", () => {
        render(
            <CtaSection
                content={{
                    label: "Book a chair",
                    phoneLabel: " ",
                    href: "/book",
                }}
            />,
        );
        const link = screen.getByRole("link");
        expect(link.innerHTML).toBe("Book a chair");
        expect(link).toHaveAccessibleName("Book a chair");
    });

    it("swaps the hero's button and second link under a look", () => {
        const { container } = render(
            <HeroSection
                look="quiet"
                content={{
                    heading: "Cuts, colour & brides.",
                    cta: {
                        label: "Book a chair",
                        phoneLabel: "Book",
                        href: "/book",
                    },
                    secondaryCta: {
                        label: "See prices",
                        phoneLabel: "Prices",
                        href: "/#prices",
                    },
                }}
            />,
        );
        const phone = Array.from(
            container.querySelectorAll(`a [class~="${PHONE_ONLY}"]`),
            (n) => n.textContent,
        );
        expect(phone).toEqual(["Book", "Prices"]);
    });
});

describe("the hero's line", () => {
    it("has both lines, one per width, and one h1 that never changes", () => {
        const { container } = render(
            <HeroSection
                content={{
                    heading: "Cuts, colour & brides.",
                    subheading:
                        "Kesar Salon on Linking Road, Khar West, six days a week.",
                    phoneLine: "Linking Road, Khar West. Open six days.",
                }}
            />,
        );
        expect(container.querySelectorAll("h1")).toHaveLength(1);
        const line = container.querySelector("p");
        expect(line && shown(line, DESK_ONLY)).toBe(
            "Linking Road, Khar West. Open six days.",
        );
        expect(line && shown(line, PHONE_ONLY)).toBe(
            "Kesar Salon on Linking Road, Khar West, six days a week.",
        );
    });

    it("is one line with no copy when there is no phone line", () => {
        const { container } = render(
            <HeroSection
                content={{ heading: "Rye", subheading: "A bakery." }}
            />,
        );
        expect(container.querySelector("p")?.innerHTML).toBe("A bakery.");
    });
});

describe("a Text block's phone body", () => {
    it("draws both bodies, one per width", () => {
        const { container } = render(
            <RichTextSection
                content={{
                    format: "html",
                    value: "<p>A long story.</p>",
                    phoneBody: "<p>Short.</p>",
                }}
            />,
        );
        const desk = container.querySelector(`[class~="${DESK_ONLY}"]`);
        const phone = container.querySelector(`[class~="${PHONE_ONLY}"]`);
        expect(desk?.innerHTML).toBe("<p>A long story.</p>");
        expect(phone?.innerHTML).toBe("<p>Short.</p>");
        expect(phone).toHaveClass("prose");
    });

    it("draws the desk body alone when the phone body is empty", () => {
        const { container } = render(
            <RichTextSection
                content={{
                    format: "html",
                    value: "<p>A long story.</p>",
                    phoneBody: "<p></p>",
                }}
            />,
        );
        expect(container.querySelectorAll(".prose")).toHaveLength(1);
        expect(container.innerHTML).not.toContain("hidden");
    });
});
