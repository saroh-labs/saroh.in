import { limitOverrideWarning } from "./limit-override-warning";

const base = { used: 5, value: 3, enforced: true, monthly: false };

describe("limitOverrideWarning (#802)", () => {
    it("says nothing when the business is within the new limit", () => {
        expect(
            limitOverrideWarning({ ...base, rowId: "products", used: 3 }),
        ).toBeNull();
    });

    it("says what pauses, when, and that raising it restores it", () => {
        expect(limitOverrideWarning({ ...base, rowId: "products" })).toBe(
            "It has 5 already. The business is told now, and 7 days later what is over 3 pauses: its oldest products are hidden from its site and read-only. Nothing is deleted, and raising the limit again restores it at once.",
        );
        expect(limitOverrideWarning({ ...base, rowId: "members" })).toContain(
            "the team members who joined most recently are paused (the owner never is)",
        );
        expect(limitOverrideWarning({ ...base, rowId: "locations" })).toContain(
            "its newest locations stop taking orders",
        );
    });

    it("a row that pauses nothing keeps what it has and stops adding", () => {
        expect(
            limitOverrideWarning({ ...base, rowId: "orders", monthly: true }),
        ).toBe(
            "It has 5 this month already. It keeps what it has; it can't add more until it is under 3 (a new month starts again).",
        );
    });

    it("never claims a pause with plan rules off", () => {
        const w = limitOverrideWarning({
            ...base,
            rowId: "products",
            enforced: false,
        });
        expect(w).toBe(
            "It has 5 already. Plan rules are off for this business, so nothing pauses and nothing is refused until they are on.",
        );
        expect(w).not.toMatch(/read-only/);
    });
});
