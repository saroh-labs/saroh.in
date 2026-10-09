/**
 * An invitation past the plan's limit after a move to a lower plan (#800)
 * waits: accepting it is refused in words that say why and that nothing is
 * lost, and nothing is written. Once the business moves up it goes through.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        organizationInvitation: { findUnique: jest.fn(), update: jest.fn() },
        organizationRole: { findUnique: jest.fn().mockResolvedValue(null) },
        site: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(),
    },
    ensureCalendarOnlyRole: jest.fn(),
}));
jest.mock("../notifications/team-alerts", () => ({
    enqueueTeamAlert: jest.fn(),
}));
jest.mock("../../common/email", () => ({
    sendOrganizationInvitationEmail: jest.fn(),
}));

const pausedNow = jest.fn();
jest.mock("../billing/over-limit.service", () => ({
    overLimit: { pausedNow: (...a: unknown[]) => pausedNow(...a) },
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { AuditService } from "../audit/audit.service";
import { INVITATION_PAUSED } from "../billing/paused-errors";
import { OrganizationMembersService } from "./organization-members.service";

const db = prisma as unknown as {
    organizationInvitation: Record<string, jest.Mock>;
    $transaction: jest.Mock;
};

const service = new OrganizationMembersService({
    record: jest.fn(),
} as unknown as AuditService);

const pending = {
    id: "inv_late",
    organizationId: "org_1",
    email: "late@example.com",
    role: "MEMBER",
    siteIds: [],
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60_000),
    staffId: null,
    organization: { name: "Rye Bakery", slug: "rye" },
};
const invitee = { id: "user_late", email: "late@example.com" };

function pausing(invitationIds: string[]) {
    return {
        organizationId: "org_1",
        since: new Date(),
        memberIds: new Set<string>(),
        invitationIds: new Set(invitationIds),
        diaryIds: new Set<string>(),
        products: null,
        posts: null,
        storeIds: new Set<string>(),
        siteIds: new Set<string>(),
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    db.organizationInvitation.findUnique.mockResolvedValue(pending);
    // Stop at the write: these tests are about whether it is reached.
    db.$transaction.mockRejectedValue(new Error("reached the write"));
});

describe("accepting an invitation past the plan's limit (#800)", () => {
    it("is refused with INVITATION_PAUSED, and nothing is written", async () => {
        pausedNow.mockResolvedValue(pausing(["inv_late"]));

        const err = await service.accept(invitee, "t").catch((e) => e);

        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse() as {
            message: string;
            details: { code: string };
        };
        expect(body.details.code).toBe(INVITATION_PAUSED);
        expect(body.message).toBe(
            "Rye Bakery's plan has no room for you right now, so this invitation can't be accepted yet. You can accept it once the business moves up, while the invitation is still valid. Ask the owner to choose a plan in Plan and billing.",
        );
        expect(db.$transaction).not.toHaveBeenCalled();
        expect(db.organizationInvitation.update).not.toHaveBeenCalled();
    });

    it("goes through for an invitation within the limit", async () => {
        pausedNow.mockResolvedValue(pausing(["inv_other"]));
        await expect(service.accept(invitee, "t")).rejects.toThrow(
            "reached the write",
        );
    });

    it("goes through when nothing is paused (enforcement off)", async () => {
        pausedNow.mockResolvedValue(null);
        await expect(service.accept(invitee, "t")).rejects.toThrow(
            "reached the write",
        );
        expect(pausedNow).toHaveBeenCalledWith("org_1");
    });
});
