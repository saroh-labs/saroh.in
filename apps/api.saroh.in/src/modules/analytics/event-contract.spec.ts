import { BadRequestException } from "@nestjs/common";

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
});
