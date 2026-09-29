import { describe, expect, it } from "vitest";

import {
    formatDayLabel,
    formatShortDate,
    formatShortDateTime,
} from "./datetime";

// ICU spells September "Sept" in en-GB; the designs write three letters for
// every month (Invoice Detail's "What happened" read "29 Sept 2026").
describe("short dates write September as Sep", () => {
    const iso = "2026-09-29T03:18:00.000Z";
    const tz = "Asia/Kolkata";

    it("formatShortDate", () => {
        expect(formatShortDate(iso, tz)).toBe("29 Sep 2026");
    });

    it("formatShortDateTime", () => {
        expect(formatShortDateTime(iso, tz)).toBe("29 Sep 2026, 08:48");
    });

    it("formatDayLabel", () => {
        expect(formatDayLabel(iso, tz)).toBe("Tue, 29 Sep 2026");
    });
});
