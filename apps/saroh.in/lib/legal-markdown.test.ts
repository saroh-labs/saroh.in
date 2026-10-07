import { describe, expect, it } from "vitest";

import { PRIVACY } from "@/content/privacy";
import { REFUNDS } from "@/content/refunds";
import { TERMS } from "@/content/terms";

import { inlineRuns, parseLegal, slugify } from "./legal-markdown";

describe("parseLegal", () => {
    it("reads headings, paragraphs, lists and tables", () => {
        const blocks = parseLegal(
            "## Who we are\n\nOne line.\n\n- **A.** first\n- second\n\n| What | Why |\n| --- | --- |\n| Account | To sign in |",
        );
        expect(blocks).toEqual([
            { kind: "heading", id: "who-we-are", text: "Who we are" },
            { kind: "paragraph", text: "One line." },
            { kind: "list", items: ["**A.** first", "second"] },
            {
                kind: "table",
                head: ["What", "Why"],
                rows: [["Account", "To sign in"]],
            },
        ]);
    });

    it("splits bold out of a line", () => {
        expect(inlineRuns("Our servers are in **India**. Some")).toEqual([
            { text: "Our servers are in ", bold: false },
            { text: "India", bold: true },
            { text: ". Some", bold: false },
        ]);
    });

    it("anchors headings without apostrophes", () => {
        expect(slugify("Why we're allowed to")).toBe("why-were-allowed-to");
    });
});

describe("the Privacy Policy", () => {
    const blocks = parseLegal(PRIVACY.body);

    it("has the owner's twelve sections, in order", () => {
        expect(
            blocks.flatMap((b) => (b.kind === "heading" ? [b.text] : [])),
        ).toEqual([
            "Who we are",
            "Two kinds of data",
            "What we collect",
            "Why we're allowed to",
            "Who we share it with",
            "Where it's stored",
            "How long we keep it",
            "Your rights",
            "Cookies",
            "How we protect it",
            "Age",
            "Changes",
        ]);
    });

    it("keeps every table whole: rows as wide as their header", () => {
        const tables = blocks.flatMap((b) => (b.kind === "table" ? [b] : []));
        expect(tables).toHaveLength(3);
        for (const t of tables) {
            for (const row of t.rows) expect(row).toHaveLength(t.head.length);
        }
    });

    it("loses no words: every line of the source is in a block", () => {
        const text = JSON.stringify(blocks);
        for (const line of PRIVACY.body.split("\n")) {
            const words = line
                .replace(/^## |^- |^\|/g, "")
                .split("|")
                .map((c) => c.trim())
                .filter((c) => c && !/^-+$/.test(c));
            for (const w of words)
                expect(text).toContain(JSON.stringify(w).slice(1, -1));
        }
    });

    it("names no price", () => {
        expect(PRIVACY.body).not.toMatch(/₹|Rs\.?\s?\d|INR/);
    });
});

describe("the Terms and the Refund and Cancellation Policy", () => {
    const headings = (body: string) =>
        parseLegal(body).flatMap((b) => (b.kind === "heading" ? [b.text] : []));

    it("the Terms have the owner's sections, in order", () => {
        expect(headings(TERMS.body)).toEqual([
            "The agreement",
            "Your account and team",
            "Plans and billing",
            "Moving to a lower plan",
            "Cancelling and refunds",
            "Early access",
            "Money you take",
            "Your data and content",
            "What you can't do",
            "Your website and domain",
            "The source code",
            "Availability and changes",
            "Closing an account",
            "Liability",
            "Changes to these terms",
            "Law and disputes",
        ]);
    });

    it("the refund policy names who we are first, then its sections", () => {
        const blocks = parseLegal(REFUNDS.body);
        expect(blocks[0]).toMatchObject({ kind: "paragraph" });
        expect(headings(REFUNDS.body)).toEqual([
            "Cancelling",
            "Refunds",
            "Introductory first month",
            "Charged by mistake",
            "Your customers' payments",
            "Nothing is shipped",
            "Questions or complaints",
        ]);
    });

    it("both say cancelling is by email, and neither promises what isn't built", () => {
        for (const body of [TERMS.body, REFUNDS.body]) {
            expect(body).toContain("by writing to contact@saroh.in");
            // Cancelling in Settings and the reminder before each payment wait for #805.
            expect(body).not.toMatch(/cancel[^.]*in Settings/i);
            expect(body).not.toMatch(/before each (monthly )?payment/i);
        }
    });

    it("names no price or rate; those live in the database", () => {
        for (const body of [TERMS.body, REFUNDS.body]) {
            expect(body).not.toMatch(/₹|Rs\.?\s?\d|INR|\d+\s?%/);
        }
    });
});
