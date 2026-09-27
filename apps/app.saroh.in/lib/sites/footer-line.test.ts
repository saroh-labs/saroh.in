import { footerLine } from "@saroh/site-blocks";
import { describe, expect, it } from "vitest";

import { footerFromLine, footerLineField } from "./footer-line";

describe("the footer as the inspector's one-line field (G6)", () => {
    it("reads an empty or missing footer as an empty line", () => {
        expect(footerLineField(null)).toEqual({ kind: "line", text: "" });
        expect(footerLineField({ format: "html", value: "  " })).toEqual({
            kind: "line",
            text: "",
        });
    });

    it("reads a one-paragraph html footer as its text", () => {
        expect(
            footerLineField({
                format: "html",
                value: "<p>Rye &amp; Co. · Hill Road, Bandra</p>",
            }),
        ).toEqual({ kind: "line", text: "Rye & Co. · Hill Road, Bandra" });
        expect(
            footerLineField({
                format: "html",
                value: "<p>It&#39;s &quot;us&quot;</p>",
            }),
        ).toEqual({ kind: "line", text: `It's "us"` });
    });

    it("keeps an entity it can't read as it was written", () => {
        expect(
            footerLineField({
                format: "html",
                value: "<p>A &#99999999; &bogus; B</p>",
            }),
        ).toEqual({ kind: "line", text: "A &#99999999; &bogus; B" });
    });

    it("reads a one-line markdown footer as it is", () => {
        expect(
            footerLineField({ format: "markdown", value: "Pulse Fitness" }),
        ).toEqual({ kind: "line", text: "Pulse Fitness" });
    });

    it("leaves anything richer than a plain line to Website settings", () => {
        for (const value of [
            "<p>One</p><p>Two</p>",
            "<ul><li>A list</li></ul>",
            '<p>Call <a href="tel:1">us</a></p>',
            "<p><strong>Bold</strong> line</p>",
            "<p>Line one<br>line two</p>",
        ]) {
            expect(footerLineField({ format: "html", value })).toEqual({
                kind: "rich",
            });
        }
        expect(
            footerLineField({ format: "markdown", value: "One\nTwo" }),
        ).toEqual({ kind: "rich" });
    });

    it("saves an emptied line as no footer", () => {
        expect(footerFromLine("")).toBeNull();
        expect(footerFromLine("   ", "markdown")).toBeNull();
    });

    it("saves a line as one escaped paragraph, keeping the footer's format", () => {
        expect(footerFromLine(" Rye & Co. <Bandra> ")).toEqual({
            format: "html",
            value: "<p>Rye &amp; Co. &lt;Bandra&gt;</p>",
        });
        expect(footerFromLine("Pulse Fitness", "markdown")).toEqual({
            format: "markdown",
            value: "Pulse Fitness",
        });
    });

    it("saves what the live footer draws as the same line", () => {
        const typed = `Kavi Dental · "Indiranagar" & more`;
        const saved = footerFromLine(typed);
        if (saved === null) throw new Error("expected a footer");
        // What G17 draws before " · Runs on Saroh" is one line…
        expect(footerLine(saved)).toEqual({
            kind: "html",
            value: "Kavi Dental · &quot;Indiranagar&quot; &amp; more",
        });
        // …and the field reads back exactly what was typed.
        expect(footerLineField(saved)).toEqual({ kind: "line", text: typed });
    });
});
