import { describe, expect, it } from "vitest";

import {
    asSentence,
    firstSentence,
    instagramCaption,
    whatsappMessage,
} from "./share-words";

const LINK = "gulmohar.saroh.app/bridal";
const bridal = {
    title: "Bridal makeup packages",
    seoDescription:
        "HD and airbrush looks with a trial session. Hair styling and saree draping too",
};

describe("share words", () => {
    it("writes the WhatsApp message from the title and Google text, ending with the link", () => {
        expect(whatsappMessage(bridal, "Gulmohar", LINK)).toBe(
            "Bridal makeup packages at Gulmohar. HD and airbrush looks with a trial session. Hair styling and saree draping too. See it here: gulmohar.saroh.app/bridal",
        );
    });

    it("takes only the first sentence for Instagram", () => {
        expect(instagramCaption(bridal, "Gulmohar", LINK)).toBe(
            "Bridal makeup packages: HD and airbrush looks with a trial session. Link in bio: gulmohar.saroh.app/bridal",
        );
    });

    it("uses the title alone when the page has no Google text", () => {
        const page = { title: "Client lounge", seoDescription: null };
        expect(whatsappMessage(page, "Gulmohar", LINK)).toBe(
            "Client lounge at Gulmohar. See it here: gulmohar.saroh.app/bridal",
        );
        expect(instagramCaption(page, "Gulmohar", LINK)).toBe(
            "Client lounge. Link in bio: gulmohar.saroh.app/bridal",
        );
    });

    it("names the business for the home page", () => {
        const home = {
            title: "Home",
            seoDescription: "Salon in Rohtak",
            isHome: true,
        };
        expect(whatsappMessage(home, "Gulmohar", "gulmohar.saroh.app")).toBe(
            "Gulmohar: Salon in Rohtak. See it here: gulmohar.saroh.app",
        );
        expect(
            whatsappMessage({ ...home, seoDescription: "" }, "Gulmohar", "x"),
        ).toBe("Gulmohar. See it here: x");
    });

    it("adds no words the page didn't have", () => {
        const words = new Set(
            `${bridal.title} ${bridal.seoDescription} Gulmohar at See it here: Link in bio: ${LINK}`
                .toLowerCase()
                .split(/[\s.:]+/),
        );
        for (const text of [
            whatsappMessage(bridal, "Gulmohar", LINK),
            instagramCaption(bridal, "Gulmohar", LINK),
        ]) {
            for (const w of text.toLowerCase().split(/[\s.:]+/)) {
                expect(words.has(w)).toBe(true);
            }
        }
    });

    it("tidies sentences", () => {
        expect(asSentence("  two   spaces ")).toBe("two spaces.");
        expect(asSentence("Asks?")).toBe("Asks?");
        expect(firstSentence("One. Two.")).toBe("One.");
        expect(firstSentence("")).toBe("");
    });
});
