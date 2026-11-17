import { describe, expect, it } from "vitest";

import { clockLabel, hourAnchor, hourLabel, hourTint } from "./time";

describe("the kit's times (KIT.md)", () => {
    it("writes 12-hour, lower-case times", () => {
        expect(clockLabel("09:14")).toBe("9:14 am");
        expect(clockLabel("16:06")).toBe("4:06 pm");
        expect(clockLabel("00:05")).toBe("12:05 am");
        expect(clockLabel("12:00")).toBe("12:00 pm");
    });

    it("writes hour labels and day anchors", () => {
        expect(hourLabel("09:00")).toBe("9 am");
        expect(hourLabel("21:00")).toBe("9 pm");
        expect(hourAnchor("18:12")).toBe("6pm");
    });

    it("refuses anything that isn't HH:MM", () => {
        expect(() => clockLabel("9am")).toThrow();
        expect(() => clockLabel("25:00")).toThrow();
    });

    it("tints a scene by the light at its hour", () => {
        expect(hourTint("07:00")).toBe("dawn");
        expect(hourTint("09:14")).toBe("noon");
        expect(hourTint("13:00")).toBe("afternoon");
        expect(hourTint("16:06")).toBe("dusk");
        expect(hourTint("18:12")).toBe("dusk");
        expect(hourTint("21:00")).toBe("lamp");
    });
});
