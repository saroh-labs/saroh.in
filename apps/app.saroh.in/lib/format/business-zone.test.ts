import { describe, expect, it } from "vitest";

import { businessZone } from "./business-zone";

describe("businessZone (UX-008)", () => {
    it("is the business's zone", () => {
        expect(businessZone({ timeZone: "Europe/London" })).toBe(
            "Europe/London",
        );
    });

    it("reads India's when it is unset, unread or unknown", () => {
        expect(businessZone(null)).toBe("Asia/Kolkata");
        expect(businessZone(undefined)).toBe("Asia/Kolkata");
        expect(businessZone({})).toBe("Asia/Kolkata");
        expect(businessZone({ timeZone: null })).toBe("Asia/Kolkata");
        expect(businessZone({ timeZone: " " })).toBe("Asia/Kolkata");
        expect(businessZone({ timeZone: "Mars/Olympus" })).toBe("Asia/Kolkata");
    });
});
