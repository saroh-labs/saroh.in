import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
    isSmallImage,
    isWhatsappLarge,
    shareImageWarnings,
    shortLine,
    webImageUrl,
} from "../../lib/share-facts";
import type { SharePlatform } from "./share-card";
import { ShareCard } from "./share-card";
import { ShareCards } from "./share-cards";

/**
 * The one share-card drawing (resources plan KTD-4) the site settings and
 * the link preview tool share: each app's words, its fallbacks when a tag
 * is missing, and the stand-in when a picture can't be drawn.
 */

const BASE = {
    title: "Fresh bread every morning | Example Bakery",
    description: "Sourdough and pastries from Hill Road, out by ten.",
    siteName: "Example Bakery",
    domain: "example-bakery.in",
};
const PICTURE = {
    url: "https://example-bakery.in/cover.jpg",
    width: 1200,
    height: 630,
    bytes: 200_000,
};

describe("ShareCard", () => {
    it.each<SharePlatform>([
        "whatsapp",
        "facebook",
        "linkedin",
        "x",
        "slack",
        "google",
        "small",
    ])("draws %s with the title and where it's from", (platform) => {
        const { container } = render(
            <ShareCard platform={platform} {...BASE} image={PICTURE} />,
        );
        expect(container).toHaveTextContent(BASE.title);
        // Slack names the site; every other app shows the domain.
        expect(container).toHaveTextContent(
            platform === "slack" ? "Example Bakery" : "example-bakery.in",
        );
    });

    it("says there's no description in each app's words", () => {
        const none = { ...BASE, description: "" };
        const { container: whatsapp } = render(
            <ShareCard platform="whatsapp" {...none} image={null} />,
        );
        expect(whatsapp).toHaveTextContent("No description");
        const { container: google } = render(
            <ShareCard platform="google" {...none} image={null} />,
        );
        expect(google).toHaveTextContent("No description found");
    });

    it("cuts a long description to one card line", () => {
        const long = "a".repeat(90);
        render(
            <ShareCard
                platform="facebook"
                {...BASE}
                description={long}
                image={null}
            />,
        );
        expect(screen.getByText(`${"a".repeat(68)}…`)).toBeInTheDocument();
    });

    it("draws X's text card when there's no picture", () => {
        const { container } = render(
            <ShareCard platform="x" {...BASE} image={null} />,
        );
        expect(container.querySelector("img")).toBeNull();
        expect(container).toHaveTextContent("From example-bakery.in");
    });

    it("draws the stand-in with the size when the picture can't be drawn", () => {
        const { container } = render(
            <ShareCard
                platform="linkedin"
                {...BASE}
                image={{ ...PICTURE, width: 600, height: 315 }}
            />,
        );
        const img = container.querySelector("img");
        if (!img) throw new Error("expected the picture");
        expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
        fireEvent.error(img);
        expect(container.querySelector("img")).toBeNull();
        expect(container).toHaveTextContent("600 × 315, too small");
    });

    it("never points an <img> at a script address", () => {
        const { container } = render(
            <ShareCard
                platform="facebook"
                {...BASE}
                image={{ url: "javascript:alert(1)" }}
            />,
        );
        expect(container.querySelector("img")).toBeNull();
    });
});

describe("ShareCards (the site settings)", () => {
    it("draws the six apps, Google included, and says Instagram has no card", () => {
        render(<ShareCards {...BASE} image={PICTURE} liveUrl={null} />);
        for (const name of [
            "WhatsApp",
            "Facebook",
            "LinkedIn",
            "X",
            "Slack",
            "Google",
        ]) {
            expect(
                screen.getByText(name, { selector: "figcaption span" }),
            ).toBeInTheDocument();
        }
        expect(
            screen.getByText(/Instagram shows the link as text/),
        ).toBeInTheDocument();
    });

    it("offers the inspectors once the site is live", () => {
        render(
            <ShareCards
                {...BASE}
                image={PICTURE}
                liveUrl="https://example-bakery.in/"
            />,
        );
        expect(
            screen.getByRole("link", { name: "Facebook Sharing Debugger" }),
        ).toHaveAttribute(
            "href",
            "https://developers.facebook.com/tools/debug/?q=https%3A%2F%2Fexample-bakery.in%2F",
        );
    });
});

describe("share facts", () => {
    it("knows a small picture and one WhatsApp won't draw large", () => {
        expect(isSmallImage({ url: "x", width: 600, height: 315 })).toBe(true);
        expect(isSmallImage({ url: "x", width: 1200, height: 630 })).toBe(
            false,
        );
        expect(isSmallImage({ url: "x" })).toBe(false);
        expect(isWhatsappLarge({ ...PICTURE, bytes: 400 * 1024 })).toBe(false);
        expect(isWhatsappLarge(PICTURE)).toBe(true);
    });

    it("keeps only web addresses", () => {
        expect(webImageUrl("data:image/png;base64,xx")).toBeNull();
        expect(webImageUrl(" https://a.example/p.png ")).toBe(
            "https://a.example/p.png",
        );
    });

    it("words the picture's problems with the limit in the sentence", () => {
        expect(shareImageWarnings(null)[0]).toMatch(/No share image yet/);
        expect(
            shareImageWarnings({
                url: "x",
                width: 600,
                height: 315,
                bytes: 500 * 1024,
            }),
        ).toHaveLength(2);
        expect(shortLine("short")).toBe("short");
    });
});
