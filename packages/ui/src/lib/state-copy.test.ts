import { describe, expect, it } from "vitest";

import * as copy from "./state-copy";
import {
    backTo,
    clearLabel,
    couldntLoad,
    couldntLoadLine,
    noMatchLine,
    noneYet,
    noResultsTitle,
    notFoundTitle,
    nothingChanged,
    planLabel,
} from "./state-copy";

describe("failure sentences", () => {
    it("titles a failed read one way", () => {
        expect(couldntLoad("invoices")).toBe("Couldn't load invoices");
        expect(couldntLoad()).toBe("Couldn't load this");
        expect(couldntLoadLine("the waitlist")).toBe(
            "Couldn't load the waitlist.",
        );
    });

    it("says nothing changed, then the one reassurance that is true", () => {
        expect(nothingChanged()).toBe("Nothing has been changed.");
        expect(nothingChanged("Your published site is unaffected.")).toBe(
            "Nothing has been changed. Your published site is unaffected.",
        );
        expect(nothingChanged("  ")).toBe("Nothing has been changed.");
    });

    it("names the way back by the menu's word", () => {
        expect(backTo()).toBe("Back to Home");
        expect(backTo("Orders")).toBe("Back to Orders");
    });

    it("titles a record that isn't there", () => {
        expect(notFoundTitle("order")).toBe("Order not found");
        expect(notFoundTitle("class pack")).toBe("Class pack not found");
    });
});

describe("empty sentences", () => {
    it("titles a first run", () => {
        expect(noneYet("bookings")).toBe("No bookings yet");
    });

    it("names what a search, a filter or a tab left empty", () => {
        expect(noResultsTitle("orders", "search", " rye ")).toBe(
            "No orders match “rye”",
        );
        expect(noResultsTitle("orders", "search", "")).toBe("No orders match");
        expect(noResultsTitle("orders", "filters")).toBe("No orders match");
        expect(noResultsTitle("orders", "view")).toBe("No orders here");
    });

    it("words a picker's no-match line once, with curly quotes", () => {
        expect(noMatchLine("customers", "asha")).toBe(
            "No customers match “asha”.",
        );
    });

    it("labels the way back by what caused it", () => {
        expect(clearLabel("search", "orders")).toBe("Clear search");
        expect(clearLabel("filters", "orders")).toBe("Clear filters");
        expect(clearLabel("view", "orders")).toBe("Show all orders");
    });
});

describe("the plan label", () => {
    it("is “See {Plan}” when one plan unlocks it and “See plans” otherwise", () => {
        expect(planLabel("Grow")).toBe("See Grow");
        expect(planLabel()).toBe("See plans");
        expect(planLabel(null)).toBe("See plans");
        expect(planLabel("  ")).toBe("See plans");
    });
});

describe("house rules", () => {
    /** Every string the module can say, with sample arguments. */
    function everything(): string[] {
        const out: string[] = [];
        const walk = (value: unknown) => {
            if (typeof value === "string") out.push(value);
            else if (typeof value === "function") {
                walk(
                    (value as (...a: string[]) => unknown)(
                        "payment",
                        "search",
                        "rye",
                    ),
                );
            } else if (value && typeof value === "object") {
                Object.values(value).forEach(walk);
            }
        };
        walk(copy);
        return out;
    }

    it("has no long dash or semicolon, and none of the retired words", () => {
        for (const line of everything()) {
            expect(line).not.toMatch(/[—;]/);
            expect(line).not.toMatch(
                /organization|workspace|capabilit|storefront|\bRetry\b|reload/i,
            );
        }
    });

    it("ends a sentence with a full stop and leaves a title without one", () => {
        expect(copy.NOTHING_CHANGED.endsWith(".")).toBe(true);
        expect(copy.moduleOff.body.endsWith(".")).toBe(true);
        expect(copy.signedOut.body.endsWith(".")).toBe(true);
        expect(copy.signedOut.title.endsWith(".")).toBe(false);
        expect(couldntLoad("orders").endsWith(".")).toBe(false);
    });
});
