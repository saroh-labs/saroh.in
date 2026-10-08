// #868 (owner decision 2026-10-08): someone on the diary who takes bookings
// with no login, given one, joins as Calendar only by default — and is
// counted as one seat throughout.
jest.mock("@saroh/database", () => ({
    prisma: {
        membership: {
            findFirst: jest.fn(),
            upsert: jest.fn(),
        },
        organizationInvitation: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            upsert: jest.fn(),
            update: jest.fn(),
        },
        siteReviewer: { upsert: jest.fn() },
        site: { findMany: jest.fn() },
        organization: { findUnique: jest.fn() },
        organizationRole: { findUnique: jest.fn(), findMany: jest.fn() },
        staffMember: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            updateMany: jest.fn(),
        },
        $transaction: jest.fn(),
    },
    ensureCalendarOnlyRole: jest.fn(),
}));
jest.mock("../notifications/team-alerts", () => ({
    enqueueTeamAlert: jest.fn(),
}));
jest.mock("../../common/email", () => ({
    sendOrganizationInvitationEmail: jest.fn().mockResolvedValue(undefined),
}));

import { BadRequestException, ConflictException } from "@nestjs/common";
import { ensureCalendarOnlyRole, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { planMeter } from "../billing/metering.service";
import { CALENDAR_ONLY_ACTIONS } from "./calendar-only-role";
import { OrganizationMembersService } from "./organization-members.service";

const db = prisma as unknown as Record<string, Record<string, jest.Mock>> & {
    $transaction: jest.Mock;
};
const ensureRole = ensureCalendarOnlyRole as unknown as jest.Mock;

const audit = { record: jest.fn() } as unknown as AuditService;
const service = new OrganizationMembersService(audit);

const owner: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_owner",
    role: "OWNER",
};

/** Priya takes bookings and has no login (DEC-105). */
const PRIYA = {
    id: "staff_priya",
    name: "Priya",
    status: "ACTIVE",
    membershipId: null,
};

beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(prisma),
    );
    db.organization!.findUnique!.mockResolvedValue({ name: "Hill Road Salon" });
    db.membership!.findFirst!.mockResolvedValue(null);
    db.staffMember!.findFirst!.mockResolvedValue(PRIYA);
    db.staffMember!.findUnique!.mockResolvedValue(null);
    db.staffMember!.updateMany!.mockResolvedValue({ count: 1 });
    db.organizationInvitation!.findFirst!.mockResolvedValue(null);
    db.organizationInvitation!.upsert!.mockImplementation(
        (args: { create: { role: string } }) => ({
            id: "inv_1",
            email: "priya@example.com",
            role: args.create.role,
            expiresAt: new Date("2026-10-15T00:00:00Z"),
        }),
    );
    db.organizationRole!.findUnique!.mockResolvedValue({
        key: "calendar-only",
        actions: [...CALENDAR_ONLY_ACTIONS],
    });
    db.organizationRole!.findMany!.mockResolvedValue([
        { key: "calendar-only", actions: [...CALENDAR_ONLY_ACTIONS] },
    ]);
    db.site!.findMany!.mockResolvedValue([]);
    db.membership!.upsert!.mockResolvedValue({ id: "m_priya" });
});

describe("inviting someone on the diary (#868)", () => {
    it("asks them in as Calendar only when no role is picked", async () => {
        await service.invite(owner, {
            email: "priya@example.com",
            staffId: "staff_priya",
        });
        const upsert = db.organizationInvitation!.upsert!.mock.calls[0][0];
        expect(upsert.create).toMatchObject({
            role: "calendar-only",
            staffId: "staff_priya",
        });
        // The role exists before it is checked or held.
        expect(ensureRole).toHaveBeenCalledWith(prisma, "org_1");
    });

    it("keeps the role the owner picked instead", async () => {
        await service.invite(owner, {
            email: "priya@example.com",
            role: "MEMBER",
            staffId: "staff_priya",
        });
        const upsert = db.organizationInvitation!.upsert!.mock.calls[0][0];
        expect(upsert.create).toMatchObject({
            role: "MEMBER",
            staffId: "staff_priya",
        });
        expect(ensureRole).not.toHaveBeenCalled();
    });

    it("still needs a role for someone not on the diary", async () => {
        await expect(
            service.invite(owner, { email: "new@example.com" }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("adds no seat: they hold one already, taking bookings (DEC-105)", async () => {
        const withRoom = jest.spyOn(planMeter, "withRoom");
        await service.invite(owner, {
            email: "priya@example.com",
            staffId: "staff_priya",
        });
        expect(withRoom.mock.calls[0][1]).toBe("members");
        const options = withRoom.mock.calls[0][3] as {
            addingIn: (tx: unknown) => Promise<number>;
        };
        expect(await options.addingIn({})).toBe(0);
        withRoom.mockRestore();
    });

    it("uses a seat whatever the role, since they take bookings", async () => {
        const withRoom = jest.spyOn(planMeter, "withRoom");
        await service
            .invite(owner, {
                email: "priya@example.com",
                role: "REVIEWER",
                staffId: "staff_priya",
                siteIds: [],
            })
            .catch(() => undefined);
        // A Reviewer with no sites is refused before the meter; the kind
        // asked for a diary person is a seat all the same.
        db.site!.findMany!.mockResolvedValue([{ id: "site_1" }]);
        await service.invite(owner, {
            email: "priya@example.com",
            role: "REVIEWER",
            staffId: "staff_priya",
            siteIds: ["site_1"],
        });
        expect(withRoom.mock.calls.at(-1)?.[1]).toBe("members");
        withRoom.mockRestore();
    });

    it("refuses someone with a login, someone not on the diary, and a second invite", async () => {
        db.staffMember!.findFirst!.mockResolvedValueOnce({
            ...PRIYA,
            membershipId: "m_1",
        });
        await expect(
            service.invite(owner, {
                email: "priya@example.com",
                staffId: "staff_priya",
            }),
        ).rejects.toThrow("Priya already has a login here.");

        db.staffMember!.findFirst!.mockResolvedValueOnce(null);
        await expect(
            service.invite(owner, {
                email: "priya@example.com",
                staffId: "staff_x",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);

        db.organizationInvitation!.findFirst!.mockResolvedValueOnce({
            email: "priya.old@example.com",
        });
        await expect(
            service.invite(owner, {
                email: "priya@example.com",
                staffId: "staff_priya",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("lists the invite as that person, on a seat, counted on the diary", async () => {
        db.organizationInvitation!.findMany!.mockResolvedValue([
            {
                id: "inv_1",
                email: "priya@example.com",
                role: "calendar-only",
                siteIds: [],
                status: "PENDING",
                expiresAt: new Date("2026-10-15T00:00:00Z"),
                createdAt: new Date("2026-10-08T00:00:00Z"),
                staffMember: PRIYA,
            },
        ]);
        const [invite] = await service.listInvitations(owner);
        expect(invite).toMatchObject({
            roleKey: "calendar-only",
            usesSeat: true,
            countedOnDiary: true,
            staff: { id: "staff_priya", name: "Priya" },
        });
        expect(invite).not.toHaveProperty("staffMember");
    });
});

describe("accepting a diary person's invite (#868)", () => {
    const pending = {
        id: "inv_1",
        organizationId: "org_1",
        email: "priya@example.com",
        role: "calendar-only",
        siteIds: [],
        status: "PENDING",
        expiresAt: new Date(Date.now() + 60_000),
        staffId: "staff_priya",
        organization: { name: "Hill Road Salon", slug: "hill-road" },
    };
    const priya = { id: "user_priya", email: "priya@example.com" };

    it("joins as Calendar only and links their diary to the login", async () => {
        db.organizationInvitation!.findUnique!.mockResolvedValue(pending);
        const res = await service.accept(priya, "a-token");

        expect(res.roleKey).toBe("calendar-only");
        expect(ensureRole).toHaveBeenCalledWith(prisma, "org_1");
        expect(db.membership!.upsert!.mock.calls[0][0].create).toMatchObject({
            role: "calendar-only",
        });
        expect(db.staffMember!.updateMany).toHaveBeenCalledWith({
            where: {
                id: "staff_priya",
                organizationId: "org_1",
                membershipId: null,
            },
            data: { membershipId: "m_priya" },
        });
    });

    it("is Calendar only even where the role row has gone, never the floor", async () => {
        db.organizationInvitation!.findUnique!.mockResolvedValue(pending);
        db.organizationRole!.findUnique!.mockResolvedValue(null);
        const res = await service.accept(priya, "a-token");
        expect(res.roleKey).toBe("calendar-only");
    });

    it("joins without a link when their login is on the diary as someone else", async () => {
        db.organizationInvitation!.findUnique!.mockResolvedValue(pending);
        db.staffMember!.findUnique!.mockResolvedValue({ id: "staff_other" });
        await service.accept(priya, "a-token");
        expect(db.staffMember!.updateMany).not.toHaveBeenCalled();
    });
});
