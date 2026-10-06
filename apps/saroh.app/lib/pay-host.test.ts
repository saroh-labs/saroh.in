import { describe, expect, it } from "vitest";

import { payUrlOf } from "./invoice-pay-shape";
import { bareHost, isPayPath, payRedirect } from "./pay-host";

describe("isPayPath", () => {
    it("is an invoice's and an order's pay page", () => {
        expect(isPayPath("/pay/abc")).toBe(true);
        expect(isPayPath("/pay/o/abc")).toBe(true);
        expect(isPayPath("/pay/abc/")).toBe(true);
    });

    it("is an invoice link's PDF (DEC-083), and no order link's", () => {
        expect(isPayPath("/pay/abc/pdf")).toBe(true);
        expect(isPayPath("/pay/abc/pdf/")).toBe(true);
        expect(isPayPath("/pay/abc/pdf/extra")).toBe(false);
        expect(isPayPath("/pay/o/abc/pdf")).toBe(false);
    });

    it("is nothing under, beside or above them", () => {
        expect(isPayPath("/pay")).toBe(false);
        expect(isPayPath("/pay/")).toBe(false);
        expect(isPayPath("/pay/abc/extra")).toBe(false);
        expect(isPayPath("/pay/o/abc/extra")).toBe(false);
        expect(isPayPath("/payments/abc")).toBe(false);
        expect(isPayPath("/shop/pay/abc")).toBe(false);
    });
});

describe("bareHost", () => {
    it("lower-cases and drops the port", () => {
        expect(bareHost("Northwind.Saroh.App:3005")).toBe(
            "northwind.saroh.app",
        );
        expect(bareHost("")).toBeNull();
        expect(bareHost(null)).toBeNull();
    });
});

describe("payRedirect", () => {
    const NW = "https://northwind.saroh.app/pay/tok";

    it("never redirects on the apex (no tenant host)", () => {
        expect(payRedirect(null, NW)).toBeNull();
        expect(payRedirect(undefined, "https://saroh.app/pay/tok")).toBeNull();
    });

    it("serves the page on the link's own host", () => {
        expect(payRedirect("northwind.saroh.app", NW)).toBeNull();
    });

    it("compares hostnames only: case and port make no second host", () => {
        expect(payRedirect("NORTHWIND.saroh.app:443", NW)).toBeNull();
        expect(
            payRedirect(
                "northwind.localhost",
                "http://northwind.localhost:3005/pay/tok",
            ),
        ).toBeNull();
    });

    it("sends another business's host to the link's own", () => {
        expect(payRedirect("rye.saroh.app", NW)).toBe(NW);
    });

    it("sends a tenant host to the apex while links live there (flag off)", () => {
        expect(
            payRedirect("northwind.saroh.app", "https://saroh.app/pay/tok"),
        ).toBe("https://saroh.app/pay/tok");
    });

    it("serves as before when the API sent no usable payUrl", () => {
        expect(payRedirect("rye.saroh.app", null)).toBeNull();
        expect(payRedirect("rye.saroh.app", undefined)).toBeNull();
        expect(payRedirect("rye.saroh.app", "not a url")).toBeNull();
        expect(payRedirect("rye.saroh.app", "javascript:alert(1)")).toBeNull();
    });
});

describe("payUrlOf", () => {
    it("keeps an http(s) link and nothing else", () => {
        expect(payUrlOf("https://rye.saroh.app/pay/t")).toBe(
            "https://rye.saroh.app/pay/t",
        );
        expect(payUrlOf("javascript:alert(1)")).toBeNull();
        expect(payUrlOf(42)).toBeNull();
        expect(payUrlOf(undefined)).toBeNull();
    });
});
