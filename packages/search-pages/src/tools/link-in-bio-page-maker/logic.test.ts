import { describe, expect, it } from "vitest";

import type { BioLink } from "./logic";
import { hrefOf, initials, linkProblem, pageButtons, pageHtml } from "./logic";

// The boards' sample: Rye Studio, four links, teal buttons.
const LINKS: BioLink[] = [
    { kind: "whatsapp", text: "Chat on WhatsApp", value: "+91 99999 99999" },
    {
        kind: "booking",
        text: "Book a time",
        value: "https://ryestudio.example.com/book",
    },
    {
        kind: "maps",
        text: "Find us",
        value: "https://maps.example.com/rye-studio",
    },
    { kind: "upi", text: "Pay by UPI", value: "saroh-sample-upi-id@okaxis" },
];
const RYE = {
    name: "Rye Studio",
    about: "Hair and skin studio, Indiranagar, Bengaluru",
    photo: null,
    links: LINKS,
    colour: "#0F5C5C",
} as const;

describe("the buttons", () => {
    it("turn each kind into the link a phone opens", () => {
        expect(pageButtons(LINKS, "Rye Studio").map((b) => b.href)).toEqual([
            "https://wa.me/919999999999",
            "https://ryestudio.example.com/book",
            "https://maps.example.com/rye-studio",
            "upi://pay?pa=saroh-sample-upi-id@okaxis&pn=Rye%20Studio&cu=INR",
        ]);
    });

    it("leave out a link that isn't one yet, and say why", () => {
        const bad = {
            kind: "booking",
            text: "Book",
            value: "ryestudio.example.com/book",
        } as const;
        expect(hrefOf(bad, "Rye Studio")).toBeNull();
        expect(linkProblem(bad)).toBe(
            "That isn't a full link yet. Start it with https://",
        );
        expect(
            linkProblem({ kind: "whatsapp", text: "Chat", value: "12345" }),
        ).toBe("Type a 10-digit mobile number, with +91 if you like.");
        expect(linkProblem({ ...bad, value: "" })).toBeNull();
    });

    it("takes no javascript: or data: address", () => {
        expect(
            hrefOf(
                { kind: "link", text: "x", value: "javascript:alert(1)" },
                "",
            ),
        ).toBeNull();
        expect(
            hrefOf({ kind: "link", text: "x", value: "data:text/html,hi" }, ""),
        ).toBeNull();
    });
});

describe("pageHtml", () => {
    it("is one file with the sample's name, line, buttons and colour", () => {
        const html = pageHtml(RYE);
        expect(html).toMatch(/^<!doctype html>/);
        expect(html).toContain("<title>Rye Studio</title>");
        expect(html).toContain(
            '<p class="a">Hair and skin studio, Indiranagar, Bengaluru</p>',
        );
        expect(html).toContain('href="https://wa.me/919999999999"');
        expect(html).toContain(
            'href="upi://pay?pa=saroh-sample-upi-id@okaxis&amp;pn=Rye%20Studio&amp;cu=INR"',
        );
        expect(html).toContain("UPI ID: saroh-sample-upi-id@okaxis");
        expect(html).toContain("background:#0F5C5C");
        expect(html).toContain('<div class="av" aria-hidden="true">RS</div>');
        expect(html).not.toMatch(/saroh\.in|Saroh/);
        expect(html).not.toContain("<script");
    });

    it("escapes what was typed, and refuses a photo that isn't a raster image", () => {
        const html = pageHtml({
            ...RYE,
            name: '<script>alert("x")</script>',
            about: "A & B's",
            photo: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
            links: [
                {
                    kind: "link",
                    text: '"><img src=x onerror=alert(1)>',
                    value: "https://example.com",
                },
            ],
        });
        expect(html).not.toContain("<script>");
        expect(html).toContain(
            "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
        );
        expect(html).toContain("A &amp; B&#39;s");
        expect(html).not.toContain("<img");
        expect(html).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
    });

    it("keeps a PNG photo", () => {
        expect(
            pageHtml({ ...RYE, photo: "data:image/png;base64,iVBORw0KGgo=" }),
        ).toContain(
            '<img class="av" src="data:image/png;base64,iVBORw0KGgo=" alt="Rye Studio">',
        );
    });
});

describe("initials", () => {
    it("takes two", () => {
        expect(initials("Rye Studio Bandra")).toBe("RS");
        expect(initials("northwind")).toBe("N");
    });
});
