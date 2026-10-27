import { describe, expect, it } from "vitest";

import { decodeQr } from "../test-qr";
import { isLink, qrModules, qrSvg } from "./qr";

describe("the QR tools' code", () => {
    it("reads back what it was given, Hindi too", () => {
        expect(decodeQr("https://example.com/menu")).toBe(
            "https://example.com/menu",
        );
        expect(decodeQr("नमस्ते Rye Studio")).toBe("नमस्ते Rye Studio");
    });

    it("draws nothing for empty text or text too long for any QR", () => {
        expect(qrModules("")).toBeNull();
        expect(qrSvg("x".repeat(5000))).toBeNull();
    });

    it("knows a full link", () => {
        expect(isLink("https://example.com/menu")).toBe(true);
        expect(isLink("example.com/menu")).toBe(false);
        expect(isLink("northwind menu pdf")).toBe(false);
        expect(isLink("https://localhost")).toBe(false);
    });
});
