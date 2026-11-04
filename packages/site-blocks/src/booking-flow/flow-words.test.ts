import { describe, expect, it } from "vitest";

import { payWords } from "./flow-words";
import type { BookingPageData } from "./model";

const page = (currency?: string | null): BookingPageData => ({
    businessName: "Ironvale Fitness",
    open: true,
    timezone: "Europe/London",
    payOnline: false,
    currency,
    rules: {} as BookingPageData["rules"],
    services: [],
});

const due = (p: BookingPageData) =>
    payWords({
        page: p,
        service: null,
        credit: null,
        payChoice: null,
        signedIn: true,
        waitMode: null,
    }).due;

describe("the pay summary before a service is chosen", () => {
    it("says a Global business's zero in its own currency", () => {
        expect(due(page("GBP"))).toBe("£0");
        expect(due(page("USD"))).toBe("$0");
    });

    it("stays rupees for India, and for an API older than the field", () => {
        expect(due(page("INR"))).toBe("₹0");
        expect(due(page(null))).toBe("₹0");
        expect(due(page())).toBe("₹0");
    });
});
