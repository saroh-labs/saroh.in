import type { BookedRow, SoldRow } from "./sells";
import type {
    ClassFullSuggestion,
    LateBillSuggestion,
    SellingLessSuggestion,
    UnpaidBill,
} from "./suggestions";
import {
    classesFull,
    firstSale,
    isSuggestionKey,
    lateBills,
    notNowUntil,
    PER_RULE,
    rankSuggestions,
    sellingLess,
    suggestionKey,
} from "./suggestions";

/**
 * The three suggestion rules (DEC-171, #1087) at their edges, pure: 89% vs
 * 90% full, 3 vs 4 sessions, 21 vs 22 days late, 9 vs 10 sold before, and
 * a fall of just under or just a third. Then the ranking, Not now's
 * hiding, and the keys.
 */

const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 09:00 in Mumbai.
const NOW = new Date("2026-10-19T03:30:00.000Z");
const clock = { now: NOW, zone: ZONE };
const none = new Set<string>();

function cls(
    over: Partial<BookedRow> & Pick<BookedRow, "serviceId">,
): BookedRow {
    return {
        name: "Sourdough class",
        capacity: 10,
        window: "PERIOD",
        bookings: 40,
        people: 30,
        sessions: 4,
        ...over,
    };
}

/** 23:59 on `day` in Mumbai: when a bill due that day falls due. */
const dueOn = (day: string) => new Date(`${day}T23:59:00+05:30`);

function bill(over: Partial<UnpaidBill> & Pick<UnpaidBill, "id">): UnpaidBill {
    return {
        number: "INV-1",
        currency: "INR",
        dueAt: dueOn("2026-09-20"),
        total: "11250.00",
        paidCents: 0,
        billToName: null,
        contact: { firstName: "Shruti", lastName: "Menon", email: null },
        ...over,
    };
}

function sold(
    productId: string,
    now: number,
    before: number,
    name = productId,
): SoldRow[] {
    const rows: SoldRow[] = [];
    if (now > 0)
        rows.push({
            productId,
            name,
            window: "PERIOD",
            sold: now,
            amount: null,
        });
    if (before > 0)
        rows.push({
            productId,
            name,
            window: "BEFORE",
            sold: before,
            amount: null,
        });
    return rows;
}

describe("a class nearly always full", () => {
    const run = (rows: BookedRow[], archived = none) =>
        classesFull(rows, { days: 28, archived });

    it("fires at 90% over 4 sessions, with what the card says", () => {
        const [s] = run([cls({ serviceId: "svc_a", bookings: 36 })]);
        expect(s).toEqual<ClassFullSuggestion>({
            key: "class-full:svc_a",
            rule: "CLASS_FULL",
            dismissible: true,
            service: { id: "svc_a", name: "Sourdough class" },
            days: 28,
            sessions: 4,
            seats: 40,
            booked: 36,
            fullPercent: 90,
            action: { kind: "ADD_CLASS_TIME", href: "/services/svc_a" },
        });
    });

    it("doesn't at 89%, and never rounds 89.x up into the rule", () => {
        expect(
            run([cls({ serviceId: "a", bookings: 89, sessions: 10 })]),
        ).toEqual([]);
        // 35 of 39 places is 89.7%: below 90 though it rounds to 90.
        expect(
            run([
                cls({
                    serviceId: "c",
                    capacity: 3,
                    sessions: 13,
                    bookings: 35,
                }),
            ]),
        ).toEqual([]);
    });

    it("needs 4 sessions: 3 full ones are not enough", () => {
        expect(
            run([cls({ serviceId: "a", sessions: 3, bookings: 30 })]),
        ).toEqual([]);
        expect(
            run([cls({ serviceId: "a", sessions: 4, bookings: 40 })]),
        ).toHaveLength(1);
    });

    it("is never a one-to-one service, nor an archived class", () => {
        expect(
            run([
                cls({ serviceId: "a", capacity: 1, sessions: 8, bookings: 8 }),
            ]),
        ).toEqual([]);
        expect(run([cls({ serviceId: "a" })], new Set(["a"]))).toEqual([]);
    });

    it("says at most 100% and puts the fullest first", () => {
        const out = run([
            cls({ serviceId: "a", name: "Pilates", bookings: 37 }),
            // Places taken can pass places offered when a class was resized.
            cls({ serviceId: "b", name: "Yoga", bookings: 44 }),
        ]);
        expect(out.map((s) => [s.service.name, s.fullPercent])).toEqual([
            ["Yoga", 100],
            ["Pilates", 92],
        ]);
    });
});

describe("a bill more than 3 weeks late", () => {
    it("fires at 22 days late and not at 21 or 20, on the business's calendar", () => {
        const out = lateBills(
            [
                bill({ id: "d20", dueAt: dueOn("2026-09-29") }),
                bill({ id: "d21", dueAt: dueOn("2026-09-28") }),
                bill({ id: "d22", dueAt: dueOn("2026-09-27") }),
            ],
            clock,
            true,
        );
        expect(out.map((s) => [s.invoice.id, s.daysLate])).toEqual([
            ["d22", 22],
        ]);
    });

    it("says what is left to pay, not the total, and who it's to", () => {
        const [s] = lateBills(
            [
                bill({
                    id: "inv_1",
                    number: "RC/26-27/0056",
                    total: "2500.00",
                    paidCents: 100000,
                }),
            ],
            clock,
            true,
        );
        expect(s).toEqual<LateBillSuggestion>({
            key: "late-bill:inv_1",
            rule: "LATE_BILL",
            dismissible: true,
            invoice: { id: "inv_1", number: "RC/26-27/0056" },
            billedTo: "Shruti Menon",
            leftToPayMinor: 150000,
            currency: "INR",
            dueOn: "2026-09-20",
            daysLate: 29,
            action: {
                kind: "REMIND",
                invoiceId: "inv_1",
                href: "/billing/invoices/inv_1",
            },
        });
    });

    it("prefers the bill-to name, and opens the bill for a role that can't remind", () => {
        const [s] = lateBills(
            [bill({ id: "i", billToName: " Café Bloom " })],
            clock,
            false,
        );
        expect(s.billedTo).toBe("Café Bloom");
        expect(s.action).toEqual({
            kind: "OPEN_BILL",
            href: "/billing/invoices/i",
        });
    });

    it("leaves out a bill paid in full by its ledger, one with no due date, and one not due", () => {
        expect(
            lateBills(
                [
                    bill({ id: "paid", total: "480.00", paidCents: 48000 }),
                    bill({ id: "nodue", dueAt: null }),
                    bill({ id: "later", dueAt: dueOn("2026-11-01") }),
                ],
                clock,
                true,
            ),
        ).toEqual([]);
    });

    it("puts the latest first, then the most owed", () => {
        const out = lateBills(
            [
                bill({ id: "small", total: "480.00" }),
                bill({ id: "big", total: "8400.00" }),
                bill({ id: "oldest", dueAt: dueOn("2026-08-01") }),
            ],
            clock,
            true,
        );
        expect(out.map((s) => s.invoice.id)).toEqual([
            "oldest",
            "big",
            "small",
        ]);
    });
});

describe("something selling less", () => {
    const run = (rows: SoldRow[], thin = false, archived = none) =>
        sellingLess(rows, { thin, archived });

    it("fires down a third having sold 10 before, with what the card says", () => {
        const [s] = run([
            ...sold("croissant", 8, 12, "Croissant box"),
            ...sold("loaf", 0, 40, "Sourdough loaf"),
            ...sold("bun", 20, 20, "Cinnamon bun"),
        ]).filter((x) => x.product.id === "croissant");
        expect(s).toEqual<SellingLessSuggestion>({
            key: "selling-less:croissant",
            rule: "SELLING_LESS",
            dismissible: true,
            product: { id: "croissant", name: "Croissant box" },
            sold: 8,
            soldBefore: 12,
            fewerPercent: 33,
            rankBefore: 3,
            action: {
                kind: "OPEN_PRODUCT",
                href: "/commerce/products/croissant",
            },
        });
    });

    it("needs 10 sold before: 9 is not enough", () => {
        expect(run(sold("a", 0, 9))).toEqual([]);
        expect(run(sold("a", 0, 10))).toHaveLength(1);
    });

    it("needs a fall of a third: 7 of 10 is not, 6 of 10 is", () => {
        expect(run(sold("a", 7, 10))).toEqual([]);
        expect(run(sold("a", 6, 10)).map((s) => s.fewerPercent)).toEqual([40]);
        // Exactly a third: 20 of 30.
        expect(run(sold("b", 20, 30))).toHaveLength(1);
        expect(run(sold("b", 21, 30))).toEqual([]);
    });

    it("counts a product that sold nothing this period", () => {
        expect(run(sold("a", 0, 15)).map((s) => s.fewerPercent)).toEqual([100]);
    });

    it("says nothing for a young business or an archived product", () => {
        expect(run(sold("a", 0, 15), true)).toEqual([]);
        expect(run(sold("a", 0, 15), false, new Set(["a"]))).toEqual([]);
    });

    it("never fires for a product that is new or selling more", () => {
        expect(run([...sold("new", 30, 0), ...sold("up", 30, 10)])).toEqual([]);
    });

    it("puts the biggest fall first", () => {
        const out = run([...sold("a", 6, 10), ...sold("b", 0, 12)]);
        expect(out.map((s) => s.product.id)).toEqual(["b", "a"]);
    });
});

describe("first sale", () => {
    it("is offered only before any sale, and can't be put off", () => {
        expect(firstSale(true)).toEqual([]);
        expect(firstSale(false)).toEqual([
            {
                key: "first-sale",
                rule: "FIRST_SALE",
                dismissible: false,
                action: { kind: "COPY_SHOP_LINK" },
            },
        ]);
    });
});

describe("ranking and Not now", () => {
    const classFull = classesFull(
        [cls({ serviceId: "c1" }), cls({ serviceId: "c2", bookings: 38 })],
        { days: 28, archived: none },
    );
    const lateBill = lateBills(
        ["b1", "b2", "b3", "b4"].map((id) => bill({ id })),
        clock,
        true,
    );
    const less = sellingLess(sold("p1", 0, 20), {
        thin: false,
        archived: none,
    });

    it("keeps the board's order: first sale, class, bill, selling less", () => {
        const out = rankSuggestions(
            {
                firstSale: firstSale(false),
                classFull,
                lateBill,
                sellingLess: less,
            },
            none,
        );
        expect(out.map((s) => s.rule)).toEqual([
            "FIRST_SALE",
            "CLASS_FULL",
            "CLASS_FULL",
            "LATE_BILL",
            "LATE_BILL",
            "LATE_BILL",
            "SELLING_LESS",
        ]);
    });

    it(`keeps at most ${PER_RULE} of a rule, and a hidden one makes room for the next`, () => {
        const parts = {
            firstSale: [],
            classFull: [],
            lateBill,
            sellingLess: [],
        };
        const shown = rankSuggestions(parts, none).map((s) => s.key);
        expect(shown).toEqual(["late-bill:b1", "late-bill:b2", "late-bill:b3"]);
        const after = rankSuggestions(parts, new Set(["late-bill:b2"])).map(
            (s) => s.key,
        );
        expect(after).toEqual(["late-bill:b1", "late-bill:b3", "late-bill:b4"]);
    });

    it("hides only the key put off", () => {
        const out = rankSuggestions(
            { firstSale: [], classFull, lateBill: [], sellingLess: less },
            new Set(["class-full:c1"]),
        );
        expect(out.map((s) => s.key)).toEqual([
            "class-full:c2",
            "selling-less:p1",
        ]);
    });

    it("answers nothing when no rule applies", () => {
        expect(
            rankSuggestions(
                { firstSale: [], classFull: [], lateBill: [], sellingLess: [] },
                none,
            ),
        ).toEqual([]);
    });
});

describe("keys and the 7 days", () => {
    it("builds and checks keys", () => {
        expect(suggestionKey("LATE_BILL", "cm1abc")).toBe("late-bill:cm1abc");
        expect(isSuggestionKey("class-full:cm1abc")).toBe(true);
        expect(isSuggestionKey("selling-less:cm1_a-b")).toBe(true);
        expect(isSuggestionKey("first-sale")).toBe(false);
        expect(isSuggestionKey("late-bill:")).toBe(false);
        expect(isSuggestionKey("late-bill:a b")).toBe(false);
        expect(isSuggestionKey("other:abc")).toBe(false);
        expect(isSuggestionKey(`late-bill:${"x".repeat(65)}`)).toBe(false);
        expect(isSuggestionKey(42)).toBe(false);
    });

    it("hides for 7 whole days", () => {
        expect(notNowUntil(NOW).toISOString()).toBe("2026-10-26T03:30:00.000Z");
    });
});
