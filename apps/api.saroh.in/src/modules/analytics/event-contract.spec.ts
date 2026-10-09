import { BadRequestException } from "@nestjs/common";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import * as contract from "./event-contract";
import {
    ANALYTICS_RETENTION_DAYS,
    PUBLIC_INGESTABLE_TYPES,
    validateEventProperties,
} from "./event-contract";

describe("event-contract — validateEventProperties", () => {
    it("normalizes valid site.view props (trims, drops empty optionals)", () => {
        const out = validateEventProperties("site.view", 1, {
            path: "  /pricing  ",
            referrer: "https://google.com",
            title: "",
        });
        // path trimmed; referrer kept; empty title dropped.
        expect(out).toEqual({
            path: "/pricing",
            referrer: "https://google.com",
        });
    });

    it("accepts the org-internal enquiry.submitted + order.paid contracts", () => {
        expect(
            validateEventProperties("enquiry.submitted", 1, {
                formId: "form_1",
                leadId: "lead_1",
            }),
        ).toEqual({ formId: "form_1", leadId: "lead_1" });

        expect(
            validateEventProperties("order.paid", 1, {
                orderId: "order_1",
                amountCents: 4200,
            }),
        ).toEqual({ orderId: "order_1", amountCents: 4200 });
    });

    it("throws on an unknown (type, schemaVersion) pair", () => {
        expect(() =>
            validateEventProperties("site.view", 2, { path: "/x" }),
        ).toThrow(BadRequestException);
        expect(() => validateEventProperties("mystery.type", 1, {})).toThrow(
            BadRequestException,
        );
    });

    it("throws naming the field when a required prop is missing", () => {
        expect(() => validateEventProperties("site.view", 1, {})).toThrow(
            /"path"/,
        );
        expect(() =>
            validateEventProperties("order.paid", 1, { orderId: "o1" }),
        ).toThrow(/"amountCents"/);
    });

    it("throws when a prop has the wrong type", () => {
        expect(() =>
            validateEventProperties("site.view", 1, { path: 42 }),
        ).toThrow(/"path"/);
        expect(() =>
            validateEventProperties("order.paid", 1, {
                orderId: "o1",
                amountCents: "free",
            }),
        ).toThrow(/"amountCents"/);
    });

    it("throws when path exceeds the max length", () => {
        expect(() =>
            validateEventProperties("site.view", 1, {
                path: "/".padEnd(2049, "x"),
            }),
        ).toThrow(BadRequestException);
    });

    it("throws when properties is not an object", () => {
        expect(() => validateEventProperties("site.view", 1, "nope")).toThrow(
            /properties must be an object/,
        );
        expect(() => validateEventProperties("site.view", 1, [])).toThrow(
            /properties must be an object/,
        );
    });

    it("exposes site.view as the ONLY publicly-ingestable type", () => {
        expect(PUBLIC_INGESTABLE_TYPES.has("site.view")).toBe(true);
        expect(PUBLIC_INGESTABLE_TYPES.has("enquiry.submitted")).toBe(false);
        expect(PUBLIC_INGESTABLE_TYPES.has("order.paid")).toBe(false);
    });

    it("has a sane retention window constant", () => {
        expect(ANALYTICS_RETENTION_DAYS).toBe(400);
    });

    it("keeps order.refunded off the public intake too (#867)", () => {
        expect(PUBLIC_INGESTABLE_TYPES.has("order.refunded")).toBe(false);
        expect(
            validateEventProperties("order.refunded", 1, {
                orderId: "order_1",
                amountCents: 4200,
            }),
        ).toEqual({ orderId: "order_1", amountCents: 4200 });
    });
});

/**
 * #867: `order.paid` sat in the contract for months with nothing writing
 * it, so Insights' orders figure read 0 beside real orders. Every event
 * type the contract declares must be named by some code outside the
 * contract and its specs: a writer, or the intake's reader.
 */
describe("event-contract — every declared type is used", () => {
    const srcRoot = join(__dirname, "..", "..");
    const sources = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) return sources(path);
            return entry.name.endsWith(".ts") &&
                !entry.name.endsWith(".spec.ts") &&
                entry.name !== "event-contract.ts"
                ? [path]
                : [];
        });
    const code = sources(srcRoot).map((file) => readFileSync(file, "utf8"));
    const declared = Object.keys(contract).filter((name) =>
        name.endsWith("_TYPE"),
    );

    it("finds the declared types", () => {
        expect(declared).toEqual(
            expect.arrayContaining(["ORDER_PAID_TYPE", "ORDER_REFUNDED_TYPE"]),
        );
    });

    it.each(declared)("%s is named outside the contract", (name) => {
        const named = new RegExp(`\\b${name}\\b`);
        expect(code.some((text) => named.test(text))).toBe(true);
    });
});
