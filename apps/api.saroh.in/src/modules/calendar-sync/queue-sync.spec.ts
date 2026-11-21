import { BULK_SYNC_SPACING_MS, queueCalendarSyncs } from "./queue-sync";

describe("queueCalendarSyncs", () => {
    it("spreads several bookings' jobs out so other businesses' go between them (S1)", async () => {
        const createMany = jest.fn().mockResolvedValue({ count: 3 });
        const db = {
            job: {
                findMany: jest
                    .fn()
                    .mockResolvedValue([
                        { payload: { bookingId: "b2", move: true } },
                    ]),
                createMany,
            },
        };
        const before = Date.now();
        const n = await queueCalendarSyncs(
            db as never,
            "org_1",
            ["b1", "b2", "b3", "b4"],
            { move: true },
        );
        expect(n).toBe(4);
        const rows = createMany.mock.calls[0][0].data as {
            payload: { bookingId: string };
            runAt: Date;
        }[];
        expect(rows.map((r) => r.payload.bookingId)).toEqual([
            "b1",
            "b3",
            "b4",
        ]);
        const first = rows[0].runAt.getTime();
        expect(first).toBeGreaterThanOrEqual(before);
        expect(rows[1].runAt.getTime() - first).toBe(BULK_SYNC_SPACING_MS);
        expect(rows[2].runAt.getTime() - first).toBe(2 * BULK_SYNC_SPACING_MS);
    });
});
