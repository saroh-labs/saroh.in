// #276: the roster rules — who may change it, what an invitation is worth,
// and the one invariant that keeps an organization ownable.
jest.mock("@saroh/database", () => ({
    prisma: {
        membership: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            count: jest.fn(),
            upsert: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            delete: jest.fn(),
        },
        organizationInvitation: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            upsert: jest.fn(),
            update: jest.fn(),
        },
        siteReviewer: {
            findMany: jest.fn(),
            deleteMany: jest.fn(),
            upsert: jest.fn(),
        },
        site: { findMany: jest.fn() },
        session: { groupBy: jest.fn() },
        sitePreviewLink: { updateMany: jest.fn() },
        storeMembers: { findMany: jest.fn(), deleteMany: jest.fn() },
        storeInvitation: { updateMany: jest.fn() },
        user: { findUnique: jest.fn() },
        organization: { findUnique: jest.fn() },
        organizationRole: { findUnique: jest.fn(), findMany: jest.fn() },
        $transaction: jest.fn(),
    },
}));

// The team's "Someone joins the team" alert (F14): only that it is queued.
jest.mock("../notifications/team-alerts", () => ({
    enqueueTeamAlert: jest.fn(),
}));
jest.mock("../../common/email", () => ({
    sendOrganizationInvitationEmail: jest.fn().mockResolvedValue(undefined),
}));

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendOrganizationInvitationEmail } from "../../common/email";
import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { planMeter } from "../billing/metering.service";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import { CAPABILITY_BY_ACTION } from "./capability-catalogue";
import { hashInviteToken } from "./invite-token";
import { OrganizationMembersService } from "./organization-members.service";
import { builtInActions, resolveCapabilities } from "./organization-policy";

const db = prisma as unknown as {
    membership: Record<string, jest.Mock>;
    organizationInvitation: Record<string, jest.Mock>;
    siteReviewer: Record<string, jest.Mock>;
    site: Record<string, jest.Mock>;
    session: Record<string, jest.Mock>;
    sitePreviewLink: Record<string, jest.Mock>;
    storeMembers: Record<string, jest.Mock>;
    storeInvitation: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    organization: Record<string, jest.Mock>;
    organizationRole: Record<string, jest.Mock>;
    $transaction: jest.Mock;
};

const audit = { record: jest.fn() } as unknown as AuditService;
const service = new OrganizationMembersService(audit);

const ctx = (role: OrgRole = "OWNER"): OrganizationContext => ({
    organizationId: "org_1",
    userId: "user_owner",
    role,
});

beforeEach(() => {
    jest.clearAllMocks();
    // The transaction runs against the same mocked client.
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        typeof fn === "function" ? fn(prisma) : Promise.resolve([]),
    );
    db.organization.findUnique.mockResolvedValue({ name: "Northwind Supply" });
    db.membership.findFirst.mockResolvedValue(null);
    db.organizationInvitation.upsert.mockResolvedValue({
        id: "inv_1",
        email: "reviewer@example.test",
        role: "REVIEWER",
        expiresAt: new Date("2026-09-19T00:00:00Z"),
    });
    db.site.findMany.mockResolvedValue([{ id: "site_1" }]);
    db.siteReviewer.upsert.mockResolvedValue({});
    db.siteReviewer.deleteMany.mockResolvedValue({ count: 0 });
    db.sitePreviewLink.updateMany.mockResolvedValue({ count: 0 });
    db.session.groupBy.mockResolvedValue([]);
    db.storeMembers.findMany.mockResolvedValue([]);
    db.storeMembers.deleteMany.mockResolvedValue({ count: 0 });
    db.storeInvitation.updateMany.mockResolvedValue({ count: 0 });
    db.user.findUnique.mockResolvedValue({ email: "leaver@example.test" });
    db.organizationRole.findMany.mockResolvedValue([]);
    db.membership.updateMany.mockResolvedValue({ count: 1 });
});

describe("who may touch the roster", () => {
    it("refuses a MEMBER and a REVIEWER the invite, role and remove paths", async () => {
        for (const role of ["MEMBER", "REVIEWER"] as const) {
            await expect(
                service.invite(ctx(role), {
                    email: "someone@example.test",
                    role: "MEMBER",
                }),
            ).rejects.toThrow(/may not perform/);
            await expect(
                service.updateRole(ctx(role), "user_2", { role: "ADMIN" }),
            ).rejects.toThrow(/may not perform/);
            await expect(service.remove(ctx(role), "user_2")).rejects.toThrow(
                /may not perform/,
            );
        }
    });

    it("hides the roster from a REVIEWER but shows it to a MEMBER", async () => {
        db.membership.findMany.mockResolvedValue([]);
        db.siteReviewer.findMany.mockResolvedValue([]);

        await expect(service.list(ctx("REVIEWER"))).rejects.toThrow(
            /may not perform/,
        );
        await expect(service.list(ctx("MEMBER"))).resolves.toEqual([]);
    });

    it("shows each person's storefront roles under them (DEC-048)", async () => {
        db.membership.findMany.mockResolvedValue([
            {
                userId: "user_2",
                role: "storefront-team",
                user: { name: "Ravi", email: "ravi@example.test" },
            },
            {
                userId: "user_owner",
                role: "OWNER",
                user: { name: "Priya", email: "priya@example.test" },
            },
        ]);
        db.siteReviewer.findMany.mockResolvedValue([]);
        db.storeMembers.findMany.mockResolvedValue([
            {
                userId: "user_2",
                role: "VIEWER",
                store: { id: "store_hill", name: "Hill Road" },
            },
            {
                userId: "user_2",
                role: "MANAGER",
                store: { id: "store_market", name: "Market" },
            },
        ]);

        const roster = await service.list(ctx("OWNER"));

        // This business's open storefronts only.
        expect(db.storeMembers.findMany.mock.calls[0][0].where).toEqual({
            store: { organizationId: "org_1", deletedAt: null },
        });
        expect(roster.map((m) => [m.userId, m.storefronts])).toEqual([
            [
                "user_2",
                [
                    {
                        storeId: "store_hill",
                        name: "Hill Road",
                        role: "VIEWER",
                    },
                    {
                        storeId: "store_market",
                        name: "Market",
                        role: "MANAGER",
                    },
                ],
            ],
            ["user_owner", []],
        ]);
    });

    it("keeps pending invitations to those who can send them", async () => {
        db.organizationInvitation.findMany.mockResolvedValue([]);

        await expect(service.listInvitations(ctx("MEMBER"))).rejects.toThrow(
            /may not perform/,
        );
        await expect(service.listInvitations(ctx("ADMIN"))).resolves.toEqual(
            [],
        );
    });
});

describe("when someone was last active", () => {
    it("reads every member's newest session in one grouped query", async () => {
        const seen = new Date("2026-09-24T10:00:00Z");
        db.membership.findMany.mockResolvedValue([
            {
                userId: "user_owner",
                role: "OWNER",
                user: { name: "Priya", email: "priya@example.test" },
            },
            {
                userId: "user_2",
                role: "MEMBER",
                user: { name: null, email: "new@example.test" },
            },
        ]);
        db.siteReviewer.findMany.mockResolvedValue([]);
        db.session.groupBy.mockResolvedValue([
            { userId: "user_owner", _max: { updatedAt: seen } },
        ]);

        const roster = await service.list(ctx("OWNER"));

        expect(db.session.groupBy).toHaveBeenCalledTimes(1);
        expect(db.session.groupBy).toHaveBeenCalledWith({
            by: ["userId"],
            where: {
                user: { memberships: { some: { organizationId: "org_1" } } },
            },
            _max: { updatedAt: true },
        });
        expect(roster.map((m) => [m.userId, m.lastActiveAt])).toEqual([
            ["user_owner", seen],
            // No session at all — never signed in, or every one expired.
            ["user_2", null],
        ]);
    });

    it("is for those who may remove people: a Member sees no one's", async () => {
        db.membership.findMany.mockResolvedValue([
            {
                userId: "user_owner",
                role: "OWNER",
                user: { name: "Priya", email: "priya@example.test" },
            },
        ]);
        db.siteReviewer.findMany.mockResolvedValue([]);
        db.session.groupBy.mockResolvedValue([
            {
                userId: "user_owner",
                _max: { updatedAt: new Date("2026-09-24T10:00:00Z") },
            },
        ]);

        const roster = await service.list(ctx("MEMBER"));

        expect(db.session.groupBy).not.toHaveBeenCalled();
        expect(roster.map((m) => m.lastActiveAt)).toEqual([null]);

        // An Admin may remove people, so is shown it.
        await service.list(ctx("ADMIN"));
        expect(db.session.groupBy).toHaveBeenCalledTimes(1);
    });
});

describe("inviting", () => {
    it("stores only a hash of the token and emails the link", async () => {
        await service.invite(ctx(), {
            email: "reviewer@example.test",
            role: "REVIEWER",
            siteIds: ["site_1"],
        });

        const [[to, url]] = (sendOrganizationInvitationEmail as jest.Mock).mock
            .calls;
        expect(to).toBe("reviewer@example.test");
        const token = url.split("/join/")[1];
        expect(token).toHaveLength(64);

        const written = db.organizationInvitation.upsert.mock.calls[0][0];
        expect(written.create.tokenHash).toBe(hashInviteToken(token));
        expect(written.create.tokenHash).not.toContain(token);
    });

    // Team → People's Resend is this: inviting an address that already has
    // an invitation. It must be a fresh link and a fresh week, with the old
    // link dead, not a second row.
    it("sending again refreshes the invitation's link and week in place", async () => {
        const before = Date.now();
        await service.invite(ctx(), {
            email: "reviewer@example.test",
            role: "REVIEWER",
            siteIds: ["site_1"],
        });

        const [[, url]] = (sendOrganizationInvitationEmail as jest.Mock).mock
            .calls;
        const token = url.split("/join/")[1];
        const written = db.organizationInvitation.upsert.mock.calls[0][0];
        expect(written.where).toEqual({
            organizationId_email: {
                organizationId: "org_1",
                email: "reviewer@example.test",
            },
        });
        expect(written.update).toMatchObject({
            tokenHash: hashInviteToken(token),
            status: "PENDING",
            acceptedAt: null,
        });
        const week = 7 * 24 * 60 * 60 * 1000;
        expect(written.update.expiresAt.getTime()).toBeGreaterThanOrEqual(
            before + week,
        );
    });

    it("never returns a token to the inviter or the roster screen", async () => {
        const invitation = await service.invite(ctx(), {
            email: "reviewer@example.test",
            role: "REVIEWER",
            siteIds: ["site_1"],
        });
        expect(JSON.stringify(invitation)).not.toMatch(/token/i);

        db.organizationInvitation.findMany.mockResolvedValue([
            {
                id: "inv_1",
                email: "reviewer@example.test",
                role: "REVIEWER",
                siteIds: ["site_1"],
                status: "PENDING",
                expiresAt: new Date(),
                createdAt: new Date(),
            },
        ]);
        const listed = await service.listInvitations(ctx());
        expect(JSON.stringify(listed)).not.toMatch(/token/i);
    });

    it("asks a reviewer invite which sites, and refuses sites to other roles", async () => {
        await expect(
            service.invite(ctx(), {
                email: "reviewer@example.test",
                role: "REVIEWER",
            }),
        ).rejects.toThrow(/at least one site/);

        await expect(
            service.invite(ctx(), {
                email: "admin@example.test",
                role: "ADMIN",
                siteIds: ["site_1"],
            }),
        ).rejects.toThrow(/Only a reviewer/);
    });

    it("refuses a site id from another organization", async () => {
        db.site.findMany.mockResolvedValue([]);

        await expect(
            service.invite(ctx(), {
                email: "reviewer@example.test",
                role: "REVIEWER",
                siteIds: ["site_from_another_org"],
            }),
        ).rejects.toThrow(/no longer exists/);
    });

    it("refuses someone who is already in the workspace", async () => {
        db.membership.findFirst.mockResolvedValue({ userId: "user_2" });

        await expect(
            service.invite(ctx(), {
                email: "already@example.test",
                role: "MEMBER",
            }),
        ).rejects.toThrow(/already in this workspace/);
    });

    it("records the role but never the invitee's address", async () => {
        await service.invite(ctx(), {
            email: "reviewer@example.test",
            role: "REVIEWER",
            siteIds: ["site_1"],
        });

        const event = (audit.record as jest.Mock).mock.calls[0][0];
        expect(event.metadata).toEqual({ role: "REVIEWER", siteCount: 1 });
        expect(JSON.stringify(event)).not.toContain("reviewer@example.test");
    });
});

describe("accepting", () => {
    const pending = {
        id: "inv_1",
        organizationId: "org_1",
        email: "reviewer@example.test",
        role: "REVIEWER",
        siteIds: ["site_1"],
        status: "PENDING",
        expiresAt: new Date(Date.now() + 60_000),
        organization: { name: "Northwind Supply", slug: "northwind" },
    };
    const invitee = { id: "user_new", email: "reviewer@example.test" };

    it("joins the org, grants the sites and spends the token", async () => {
        db.organizationInvitation.findUnique.mockResolvedValue(pending);

        const result = await service.accept(invitee, "a-token");

        expect(
            db.organizationInvitation.findUnique.mock.calls[0][0].where,
        ).toEqual({ tokenHash: hashInviteToken("a-token") });
        expect(db.membership.upsert.mock.calls[0][0].create).toMatchObject({
            organizationId: "org_1",
            userId: "user_new",
            role: "REVIEWER",
        });
        expect(db.siteReviewer.upsert.mock.calls[0][0].create).toMatchObject({
            siteId: "site_1",
            userId: "user_new",
        });
        const spent = db.organizationInvitation.update.mock.calls[0][0].data;
        expect(spent.status).toBe("ACCEPTED");
        expect(spent.tokenHash).toBe("accepted:inv_1");
        // Where to send them next: the site they were asked to look at.
        expect(result).toMatchObject({
            organizationId: "org_1",
            siteId: "site_1",
        });
        // The team hears of it, keyed to this invitation (F14).
        expect((enqueueTeamAlert as jest.Mock).mock.calls[0].slice(1)).toEqual([
            "org_1",
            { event: "team", userId: "user_new", invitationId: "inv_1" },
        ]);
    });

    it("refuses a token that was already spent, in the same words as an unknown one", async () => {
        db.organizationInvitation.findUnique.mockResolvedValue(null);
        const unknown = await service.accept(invitee, "nope").catch((e) => e);

        db.organizationInvitation.findUnique.mockResolvedValue({
            ...pending,
            status: "ACCEPTED",
        });
        const spent = await service.accept(invitee, "spent").catch((e) => e);

        expect(spent.message).toBe(unknown.message);
        expect(db.membership.upsert).not.toHaveBeenCalled();
        expect(enqueueTeamAlert).not.toHaveBeenCalled();
    });

    it("refuses an expired invitation and marks it so", async () => {
        db.organizationInvitation.findUnique.mockResolvedValue({
            ...pending,
            expiresAt: new Date(Date.now() - 60_000),
        });

        await expect(service.accept(invitee, "old")).rejects.toThrow(/expired/);
        expect(
            db.organizationInvitation.update.mock.calls[0][0].data.status,
        ).toBe("EXPIRED");
        expect(db.membership.upsert).not.toHaveBeenCalled();
    });

    it("refuses someone signed in as a different person", async () => {
        db.organizationInvitation.findUnique.mockResolvedValue(pending);

        await expect(
            service.accept(
                { id: "user_other", email: "someone.else@example.test" },
                "a-token",
            ),
        ).rejects.toThrow(/was sent to reviewer@example.test/);
        expect(db.membership.upsert).not.toHaveBeenCalled();
    });

    it("still joins when a granted site has since been deleted", async () => {
        db.organizationInvitation.findUnique.mockResolvedValue(pending);
        db.site.findMany.mockResolvedValue([]);

        const result = await service.accept(invitee, "a-token");

        expect(db.membership.upsert).toHaveBeenCalled();
        expect(db.siteReviewer.upsert).not.toHaveBeenCalled();
        expect(result.siteId).toBeNull();
    });
});

describe("the last owner", () => {
    it("cannot be demoted", async () => {
        db.membership.findUnique.mockResolvedValue({
            role: "OWNER",
            extraActions: [],
        });
        db.membership.count.mockResolvedValue(0);

        await expect(
            service.updateRole(ctx(), "user_owner", { role: "ADMIN" }),
        ).rejects.toThrow(/only owner/i);
        expect(db.membership.update).not.toHaveBeenCalled();
    });

    it("cannot be removed", async () => {
        db.membership.findUnique.mockResolvedValue({
            role: "OWNER",
            extraActions: [],
        });
        db.membership.count.mockResolvedValue(0);

        await expect(service.remove(ctx(), "user_owner")).rejects.toThrow(
            /only owner/i,
        );
        expect(db.membership.delete).not.toHaveBeenCalled();
    });

    it("can be demoted once there is another owner", async () => {
        db.membership.findUnique.mockResolvedValue({
            role: "OWNER",
            extraActions: [],
        });
        db.membership.count.mockResolvedValue(1);

        await service.updateRole(ctx(), "user_owner", { role: "ADMIN" });

        expect(db.membership.update.mock.calls[0][0].data).toEqual({
            role: "ADMIN",
        });
    });
});

describe("the plan's team members (U13): Reviewers aren't counted, and have their own cap", () => {
    it("inviting a Reviewer checks the Reviewers cap, never the team's", async () => {
        const withRoom = jest.spyOn(planMeter, "withRoom");
        const count = jest.fn().mockResolvedValue(0);
        await service.invite(ctx(), {
            email: "reviewer@example.test",
            role: "REVIEWER",
            siteIds: ["site_1"],
        });
        expect(withRoom.mock.calls[0][1]).toBe("reviewers");
        const options = withRoom.mock.calls[0][3] as {
            addingIn: (tx: unknown) => Promise<number>;
        };
        const tx = { organizationInvitation: { count } };
        expect(await options.addingIn(tx)).toBe(1);
        // Only an open Reviewer invitation already counts this person.
        expect(count.mock.calls[0][0].where).toMatchObject({
            role: "REVIEWER",
        });
        count.mockResolvedValue(1);
        expect(await options.addingIn(tx)).toBe(0);
        withRoom.mockRestore();
    });

    it("inviting anyone else adds one, unless a counted invite is open", async () => {
        const withRoom = jest.spyOn(planMeter, "withRoom");
        const count = jest.fn().mockResolvedValue(0);
        await service.invite(ctx(), {
            email: "member@example.test",
            role: "MEMBER",
        });
        expect(withRoom.mock.calls[0][1]).toBe("members");
        const options = withRoom.mock.calls[0][3] as {
            addingIn: (tx: unknown) => Promise<number>;
        };
        const tx = { organizationInvitation: { count } };
        expect(await options.addingIn(tx)).toBe(1);
        // An open invitation as a Reviewer didn't count; this one does.
        expect(count.mock.calls[0][0].where).toMatchObject({
            role: { not: "REVIEWER" },
        });
        count.mockResolvedValue(1);
        expect(await options.addingIn(tx)).toBe(0);
        withRoom.mockRestore();
    });

    it("moving someone off Reviewer is metered, on the role change's transaction", async () => {
        const roomInTx = jest
            .spyOn(planMeter, "roomInTx")
            .mockResolvedValue(null);
        db.membership.findUnique.mockResolvedValue({
            role: "REVIEWER",
            extraActions: [],
        });
        await service.updateRole(ctx(), "user_2", { role: "MEMBER" });
        expect(roomInTx).toHaveBeenCalledWith(prisma, "org_1", "members");
        roomInTx.mockRestore();
    });

    it("a refusal stops the role change", async () => {
        const roomInTx = jest
            .spyOn(planMeter, "roomInTx")
            .mockRejectedValue(new ForbiddenException("full"));
        db.membership.findUnique.mockResolvedValue({
            role: "REVIEWER",
            extraActions: [],
        });
        await expect(
            service.updateRole(ctx(), "user_2", { role: "MEMBER" }),
        ).rejects.toThrow(ForbiddenException);
        expect(db.membership.update).not.toHaveBeenCalled();
        roomInTx.mockRestore();
    });

    it("making someone a Reviewer checks the Reviewers cap; other changes aren't metered", async () => {
        const roomInTx = jest
            .spyOn(planMeter, "roomInTx")
            .mockResolvedValue(null);
        db.membership.findUnique.mockResolvedValue({
            role: "MEMBER",
            extraActions: [],
        });
        await service.updateRole(ctx(), "user_2", { role: "ADMIN" });
        expect(roomInTx).not.toHaveBeenCalled();
        await service.updateRole(ctx(), "user_2", {
            role: "REVIEWER",
            siteIds: ["site_1"],
        });
        expect(roomInTx).toHaveBeenCalledTimes(1);
        expect(roomInTx).toHaveBeenCalledWith(prisma, "org_1", "reviewers");
        roomInTx.mockRestore();
    });
});

describe("changing a role", () => {
    it("drops every reviewer grant when the role is no longer REVIEWER", async () => {
        db.membership.findUnique.mockResolvedValue({
            role: "REVIEWER",
            extraActions: [],
        });

        await service.updateRole(ctx(), "user_2", { role: "MEMBER" });

        expect(db.siteReviewer.deleteMany.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            userId: "user_2",
        });
        expect(db.siteReviewer.upsert).not.toHaveBeenCalled();
    });

    it("replaces the granted sites rather than adding to them", async () => {
        db.membership.findUnique.mockResolvedValue({
            role: "REVIEWER",
            extraActions: [],
        });
        db.site.findMany.mockResolvedValue([{ id: "site_2" }]);

        await service.updateRole(ctx(), "user_2", {
            role: "REVIEWER",
            siteIds: ["site_2"],
        });

        // Every grant that is not in the new set goes.
        expect(db.siteReviewer.deleteMany.mock.calls[0][0].where).toMatchObject(
            {
                userId: "user_2",
                siteId: { notIn: ["site_2"] },
            },
        );
        expect(db.siteReviewer.upsert.mock.calls[0][0].create).toMatchObject({
            siteId: "site_2",
            userId: "user_2",
        });
    });
});

describe("removing someone", () => {
    beforeEach(() => {
        db.membership.findUnique.mockResolvedValue({
            role: "REVIEWER",
            extraActions: [],
        });
    });

    it("takes their grants and their live share links with them", async () => {
        db.sitePreviewLink.updateMany.mockResolvedValue({ count: 2 });

        const result = await service.remove(ctx(), "user_2");

        expect(db.siteReviewer.deleteMany).toHaveBeenCalled();
        const links = db.sitePreviewLink.updateMany.mock.calls[0][0];
        expect(links.where).toMatchObject({
            createdByUserId: "user_2",
            revokedAt: null,
        });
        expect(links.data.revokedAt).toBeInstanceOf(Date);
        expect(result).toEqual({
            removed: true,
            revokedLinks: 2,
            storefrontRoles: 0,
        });
    });

    it("takes their storefront roles in this business with them (DEC-048)", async () => {
        db.storeMembers.deleteMany.mockResolvedValue({ count: 2 });

        const result = await service.remove(ctx(), "user_2");

        // Scoped to this business's storefronts, never another's.
        expect(db.storeMembers.deleteMany).toHaveBeenCalledWith({
            where: { userId: "user_2", store: { organizationId: "org_1" } },
        });
        expect(result).toMatchObject({ storefrontRoles: 2 });
        expect(db.$transaction.mock.calls[0][1]).toEqual({
            isolationLevel: "Serializable",
        });
    });

    it("keeps an only owner's storefront roles when refusing to remove them", async () => {
        db.membership.findUnique.mockResolvedValue({
            role: "OWNER",
            extraActions: [],
        });
        db.membership.count.mockResolvedValue(0);

        await expect(service.remove(ctx(), "user_owner")).rejects.toThrow(
            /only owner/i,
        );
        expect(db.storeMembers.deleteMany).not.toHaveBeenCalled();
    });

    it("checks the last owner again inside the transaction", async () => {
        db.membership.findUnique.mockResolvedValue({
            role: "OWNER",
            extraActions: [],
        });
        // Another owner before the transaction; none left inside it.
        db.membership.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

        await expect(service.remove(ctx(), "user_owner")).rejects.toThrow(
            /only owner/i,
        );
        expect(db.membership.delete).not.toHaveBeenCalled();
        expect(db.storeMembers.deleteMany).not.toHaveBeenCalled();
    });

    it("leaves their notes and approvals alone", async () => {
        await service.remove(ctx(), "user_2");
        // Nothing in this service deletes review history: what was said about
        // a site stays said.
        expect(Object.keys(prisma)).not.toContain("siteComment");
    });

    it("refuses someone who is not in the workspace", async () => {
        db.membership.findUnique.mockResolvedValue(null);

        await expect(service.remove(ctx(), "stranger")).rejects.toThrow(
            /not in this workspace/,
        );
    });
});

/**
 * Roles a business invents. Two jobs: a role key must name a role this
 * business actually has, and nobody may act on a role that can do more than
 * they can — otherwise ticking "change what a role can do" for a Stock clerk
 * hands the business to whoever holds it.
 */
describe("invented roles on the roster", () => {
    /** An actor holding an invented role, with exactly these permissions. */
    const clerk = (actions: string[]): OrganizationContext => ({
        organizationId: "org_1",
        userId: "user_clerk",
        role: "MEMBER",
        roleKey: "stock-clerk",
        actions: new Set(actions) as OrganizationContext["actions"],
    });

    beforeEach(() => {
        db.organizationRole.findUnique.mockResolvedValue(null);
    });

    it("invites someone at a role this business invented", async () => {
        db.organizationRole.findUnique.mockResolvedValue({
            actions: ["order:read"],
        });
        await service.invite(ctx("OWNER"), {
            email: "new@example.com",
            role: "stock-clerk",
        });
        expect(db.organizationInvitation.upsert).toHaveBeenCalled();
        expect(
            db.organizationInvitation.upsert.mock.calls[0][0].create.role,
        ).toBe("stock-clerk");
    });

    it("refuses a role key this business does not have", async () => {
        // A typo must be a 400 — never a membership that quietly resolves to
        // the read-only floor instead of the role that was meant.
        await expect(
            service.invite(ctx("OWNER"), {
                email: "new@example.com",
                role: "stok-clerk",
            }),
        ).rejects.toThrow(/does not exist in this business/);
        expect(db.organizationInvitation.upsert).not.toHaveBeenCalled();
    });

    it("will not let an invented role invite someone as Owner", async () => {
        const actor = clerk(["member:invite", "member:role:update"]);
        await expect(
            service.invite(actor, {
                email: "friend@example.com",
                role: "OWNER",
            }),
        ).rejects.toThrow(/can do more than you can/);
    });

    it("will not let an invented role promote anyone to Admin", async () => {
        db.membership.findUnique.mockResolvedValue({
            role: "stock-clerk",
            extraActions: [],
        });
        db.organizationRole.findUnique.mockResolvedValue({
            actions: ["member:role:update"],
        });
        const actor = clerk(["member:role:update"]);
        await expect(
            service.updateRole(actor, "user_clerk", { role: "ADMIN" }),
        ).rejects.toThrow(/can do more than you can/);
        expect(db.membership.update).not.toHaveBeenCalled();
    });

    it("will not let an invented role change the Owner", async () => {
        // Demoting from below is the other half of a takeover.
        db.membership.findUnique.mockResolvedValue({
            role: "OWNER",
            extraActions: [],
        });
        const actor = clerk(["member:role:update"]);
        await expect(
            service.updateRole(actor, "user_owner", { role: "MEMBER" }),
        ).rejects.toThrow(/cannot change a role that can do more/);
        expect(db.membership.update).not.toHaveBeenCalled();
    });

    it("will not let an invented role remove an Admin", async () => {
        db.membership.findUnique.mockResolvedValue({
            role: "ADMIN",
            extraActions: [],
        });
        const actor = clerk(["member:remove", "member:read"]);
        await expect(service.remove(actor, "user_admin")).rejects.toThrow(
            /cannot remove a role that can do more/,
        );
        expect(db.membership.delete).not.toHaveBeenCalled();
    });

    it("lets a role act on roles within its own reach", async () => {
        // A shift lead with the roster and orders may move someone onto the
        // Stock clerk role, which can do less than they can.
        db.membership.findUnique.mockResolvedValue({
            role: "MEMBER",
            extraActions: [],
        });
        db.organizationRole.findUnique.mockResolvedValue({
            actions: ["order:read"],
        });
        const lead = clerk([
            "member:role:update",
            "order:read",
            "order:write",
            // The Member floor, so changing a current Member is in reach.
            "org:read",
            "member:read",
            "store:read",
            "product-review:read",
            "site:read",
            "media:read",
            "module:read",
            "booking:read",
            "service:read",
            "contact:read",
            // A Member moves kitchen stages (DEC-024).
            "order:stage",
        ]);
        await service.updateRole(lead, "user_x", { role: "stock-clerk" });
        expect(db.membership.update.mock.calls[0][0].data).toEqual({
            role: "stock-clerk",
        });
    });

    it("still lets someone be changed whose role was since removed", async () => {
        // Their current key names nothing; it resolves to the floor instead of
        // locking them into a role nobody can edit them out of.
        db.membership.findUnique.mockResolvedValue({
            role: "deleted-role",
            extraActions: [],
        });
        await service.updateRole(ctx("OWNER"), "user_x", { role: "MEMBER" });
        expect(db.membership.update).toHaveBeenCalled();
    });

    describe("the built-ins", () => {
        it("an Admin can no longer make someone an Owner", async () => {
            // Deliberate: Owner can close the business and Admin cannot. An
            // Owner is made by an Owner.
            db.membership.findUnique.mockResolvedValue({
                role: "MEMBER",
                extraActions: [],
            });
            await expect(
                service.updateRole(ctx("ADMIN"), "user_x", { role: "OWNER" }),
            ).rejects.toThrow(/can do more than you can/);
        });

        it("an Owner still can", async () => {
            db.membership.findUnique.mockResolvedValue({
                role: "MEMBER",
                extraActions: [],
            });
            await service.updateRole(ctx("OWNER"), "user_x", { role: "OWNER" });
            expect(db.membership.update.mock.calls[0][0].data).toEqual({
                role: "OWNER",
            });
        });

        it("an Admin can still manage everyone below Owner", async () => {
            db.membership.findUnique.mockResolvedValue({
                role: "MEMBER",
                extraActions: [],
            });
            await service.updateRole(ctx("ADMIN"), "user_x", { role: "ADMIN" });
            expect(db.membership.update).toHaveBeenCalled();
        });
    });
});

/**
 * The public invitation preview — read before the person has an account.
 * It has to describe the role they are actually being given.
 */
describe("preview — the role an invitation actually grants", () => {
    const pending = {
        email: "clerk@example.com",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86_400_000),
        organizationId: "org_1",
        organization: { name: "Northwind Supply" },
        invitedBy: { name: "Demo Owner" },
    };

    it("names an invented role and says what it grants", async () => {
        db.organizationInvitation.findUnique.mockResolvedValue({
            ...pending,
            role: "stock-clerk",
        });
        db.organizationRole.findUnique.mockResolvedValue({
            label: "Stock clerk",
            actions: ["order:read", "order:write", "order:teleport"],
        });

        const preview = await service.preview("a-token");

        expect(preview.roleKey).toBe("stock-clerk");
        expect(preview.roleLabel).toBe("Stock clerk");
        // In the catalogue's words, and nothing that is not a real power.
        expect(preview.grants).toEqual([
            "See orders",
            "Take, change and export orders",
        ]);
    });

    it("leaves a built-in to the page's own description", async () => {
        db.organizationInvitation.findUnique.mockResolvedValue({
            ...pending,
            role: "ADMIN",
        });

        const preview = await service.preview("a-token");

        expect(preview.role).toBe("ADMIN");
        expect(preview.roleLabel).toBeNull();
        expect(preview.grants).toBeNull();
        expect(db.organizationRole.findUnique).not.toHaveBeenCalled();
    });
});

/**
 * Extra permissions per person (F17, DEC-039; matrix §5). `member:role:update`
 * is necessary, not sufficient: the reach rule holds for every actor.
 */
describe("extra permissions per person (F17)", () => {
    /**
     * A custom "Manager": a Member's bundle, plus reading orders and
     * changing and removing people. It can't refund.
     */
    const MANAGER = [
        ...builtInActions("MEMBER"),
        "order:read",
        "member:role:update",
        "member:remove",
    ];
    const manager = (): OrganizationContext => ({
        organizationId: "org_1",
        userId: "user_manager",
        role: "MEMBER",
        roleKey: "manager",
        actions: resolveCapabilities("manager", MANAGER),
    });
    const admin = (): OrganizationContext => ({
        organizationId: "org_1",
        userId: "user_admin",
        role: "ADMIN",
        roleKey: "ADMIN",
    });
    const person = (role: string, extraActions: string[] = []) =>
        db.membership.findUnique.mockResolvedValue({ role, extraActions });
    const audited = () =>
        (audit.record as jest.Mock).mock.calls.filter(
            ([e]) => e.action === "membership.extras.update",
        );

    it("lets an Admin give a Member a power they hold, and audits it", async () => {
        person("MEMBER");

        const res = await service.setExtraActions(admin(), "user_2", {
            actions: ["payment:manage"],
        });

        expect(res).toEqual({
            userId: "user_2",
            extraActions: ["payment:manage"],
        });
        expect(db.membership.updateMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                userId: "user_2",
                role: "MEMBER",
                extraActions: { equals: [] },
            },
            data: { extraActions: ["payment:manage"] },
        });
        const [[event]] = audited();
        expect(event).toMatchObject({
            actorUserId: "user_admin",
            organizationId: "org_1",
            targetType: "membership",
            targetId: "user_2",
            outcome: "SUCCESS",
            metadata: {
                role: "MEMBER",
                given: ["payment:manage"],
                taken: [],
                // In the owner's words, as the catalogue says it.
                givenLabels: [
                    CAPABILITY_BY_ACTION.get("payment:manage")?.label,
                ],
            },
        });
    });

    it("audits a removal, and takes the power away", async () => {
        person("MEMBER", ["order:refund"]);

        const res = await service.setExtraActions(admin(), "user_2", {
            actions: [],
        });

        expect(res.extraActions).toEqual([]);
        expect(db.membership.updateMany.mock.calls[0][0].data).toEqual({
            extraActions: [],
        });
        expect(audited()[0][0].metadata).toMatchObject({
            given: [],
            taken: ["order:refund"],
            takenLabels: [expect.stringMatching(/refund/i)],
        });
    });

    it("refuses org:delete as an extra (400), even from an Owner", async () => {
        person("ADMIN");
        await expect(
            service.setExtraActions(ctx("OWNER"), "user_2", {
                actions: ["org:delete"],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(db.membership.updateMany).not.toHaveBeenCalled();
    });

    it("refuses anyone without member:role:update (403), in words", async () => {
        person("MEMBER");
        await expect(
            service.setExtraActions(ctx("MEMBER"), "user_2", {
                actions: ["order:refund"],
            }),
        ).rejects.toThrow("Your role can't change what people can do.");
    });

    it("refuses a Manager giving a power they don't hold (403)", async () => {
        person("MEMBER");
        const refused = service.setExtraActions(manager(), "user_2", {
            actions: ["order:refund"],
        });
        await expect(refused).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.setExtraActions(manager(), "user_2", {
                actions: ["order:refund"],
            }),
        ).rejects.toThrow(/^Your role can't give a permission you don't have/);
        expect(db.membership.updateMany).not.toHaveBeenCalled();
    });

    it("counts implied holds: an extra can't carry a power past the rule", async () => {
        // The Manager holds order:read, but not what payment:manage implies.
        person("MEMBER");
        await expect(
            service.setExtraActions(manager(), "user_2", {
                actions: ["payment:manage"],
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lets a Manager give what they hold", async () => {
        person("MEMBER");
        await expect(
            service.setExtraActions(manager(), "user_2", {
                actions: ["order:read"],
            }),
        ).resolves.toEqual({ userId: "user_2", extraActions: ["order:read"] });
    });

    it("refuses anyone, an Owner included, setting their own extras (403)", async () => {
        person("OWNER");
        for (const actor of [ctx("OWNER"), admin(), manager()]) {
            await expect(
                service.setExtraActions(actor, actor.userId, { actions: [] }),
            ).rejects.toThrow(/your own permissions/);
        }
        expect(db.membership.updateMany).not.toHaveBeenCalled();
    });

    it("refuses a Manager changing an Admin's extras, even one they hold (403)", async () => {
        person("ADMIN");
        await expect(
            service.setExtraActions(manager(), "user_admin", {
                actions: ["order:read"],
            }),
        ).rejects.toThrow(/someone who can do more than you can/);
    });

    it("counts a person's current extras when judging who they are", async () => {
        // A Member the Manager could reach by role, but given a refund.
        person("MEMBER", ["order:refund"]);
        await expect(
            service.setExtraActions(manager(), "user_2", { actions: [] }),
        ).rejects.toThrow(/someone who can do more than you can/);
        await expect(
            service.updateRole(manager(), "user_2", { role: "MEMBER" }),
        ).rejects.toThrow(/someone who can do more than you can/);
        await expect(service.remove(manager(), "user_2")).rejects.toThrow(
            /can do more than you can/,
        );
    });

    it("gives a Reviewer nothing beyond reviewing websites (400)", async () => {
        person("REVIEWER");
        await expect(
            service.setExtraActions(admin(), "user_2", {
                actions: ["payment:read"],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("stores nothing the role already grants, and skips a no-op", async () => {
        person("MEMBER");
        const res = await service.setExtraActions(admin(), "user_2", {
            actions: ["booking:read", "contact:read"],
        });
        expect(res.extraActions).toEqual([]);
        expect(db.membership.updateMany).not.toHaveBeenCalled();
        expect(audited()).toHaveLength(0);
    });

    it("refuses to overwrite a change made meanwhile (409)", async () => {
        person("MEMBER");
        db.membership.updateMany.mockResolvedValueOnce({ count: 0 });
        await expect(
            service.setExtraActions(admin(), "user_2", {
                actions: ["order:refund"],
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(audited()).toHaveLength(0);
    });

    it("404s someone not in the business", async () => {
        db.membership.findUnique.mockResolvedValue(null);
        await expect(
            service.setExtraActions(admin(), "user_gone", { actions: [] }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("drops a non-review extra when someone is made a Reviewer", async () => {
        person("MEMBER", ["order:refund"]);
        db.site.findMany.mockResolvedValue([{ id: "site_1" }]);

        await service.updateRole(ctx("OWNER"), "user_2", {
            role: "REVIEWER",
            siteIds: ["site_1"],
        });

        expect(db.membership.update.mock.calls[0][0].data).toEqual({
            role: "REVIEWER",
            extraActions: [],
        });
    });

    it("keeps extras through any other role change", async () => {
        person("MEMBER", ["order:refund"]);
        await service.updateRole(ctx("OWNER"), "user_2", { role: "ADMIN" });
        expect(db.membership.update.mock.calls[0][0].data).toEqual({
            role: "ADMIN",
        });
    });

    it("lists each person's extras beyond their role", async () => {
        db.membership.findMany.mockResolvedValue([
            {
                userId: "user_2",
                role: "MEMBER",
                // contact:read comes with Member; not an extra.
                extraActions: ["order:refund", "contact:read", "gone:away"],
                user: { name: "Ravi", email: "ravi@example.test" },
            },
            {
                userId: "user_3",
                role: "stock-clerk",
                extraActions: ["store:read", "invoice:read"],
                user: { name: "Asha", email: "asha@example.test" },
            },
        ]);
        db.siteReviewer.findMany.mockResolvedValue([]);
        db.organizationRole.findMany.mockResolvedValue([
            { key: "stock-clerk", actions: ["store:read"] },
        ]);

        const roster = await service.list(ctx("OWNER"));

        expect(roster.map((m) => [m.userId, m.extraActions])).toEqual([
            ["user_2", ["order:refund"]],
            ["user_3", ["invoice:read"]],
        ]);
    });
});
