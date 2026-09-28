import { ConflictException } from "@nestjs/common";

import {
    assertRevision,
    diffValues,
    mergeForEditor,
    nextPending,
    pickPatch,
    readPending,
    samePending,
} from "./draft-record";

type Values = {
    name: string;
    price: string | null;
    classes: number | null;
};
const FIELDS = ["name", "price", "classes"] as const;

const live: Values = { name: "Monthly", price: "1200.00", classes: 8 };

describe("pickPatch", () => {
    it("keeps the record's fields that were sent, nulls included", () => {
        expect(
            pickPatch<Values>(FIELDS, {
                price: "1500.00",
                classes: null,
                revision: 4,
                other: "x",
            }),
        ).toEqual({ price: "1500.00", classes: null });
    });

    it("is empty when nothing publishable was sent", () => {
        expect(pickPatch<Values>(FIELDS, { revision: 1 })).toEqual({});
    });
});

describe("readPending", () => {
    it("reads a stored set, dropping unknown fields and odd values", () => {
        expect(
            readPending<Values>(FIELDS, {
                price: "1500.00",
                classes: null,
                bogus: 1,
                name: { nested: true },
            }),
        ).toEqual({ price: "1500.00", classes: null });
    });

    it.each([null, undefined, "x", 3, [], {}, { bogus: 1 }])(
        "reads %p as no pending set",
        (stored) => {
            expect(readPending<Values>(FIELDS, stored)).toBeNull();
        },
    );
});

describe("mergeForEditor", () => {
    it("lays the pending set over the live values", () => {
        expect(mergeForEditor(live, { price: "1500.00" })).toEqual({
            ...live,
            price: "1500.00",
        });
    });

    it("is the live values when nothing is pending", () => {
        expect(mergeForEditor(live, null)).toEqual(live);
    });
});

describe("nextPending", () => {
    it("adds a changed field", () => {
        expect(nextPending(FIELDS, live, null, { price: "1500.00" })).toEqual({
            price: "1500.00",
        });
    });

    it("keeps what was pending and adds the new change", () => {
        expect(
            nextPending(FIELDS, live, { price: "1500.00" }, { classes: 10 }),
        ).toEqual({ price: "1500.00", classes: 10 });
    });

    it("drops a field put back to its live value", () => {
        expect(
            nextPending(
                FIELDS,
                live,
                { price: "1500.00", classes: 10 },
                { price: "1200.00" },
            ),
        ).toEqual({ classes: 10 });
    });

    it("is null when every change is put back", () => {
        expect(
            nextPending(
                FIELDS,
                live,
                { price: "1500.00" },
                { price: "1200.00" },
            ),
        ).toBeNull();
    });

    it("is null when the patch only repeats what is live", () => {
        expect(
            nextPending(FIELDS, live, null, { name: "Monthly", classes: 8 }),
        ).toBeNull();
    });

    it("holds a cleared value as a change", () => {
        expect(nextPending(FIELDS, live, null, { classes: null })).toEqual({
            classes: null,
        });
    });
});

describe("diffValues", () => {
    it("lists each changed field as [before, after]", () => {
        expect(
            diffValues(FIELDS, live, {
                ...live,
                price: "1500.00",
                classes: null,
            }),
        ).toEqual({ price: ["1200.00", "1500.00"], classes: [8, null] });
    });

    it("is empty for the same values", () => {
        expect(diffValues(FIELDS, live, { ...live })).toEqual({});
    });
});

describe("samePending", () => {
    it.each([
        [null, null, true],
        [null, {}, true],
        [{ price: "1" }, { price: "1" }, true],
        [{ price: "1" }, { price: "2" }, false],
        [{ price: "1" }, null, false],
        [{ price: "1" }, { price: "1", classes: 2 }, false],
    ] as const)("%p vs %p → %p", (a, b, same) => {
        expect(
            samePending<Values>(
                a as Partial<Values> | null,
                b as Partial<Values> | null,
            ),
        ).toBe(same);
    });
});

describe("assertRevision", () => {
    const held = {
        revision: 5,
        changedBy: "Priya Raman",
        changedAt: new Date("2026-10-14T10:00:00Z"),
    };

    it("lets the current revision through", () => {
        expect(() => assertRevision(5, held, "plan")).not.toThrow();
    });

    it("refuses a stale one with who, when and both revisions", () => {
        let thrown: unknown;
        try {
            assertRevision(4, held, "plan");
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBeInstanceOf(ConflictException);
        const body = (thrown as ConflictException).getResponse() as {
            message: string;
            details: Record<string, unknown>;
        };
        expect(body.message).toBe(
            "Priya Raman changed this plan while you were editing. Reload to see it.",
        );
        expect(body.details).toEqual({
            yours: 4,
            current: 5,
            changedBy: "Priya Raman",
            changedAt: "2026-10-14T10:00:00.000Z",
        });
    });

    it("says someone else when nobody is named", () => {
        expect(() =>
            assertRevision(
                1,
                { revision: 2, changedBy: null, changedAt: null },
                "pack",
            ),
        ).toThrow("Someone else changed this pack while you were editing.");
    });

    it("refuses a revision ahead of the server's too", () => {
        expect(() => assertRevision(6, held, "plan")).toThrow(
            ConflictException,
        );
    });
});
