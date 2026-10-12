// The refusal a tax invoice gets for a rate nobody chose: pure.
import { ConflictException } from "@nestjs/common";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
    assertRatesSet,
    GST_RATE_MISSING,
    gstRateMessage,
    unratedOf,
} from "./gst-rate-required";

const service = (id: string, name: string, rate: string | null) =>
    ({ kind: "SERVICE", id, name, rate }) as const;

describe("unratedOf", () => {
    it("keeps only the lines with no rate: 0 is a rate", () => {
        expect(
            unratedOf([
                service("s_1", "Personal Training", null),
                service("s_2", "Yoga", "0"),
                service("s_3", "Massage", "18.00"),
            ]),
        ).toEqual([{ kind: "SERVICE", id: "s_1", name: "Personal Training" }]);
    });

    it("names an item once, however many lines bill it", () => {
        expect(
            unratedOf([
                { kind: "PRODUCT", id: "p_1", name: "Serum", rate: null },
                { kind: "PRODUCT", id: "p_1", name: "Serum", rate: null },
                // The same id on another kind is another item.
                service("p_1", "Serum facial", null),
            ]),
        ).toHaveLength(2);
    });
});

describe("gstRateMessage", () => {
    const named = (...names: string[]) =>
        names.map((name, i) => ({
            kind: "SERVICE" as const,
            id: String(i),
            name,
        }));

    it("names one item", () => {
        expect(gstRateMessage(named("Personal Training"))).toBe(
            "Personal Training has no GST rate. Choose one to issue this invoice.",
        );
    });

    it("names up to three, then counts", () => {
        expect(gstRateMessage(named("Yoga", "Massage", "Facial"))).toBe(
            "Yoga, Massage and Facial have no GST rate. Choose one for each to issue this invoice.",
        );
        expect(gstRateMessage(named("A", "B", "C", "D"))).toBe(
            "4 items have no GST rate. Choose one for each to issue this invoice.",
        );
    });

    it("never prints a blank name", () => {
        expect(gstRateMessage(named("  "))).toBe(
            "A line has no GST rate. Choose one to issue this invoice.",
        );
    });
});

describe("assertRatesSet", () => {
    const unset = [service("s_1", "Personal Training", null)];

    it("refuses a registered business's paper with a typed 409", () => {
        let thrown: unknown;
        try {
            assertRatesSet(true, unset);
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(ConflictException);
        expect((thrown as ConflictException).getResponse()).toEqual({
            message:
                "Personal Training has no GST rate. Choose one to issue this invoice.",
            details: {
                reason: GST_RATE_MISSING,
                items: [
                    { kind: "SERVICE", id: "s_1", name: "Personal Training" },
                ],
            },
        });
    });

    it("lets a receipt through: a business that isn't registered is never asked", () => {
        expect(() => assertRatesSet(false, unset)).not.toThrow();
    });

    it("lets a paper through once every line has a rate, exempt included", () => {
        expect(() =>
            assertRatesSet(true, [
                service("s_1", "Personal Training", "18"),
                service("s_2", "Yoga", "0"),
            ]),
        ).not.toThrow();
    });
});

/*
 * Who asks: pinned as source facts, the way the module rollout is
 * (`capabilities/module-annotations.spec.ts`). The refusal belongs only
 * where someone at the business starts the paper. A payment's webhook, the
 * booking page's hold, a pack or a plan bought on the site and the renewal
 * job must never reach it: a customer's payment is never failed for a rate.
 */
describe("which writers refuse an unset rate", () => {
    const MODULES = join(__dirname, "..");
    const files = readdirSync(MODULES, { recursive: true, encoding: "utf8" })
        .map((f) => f.split("\\").join("/"))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".spec.ts"));
    const using = (needle: RegExp) =>
        files
            .filter((f) => needle.test(readFileSync(join(MODULES, f), "utf8")))
            .sort();

    it("only the team's own actions call the refusal", () => {
        expect(using(/\bassertRatesSet\(/)).toEqual([
            // Take payment at the desk, and a booking's pay link.
            "bookings/booking-desk-pay.ts",
            "bookings/booking-pay-link.ts",
            "invoices/gst-rate-required.ts",
            // Issue, on a hand-written invoice.
            "invoices/invoices.service.ts",
            // An order's invoice, only when its caller says a person took it.
            "invoices/order-invoicing.ts",
        ]);
    });

    it("only the counter and Record as paid ask it of an order's invoice", () => {
        expect(using(/refuseUnsetRate: true/)).toEqual([
            "orders/new-order.ts",
            "orders/orders.service.ts",
        ]);
    });
});
