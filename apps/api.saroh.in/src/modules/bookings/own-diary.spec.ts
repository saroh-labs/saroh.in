import { ForbiddenException, NotFoundException } from "@nestjs/common";

import {
    assertOwnBooking,
    bookingStaffFor,
    isOwnBooking,
    ownBookingsWhere,
    ownDiaryOf,
} from "./own-diary";

/**
 * Calendar only works its own diary (#868): someone else's bookings are
 * neither listed, read nor changed.
 */

const calendarOnly = {
    organizationId: "org",
    userId: "u_priya",
    roleKey: "calendar-only",
};

function db(staffMember: unknown) {
    return {
        membership: {
            findUnique: jest.fn().mockResolvedValue({ staffMember }),
        },
    };
}

const PRIYA = { id: "staff_priya", services: [{ serviceId: "svc_cut" }] };
const mine = { staffId: "staff_priya", serviceId: "svc_cut" };
const theirs = { staffId: "staff_ravi", serviceId: "svc_cut" };
const nobodysOther = { staffId: null, serviceId: "svc_colour" };
const nobodysMine = { staffId: null, serviceId: "svc_cut" };

describe("whose diary a caller works", () => {
    it("is nobody's narrowing for every other role", async () => {
        for (const roleKey of ["OWNER", "ADMIN", "MEMBER", "front-desk"]) {
            const d = db(PRIYA);
            await expect(
                ownDiaryOf(d as never, { ...calendarOnly, roleKey }),
            ).resolves.toBeNull();
            expect(d.membership.findUnique).not.toHaveBeenCalled();
        }
    });

    it("is their staff member and the services they take", async () => {
        await expect(
            ownDiaryOf(db(PRIYA) as never, calendarOnly),
        ).resolves.toEqual({ staffId: "staff_priya", serviceIds: ["svc_cut"] });
    });

    it("is no diary when they aren't on it", async () => {
        await expect(
            ownDiaryOf(db(null) as never, calendarOnly),
        ).resolves.toEqual({ staffId: null, serviceIds: [] });
    });
});

describe("which bookings are theirs", () => {
    const own = { staffId: "staff_priya", serviceIds: ["svc_cut"] };

    it("are the ones they take, and nobody's for a service they take", () => {
        expect(isOwnBooking(own, mine)).toBe(true);
        expect(isOwnBooking(own, nobodysMine)).toBe(true);
        expect(isOwnBooking(own, theirs)).toBe(false);
        expect(isOwnBooking(own, nobodysOther)).toBe(false);
    });

    it("are none at all off the diary, never everyone's", () => {
        const none = { staffId: null, serviceIds: [] };
        expect(isOwnBooking(none, mine)).toBe(false);
        expect(isOwnBooking(none, nobodysMine)).toBe(false);
        expect(ownBookingsWhere(none)).toEqual({ AND: [{ id: { in: [] } }] });
    });

    it("narrow a list without replacing an OR beside it", () => {
        expect(ownBookingsWhere(null)).toEqual({});
        expect(ownBookingsWhere(own)).toEqual({
            AND: [
                {
                    OR: [
                        { staffId: "staff_priya" },
                        { staffId: null, serviceId: { in: ["svc_cut"] } },
                    ],
                },
            ],
        });
        expect(
            ownBookingsWhere({ staffId: "staff_priya", serviceIds: [] }),
        ).toEqual({ AND: [{ staffId: "staff_priya" }] });
    });
});

describe("reading and changing someone else's booking", () => {
    it("is a 404 to read and a 403 to change", async () => {
        await expect(
            assertOwnBooking(db(PRIYA) as never, calendarOnly, theirs, "read"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            assertOwnBooking(db(PRIYA) as never, calendarOnly, theirs, "write"),
        ).rejects.toThrow(ForbiddenException);
        await expect(
            assertOwnBooking(db(PRIYA) as never, calendarOnly, theirs, "write"),
        ).rejects.toThrow("Your role changes only your own bookings.");
    });

    it("lets them read and change their own", async () => {
        await expect(
            assertOwnBooking(db(PRIYA) as never, calendarOnly, mine, "write"),
        ).resolves.toBeUndefined();
    });

    it("never stops anyone else", async () => {
        await expect(
            assertOwnBooking(
                db(PRIYA) as never,
                { ...calendarOnly, roleKey: "MEMBER" },
                theirs,
                "read",
            ),
        ).resolves.toBeUndefined();
    });
});

describe("booking someone in by hand", () => {
    it("books Calendar only with themselves", async () => {
        await expect(
            bookingStaffFor(db(PRIYA) as never, calendarOnly, undefined),
        ).resolves.toBe("staff_priya");
        await expect(
            bookingStaffFor(db(PRIYA) as never, calendarOnly, "staff_priya"),
        ).resolves.toBe("staff_priya");
    });

    it("refuses another person's diary, or none", async () => {
        await expect(
            bookingStaffFor(db(PRIYA) as never, calendarOnly, "staff_ravi"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            bookingStaffFor(db(null) as never, calendarOnly, undefined),
        ).rejects.toThrow(/aren't on the diary/);
    });

    it("leaves everyone else's choice as asked", async () => {
        await expect(
            bookingStaffFor(
                db(PRIYA) as never,
                { ...calendarOnly, roleKey: "ADMIN" },
                "staff_ravi",
            ),
        ).resolves.toBe("staff_ravi");
    });
});
