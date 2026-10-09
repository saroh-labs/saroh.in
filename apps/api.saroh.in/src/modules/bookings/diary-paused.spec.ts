import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Service } from "@saroh/database";

/**
 * People on the diary with no login past the team limit after a move to a
 * lower plan (#800) take no new bookings: the slot engine offers no time
 * with them, a booking by hand with them is refused in the team's words,
 * and a customer hears only that they aren't taking bookings. Bookings
 * already made are never read here, so nothing of theirs changes. What is
 * paused is the core's (`over-limit.service.ts`), mocked here.
 */
jest.mock("@saroh/database", () => ({ prisma: {} }));

const pausedNow = jest.fn();
jest.mock("../billing/over-limit.service", () => ({
    overLimit: { pausedNow: (...a: unknown[]) => pausedNow(...a) },
}));

const serviceStaff = jest.fn();
const loadPeople = jest.fn();
jest.mock("./staff-availability", () => ({
    ...jest.requireActual("./staff-availability"),
    serviceStaff: (...a: unknown[]) => serviceStaff(...a),
    loadPeople: (...a: unknown[]) => loadPeople(...a),
    businessTimezone: () => Promise.resolve("Asia/Kolkata"),
}));

jest.mock("./opening-hours", () => ({
    openingFor: () => Promise.resolve(null),
}));

import { PAUSED_BY_PLAN } from "../billing/paused-errors";
import { loadStaffing, openSlots, resolvePerson } from "./booking-slots";
import { nobodyTaking, pausedDiaryIds, splitPaused } from "./diary-paused";

const ASHA = { id: "staff_asha", name: "Asha" };
const RAVI = { id: "staff_ravi", name: "Ravi" };

function pausing(diaryIds: string[]) {
    return {
        organizationId: "org_1",
        since: new Date(),
        memberIds: new Set<string>(),
        invitationIds: new Set<string>(),
        diaryIds: new Set(diaryIds),
        products: null,
        posts: null,
        storeIds: new Set<string>(),
        siteIds: new Set<string>(),
    };
}

function service(capacity = 1): Service {
    return {
        id: "svc_1",
        organizationId: "org_1",
        capacity,
        durationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        timezone: "Asia/Kolkata",
    } as unknown as Service;
}

const from = new Date("2026-11-02T00:00:00.000Z");
const to = new Date("2026-11-03T00:00:00.000Z");
const at = new Date("2026-11-02T05:00:00.000Z");

beforeEach(() => {
    jest.clearAllMocks();
    pausedNow.mockResolvedValue(null);
    serviceStaff.mockResolvedValue([ASHA, RAVI]);
    loadPeople.mockResolvedValue([]);
});

describe("splitPaused and nobodyTaking (pure)", () => {
    it("keeps everyone when nobody is paused", () => {
        expect(splitPaused([ASHA, RAVI], new Set())).toEqual({
            taking: [ASHA, RAVI],
            paused: [],
        });
    });

    it("takes the paused out, in order", () => {
        expect(splitPaused([ASHA, RAVI], new Set([RAVI.id]))).toEqual({
            taking: [ASHA],
            paused: [RAVI],
        });
    });

    it("says nobody takes a service only when it has people and all are paused", () => {
        expect(nobodyTaking({ people: [], paused: [ASHA] })).toBe(true);
        expect(nobodyTaking({ people: [ASHA], paused: [RAVI] })).toBe(false);
        // A service nobody takes at all is not "paused": it books on its
        // own hours, as before.
        expect(nobodyTaking({ people: [] })).toBe(false);
        expect(nobodyTaking({ people: [], paused: [] })).toBe(false);
    });
});

describe("pausedDiaryIds", () => {
    it("is empty when nothing is paused (enforcement off, under the limit)", async () => {
        expect([...(await pausedDiaryIds("org_1"))]).toEqual([]);
    });

    it("is the diary people the plan paused", async () => {
        pausedNow.mockResolvedValue(pausing([RAVI.id]));
        expect([...(await pausedDiaryIds("org_1"))]).toEqual([RAVI.id]);
    });
});

describe("loadStaffing", () => {
    it("leaves a paused person out of who takes it, and names them as paused", async () => {
        pausedNow.mockResolvedValue(pausing([RAVI.id]));
        const s = await loadStaffing(service());
        expect(s.people).toEqual([ASHA]);
        expect(s.paused).toEqual([RAVI]);
        expect(s.perPerson).toBe(true);
    });

    it("keeps a one-to-one whose people are all paused per person, offering nobody", async () => {
        pausedNow.mockResolvedValue(pausing([ASHA.id, RAVI.id]));
        const s = await loadStaffing(service());
        expect(s.people).toEqual([]);
        expect(s.perPerson).toBe(true);
        expect(nobodyTaking(s)).toBe(true);
    });

    it("is unchanged when nothing is paused", async () => {
        const s = await loadStaffing(service());
        expect(s.people).toEqual([ASHA, RAVI]);
        expect(s.paused).toBeUndefined();
    });
});

describe("openSlots — the slot engine", () => {
    it("asks only the people still taking bookings for their hours", async () => {
        pausedNow.mockResolvedValue(pausing([RAVI.id]));
        await openSlots(service(), [], from, to);
        expect(loadPeople).toHaveBeenCalledTimes(1);
        expect(loadPeople.mock.calls[0][2]).toEqual([ASHA.id]);
    });

    it("offers no time with a paused person asked for by name", async () => {
        pausedNow.mockResolvedValue(pausing([RAVI.id]));
        await expect(
            openSlots(service(), [], from, to, RAVI.id),
        ).resolves.toEqual([]);
        expect(loadPeople).not.toHaveBeenCalled();
    });

    it("offers nothing when everyone who takes it is paused, a class too", async () => {
        pausedNow.mockResolvedValue(pausing([ASHA.id, RAVI.id]));
        await expect(openSlots(service(), [], from, to)).resolves.toEqual([]);
        await expect(openSlots(service(8), [], from, to)).resolves.toEqual([]);
    });
});

describe("resolvePerson — booking by hand and online", () => {
    const staffing = {
        people: [ASHA],
        paused: [RAVI],
        perPerson: true,
        zone: "Asia/Kolkata",
    };

    it("refuses the team booking a paused person, saying who and why", async () => {
        const err = await resolvePerson(
            service(),
            [],
            staffing,
            at,
            RAVI.id,
            "team",
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse() as {
            message: string;
            details: { code: string; kind: string; field: string };
        };
        expect(body.details).toEqual({
            code: PAUSED_BY_PLAN,
            kind: "person",
            field: "staffId",
        });
        expect(body.message).toBe(
            "Ravi is paused. Your plan includes fewer team members than you have, so the people who joined most recently take no new bookings. Bookings already made are kept. Choose a plan in Plan and billing to bring them back.",
        );
    });

    it("tells a customer only that the person isn't taking bookings, never the plan", async () => {
        const err = await resolvePerson(
            service(),
            [],
            staffing,
            at,
            RAVI.id,
            "public",
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        const body = (err as BadRequestException).getResponse() as {
            message: string;
        };
        expect(body.message).toBe(
            "That person isn't taking bookings right now. Pick someone else.",
        );
        expect(body.message).not.toMatch(/plan/i);
    });

    it("refuses a service everyone who takes it is paused for", async () => {
        const all = { ...staffing, people: [], paused: [ASHA, RAVI] };
        const team = await resolvePerson(
            service(),
            [],
            all,
            at,
            undefined,
            "team",
        ).catch((e: unknown) => e);
        expect((team as ConflictException).message).toContain(
            "Asha and Ravi are paused.",
        );
        const pub = await resolvePerson(
            service(),
            [],
            all,
            at,
            undefined,
            "public",
        ).catch((e: unknown) => e);
        expect((pub as BadRequestException).getResponse()).toMatchObject({
            message: "This service isn't taking bookings right now.",
        });
    });
});
