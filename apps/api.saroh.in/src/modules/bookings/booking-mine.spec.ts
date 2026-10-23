// "Bookings with you" (#1138): who booking.notify queues an alert for, and
// that it is never the person who did it, nor anyone without a login.
jest.mock("../notifications/team-alerts", () => ({
    enqueueTeamAlert: jest.fn(),
}));

import type { Prisma } from "@saroh/database";

import { enqueueTeamAlert } from "../notifications/team-alerts";
import type { MineEvent } from "./booking-mine";
import { queueStaffAlertsInTx, staffToTell } from "./booking-mine";

const ORG = "org_1";
const enqueue = enqueueTeamAlert as jest.Mock;

function makeTx(people: { id: string; userId: string | null }[]) {
    return {
        job: { create: jest.fn() },
        staffMember: {
            findMany: jest.fn().mockResolvedValue(
                people.map((p) => ({
                    id: p.id,
                    membership: p.userId ? { userId: p.userId } : null,
                })),
            ),
        },
    };
}
const asTx = (tx: ReturnType<typeof makeTx>) =>
    tx as unknown as Prisma.TransactionClient;

const booked: MineEvent = { id: "ev_1", type: "BOOKED", actorUserId: null };

beforeEach(() => jest.clearAllMocks());

describe("staffToTell", () => {
    it("tells the person a booking is with, as what happened", () => {
        expect(staffToTell(booked, "st_ravi", "BOOKING_CONFIRMED")).toEqual([
            { staffId: "st_ravi", change: "new" },
        ]);
        expect(
            staffToTell(
                { ...booked, type: "RESCHEDULED" },
                "st_ravi",
                "BOOKING_MOVED",
            ),
        ).toEqual([{ staffId: "st_ravi", change: "moved" }]);
        expect(
            staffToTell(
                { ...booked, type: "CANCELLED" },
                "st_ravi",
                "BOOKING_CANCELLED",
            ),
        ).toEqual([{ staffId: "st_ravi", change: "cancelled" }]);
    });

    it("given to someone else: both are told", () => {
        expect(
            staffToTell(
                {
                    ...booked,
                    type: "REASSIGNED",
                    fromStaffId: "st_ravi",
                    toStaffId: "st_meera",
                },
                "st_meera",
                "BOOKING_MOVED",
            ),
        ).toEqual([
            { staffId: "st_meera", change: "new" },
            { staffId: "st_ravi", change: "moved-away" },
        ]);
    });

    it("given someone when it had nobody: only them", () => {
        expect(
            staffToTell(
                { ...booked, type: "REASSIGNED", toStaffId: "st_meera" },
                "st_meera",
                "BOOKING_MOVED",
            ),
        ).toEqual([{ staffId: "st_meera", change: "new" }]);
    });

    it("a booking with nobody tells nobody", () => {
        expect(staffToTell(booked, null, "BOOKING_CONFIRMED")).toEqual([]);
    });
});

describe("queueStaffAlertsInTx", () => {
    it("queues one alert for the person with a login", async () => {
        const tx = makeTx([{ id: "st_ravi", userId: "u_ravi" }]);
        await queueStaffAlertsInTx(asTx(tx), ORG, {
            bookingId: "bk_1",
            bookingStaffId: "st_ravi",
            event: booked,
            kind: "BOOKING_CONFIRMED",
        });
        expect(tx.staffMember.findMany).toHaveBeenCalledWith({
            where: { organizationId: ORG, id: { in: ["st_ravi"] } },
            select: { id: true, membership: { select: { userId: true } } },
        });
        expect(enqueue).toHaveBeenCalledWith(tx, ORG, {
            event: "booking-mine",
            bookingId: "bk_1",
            eventId: "ev_1",
            userId: "u_ravi",
            change: "new",
        });
    });

    it("never the person who did it", async () => {
        const tx = makeTx([{ id: "st_ravi", userId: "u_ravi" }]);
        await queueStaffAlertsInTx(asTx(tx), ORG, {
            bookingId: "bk_1",
            bookingStaffId: "st_ravi",
            event: { ...booked, type: "CANCELLED", actorUserId: "u_ravi" },
            kind: "BOOKING_CANCELLED",
        });
        expect(enqueue).not.toHaveBeenCalled();
    });

    it("a person with no login: nothing queued", async () => {
        const tx = makeTx([{ id: "st_ravi", userId: null }]);
        await queueStaffAlertsInTx(asTx(tx), ORG, {
            bookingId: "bk_1",
            bookingStaffId: "st_ravi",
            event: booked,
            kind: "BOOKING_CONFIRMED",
        });
        expect(enqueue).not.toHaveBeenCalled();
    });

    it("a job from before A14 (no event) tells nobody, and reads nothing", async () => {
        const tx = makeTx([{ id: "st_ravi", userId: "u_ravi" }]);
        await queueStaffAlertsInTx(asTx(tx), ORG, {
            bookingId: "bk_1",
            bookingStaffId: "st_ravi",
            event: null,
            kind: "BOOKING_CONFIRMED",
        });
        expect(tx.staffMember.findMany).not.toHaveBeenCalled();
        expect(enqueue).not.toHaveBeenCalled();
    });

    it("moved from Ravi to Meera by the owner: both are queued", async () => {
        const tx = makeTx([
            { id: "st_ravi", userId: "u_ravi" },
            { id: "st_meera", userId: "u_meera" },
        ]);
        await queueStaffAlertsInTx(asTx(tx), ORG, {
            bookingId: "bk_1",
            bookingStaffId: "st_meera",
            event: {
                id: "ev_2",
                type: "REASSIGNED",
                actorUserId: "u_owner",
                fromStaffId: "st_ravi",
                toStaffId: "st_meera",
            },
            kind: "BOOKING_MOVED",
        });
        expect(enqueue.mock.calls.map((c) => c[2])).toEqual([
            expect.objectContaining({ userId: "u_meera", change: "new" }),
            expect.objectContaining({
                userId: "u_ravi",
                change: "moved-away",
            }),
        ]);
    });
});
