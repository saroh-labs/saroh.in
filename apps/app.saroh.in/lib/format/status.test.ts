import { describe, expect, it } from "vitest";

import { bookingStatus, formatStatus } from "./status";

describe("bookingStatus — one word each (UX-078)", () => {
    it("says Booked, never Confirmed, and To confirm, never Pending", () => {
        expect(bookingStatus("CONFIRMED")).toBe("Booked");
        expect(bookingStatus("PENDING")).toBe("To confirm");
    });

    it("reads any other status as formatStatus does", () => {
        expect(bookingStatus("CANCELLED")).toBe("Cancelled");
        expect(formatStatus("NO_SHOW")).toBe("No show");
    });
});
