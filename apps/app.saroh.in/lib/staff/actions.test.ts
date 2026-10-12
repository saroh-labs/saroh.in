/**
 * The two ways onto the diary start with a filled week: "It's just me" and
 * a new person both get the business's opening hours as their weekly
 * hours, or the Hours sheet's default week when none are saved.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { staff, listServices } = vi.hoisted(() => ({
    staff: {
        readOpeningHours: vi.fn(),
        createStaff: vi.fn(),
        addSelf: vi.fn(),
        readOffered: vi.fn(),
    },
    listServices: vi.fn(),
}));
vi.mock("./service", () => staff);
vi.mock("@/lib/services/service", () => ({ listServices }));

import { addMyself, addPerson, readOffered } from "./actions";
import { defaultWeek } from "./starting-week";

const OPEN = [1, 2, 3].map((dayOfWeek) => ({
    dayOfWeek,
    startMinute: 600,
    endMinute: 1140,
}));
const service = (id: string, status = "ACTIVE") => ({ id, status });

beforeEach(() => {
    for (const m of [...Object.values(staff), listServices]) m.mockReset();
    staff.addSelf.mockResolvedValue({ ok: true, data: { id: "st_me" } });
    staff.createStaff.mockResolvedValue({ ok: true, data: { id: "st_1" } });
    listServices.mockResolvedValue([]);
});

describe("It's just me", () => {
    it("starts them with the opening hours, on every service taking bookings", async () => {
        staff.readOpeningHours.mockResolvedValue(OPEN);
        listServices.mockResolvedValue([
            service("svc_cut"),
            service("svc_old", "ARCHIVED"),
            service("svc_colour"),
        ]);
        const res = await addMyself();
        expect(staff.addSelf).toHaveBeenCalledWith({
            hours: OPEN,
            serviceIds: ["svc_cut", "svc_colour"],
        });
        expect(res).toEqual({
            ok: true,
            data: { staff: { id: "st_me" }, week: "opening" },
        });
    });

    it("starts them with the default week when no opening hours are saved", async () => {
        staff.readOpeningHours.mockResolvedValue(null);
        const res = await addMyself();
        expect(staff.addSelf).toHaveBeenCalledWith({
            hours: defaultWeek(),
            serviceIds: [],
        });
        expect(res.ok && res.data.week).toBe("default");
    });

    it("still adds them, on the default week, when the hours couldn't be read", async () => {
        staff.readOpeningHours.mockResolvedValue(undefined);
        listServices.mockRejectedValue(new Error("down"));
        const res = await addMyself();
        expect(staff.addSelf).toHaveBeenCalledWith({
            hours: defaultWeek(),
            serviceIds: [],
        });
        expect(res.ok && res.data.week).toBe("default");
    });

    it("passes a refusal on as it was said", async () => {
        staff.readOpeningHours.mockResolvedValue(OPEN);
        staff.addSelf.mockResolvedValue({ ok: false, error: "No." });
        await expect(addMyself()).resolves.toEqual({ ok: false, error: "No." });
    });
});

describe("a new person", () => {
    it("starts with the opening hours as their weekly hours", async () => {
        staff.readOpeningHours.mockResolvedValue(OPEN);
        await addPerson({ name: "Asha", title: "Trainer" });
        expect(staff.createStaff).toHaveBeenCalledWith({
            name: "Asha",
            title: "Trainer",
            hours: OPEN,
        });
    });

    it("starts with the default week when the business has none", async () => {
        staff.readOpeningHours.mockResolvedValue(null);
        await addPerson({ name: "Asha" });
        expect(staff.createStaff).toHaveBeenCalledWith({
            name: "Asha",
            hours: defaultWeek(),
        });
        const [{ hours }] = staff.createStaff.mock.calls[0] as [
            { hours: unknown[] },
        ];
        expect(hours.length).toBeGreaterThan(0);
    });
});

describe("the preview's read", () => {
    it("asks the booking page's read for one service and person", async () => {
        staff.readOffered.mockResolvedValue({ ok: false, why: "off" });
        await expect(readOffered("svc_1", "st_1")).resolves.toEqual({
            ok: false,
            why: "off",
        });
        expect(staff.readOffered).toHaveBeenCalledWith("svc_1", "st_1");
    });
});
