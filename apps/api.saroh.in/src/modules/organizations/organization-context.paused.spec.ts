import { ForbiddenException } from "@nestjs/common";

/**
 * A team member past the plan's limit after a move to a lower plan (#800)
 * can't open the business; everyone else can, and a move back up lets them
 * in again. What is paused is the core's (`over-limit.service.ts`), mocked
 * here: this spec is about the door.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        organizationRole: {
            findUnique: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
        },
        membership: { findUnique: jest.fn(), findMany: jest.fn() },
        organization: { findUnique: jest.fn() },
    },
}));

const pausedNow = jest.fn();
jest.mock("../billing/over-limit.service", () => ({
    overLimit: { pausedNow: (...a: unknown[]) => pausedNow(...a) },
}));

import { prisma } from "@saroh/database";

import { MEMBER_PAUSED } from "../billing/paused-errors";
import { OrganizationContextService } from "./organization-context.service";

const membershipFindUnique = prisma.membership.findUnique as jest.Mock;
const membershipFindMany = prisma.membership.findMany as jest.Mock;
const organizationFindUnique = prisma.organization.findUnique as jest.Mock;

function pausing(memberIds: string[]) {
    return {
        organizationId: "org_1",
        since: new Date(),
        memberIds: new Set(memberIds),
        invitationIds: new Set<string>(),
        diaryIds: new Set<string>(),
        products: null,
        posts: null,
        storeIds: new Set<string>(),
        siteIds: new Set<string>(),
    };
}

describe("OrganizationContextService.resolve — a paused team member (#800)", () => {
    const service = new OrganizationContextService();

    beforeEach(() => {
        jest.clearAllMocks();
        organizationFindUnique.mockResolvedValue({ name: "Rye Bakery" });
    });

    it("refuses a paused member with MEMBER_PAUSED and words that say why", async () => {
        membershipFindUnique.mockResolvedValue({
            organization: { lifecycleStatus: "ACTIVE" },
            id: "mem_late",
            role: "MEMBER",
            extraActions: [],
        });
        pausedNow.mockResolvedValue(pausing(["mem_late"]));

        const err = await service
            .resolve("user_late", "org_1")
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ForbiddenException);
        const body = (err as ForbiddenException).getResponse() as {
            message: string;
            details: { code: string };
        };
        expect(body.details.code).toBe(MEMBER_PAUSED);
        expect(body.message).toBe(
            "Your access to Rye Bakery is paused. Its plan includes fewer team members than it has, so the people who joined most recently are paused until it moves up again. Nothing of yours is lost. Ask the owner to choose a plan in Plan and billing.",
        );
    });

    it("lets a member who is kept in", async () => {
        membershipFindUnique.mockResolvedValue({
            organization: { lifecycleStatus: "ACTIVE" },
            id: "mem_early",
            role: "ADMIN",
            extraActions: [],
        });
        pausedNow.mockResolvedValue(pausing(["mem_late"]));

        const ctx = await service.resolve("user_early", "org_1");
        expect(ctx.role).toBe("ADMIN");
    });

    it("never asks for the owner", async () => {
        membershipFindUnique.mockResolvedValue({
            organization: { lifecycleStatus: "ACTIVE" },
            id: "mem_owner",
            role: "OWNER",
            extraActions: [],
        });
        pausedNow.mockResolvedValue(pausing(["mem_owner"]));

        const ctx = await service.resolve("user_owner", "org_1");
        expect(ctx.role).toBe("OWNER");
        expect(pausedNow).not.toHaveBeenCalled();
    });

    it("refuses nothing when nothing is paused (enforcement off, or the plan unread)", async () => {
        membershipFindUnique.mockResolvedValue({
            organization: { lifecycleStatus: "ACTIVE" },
            id: "mem_late",
            role: "MEMBER",
            extraActions: [],
        });
        pausedNow.mockResolvedValue(null);

        await expect(service.resolve("user_late", "org_1")).resolves.toEqual(
            expect.objectContaining({ organizationId: "org_1" }),
        );
    });

    it("lets them in again once the business moves back up", async () => {
        membershipFindUnique.mockResolvedValue({
            organization: { lifecycleStatus: "ACTIVE" },
            id: "mem_late",
            role: "MEMBER",
            extraActions: [],
        });
        pausedNow.mockResolvedValueOnce(pausing(["mem_late"]));
        await expect(service.resolve("user_late", "org_1")).rejects.toThrow(
            ForbiddenException,
        );

        // Derived, never stored: the plan reads higher, nothing is paused.
        pausedNow.mockResolvedValueOnce(pausing([]));
        await expect(service.resolve("user_late", "org_1")).resolves.toEqual(
            expect.objectContaining({ role: "MEMBER" }),
        );
    });

    it("leaves a stranger's refusal as it was", async () => {
        membershipFindUnique.mockResolvedValue(null);
        organizationFindUnique.mockResolvedValue({ id: "org_1" });
        await expect(service.resolve("user_x", "org_1")).rejects.toThrow(
            "You are not a member of this organization",
        );
        expect(pausedNow).not.toHaveBeenCalled();
    });
});

describe("OrganizationContextService.listForUser — the chooser's Paused (#800)", () => {
    const service = new OrganizationContextService();

    beforeEach(() => jest.clearAllMocks());

    it("marks a paused membership, and only that one", async () => {
        const org = (id: string) => ({
            id,
            name: id,
            slug: id,
            lifecycleStatus: "ACTIVE",
            kind: "BUSINESS",
            businessProfile: null,
        });
        membershipFindMany.mockResolvedValue([
            {
                id: "m_own",
                role: "OWNER",
                extraActions: [],
                organization: org("a"),
            },
            {
                id: "m_late",
                role: "MEMBER",
                extraActions: [],
                organization: org("b"),
            },
            {
                id: "m_kept",
                role: "MEMBER",
                extraActions: [],
                organization: org("c"),
            },
        ]);
        pausedNow.mockImplementation(async (orgId: string) =>
            orgId === "b"
                ? pausing(["m_late"])
                : orgId === "c"
                  ? null
                  : pausing([]),
        );

        const list = await service.listForUser("user_1");
        expect(list.map((o) => [o.id, o.paused])).toEqual([
            ["a", false],
            ["b", true],
            ["c", false],
        ]);
        // The owner's business is never asked.
        expect(pausedNow).not.toHaveBeenCalledWith("a");
    });
});
