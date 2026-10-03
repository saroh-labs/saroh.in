import {
    dueForLookup,
    FIRST_LOOKUP_AFTER_MS,
    LOOKUP_TIERS,
    LOOKUP_WINDOW_MS,
} from "./payment-lookup-schedule";

const NOW = new Date("2026-09-29T10:00:00.000Z");
const MIN = 60_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

/** Evaluate the where the way Postgres would, for one intent. */
function isDue(intent: {
    status: string;
    providerIntentId: string | null;
    createdAt: Date;
    lastLookupAt: Date | null;
}): boolean {
    const where = dueForLookup(NOW) as {
        status: { in: string[] };
        OR: {
            createdAt: { lte: Date; gt: Date };
            OR: [{ lastLookupAt: null }, { lastLookupAt: { lte: Date } }];
        }[];
    };
    if (!where.status.in.includes(intent.status)) return false;
    if (intent.providerIntentId === null) return false;
    return where.OR.some(
        (tier) =>
            intent.createdAt <= tier.createdAt.lte &&
            intent.createdAt > tier.createdAt.gt &&
            (intent.lastLookupAt === null ||
                intent.lastLookupAt <= tier.OR[1].lastLookupAt.lte),
    );
}

const open = (createdAt: Date, lastLookupAt: Date | null = null) => ({
    status: "REQUIRES_PAYMENT",
    providerIntentId: "order_1",
    createdAt,
    lastLookupAt,
});

describe("dueForLookup (P1)", () => {
    it("waits a few minutes for the webhook before the first ask", () => {
        expect(isDue(open(ago(FIRST_LOOKUP_AFTER_MS - 1_000)))).toBe(false);
        expect(isDue(open(ago(FIRST_LOOKUP_AFTER_MS)))).toBe(true);
    });

    it("asks a young intent every three minutes, inside a hold's fifteen", () => {
        expect(isDue(open(ago(10 * MIN), ago(2 * MIN)))).toBe(false);
        expect(isDue(open(ago(10 * MIN), ago(3 * MIN)))).toBe(true);
    });

    it("asks less often as the intent ages, and stops after three days", () => {
        expect(isDue(open(ago(2 * 60 * MIN), ago(20 * MIN)))).toBe(false);
        expect(isDue(open(ago(2 * 60 * MIN), ago(30 * MIN)))).toBe(true);
        expect(isDue(open(ago(24 * 60 * MIN), ago(5 * 60 * MIN)))).toBe(false);
        expect(isDue(open(ago(24 * 60 * MIN), ago(6 * 60 * MIN)))).toBe(true);
        expect(isDue(open(ago(LOOKUP_WINDOW_MS + MIN)))).toBe(false);
    });

    it("never asks about a settled intent or one the provider never made", () => {
        expect(isDue({ ...open(ago(10 * MIN)), status: "SUCCEEDED" })).toBe(
            false,
        );
        expect(isDue({ ...open(ago(10 * MIN)), providerIntentId: null })).toBe(
            false,
        );
    });

    it("its tiers cover the window without a gap", () => {
        expect(LOOKUP_TIERS[LOOKUP_TIERS.length - 1].under).toBe(
            LOOKUP_WINDOW_MS,
        );
        for (let i = 1; i < LOOKUP_TIERS.length; i++) {
            expect(LOOKUP_TIERS[i].under).toBeGreaterThan(
                LOOKUP_TIERS[i - 1].under,
            );
        }
    });
});
