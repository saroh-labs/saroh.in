// The confirmation stamp (round-2 A14, DEC-049) against a stand-in
// database: a booking or order confirmation, sent to the email the
// customer made it online with, verifies that contact's email; nothing
// else does.

import type { Prisma } from "@saroh/database";

import type { SentMessage } from "./confirmation-stamp";
import { confirmationVia, stampConfirmedEmail } from "./confirmation-stamp";

const NOW = new Date("2026-10-06T05:30:00.000Z");

function makeDb() {
    return {
        customerNotice: {
            findFirst: jest
                .fn()
                .mockResolvedValue({ bookingId: "bk_1", orderId: null }),
        },
        booking: {
            findFirst: jest.fn().mockResolvedValue({
                contactId: "ct_1",
                bookerEmail: "Asha@Example.com",
            }),
        },
        bookingEvent: {
            findFirst: jest.fn().mockResolvedValue({ actorUserId: null }),
        },
        order: {
            findFirst: jest.fn().mockResolvedValue({
                placedOnline: true,
                customer: { email: "asha@example.com" },
            }),
        },
        contact: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
    };
}
type FakeDb = ReturnType<typeof makeDb>;
const asDb = (db: FakeDb) => db as unknown as Prisma.TransactionClient;

function sent(over: Partial<SentMessage> = {}): SentMessage {
    return {
        id: "msg_1",
        organizationId: "org_1",
        contactId: "ct_1",
        toAddress: "asha@example.com",
        template: "BOOKING_CONFIRMED",
        ...over,
    };
}

describe("which sends prove an address", () => {
    it("a booking confirmation, and an order's Ready or handover", () => {
        expect(confirmationVia("BOOKING_CONFIRMED")).toBe(
            "BOOKING_CONFIRMATION",
        );
        expect(confirmationVia("ORDER_READY")).toBe("ORDER_CONFIRMATION");
        expect(confirmationVia("ORDER_HANDED_OVER")).toBe("ORDER_CONFIRMATION");
    });

    it("not a move, a cancel, an invoice or a typed message", () => {
        for (const t of [
            "BOOKING_MOVED",
            "BOOKING_CANCELLED",
            "INVOICE_SENT",
            "WAITLIST_OFFER",
            null,
        ]) {
            expect(confirmationVia(t)).toBeNull();
        }
    });
});

describe("stampConfirmedEmail", () => {
    it("stamps a contact who booked online with the email it went to", async () => {
        const db = makeDb();
        await expect(stampConfirmedEmail(asDb(db), sent(), NOW)).resolves.toBe(
            true,
        );
        expect(db.contact.updateMany).toHaveBeenCalledWith({
            where: {
                id: "ct_1",
                organizationId: "org_1",
                emailVerifiedAt: null,
                email: { equals: "asha@example.com", mode: "insensitive" },
            },
            data: {
                emailVerifiedAt: NOW,
                emailVerifiedVia: "BOOKING_CONFIRMATION",
            },
        });
    });

    it("stamps an order placed online, as an order confirmation", async () => {
        const db = makeDb();
        db.customerNotice.findFirst.mockResolvedValue({
            bookingId: null,
            orderId: "order_1",
        });
        await stampConfirmedEmail(
            asDb(db),
            sent({ template: "ORDER_READY" }),
            NOW,
        );
        expect(db.contact.updateMany.mock.calls[0][0].data).toEqual({
            emailVerifiedAt: NOW,
            emailVerifiedVia: "ORDER_CONFIRMATION",
        });
    });

    it("a reserved placeholder address is never stamped", async () => {
        const db = makeDb();
        const out = await stampConfirmedEmail(
            asDb(db),
            sent({ toAddress: "account+ct_1@account.invalid" }),
            NOW,
        );
        expect(out).toBe(false);
        expect(db.customerNotice.findFirst).not.toHaveBeenCalled();
        expect(db.contact.updateMany).not.toHaveBeenCalled();
    });

    it("a booking the team made by hand proves nothing", async () => {
        const db = makeDb();
        db.bookingEvent.findFirst.mockResolvedValue({ actorUserId: "user_1" });
        expect(await stampConfirmedEmail(asDb(db), sent(), NOW)).toBe(false);
        expect(db.contact.updateMany).not.toHaveBeenCalled();
    });

    it("a booking made with another email proves nothing", async () => {
        const db = makeDb();
        db.booking.findFirst.mockResolvedValue({
            contactId: "ct_1",
            bookerEmail: "someone@else.com",
        });
        expect(await stampConfirmedEmail(asDb(db), sent(), NOW)).toBe(false);
    });

    it("another contact's booking proves nothing for this one", async () => {
        const db = makeDb();
        db.booking.findFirst.mockResolvedValue({
            contactId: "ct_other",
            bookerEmail: "asha@example.com",
        });
        expect(await stampConfirmedEmail(asDb(db), sent(), NOW)).toBe(false);
    });

    it("an order the team keyed in proves nothing", async () => {
        const db = makeDb();
        db.customerNotice.findFirst.mockResolvedValue({
            bookingId: null,
            orderId: "order_1",
        });
        db.order.findFirst.mockResolvedValue({
            placedOnline: false,
            customer: { email: "asha@example.com" },
        });
        expect(
            await stampConfirmedEmail(
                asDb(db),
                sent({ template: "ORDER_READY" }),
                NOW,
            ),
        ).toBe(false);
    });

    it("a message no notice recorded (a typed one) proves nothing", async () => {
        const db = makeDb();
        db.customerNotice.findFirst.mockResolvedValue(null);
        expect(await stampConfirmedEmail(asDb(db), sent(), NOW)).toBe(false);
    });

    it("a move or a cancel never stamps", async () => {
        const db = makeDb();
        expect(
            await stampConfirmedEmail(
                asDb(db),
                sent({ template: "BOOKING_MOVED" }),
                NOW,
            ),
        ).toBe(false);
        expect(db.customerNotice.findFirst).not.toHaveBeenCalled();
    });

    it("a contact already verified, or holding another email, is left as it is", async () => {
        const db = makeDb();
        db.contact.updateMany.mockResolvedValue({ count: 0 });
        expect(await stampConfirmedEmail(asDb(db), sent(), NOW)).toBe(false);
    });
});
