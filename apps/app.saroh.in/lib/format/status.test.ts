import { describe, expect, it } from "vitest";

import { bookingStatus, formatStatus } from "./status";

describe("bookingStatus — one word each (UX-078, DEC-170)", () => {
    it("says Booked, never Confirmed, and Awaiting payment, never Pending or To confirm", () => {
        expect(bookingStatus("CONFIRMED")).toBe("Booked");
        expect(bookingStatus("PENDING")).toBe("Awaiting payment");
    });

    it("reads any other status as formatStatus does", () => {
        expect(bookingStatus("CANCELLED")).toBe("Cancelled");
        expect(formatStatus("NO_SHOW")).toBe("No show");
    });
});
