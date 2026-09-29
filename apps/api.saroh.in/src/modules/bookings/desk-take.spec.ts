import type { BookingPaperRow } from "./desk-take";
import {
    chargingOnly,
    DESK_REFUSED,
    deskTake,
    paidAtDesk,
    paidOnlineOf,
} from "./desk-take";

/*
 * What "Take ₹X" takes at the desk, and why not (round-2 P2). Pure: the
 * booking's read, the diary and the write all decide it here.
 */

const DESK = { status: "CONFIRMED", paidWith: "DESK" };
const PRICE = { priceCents: 50_000, paidOnlineCents: 0, paidAtDeskCents: 0 };

function paper(over: Partial<BookingPaperRow> = {}): BookingPaperRow {
    return {
        kind: "INVOICE",
        status: "PAID",
        paymentMethod: "CASH",
        total: "500.00",
        paidAt: new Date("2026-09-29T10:00:00Z"),
        paymentIntents: [],
        ...over,
    };
}

describe("paidAtDesk", () => {
    it("adds up the paper paid by hand, and says how the last was paid", () => {
        expect(
            paidAtDesk([
                paper({ total: "400.00", paymentMethod: "ONLINE" }),
                paper({
                    kind: "SUPPLEMENTARY",
                    total: "400.00",
                    paymentMethod: "UPI",
                }),
            ]),
        ).toEqual({ cents: 40_000, method: "UPI" });
    });

    it("counts nothing issued, void, online or an order's", () => {
        expect(
            paidAtDesk([
                paper({ status: "ISSUED", paymentMethod: null }),
                paper({ status: "VOID" }),
                paper({ paymentMethod: "ONLINE" }),
                paper({ paymentMethod: "ORDER" }),
            ]),
        ).toEqual({ cents: 0, method: null });
    });

    it("takes the latest method by when it was paid", () => {
        expect(
            paidAtDesk([
                paper({
                    paymentMethod: "CARD",
                    paidAt: new Date("2026-09-29T12:00:00Z"),
                }),
                paper({
                    paymentMethod: "CASH",
                    paidAt: new Date("2026-09-29T09:00:00Z"),
                }),
            ]).method,
        ).toBe("CARD");
    });
});

describe("paidOnlineOf and chargingOnly", () => {
    it("sums the succeeded payments on the booking's own paid invoice", () => {
        const rows = [
            {
                kind: "INVOICE",
                status: "PAID",
                paymentIntents: [
                    { status: "SUCCEEDED", amountCents: 40_000 },
                    { status: "PROCESSING", amountCents: 100 },
                ],
            },
            {
                kind: "SUPPLEMENTARY",
                status: "PAID",
                paymentIntents: [{ status: "SUCCEEDED", amountCents: 999 }],
            },
            {
                kind: "INVOICE",
                status: "ISSUED",
                paymentIntents: [{ status: "SUCCEEDED", amountCents: 999 }],
            },
        ];
        expect(paidOnlineOf(rows)).toBe(40_000);
        expect(chargingOnly(rows)[0]?.paymentIntents).toEqual([
            { status: "PROCESSING", amountCents: 100 },
        ]);
    });
});

describe("deskTake", () => {
    it("takes the whole price for a pay-at-the-desk booking, which a link could ask for too", () => {
        expect(deskTake(DESK, { ...PRICE, paper: [] })).toEqual({
            cents: 50_000,
            byLink: true,
        });
    });

    it("takes a booking nobody said how it's paid", () => {
        expect(
            deskTake(
                { status: "CONFIRMED", paidWith: null },
                { ...PRICE, paper: [] },
            ),
        ).toEqual({ cents: 50_000, byLink: true });
    });

    it("takes only the balance after a deposit, never by link", () => {
        expect(
            deskTake(
                { status: "CONFIRMED", paidWith: "PAID" },
                {
                    ...PRICE,
                    priceCents: 80_000,
                    paidOnlineCents: 40_000,
                    paper: [paper({ paymentMethod: "ONLINE", total: "400" })],
                },
            ),
        ).toEqual({ cents: 40_000, byLink: false });
    });

    it("takes what a pay link already out asks for", () => {
        expect(
            deskTake(
                { status: "CONFIRMED", paidWith: null },
                {
                    ...PRICE,
                    paper: [
                        paper({
                            status: "ISSUED",
                            paymentMethod: null,
                            total: "450.00",
                        }),
                    ],
                },
            ),
        ).toEqual({ cents: 45_000, byLink: true });
    });

    it.each([
        [
            "cancelled",
            { status: "CANCELLED", paidWith: "DESK" },
            DESK_REFUSED.cancelled,
        ],
        [
            "a hold still waiting",
            { status: "PENDING", paidWith: null },
            DESK_REFUSED.holding,
        ],
        [
            "a treatment's visit",
            { ...DESK, orderId: "ord_1" },
            DESK_REFUSED.treatment,
        ],
        [
            "a course's session",
            { ...DESK, courseEnrollmentId: "enr_1" },
            DESK_REFUSED.course,
        ],
        [
            "paid with a pack",
            { status: "CONFIRMED", paidWith: "PACK" },
            DESK_REFUSED.paid,
        ],
        [
            "a membership's class",
            { status: "CONFIRMED", paidWith: "MEMBERSHIP" },
            DESK_REFUSED.paid,
        ],
        [
            "recorded as paid by hand",
            { status: "CONFIRMED", paidWith: "PAID" },
            DESK_REFUSED.paid,
        ],
    ])("refuses %s", (_what, booking, refusal) => {
        expect(deskTake(booking, { ...PRICE, paper: [] })).toEqual({
            refusal,
        });
    });

    it("refuses a booking already paid at the desk, or in full online", () => {
        expect(
            deskTake(DESK, {
                ...PRICE,
                paidAtDeskCents: 50_000,
                paper: [paper()],
            }),
        ).toEqual({ refusal: DESK_REFUSED.paid });
        expect(
            deskTake(
                { status: "CONFIRMED", paidWith: "PAID" },
                {
                    ...PRICE,
                    paidOnlineCents: 50_000,
                    paper: [paper({ paymentMethod: "ONLINE" })],
                },
            ),
        ).toEqual({ refusal: DESK_REFUSED.paid });
    });

    it("refuses while a payment is going through online", () => {
        expect(
            deskTake(DESK, {
                ...PRICE,
                paper: [
                    paper({
                        status: "ISSUED",
                        paymentMethod: null,
                        paymentIntents: [{ id: "pi_1" }],
                    }),
                ],
            }),
        ).toEqual({ refusal: DESK_REFUSED.charging });
    });

    it("leaves a voided or credited invoice to Invoices", () => {
        expect(
            deskTake(DESK, {
                ...PRICE,
                paper: [paper({ status: "VOID", paymentMethod: null })],
            }),
        ).toEqual({ refusal: DESK_REFUSED.voided });
    });

    it("refuses a booking with no price", () => {
        expect(
            deskTake(DESK, { ...PRICE, priceCents: null, paper: [] }),
        ).toEqual({ refusal: DESK_REFUSED.unpriced });
        expect(deskTake(DESK, { ...PRICE, priceCents: 0, paper: [] })).toEqual({
            refusal: DESK_REFUSED.unpriced,
        });
    });
});
