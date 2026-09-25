// DB-free unit tests for the booking page's pay-now hold (U19). The
// transaction client is a plain object of jest mocks, so every read and write
// the hold makes is asserted in the one transaction it was handed.
import { hashPayToken } from "../invoices/pay-token";
import {
    confirmHoldInTx,
    createHoldInvoiceInTx,
    HOLD_MINUTES,
    HOLD_RELEASED_REASON,
    holdExpiry,
    holdLineDescription,
    holdsPlace,
    holdState,
    isExpiredHold,
    releaseHoldInTx,
    renewHoldTokenInTx,
} from "./booking-hold";

const NOW = new Date("2026-09-18T09:30:00.000Z");
const LATER = new Date(NOW.getTime() + 5 * 60_000);
const EARLIER = new Date(NOW.getTime() - 60_000);

function makeTx() {
    return {
        $queryRaw: jest.fn().mockResolvedValue([]),
        booking: {
            findUnique: jest.fn(),
            update: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
        },
        bookingEvent: { create: jest.fn() },
        invoice: {
            create: jest.fn().mockResolvedValue({ id: "inv_1" }),
            findFirst: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        invoiceLine: { createMany: jest.fn() },
        invoiceSequence: {
            upsert: jest.fn().mockResolvedValue({ lastNumber: 7 }),
        },
        businessProfile: { findUnique: jest.fn().mockResolvedValue(null) },
        courseSession: { findMany: jest.fn().mockResolvedValue([]) },
    };
}
type FakeTx = ReturnType<typeof makeTx>;
const asTx = (tx: FakeTx) =>
    tx as unknown as Parameters<typeof releaseHoldInTx>[0];

/** The tables `tx` row-locked, in order. */
function lockedTables(tx: FakeTx): string[] {
    return (tx.$queryRaw.mock.calls as [TemplateStringsArray][]).map(
        ([sql]) => /FROM "(\w+)"/.exec(sql.join("?"))?.[1] ?? "?",
    );
}

describe("what a hold is", () => {
    it("takes a place while it lasts, as a confirmed booking does", () => {
        expect(holdsPlace(NOW)).toEqual({
            OR: [
                { status: "CONFIRMED" },
                { status: "PENDING", holdExpiresAt: { gt: NOW } },
            ],
        });
    });

    it("runs out fifteen minutes after it was made", () => {
        expect(HOLD_MINUTES).toBe(15);
        expect(holdExpiry(NOW).toISOString()).toBe("2026-09-18T09:45:00.000Z");
    });

    it("reads HELD, then RELEASED once its time is up", () => {
        expect(
            holdState({ status: "PENDING", holdExpiresAt: LATER }, NOW),
        ).toBe("HELD");
        expect(
            holdState({ status: "PENDING", holdExpiresAt: EARLIER }, NOW),
        ).toBe("RELEASED");
        expect(
            isExpiredHold({ status: "PENDING", holdExpiresAt: NOW }, NOW),
        ).toBe(true);
        expect(
            isExpiredHold({ status: "PENDING", holdExpiresAt: LATER }, NOW),
        ).toBe(false);
    });

    it("tells a released hold from a booking the team cancelled", () => {
        expect(
            holdState({ status: "CANCELLED", holdExpiresAt: EARLIER }, NOW),
        ).toBe("RELEASED");
        expect(
            holdState({ status: "CANCELLED", holdExpiresAt: null }, NOW),
        ).toBe("CANCELLED");
        expect(
            holdState({ status: "CONFIRMED", holdExpiresAt: null }, NOW),
        ).toBe("CONFIRMED");
    });

    it("names the session on its invoice line in the service's own time", () => {
        expect(
            holdLineDescription(
                "Personal training",
                new Date("2026-09-21T01:30:00.000Z"),
                "Asia/Kolkata",
            ),
        ).toBe("Personal training · Mon 21 Sep 2026, 07:00");
    });
});

describe("createHoldInvoiceInTx", () => {
    const input = {
        organizationId: "org_1",
        bookingId: "bk_1",
        contactId: "c_1",
        billToName: "Asha Rao",
        billToEmail: "asha@example.in",
        service: {
            name: "Personal training",
            priceCents: 118_000,
            currency: "INR",
            timezone: "Asia/Kolkata",
            gstRate: "18",
            sacCode: "999723",
        },
        startAt: new Date("2026-09-21T01:30:00.000Z"),
    };

    it("writes a numberless DRAFT for the service's own price, with a pay token", async () => {
        const tx = makeTx();
        const made = await createHoldInvoiceInTx(asTx(tx), input);

        const data = tx.invoice.create.mock.calls[0][0].data;
        expect(data).toMatchObject({
            organizationId: "org_1",
            status: "DRAFT",
            kind: "INVOICE",
            source: "BOOKING",
            bookingId: "bk_1",
            contactId: "c_1",
            billToName: "Asha Rao",
            billToEmail: "asha@example.in",
            currency: "INR",
        });
        expect(data.number).toBeUndefined();
        expect(String(data.total)).toBe("1180.00");
        // Only the hash is stored; the token goes back once.
        expect(data.payTokenHash).toBe(hashPayToken(made.payToken));
        expect(made.invoiceId).toBe("inv_1");
        const lines = tx.invoiceLine.createMany.mock.calls[0][0].data;
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({
            description: "Personal training · Mon 21 Sep 2026, 07:00",
            quantity: 1,
        });
    });

    it("splits GST out of the price for a registered business", async () => {
        const tx = makeTx();
        tx.businessProfile.findUnique.mockResolvedValue({
            gstRegistered: true,
            gstState: "29",
            taxId: "29AAGCR4375J1ZU",
            invoicePrefix: "PF",
            timezone: "Asia/Kolkata",
            deliveryGstRate: "18",
            deliverySacCode: null,
        });
        await createHoldInvoiceInTx(asTx(tx), input);

        const data = tx.invoice.create.mock.calls[0][0].data;
        expect(String(data.total)).toBe("1180.00");
        expect(String(data.subtotal)).toBe("1000.00");
        expect(String(data.cgst)).toBe("90.00");
        expect(String(data.sgst)).toBe("90.00");
        expect(data.sellerGstin).toBe("29AAGCR4375J1ZU");
    });
});

describe("renewHoldTokenInTx", () => {
    it("swaps the draft's token for a new one", async () => {
        const tx = makeTx();
        const token = await renewHoldTokenInTx(asTx(tx), "bk_1");
        expect(token).toEqual(expect.any(String));
        expect(tx.invoice.updateMany).toHaveBeenCalledWith({
            where: {
                bookingId: "bk_1",
                kind: "INVOICE",
                source: "BOOKING",
                status: "DRAFT",
            },
            data: { payTokenHash: hashPayToken(token ?? "") },
        });
    });

    it("answers null when there is no draft left to pay", async () => {
        const tx = makeTx();
        tx.invoice.updateMany.mockResolvedValue({ count: 0 });
        expect(await renewHoldTokenInTx(asTx(tx), "bk_1")).toBeNull();
    });
});

describe("releaseHoldInTx", () => {
    it("cancels the hold, keeps its expiry, and voids its draft", async () => {
        const tx = makeTx();
        tx.booking.findUnique.mockResolvedValue({
            id: "bk_1",
            organizationId: "org_1",
            status: "PENDING",
            startAt: new Date("2026-09-21T01:30:00.000Z"),
            holdExpiresAt: EARLIER,
        });

        expect(await releaseHoldInTx(asTx(tx), "bk_1", NOW)).toBe(true);

        // Locked before it is read: its invoice, then itself — the
        // webhook's order, so the two cannot deadlock (#508).
        expect(lockedTables(tx)).toEqual(["Invoice", "Booking"]);
        expect(tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
            tx.booking.findUnique.mock.invocationCallOrder[0],
        );
        expect(tx.booking.update).toHaveBeenCalledWith({
            where: { id: "bk_1" },
            data: {
                status: "CANCELLED",
                cancelledAt: NOW,
                holdExpiresAt: EARLIER,
            },
        });
        expect(tx.bookingEvent.create.mock.calls[0][0].data).toMatchObject({
            bookingId: "bk_1",
            type: "CANCELLED",
        });
        // Nobody on the team let it go.
        expect(
            tx.bookingEvent.create.mock.calls[0][0].data.actorUserId,
        ).toBeNull();
        expect(tx.invoice.updateMany).toHaveBeenCalledWith({
            where: {
                bookingId: "bk_1",
                kind: "INVOICE",
                source: "BOOKING",
                status: "DRAFT",
            },
            data: {
                status: "VOID",
                voidedAt: NOW,
                voidReason: HOLD_RELEASED_REASON,
                payTokenHash: null,
            },
        });
    });

    it("names the team member who let it go", async () => {
        const tx = makeTx();
        tx.booking.findUnique.mockResolvedValue({
            id: "bk_1",
            organizationId: "org_1",
            status: "PENDING",
            startAt: NOW,
            holdExpiresAt: LATER,
        });
        await releaseHoldInTx(asTx(tx), "bk_1", NOW, "user_1");
        expect(tx.bookingEvent.create.mock.calls[0][0].data.actorUserId).toBe(
            "user_1",
        );
    });

    it("leaves a booking that is no longer a hold alone", async () => {
        const tx = makeTx();
        tx.booking.findUnique.mockResolvedValue({
            id: "bk_1",
            organizationId: "org_1",
            status: "CONFIRMED",
            startAt: NOW,
            holdExpiresAt: null,
        });
        expect(await releaseHoldInTx(asTx(tx), "bk_1", NOW)).toBe(false);
        expect(tx.booking.update).not.toHaveBeenCalled();
        expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    });
});

describe("confirmHoldInTx — the money arrived", () => {
    const payment = {
        paymentMethod: "ONLINE",
        paymentReference: "pay_1",
        paymentNote: "Paid online through Razorpay",
    };
    const heldBooking = (over: Record<string, unknown> = {}) => ({
        id: "bk_1",
        serviceId: "svc_1",
        staffId: "staff_1",
        status: "PENDING",
        startAt: new Date("2026-09-21T01:30:00.000Z"),
        endAt: new Date("2026-09-21T02:30:00.000Z"),
        holdExpiresAt: LATER,
        service: { capacity: 1 },
        ...over,
    });

    function wire(tx: FakeTx, booking: ReturnType<typeof heldBooking>) {
        tx.invoice.findFirst.mockResolvedValue({
            id: "inv_1",
            bookingId: "bk_1",
        });
        tx.booking.findUnique.mockImplementation(
            (args: { select: Record<string, unknown> }) =>
                Promise.resolve(
                    "service" in args.select
                        ? booking
                        : { ...booking, organizationId: "org_1" },
                ),
        );
    }

    it("confirms a hold paid in time, and numbers the invoice PAID", async () => {
        const tx = makeTx();
        wire(tx, heldBooking());

        const out = await confirmHoldInTx(asTx(tx), {
            invoiceId: "inv_1",
            organizationId: "org_1",
            now: NOW,
            payment,
        });

        expect(out).toBe("confirmed");
        expect(tx.booking.update).toHaveBeenCalledWith({
            where: { id: "bk_1" },
            data: {
                status: "CONFIRMED",
                holdExpiresAt: null,
                paidWith: "PAID",
            },
        });
        expect(tx.invoice.update).toHaveBeenCalledWith({
            where: { id: "inv_1" },
            data: {
                status: "PAID",
                number: "INV-0007",
                issuedAt: NOW,
                dueAt: NOW,
                paidAt: NOW,
                ...payment,
            },
        });
        // Paid in time: nothing needed counting.
        expect(tx.booking.count).not.toHaveBeenCalled();
    });

    it("still confirms a late payment when the place is free", async () => {
        const tx = makeTx();
        wire(tx, heldBooking({ holdExpiresAt: EARLIER }));
        tx.booking.count.mockResolvedValue(0);

        const out = await confirmHoldInTx(asTx(tx), {
            invoiceId: "inv_1",
            organizationId: "org_1",
            now: NOW,
            payment,
        });

        expect(out).toBe("confirmed");
        // The person's diary, leaving the booking itself out.
        expect(tx.booking.count.mock.calls[0][0].where).toMatchObject({
            id: { not: "bk_1" },
            staffId: "staff_1",
        });
    });

    it("releases a late payment's hold when someone else has the place", async () => {
        const tx = makeTx();
        wire(tx, heldBooking({ holdExpiresAt: EARLIER }));
        tx.booking.count.mockResolvedValue(1);

        const out = await confirmHoldInTx(asTx(tx), {
            invoiceId: "inv_1",
            organizationId: "org_1",
            now: NOW,
            payment,
        });

        expect(out).toBe("released");
        expect(tx.booking.update.mock.calls[0][0].data).toMatchObject({
            status: "CANCELLED",
        });
        expect(tx.invoice.update).not.toHaveBeenCalled();
        expect(tx.invoiceSequence.upsert).not.toHaveBeenCalled();
    });

    it("counts a class's places, not a person, for a late payment", async () => {
        const tx = makeTx();
        wire(
            tx,
            heldBooking({ holdExpiresAt: EARLIER, service: { capacity: 12 } }),
        );
        tx.booking.count.mockResolvedValue(11);

        const out = await confirmHoldInTx(asTx(tx), {
            invoiceId: "inv_1",
            organizationId: "org_1",
            now: NOW,
            payment,
        });

        expect(out).toBe("confirmed");
        expect(tx.booking.count.mock.calls[0][0].where).toMatchObject({
            serviceId: "svc_1",
        });
    });

    it("answers released for a hold already let go", async () => {
        const tx = makeTx();
        wire(tx, heldBooking({ status: "CANCELLED" }));
        const out = await confirmHoldInTx(asTx(tx), {
            invoiceId: "inv_1",
            organizationId: "org_1",
            now: NOW,
            payment,
        });
        expect(out).toBe("released");
        expect(tx.booking.update).not.toHaveBeenCalled();
    });
});
