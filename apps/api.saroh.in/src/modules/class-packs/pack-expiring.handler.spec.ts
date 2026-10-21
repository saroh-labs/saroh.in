// Which purchases the pack expiry sweep tells (DEC-174 U22, #1153): a
// week before the use-by day, in the business's own zone. The queueing,
// once per date, is `pack-expiring.handler.db.spec.ts`.
import { dueForExpiringNotice } from "./pack-expiring.handler";

const DAY = 86_400_000;
const KOLKATA = "Asia/Kolkata";
// 21 Oct 2026, 9:00 am in Kolkata.
const NOW = new Date("2026-10-21T03:30:00.000Z");

function held(
    expiresInMs: number,
    over: { boughtDaysAgo?: number; credits?: number; used?: number } = {},
) {
    return {
        createdAt: new Date(NOW.getTime() - (over.boughtDaysAgo ?? 30) * DAY),
        expiresAt: new Date(NOW.getTime() + expiresInMs),
        credits: over.credits ?? 10,
        used: over.used ?? 7,
    };
}

describe("a pack's expiry notice is due", () => {
    it("when its use-by day is 7 days away in the business's zone, with classes left", () => {
        expect(dueForExpiringNotice(held(7 * DAY), NOW, KOLKATA)).toBe(true);
    });

    it("a day the sweep missed is made up the next day, never later", () => {
        expect(dueForExpiringNotice(held(6 * DAY), NOW, KOLKATA)).toBe(true);
        expect(dueForExpiringNotice(held(5 * DAY), NOW, KOLKATA)).toBe(false);
    });

    it("not yet at 8 days", () => {
        expect(dueForExpiringNotice(held(8 * DAY), NOW, KOLKATA)).toBe(false);
    });

    it("counts days in the business's zone, not in UTC", () => {
        // 28 Oct, 7:00 pm UTC is already 29 Oct in Kolkata: 8 days away
        // there, but 7 in UTC.
        const late = {
            ...held(0),
            expiresAt: new Date("2026-10-28T19:00:00.000Z"),
        };
        expect(dueForExpiringNotice(late, NOW, KOLKATA)).toBe(false);
        expect(dueForExpiringNotice(late, NOW, "UTC")).toBe(true);
    });

    it("never with nothing left, or once it has run out", () => {
        expect(
            dueForExpiringNotice(held(7 * DAY, { used: 10 }), NOW, KOLKATA),
        ).toBe(false);
        expect(dueForExpiringNotice(held(-DAY), NOW, KOLKATA)).toBe(false);
    });

    it("never for a pack bought with a week or less to go", () => {
        expect(
            dueForExpiringNotice(
                held(7 * DAY, { boughtDaysAgo: 0 }),
                NOW,
                KOLKATA,
            ),
        ).toBe(false);
        expect(
            dueForExpiringNotice(
                held(7 * DAY, { boughtDaysAgo: 1 }),
                NOW,
                KOLKATA,
            ),
        ).toBe(true);
    });
});
