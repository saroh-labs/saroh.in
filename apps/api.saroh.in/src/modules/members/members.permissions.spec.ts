/**
 * A storefront's team is managed with the business's permissions (audit
 * 2026-11-12 #4): `member:read`, `member:role:update`, `member:remove` and
 * `member:invite`, from the caller's resolved set in the store's business.
 * A `StoreOwner` row is neither needed nor enough. Prisma and the
 * organization context are doubles.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        store: { findUnique: jest.fn() },
        storeOwner: { findMany: jest.fn(), findUnique: jest.fn() },
        storeMembers: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        storeInvitation: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
    },
}));

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { OrgAction } from "../organizations/organization-actions";
import type { OrganizationContextService } from "../organizations/organization-context.service";
import { roleDenial } from "../organizations/organization-policy";
import { MembersService } from "./members.service";

const STORE = "store_1";
const ORG = "org_1";
const CALLER = "user_caller";
const TARGET = "user_target";

const storeFind = prisma.store.findUnique as jest.Mock;
const memberFind = prisma.storeMembers.findUnique as jest.Mock;
const memberUpdate = prisma.storeMembers.update as jest.Mock;
const memberDelete = prisma.storeMembers.delete as jest.Mock;
const ownerFind = prisma.storeOwner.findUnique as jest.Mock;

function members(ctx: OrganizationContext | null) {
    const contexts = {
        resolve: jest.fn(() =>
            ctx ? Promise.resolve(ctx) : Promise.reject(new Error("no")),
        ),
    } as unknown as OrganizationContextService;
    return new MembersService(contexts);
}

const ctx = (
    role: OrganizationContext["role"],
    actions: OrgAction[],
): OrganizationContext => ({
    organizationId: ORG,
    userId: CALLER,
    role,
    actions: new Set(actions),
});

beforeEach(() => {
    jest.clearAllMocks();
    storeFind.mockResolvedValue({ organizationId: ORG });
    memberFind.mockResolvedValue({ id: "sm_1", role: "VIEWER" });
    (prisma.storeOwner.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.storeMembers.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.storeInvitation.findMany as jest.Mock).mockResolvedValue([]);
});

describe("storefront team management follows business permissions", () => {
    it("refuses the storefront's maker once the business moved them to Member", async () => {
        // They still have a StoreOwner row: it is no longer enough.
        ownerFind.mockResolvedValue({ id: "so_1" });
        const service = members(
            ctx("MEMBER", ["org:read", "member:read", "store:read"]),
        );
        await expect(
            service.updateMemberRole(STORE, CALLER, TARGET, "EDITOR"),
        ).rejects.toMatchObject({
            response: roleDenial("member:role:update"),
        });
        await expect(
            service.removeMember(STORE, CALLER, TARGET),
        ).rejects.toMatchObject({ response: roleDenial("member:remove") });
        await expect(
            service.listInvitations(STORE, CALLER),
        ).rejects.toMatchObject({ response: roleDenial("member:invite") });
        await expect(
            service.revokeInvitation(STORE, CALLER, "inv_1"),
        ).rejects.toMatchObject({ response: roleDenial("member:invite") });
        expect(memberUpdate).not.toHaveBeenCalled();
        expect(memberDelete).not.toHaveBeenCalled();
    });

    it("lets an Admin with no StoreOwner row manage the team", async () => {
        ownerFind.mockResolvedValue(null);
        const service = members(
            ctx("ADMIN", [
                "store:read",
                "member:read",
                "member:role:update",
                "member:remove",
                "member:invite",
            ]),
        );
        await expect(
            service.updateMemberRole(STORE, CALLER, TARGET, "EDITOR"),
        ).resolves.toEqual({ userId: TARGET, role: "EDITOR" });
        await expect(
            service.removeMember(STORE, CALLER, TARGET),
        ).resolves.toEqual({ userId: TARGET });
        await expect(service.listInvitations(STORE, CALLER)).resolves.toEqual(
            [],
        );
        await expect(service.listMembers(STORE, CALLER)).resolves.toEqual([]);
    });

    it("a role the business made with the member powers manages it too", async () => {
        const service = members(
            ctx("MEMBER", ["store:read", "member:role:update"]),
        );
        await expect(
            service.updateMemberRole(STORE, CALLER, TARGET, "VIEWER"),
        ).resolves.toEqual({ userId: TARGET, role: "VIEWER" });
    });

    it("lists the team to member:read, and refuses without it", async () => {
        await expect(
            members(ctx("MEMBER", ["store:read", "member:read"])).listMembers(
                STORE,
                CALLER,
            ),
        ).resolves.toEqual([]);
        await expect(
            members(ctx("MEMBER", ["store:read"])).listMembers(STORE, CALLER),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("a stranger to the business learns nothing: 404, not 403", async () => {
        ownerFind.mockResolvedValue({ id: "so_1" });
        const service = members(null);
        for (const call of [
            () => service.listMembers(STORE, CALLER),
            () => service.updateMemberRole(STORE, CALLER, TARGET, "VIEWER"),
            () => service.removeMember(STORE, CALLER, TARGET),
            () => service.listInvitations(STORE, CALLER),
            () => service.revokeInvitation(STORE, CALLER, "inv_1"),
            () =>
                service.createInvitation(
                    STORE,
                    CALLER,
                    "x@example.com",
                    "VIEWER",
                ),
        ]) {
            await expect(call()).rejects.toBeInstanceOf(NotFoundException);
        }
    });

    it("someone on the team who can't see storefronts gets 404 too", async () => {
        await expect(
            members(ctx("MEMBER", ["booking:read"])).listMembers(STORE, CALLER),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
