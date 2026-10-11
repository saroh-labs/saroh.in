/**
 * Leaving a business (UX audit, 10 Oct 2026), against a real Postgres and
 * the context the guard would really resolve.
 *
 * `remove` asks `member:remove`, so only an Owner or Admin could take
 * anyone off the team, themselves included: a Member, a Reviewer, a
 * location's person and a diary person with a login had no way out. Here
 * each of them leaves through `leave`, with the context `OrganizationGuard`
 * builds for them, and the rows are read back: their membership in THIS
 * business is gone with their location roles in it, and nothing of theirs
 * in another business, or of anyone else's in this one, is touched. The
 * last Owner is refused, and stays.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        SITE_ACCOUNT_AREA: "off",
    },
}));
jest.mock("../../common/email", () => ({
    sendOrganizationInvitationEmail: jest.fn().mockResolvedValue(undefined),
}));

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { OrganizationContextService } from "./organization-context.service";
import {
    LAST_OWNER_CANT_LEAVE,
    OrganizationMembersService,
} from "./organization-members.service";

const tag = `${process.pid}-${Date.now()}`;
const audit = { record: jest.fn() } as unknown as AuditService;
const members = new OrganizationMembersService(audit);
const contexts = new OrganizationContextService();

/** A role the business made that holds almost nothing. */
const DESK_ONLY = "leave-desk-only";

let orgId = "";
let otherOrgId = "";
let storeId = "";
let otherStoreId = "";
const users: Record<string, string> = {};

const person = async (key: string) => {
    users[key] = (
        await prisma.user.create({
            data: { email: `leave-${key}-${tag}@example.com` },
        })
    ).id;
    return users[key];
};

const join = (organizationId: string, key: string, role: string) =>
    prisma.membership.create({
        data: { organizationId, userId: users[key]!, role },
    });

const membershipOf = (organizationId: string, key: string) =>
    prisma.membership.findUnique({
        where: {
            organizationId_userId: { organizationId, userId: users[key]! },
        },
    });

/** The context the guard resolves for this person in the business. */
const as = (key: string): Promise<OrganizationContext> =>
    contexts.resolve(users[key]!, orgId);

beforeAll(async () => {
    for (const key of [
        "owner",
        "second",
        "admin",
        "member",
        "reviewer",
        "desk",
        "counter",
        "bystander",
    ]) {
        await person(key);
    }
    orgId = (
        await prisma.organization.create({
            data: { name: "Hill Road Clinic", slug: `leave-${tag}` },
        })
    ).id;
    otherOrgId = (
        await prisma.organization.create({
            data: { name: "Rye Bakery", slug: `leave-other-${tag}` },
        })
    ).id;
    await prisma.organizationRole.create({
        data: {
            organizationId: orgId,
            key: DESK_ONLY,
            label: "Desk only",
            actions: ["org:read", "booking:read"],
        },
    });
    await join(orgId, "owner", "OWNER");
    await join(orgId, "admin", "ADMIN");
    await join(orgId, "member", "MEMBER");
    await join(orgId, "reviewer", "REVIEWER");
    await join(orgId, "desk", DESK_ONLY);
    await join(orgId, "counter", "MEMBER");
    await join(orgId, "bystander", "MEMBER");
    // The same people elsewhere: leaving here must not reach there.
    await join(otherOrgId, "member", "MEMBER");
    await join(otherOrgId, "counter", "MEMBER");

    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road counter",
                slug: `leave-store-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    otherStoreId = (
        await prisma.store.create({
            data: {
                name: "Rye counter",
                slug: `leave-other-store-${tag}`,
                organizationId: otherOrgId,
            },
        })
    ).id;
    await prisma.storeMembers.create({
        data: { storeId, userId: users.counter!, role: "MANAGER" },
    });
    await prisma.storeMembers.create({
        data: { storeId: otherStoreId, userId: users.counter!, role: "EDITOR" },
    });
    await prisma.storeMembers.create({
        data: { storeId, userId: users.bystander!, role: "VIEWER" },
    });
});

describe("leaving a business", () => {
    it("lets a Member go, who could never remove anyone", async () => {
        const me = await as("member");
        // The old way out, still refused: it is someone else's power.
        await expect(members.remove(me, users.member!)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(await membershipOf(orgId, "member")).not.toBeNull();

        await expect(members.leave(me)).resolves.toMatchObject({ left: true });

        expect(await membershipOf(orgId, "member")).toBeNull();
        // Their place in another business is theirs still.
        expect(await membershipOf(otherOrgId, "member")).not.toBeNull();
    });

    it("lets a Reviewer and a role that holds almost nothing go", async () => {
        for (const key of ["reviewer", "desk"]) {
            await expect(members.leave(await as(key))).resolves.toMatchObject({
                left: true,
            });
            expect(await membershipOf(orgId, key)).toBeNull();
        }
    });

    it("takes their location roles in this business, and only those", async () => {
        const result = await members.leave(await as("counter"));
        expect(result).toMatchObject({ left: true, storefrontRoles: 1 });

        expect(
            await prisma.storeMembers.count({
                where: { storeId, userId: users.counter! },
            }),
        ).toBe(0);
        // Another business's location, and another person's role here.
        expect(
            await prisma.storeMembers.count({
                where: { storeId: otherStoreId, userId: users.counter! },
            }),
        ).toBe(1);
        expect(
            await prisma.storeMembers.count({
                where: { storeId, userId: users.bystander! },
            }),
        ).toBe(1);
        expect(await membershipOf(otherOrgId, "counter")).not.toBeNull();
    });

    it("leaves everyone else on the team", async () => {
        for (const key of ["owner", "admin", "bystander"]) {
            expect(await membershipOf(orgId, key)).not.toBeNull();
        }
    });

    it("is no longer a member afterwards: the guard's own read refuses them", async () => {
        await expect(as("member")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses the only Owner, who stays", async () => {
        const refused = members.leave(await as("owner"));
        await expect(refused).rejects.toBeInstanceOf(BadRequestException);
        await expect(members.leave(await as("owner"))).rejects.toThrow(
            LAST_OWNER_CANT_LEAVE,
        );
        expect(await membershipOf(orgId, "owner")).toMatchObject({
            role: "OWNER",
        });
    });

    it("lets an Owner go once there is another, and then refuses the last one", async () => {
        await join(orgId, "second", "OWNER");

        await expect(members.leave(await as("owner"))).resolves.toMatchObject({
            left: true,
        });
        expect(await membershipOf(orgId, "owner")).toBeNull();

        await expect(members.leave(await as("second"))).rejects.toThrow(
            LAST_OWNER_CANT_LEAVE,
        );
        expect(await membershipOf(orgId, "second")).toMatchObject({
            role: "OWNER",
        });
    });

    it("lets an Admin go while the business keeps its Owner", async () => {
        await expect(members.leave(await as("admin"))).resolves.toMatchObject({
            left: true,
        });
        expect(await membershipOf(orgId, "admin")).toBeNull();
        expect(
            await prisma.membership.count({
                where: { organizationId: orgId, role: "OWNER" },
            }),
        ).toBe(1);
    });
});
