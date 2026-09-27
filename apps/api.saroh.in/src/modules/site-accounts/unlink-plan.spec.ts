import { Prisma } from "@saroh/database";

import type { UnlinkMover } from "./unlink-plan";
import {
    applyUnlinkMoves,
    countUnlinkMoves,
    UNLINK_MOVERS,
    UNLINK_STAYS,
    unlinkMoves,
    unlinkSentence,
} from "./unlink-plan";

/**
 * What "This isn't them" moves (A4): the counts the confirm names, its
 * sentence, and the guard that every `customerAccountId` in the schema has
 * a mover or a reason to stay.
 */

const bookings = { key: "bookings", noun: ["booking", "bookings"] } as const;
const orders = { key: "orders", noun: ["order", "orders"] } as const;
const messages = { key: "messages", noun: ["message", "messages"] } as const;

describe("unlinkMoves", () => {
    it("names each kind with its count, singular or plural", () => {
        expect(
            unlinkMoves(
                [bookings, orders],
                new Map([
                    ["bookings", 2],
                    ["orders", 1],
                ]),
            ),
        ).toEqual([
            { key: "bookings", count: 2, label: "2 bookings" },
            { key: "orders", count: 1, label: "1 order" },
        ]);
    });

    it("leaves out a kind with nothing to move, or no count at all", () => {
        expect(
            unlinkMoves([bookings, orders], new Map([["bookings", 0]])),
        ).toEqual([]);
    });
});

describe("unlinkSentence", () => {
    it("says what moves with them", () => {
        expect(
            unlinkSentence([
                { key: "bookings", count: 2, label: "2 bookings" },
            ]),
        ).toBe("2 bookings they made online move with them.");
    });

    it("lists several kinds in plain words", () => {
        expect(
            unlinkSentence(
                unlinkMoves(
                    [bookings, orders, messages],
                    new Map([
                        ["bookings", 2],
                        ["orders", 1],
                        ["messages", 3],
                    ]),
                ),
            ),
        ).toBe(
            "2 bookings, 1 order and 3 messages they made online move with them.",
        );
    });

    it("says everything stays when nothing moves", () => {
        expect(unlinkSentence([])).toBe(
            "Nothing they did online is on this record, so everything here stays.",
        );
    });
});

describe("counting and moving", () => {
    const scope = {
        organizationId: "org_1",
        accountId: "acc_1",
        fromContactId: "c_farah",
        since: new Date("2026-09-20T00:00:00Z"),
    };
    const tx = {} as Prisma.TransactionClient;

    function fake(
        key: string,
        n: number,
    ): UnlinkMover & {
        count: jest.Mock;
        move: jest.Mock;
    } {
        return {
            key,
            model: "Booking",
            noun: [key, `${key}s`],
            count: jest.fn().mockResolvedValue(n),
            move: jest.fn().mockResolvedValue(n),
        };
    }

    it("asks each mover in the caller's transaction, with the scope", async () => {
        const a = fake("booking", 2);
        const b = fake("order", 0);

        const counts = await countUnlinkMoves(tx, scope, [a, b]);

        expect([...counts]).toEqual([
            ["booking", 2],
            ["order", 0],
        ]);
        expect(a.count).toHaveBeenCalledWith(tx, scope);
    });

    it("moves each mover's records to the new contact", async () => {
        const a = fake("booking", 1);

        const moved = await applyUnlinkMoves(
            tx,
            { ...scope, toContactId: "c_new" },
            [a],
        );

        expect(moved.get("booking")).toBe(1);
        expect(a.move).toHaveBeenCalledWith(tx, {
            ...scope,
            toContactId: "c_new",
        });
    });

    it("moves bookings the account made by default (A9)", () => {
        expect(UNLINK_MOVERS.map((m) => [m.key, m.model])).toEqual([
            ["bookings", "Booking"],
        ]);
    });

    it("counts and moves only what the account made on that contact since it linked", async () => {
        const booking = {
            count: jest.fn().mockResolvedValue(2),
            updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        };
        const db = { booking } as unknown as Prisma.TransactionClient;
        const where = {
            organizationId: "org_1",
            customerAccountId: "acc_1",
            contactId: "c_farah",
            createdAt: { gte: scope.since },
        };

        expect((await countUnlinkMoves(db, scope)).get("bookings")).toBe(2);
        expect(booking.count).toHaveBeenCalledWith({ where });

        await applyUnlinkMoves(db, { ...scope, toContactId: "c_new" });
        expect(booking.updateMany).toHaveBeenCalledWith({
            where,
            data: { contactId: "c_new" },
        });
    });
});

describe("the schema guard", () => {
    it("gives every model with a customerAccountId a mover or a reason to stay", () => {
        const withAccount = Prisma.dmmf.datamodel.models
            .filter((m) => m.fields.some((f) => f.name === "customerAccountId"))
            .map((m) => m.name)
            .sort();
        const covered = new Set([
            ...UNLINK_MOVERS.map((m) => m.model),
            ...Object.keys(UNLINK_STAYS),
        ]);

        expect(withAccount.filter((name) => !covered.has(name))).toEqual([]);
        // And no stale entry names a model that no longer has the column.
        expect(
            [...covered].filter((name) => !withAccount.includes(name)),
        ).toEqual([]);
    });
});
