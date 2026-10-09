// The diary's people read marks someone on the diary with no login who is
// past the plan's team limit (#800), so the calendar offers no new booking
// with them; everyone else reads as before. What is paused is mocked.
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: { staffMember: { findMany: jest.fn() } },
}));

const pausedNow = jest.fn();
jest.mock("../billing/over-limit.service", () => ({
    overLimit: { pausedNow: (...a: unknown[]) => pausedNow(...a) },
}));
jest.mock("../bookings/own-diary", () => ({
    ownDiaryOf: () => Promise.resolve(null),
}));
jest.mock("../bookings/staff-availability", () => ({
    ...jest.requireActual("../bookings/staff-availability"),
    businessTimezone: () => Promise.resolve("Asia/Kolkata"),
}));
jest.mock("./closures.service", () => ({
    closureViews: () => Promise.resolve([]),
}));
jest.mock("../bookings/opening-hours", () => ({
    loadOpeningHours: () => Promise.resolve(null),
}));

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { StaffService } from "./staff.service";

const findMany = prisma.staffMember.findMany as jest.Mock;

const row = (id: string, name: string) => ({
    id,
    organizationId: "org_1",
    name,
    title: null,
    status: "ACTIVE",
    membershipId: null,
    membership: null,
    services: [],
    hours: [],
    extraHours: [],
    timeOff: [],
});

const CTX: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};

describe("StaffService.list — a diary person the plan paused (#800)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        findMany.mockResolvedValue([
            row("staff_asha", "Asha"),
            row("staff_ravi", "Ravi"),
        ]);
    });

    it("marks only the paused person", async () => {
        pausedNow.mockResolvedValue({
            diaryIds: new Set(["staff_ravi"]),
            memberIds: new Set(),
            invitationIds: new Set(),
            siteIds: new Set(),
            storeIds: new Set(),
            products: null,
            posts: null,
        });
        const { staff } = await new StaffService().list(CTX);
        expect(staff.find((s) => s.id === "staff_ravi")?.paused).toBe(true);
        expect(staff.find((s) => s.id === "staff_asha")).not.toHaveProperty(
            "paused",
        );
    });

    it("marks nobody when nothing is paused", async () => {
        pausedNow.mockResolvedValue(null);
        const { staff } = await new StaffService().list(CTX);
        expect(staff.some((s) => "paused" in s)).toBe(false);
    });
});
