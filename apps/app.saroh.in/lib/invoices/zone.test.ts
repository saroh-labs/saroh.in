import { describe, expect, it } from "vitest";

import { invoiceZone } from "./zone";

describe("invoiceZone (#836)", () => {
    it("is the business's zone", () => {
        expect(invoiceZone({ timeZone: "Europe/London" })).toBe(
            "Europe/London",
        );
    });

    it("reads India's when it is unset, unread or unknown", () => {
        expect(invoiceZone(null)).toBe("Asia/Kolkata");
        expect(invoiceZone({ timeZone: null })).toBe("Asia/Kolkata");
        expect(invoiceZone({ timeZone: "Mars/Olympus" })).toBe("Asia/Kolkata");
    });
});
