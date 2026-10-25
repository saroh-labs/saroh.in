import { TRADE_PRESETS, TRADES } from "./trade-presets";

/** The trade starters (DEC-189) are a ready setup the owner can book from. */
describe.each(TRADES)("the %s starter", (trade) => {
    const preset = TRADE_PRESETS[trade];

    it("has about six services, each named once", () => {
        expect(preset.services.length).toBeGreaterThanOrEqual(5);
        expect(preset.services.length).toBeLessThanOrEqual(8);
        const names = preset.services.map((s) => s.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it("gives each service minutes, places and a sample price in minor units", () => {
        for (const s of preset.services) {
            expect(s.name.length).toBeLessThanOrEqual(128);
            expect(Number.isInteger(s.durationMinutes)).toBe(true);
            expect(s.durationMinutes).toBeGreaterThan(0);
            expect(s.capacity).toBeGreaterThanOrEqual(1);
            if (s.priceCents !== null) {
                expect(Number.isInteger(s.priceCents)).toBe(true);
                expect(s.priceCents).toBeGreaterThan(0);
            }
        }
        expect(preset.services.some((s) => s.priceCents !== null)).toBe(true);
    });

    it("opens on valid weekly windows that close after they open, one per day", () => {
        expect(preset.hours.length).toBeGreaterThan(0);
        const days = preset.hours.map((h) => h.weekday);
        expect(new Set(days).size).toBe(days.length);
        for (const h of preset.hours) {
            expect(h.weekday).toBeGreaterThanOrEqual(0);
            expect(h.weekday).toBeLessThanOrEqual(6);
            expect(h.open).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
            expect(h.close).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
            expect(h.open < h.close).toBe(true);
        }
    });
});

describe("the gym starter", () => {
    it("has classes (more than one place) beside one-to-one sessions", () => {
        const { services } = TRADE_PRESETS.GYM;
        expect(services.some((s) => s.capacity > 1)).toBe(true);
        expect(services.some((s) => s.capacity === 1)).toBe(true);
    });
});
