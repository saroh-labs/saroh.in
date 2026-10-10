import { tooLightToScan } from "@saroh/ui/lib/qr-art";
import { describe, expect, it } from "vitest";

import { qrCodeMaker as copy } from "@/content/qr-code-maker";
import { cta } from "@/lib/links";

import {
    logoProblem,
    QR_LOGO_MAX_BYTES,
    QR_SAMPLE_LINK,
    QR_SWATCHES,
    qrLink,
    typedLink,
} from "./qr-code-maker";

/**
 * The QR code maker's rules on saroh.in (QR codes plan U9), and the words
 * the page may not say.
 */

describe("qrLink", () => {
    it("is empty for an empty field, so the page draws its sample", () => {
        expect(qrLink("https", "")).toBe("");
        expect(qrLink("https", "   ")).toBe("");
    });

    it("puts the scheme in front and drops spaces", () => {
        expect(qrLink("https", " shop.in/book ")).toBe("https://shop.in/book");
        expect(qrLink("http", "shop.in/my menu")).toBe("http://shop.in/mymenu");
    });
});

describe("typedLink", () => {
    it("takes a pasted scheme off, however many times it was pasted", () => {
        expect(typedLink("https://https://shop.in", "https")).toEqual({
            rest: "shop.in",
            scheme: "https",
        });
        expect(typedLink("http://shop.in", "https")).toEqual({
            rest: "shop.in",
            scheme: "http",
        });
    });

    it("leaves plain typing alone, spaces and all, and keeps the scheme", () => {
        expect(typedLink("shop.in ", "http")).toEqual({
            rest: "shop.in ",
            scheme: "http",
        });
    });
});

describe("logoProblem", () => {
    it("takes a picture up to the limit and refuses anything else", () => {
        expect(logoProblem({ type: "image/png", size: 10 })).toBeNull();
        expect(
            logoProblem({ type: "image/svg+xml", size: QR_LOGO_MAX_BYTES }),
        ).toBeNull();
        expect(logoProblem({ type: "application/pdf", size: 10 })).toBe(
            "not-picture",
        );
        expect(
            logoProblem({ type: "image/png", size: QR_LOGO_MAX_BYTES + 1 }),
        ).toBe("too-big");
    });
});

describe("the swatches", () => {
    it("are the design's five, and only the last is too light to scan", () => {
        expect(QR_SWATCHES.map((s) => s.hex)).toEqual([
            "#1C1C1A",
            "#5C2A48",
            "#1F4D3A",
            "#1E3A5F",
            "#F0A92B",
        ]);
        expect(QR_SWATCHES.map((s) => tooLightToScan(s.hex))).toEqual([
            false,
            false,
            false,
            false,
            true,
        ]);
    });
});

describe("the page's words", () => {
    const every = JSON.stringify(copy);

    it("lives where the menu and the sample code say it does", () => {
        expect(copy.path).toBe("/tools/qr-code-maker");
        expect(QR_SAMPLE_LINK).toBe(`https://www.saroh.in${copy.path}`);
    });

    it("never promises emailed files, a date, or the waitlist by name", () => {
        // The email carries a link back, not the files (the relay lesson).
        expect(every).not.toMatch(/with your files|send it\?/i);
        // The start button's words and address come from `cta()`.
        expect(every).not.toMatch(/waitlist|early access|17 Oct/i);
        expect(cta({ src: "qr-code-maker", mode: "waitlist" }).href).toBe(
            "/waitlist?src=qr-code-maker",
        );
    });

    it("claims nothing about QR codes inside Saroh, which aren't released (ledger CN2, QR8)", () => {
        const band = `${copy.band.title} ${copy.band.body}`;
        expect(band).not.toMatch(/scans|reprint|counts|each code/i);
    });

    it("names no plan and no price", () => {
        expect(every).not.toMatch(/₹|\bGrow\b|\bPro\b|Free plan/);
    });
});
