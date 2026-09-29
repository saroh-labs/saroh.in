// `booking.notify` (round-2 A14) against a stand-in transaction: the team is
// told only of what the customer did themselves, the customer's side is
// handed to customer.notify's service keyed to the event, and a job from
// before A14 (no event id) still finds what it is about.
// F14: the team is also told of a booking the customer made, and each
// notice queues its email (`team.alert`) for whoever chose it.

jest.mock("@saroh/database", () => ({
    prisma: { $transaction: jest.fn() },
    runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
}));
jest.mock("../notifications/team-alerts", () => ({
    enqueueTeamAlert: jest.fn(),
}));

import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { enqueueTeamAlert } from "../notifications/team-alerts";
import type { CustomerNotifyService } from "../site-accounts/customer-notify.handler";
import type { BookingNotifyPayload } from "./booking-notify.handler";
import {
    BOOKING_NOTIFY_TYPE,
    BookingNotifyHandler,
    tellAboutBooking,
} from "./booking-notify.handler";

const ORG = "org_1";
const NOW = new Date("2026-10-06T05:30:00.000Z");
const WAS = new Date("2026-10-05T04:30:00.000Z");

function makeTx() {
    return {
        booking: {
            findFirst: jest.fn().mockResolvedValue({
                id: "bk_1",
                status: "CONFIRMED",
                startAt: NOW,
                timezone: "Asia/Kolkata",
                bookerName: "Asha R",
                service: { name: "Check-up" },
                contact: { firstName: "Asha", lastName: "Rao" },
            }),
        },
        bookingEvent: { findFirst: jest.fn() },
        customerNotice: {
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockResolvedValue({}),
        },
        notification: {
            create: jest.fn().mockResolvedValue({ id: "ntf_1" }),
        },
    };
}
type FakeTx = ReturnType<typeof makeTx>;
const asTx = (tx: FakeTx) => tx as unknown as Prisma.TransactionClient;

const notify = jest.fn().mockResolvedValue({
    duplicate: false,
    threadMessageId: null,
    messageId: null,
});
const notices = { notify } as unknown as CustomerNotifyService;

function run(tx: FakeTx, payload: BookingNotifyPayload) {
    return tellAboutBooking(asTx(tx), notices, {
        organizationId: ORG,
        jobId: "job_9",
        payload,
        now: NOW,
    });
}

beforeEach(() => jest.clearAllMocks());

describe("booking.notify", () => {
    it("the customer moved it: the team's inbox says so, and the customer is told", async () => {
        const tx = makeTx();
        tx.bookingEvent.findFirst.mockResolvedValue({
            id: "ev_move",
            type: "RESCHEDULED",
            actorUserId: null,
            fromStartAt: WAS,
            toStartAt: NOW,
        });
        await run(tx, {
            bookingId: "bk_1",
            reason: "rescheduled",
            eventId: "ev_move",
        });

        expect(tx.notification.create).toHaveBeenCalledWith({
            data: {
                organizationId: ORG,
                type: "booking.moved",
                title: "Asha Rao moved their Check-up",
                body: "Now Tue 6 Oct at 11:00. It was Mon 5 Oct at 10:00.",
            },
            select: { id: true },
        });
        expect(tx.customerNotice.createMany.mock.calls[0][0].data[0]).toEqual({
            organizationId: ORG,
            eventKey: "team:booking:ev_move",
            kind: "TEAM_TOLD",
            bookingId: "bk_1",
        });
        expect(tx.customerNotice.update.mock.calls[0][0].data).toEqual({
            notificationId: "ntf_1",
        });
        // Its email, for whoever chose it, is the team.alert job (F14).
        expect((enqueueTeamAlert as jest.Mock).mock.calls[0].slice(1)).toEqual([
            ORG,
            { event: "booking", notificationId: "ntf_1" },
        ]);
        expect(notify).toHaveBeenCalledWith(
            tx,
            ORG,
            {
                kind: "BOOKING_MOVED",
                eventKey: "booking:ev_move",
                bookingId: "bk_1",
                bookingEventId: "ev_move",
            },
            NOW,
        );
    });

    it("the customer cancelled it: the team is told when it was", async () => {
        const tx = makeTx();
        tx.bookingEvent.findFirst.mockResolvedValue({
            id: "ev_cancel",
            type: "CANCELLED",
            actorUserId: null,
            fromStartAt: WAS,
            toStartAt: null,
        });
        await run(tx, { bookingId: "bk_1", eventId: "ev_cancel" });
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            type: "booking.cancelled",
            title: "Asha Rao cancelled their Check-up",
            body: "It was Mon 5 Oct at 10:00.",
        });
        expect(notify.mock.calls[0][2]).toMatchObject({
            kind: "BOOKING_CANCELLED",
        });
    });

    it("the team moved it: only the customer is told", async () => {
        const tx = makeTx();
        tx.bookingEvent.findFirst.mockResolvedValue({
            id: "ev_move",
            type: "RESCHEDULED",
            actorUserId: "user_1",
            fromStartAt: WAS,
            toStartAt: NOW,
        });
        await run(tx, { bookingId: "bk_1", eventId: "ev_move" });
        expect(tx.notification.create).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it("a booking made online: the team's New booking, and the customer's confirmation (F14)", async () => {
        const tx = makeTx();
        tx.bookingEvent.findFirst.mockResolvedValue({
            id: "ev_booked",
            type: "BOOKED",
            actorUserId: null,
            fromStartAt: null,
            toStartAt: NOW,
        });
        await run(tx, {
            bookingId: "bk_1",
            reason: "booked",
            eventId: "ev_booked",
        });
        expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
            type: "booking.new",
            title: "Asha Rao booked Check-up",
            body: "Tue 6 Oct at 11:00.",
        });
        expect(
            tx.customerNotice.createMany.mock.calls[0][0].data[0],
        ).toMatchObject({
            eventKey: "team:booking:ev_booked",
            kind: "TEAM_TOLD",
        });
        expect(enqueueTeamAlert).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][2]).toMatchObject({
            kind: "BOOKING_CONFIRMED",
            eventKey: "booking:ev_booked",
        });
    });

    it("the team is told once per event, however often the job runs", async () => {
        const tx = makeTx();
        tx.bookingEvent.findFirst.mockResolvedValue({
            id: "ev_move",
            type: "RESCHEDULED",
            actorUserId: null,
            fromStartAt: WAS,
            toStartAt: NOW,
        });
        tx.customerNotice.createMany.mockResolvedValue({ count: 0 });
        await run(tx, { bookingId: "bk_1", eventId: "ev_move" });
        expect(tx.notification.create).not.toHaveBeenCalled();
        expect(enqueueTeamAlert).not.toHaveBeenCalled();
    });

    it("a job from before A14 (no event id) reads the booking's latest event", async () => {
        const tx = makeTx();
        tx.bookingEvent.findFirst.mockResolvedValue({
            id: "ev_latest",
            type: "RESCHEDULED",
            actorUserId: "user_1",
            fromStartAt: WAS,
            toStartAt: NOW,
        });
        await run(tx, { bookingId: "bk_1", reason: "rescheduled" });
        expect(tx.bookingEvent.findFirst.mock.calls[0][0].where).toEqual({
            bookingId: "bk_1",
        });
        expect(notify.mock.calls[0][2]).toMatchObject({
            kind: "BOOKING_MOVED",
            eventKey: "booking:ev_latest",
        });
    });

    it("with no history at all, the job itself is the key", async () => {
        const tx = makeTx();
        tx.bookingEvent.findFirst.mockResolvedValue(null);
        await run(tx, { bookingId: "bk_1", reason: "cancelled" });
        expect(notify.mock.calls[0][2]).toMatchObject({
            kind: "BOOKING_CANCELLED",
            eventKey: "booking:job:job_9",
            bookingEventId: null,
        });
    });

    it("a booking gone, or in another business, is nothing to tell", async () => {
        const tx = makeTx();
        tx.booking.findFirst.mockResolvedValue(null);
        await run(tx, { bookingId: "bk_other", eventId: "ev_1" });
        expect(tx.booking.findFirst.mock.calls[0][0].where).toEqual({
            id: "bk_other",
            organizationId: ORG,
        });
        expect(notify).not.toHaveBeenCalled();
    });
});

describe("the booking.notify job", () => {
    function job(payload: unknown, organizationId: string | null = ORG): Job {
        return {
            id: "job_1",
            organizationId,
            type: BOOKING_NOTIFY_TYPE,
            payload,
        } as unknown as Job;
    }

    it("runs in the business's RLS context, on one transaction", async () => {
        const tx = makeTx();
        tx.bookingEvent.findFirst.mockResolvedValue(null);
        (prisma.$transaction as jest.Mock).mockImplementation(
            (fn: (t: unknown) => unknown) => fn(tx),
        );
        await new BookingNotifyHandler(notices).handle(
            job({ bookingId: "bk_1", serviceId: "svc_1", contactId: "ct_1" }),
        );
        expect(runInOrgContext).toHaveBeenCalledWith(ORG, expect.any(Function));
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it("a job naming no booking, or no business, does nothing", async () => {
        const handler = new BookingNotifyHandler(notices);
        await handler.handle(job({}));
        await handler.handle(job({ bookingId: "bk_1" }, null));
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});
