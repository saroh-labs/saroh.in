import { describe, expect, it } from "vitest";

import { cannotSend } from "./use-phone-send";

describe("cannotSend", () => {
    it("opens Continue for now when codes can't go out", () => {
        expect(cannotSend({ code: "UNAVAILABLE" })).toBe(true);
        expect(cannotSend({ code: "WHATSAPP_FAILED", status: 422 })).toBe(true);
        expect(cannotSend({ status: 503 })).toBe(true);
    });

    it("keeps the person at the step for their own mistakes", () => {
        expect(cannotSend({ code: "INVALID_PHONE", status: 400 })).toBe(false);
        expect(cannotSend({ code: "TOO_MANY", status: 429 })).toBe(false);
    });
});
