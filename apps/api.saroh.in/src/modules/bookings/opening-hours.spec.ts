import { BadRequestException } from "@nestjs/common";

import type {
    AvailabilityService,
    OpeningHours,
    StaffAvailabilityInput,
} from "./availability";
import { insideOpening, personSlots, staffSlots } from "./availability";
import {
    happensInPerson,
    loadOpeningHours,
    openingWindows,
    refuseOutsideOpening,
} from "./opening-hours";
import { eitherWay } from "./public-booking-page";

// DEC-087, DEC-096: in-person bookings keep to the business's opening hours. Pure
// geometry and the reading; the booking paths are in their own specs.

const MON = "2026-09-21"; // a Monday

/** A week as Settings › Hours stores it, Monday first. */
function week(
    open: string,
    close: string,
    closed: string[] = [],
): { day: string; open: string; close: string; closed: boolean }[] {
    return ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => ({
        day,
        open,
        close,
        closed: closed.includes(day),
    }));
}

const ONE_TO_ONE: AvailabilityService = {
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    capacity: 1,
    timezone: "UTC",
};

function person(
    startMinute: number,
    endMinute: number,
    dayOfWeek = 1,
): StaffAvailabilityInput {
    return {
        id: "staff_1",
        hours: [{ dayOfWeek, startMinute, endMinute }],
        extraHours: [],
        timeOff: [],
        busy: [],
    };
}

function opening(windows: OpeningHours["windows"], zone = "UTC"): OpeningHours {
    return { zone, windows };
}

const day = (date: string) => ({
    from: new Date(`${date}T00:00:00.000Z`),
    to: new Date(`${date}T23:59:59.000Z`),
});

const times = (slots: { startAt: Date }[]) =>
    slots.map((s) => s.startAt.toISOString().slice(11, 16));

describe("openingWindows — a stored week as weekly windows", () => {
    it("reads each open day, Sunday as 0, and leaves a closed day out", () => {
        const windows = openingWindows(week("09:00", "18:30", ["SUN"]));
        expect(windows).toHaveLength(6);
        expect(windows).toContainEqual({
            dayOfWeek: 1,
            startMinute: 540,
            endMinute: 1110,
        });
        expect(windows!.some((w) => w.dayOfWeek === 0)).toBe(false);
    });

    it("is null when nothing is saved, or the week can't be read", () => {
        expect(openingWindows(null)).toBeNull();
        expect(openingWindows([])).toBeNull();
        expect(openingWindows([{ day: "MON", open: "9am" }])).toBeNull();
    });
});

describe("loadOpeningHours — the shops' weeks, or the business's", () => {
    function db(
        shops: unknown[],
        first: unknown = null,
        timezone = "Asia/Kolkata",
    ) {
        return {
            store: {
                findMany: jest.fn().mockResolvedValue(shops),
                findFirst: jest.fn().mockResolvedValue(first),
            },
            businessProfile: {
                findUnique: jest.fn().mockResolvedValue({ timezone }),
            },
            service: { findFirst: jest.fn() },
        };
    }

    it("is null when the business has no hours saved: bookings work as before", async () => {
        const client = db([], null);
        await expect(
            loadOpeningHours(client as never, "org_1"),
        ).resolves.toBeNull();
        expect(client.store.findMany.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            deletedAt: null,
            settings: { is: { kind: "SHOP" } },
        });
    });

    it("reads the business's week with no walk-in storefront (DEC-096)", async () => {
        // An online-only business: Settings › Hours saved to its storefront.
        const client = db([], {
            settings: { openingHours: week("10:00", "19:00", ["SUN"]) },
        });
        const hours = await loadOpeningHours(client as never, "org_1");
        expect(hours!.zone).toBe("Asia/Kolkata");
        expect(hours!.windows).toHaveLength(6);
        expect(hours!.windows).toContainEqual({
            dayOfWeek: 1,
            startMinute: 600,
            endMinute: 1140,
        });
        // The first storefront, as the site header reads it.
        expect(client.store.findFirst.mock.calls[0][0]).toMatchObject({
            where: { organizationId: "org_1", deletedAt: null },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
    });

    it("is null when no shop has its hours set, and never falls back past a shop", async () => {
        const client = db([{ settings: { openingHours: null } }], {
            settings: { openingHours: week("00:00", "23:59") },
        });
        await expect(
            loadOpeningHours(client as never, "org_1"),
        ).resolves.toBeNull();
        expect(client.store.findFirst).not.toHaveBeenCalled();
    });

    it("puts two shops' weeks together, in the business's zone", async () => {
        const client = db([
            { settings: { openingHours: week("09:00", "13:00") } },
            { settings: { openingHours: week("12:00", "18:00") } },
            { settings: null },
        ]);
        const hours = await loadOpeningHours(client as never, "org_1");
        expect(hours!.zone).toBe("Asia/Kolkata");
        expect(hours!.windows).toHaveLength(14);
    });
});

describe("who keeps to opening hours", () => {
    it("is an in-person booking, never an online one", () => {
        expect(happensInPerson("IN_PERSON", undefined)).toBe(true);
        expect(happensInPerson("ONLINE", undefined)).toBe(false);
    });

    it("is either way as the booker chose — in person when they didn't say", () => {
        expect(happensInPerson("EITHER", "IN_PERSON")).toBe(true);
        expect(happensInPerson("EITHER", undefined)).toBe(true);
        expect(happensInPerson("EITHER", null)).toBe(true);
        expect(happensInPerson("EITHER", "ONLINE")).toBe(false);
    });
});

describe("a person's hours cut to opening hours", () => {
    const { from, to } = day(MON);
    const NINE_TO_SIX = opening([
        { dayOfWeek: 1, startMinute: 540, endMinute: 1080 },
    ]);

    it("offers only the starts that fit inside, from when the shop opens", () => {
        // In from 08:15 to 20:00; the shop is open 09:00–18:00.
        const slots = personSlots(
            ONE_TO_ONE,
            [],
            person(495, 1200),
            "UTC",
            from,
            to,
            NINE_TO_SIX,
        );
        const at = times(slots);
        expect(at[0]).toBe("09:00");
        expect(at.at(-1)).toBe("17:00");
        expect(at).not.toContain("08:15");
        expect(at).not.toContain("17:30");
    });

    it("is unchanged with no opening hours saved, or online", () => {
        const slots = personSlots(
            ONE_TO_ONE,
            [],
            person(495, 1200),
            "UTC",
            from,
            to,
            null,
        );
        expect(times(slots)[0]).toBe("08:15");
        expect(times(slots).at(-1)).toBe("18:45");
    });

    it("offers nothing in person on a day the shop is closed", () => {
        const tuesdayOnly = opening([
            { dayOfWeek: 2, startMinute: 540, endMinute: 1080 },
        ]);
        expect(
            personSlots(
                ONE_TO_ONE,
                [],
                person(495, 1200),
                "UTC",
                from,
                to,
                tuesdayOnly,
            ),
        ).toEqual([]);
    });

    it("is open when any shop is: two shops' hours together", () => {
        // One shop 09:00–13:00, the other 12:00–18:00: open 09:00–18:00,
        // so 12:30 — across the two — is offered.
        const two = opening([
            { dayOfWeek: 1, startMinute: 540, endMinute: 780 },
            { dayOfWeek: 1, startMinute: 720, endMinute: 1080 },
        ]);
        const at = times(
            staffSlots(ONE_TO_ONE, [], [person(0, 1440)], "UTC", from, to, two),
        );
        expect(at[0]).toBe("09:00");
        expect(at).toContain("12:30");
        expect(at.at(-1)).toBe("17:00");
    });

    it("reads opening hours in the business's zone, not UTC", () => {
        // Open 09:00–18:00 in India is 03:30–12:30 UTC; the person's hours
        // are in India too, all day Monday.
        const india = opening(
            [{ dayOfWeek: 1, startMinute: 540, endMinute: 1080 }],
            "Asia/Kolkata",
        );
        const at = times(
            personSlots(
                ONE_TO_ONE,
                [],
                person(0, 1440),
                "Asia/Kolkata",
                new Date(`${MON}T00:00:00.000Z`),
                new Date("2026-09-22T00:00:00.000Z"),
                india,
            ),
        );
        expect(at[0]).toBe("03:30");
        expect(at.at(-1)).toBe("11:30");
    });

    it("keeps a late-night India opening on the right UTC day", () => {
        // Monday 00:00–02:00 in India is Sunday 18:30–20:30 UTC.
        const lateNight = opening(
            [{ dayOfWeek: 1, startMinute: 0, endMinute: 120 }],
            "Asia/Kolkata",
        );
        const slots = personSlots(
            ONE_TO_ONE,
            [],
            person(0, 1440),
            "Asia/Kolkata",
            new Date("2026-09-20T00:00:00.000Z"),
            new Date("2026-09-22T00:00:00.000Z"),
            lateNight,
        );
        expect(slots.map((s) => s.startAt.toISOString())).toEqual([
            "2026-09-20T18:30:00.000Z",
            "2026-09-20T19:00:00.000Z",
            "2026-09-20T19:30:00.000Z",
        ]);
    });
});

describe("a service's own times inside opening hours", () => {
    it("keeps a class's sessions where they are, dropping those not wholly inside", () => {
        const slots = [8.5, 9.5, 10.5, 11.5].map((h) => ({
            startAt: new Date(Date.UTC(2026, 8, 21, h, (h % 1) * 60)),
            endAt: new Date(Date.UTC(2026, 8, 21, h + 1, (h % 1) * 60)),
        }));
        const kept = insideOpening(
            slots,
            opening([{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }]),
        );
        expect(times(kept)).toEqual(["09:30", "10:30"]);
        expect(insideOpening(slots, null)).toBe(slots);
    });
});

describe("refuseOutsideOpening — the server's word", () => {
    const hours = opening([
        { dayOfWeek: 1, startMinute: 540, endMinute: 1080 },
    ]);
    const at = (from: string, to: string) => ({
        startAt: new Date(`${MON}T${from}:00.000Z`),
        endAt: new Date(`${MON}T${to}:00.000Z`),
    });

    it("lets a booking inside opening hours through", () => {
        expect(() =>
            refuseOutsideOpening(hours, at("17:00", "18:00")),
        ).not.toThrow();
    });

    it("refuses one that runs past closing, and says why", () => {
        expect(() => refuseOutsideOpening(hours, at("17:30", "18:30"))).toThrow(
            "That time is outside opening hours. Pick another time.",
        );
    });

    it("tells someone still choosing Where that online is open", () => {
        try {
            refuseOutsideOpening(hours, at("19:00", "20:00"), true);
            throw new Error("not refused");
        } catch (err) {
            expect(err).toBeInstanceOf(BadRequestException);
            expect((err as BadRequestException).getResponse()).toMatchObject({
                message: expect.stringMatching(/choose online/),
                field: "startAt",
            });
        }
    });

    it("never refuses with no opening hours", () => {
        expect(() =>
            refuseOutsideOpening(null, at("23:00", "23:59")),
        ).not.toThrow();
    });
});

describe("eitherWay — one list for a service offered either way", () => {
    const start = (startAt: string) => ({
        startAt,
        endAt: startAt,
        staffId: null,
        staffName: null,
        placesLeft: null,
    });

    it("says which way a start can only be had, and nothing when both", () => {
        const both = eitherWay(
            { hours: [], starts: [start("2026-09-21T09:00:00.000Z")] },
            {
                hours: [],
                starts: [
                    start("2026-09-21T09:00:00.000Z"),
                    start("2026-09-21T19:00:00.000Z"),
                ],
            },
        );
        expect(both.starts).toEqual([
            start("2026-09-21T09:00:00.000Z"),
            { ...start("2026-09-21T19:00:00.000Z"), only: "ONLINE" },
        ]);
    });

    it("marks a start only in person has (a person's grid cut to opening)", () => {
        const out = eitherWay(
            { hours: [], starts: [start("2026-09-21T09:00:00.000Z")] },
            { hours: [], starts: [] },
        );
        expect(out.starts[0]!.only).toBe("IN_PERSON");
    });
});
