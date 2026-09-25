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
        organization: { findUnique: jest.fn() },
        organizationRole: { findUnique: jest.fn() },
        $transaction: jest.fn(),
    },
}));

jest.mock("../../common/email", () => ({
    sendOrganizationInvitationEmail: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@saroh/database";

import { sendOrganizationInvitationEmail } from "../../common/email";
import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { hashInviteToken } from "./invite-token";
import { OrganizationMembersService } from "./organization-members.service";

const db = prisma as unknown as {
    membership: Record<string, jest.Mock>;
    organizationInvitation: Record<string, jest.Mock>;
    siteReviewer: Record<string, jest.Mock>;
    site: Record<string, jest.Mock>;
    session: Record<string, jest.Mock>;
    sitePreviewLink: Record<string, jest.Mock>;
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
        db.membership.findUnique.mockResolvedValue({ role: "OWNER" });
        db.membership.count.mockResolvedValue(0);

        await expect(
            service.updateRole(ctx(), "user_owner", { role: "ADMIN" }),
        ).rejects.toThrow(/only owner/i);
        expect(db.membership.update).not.toHaveBeenCalled();
    });

    it("cannot be removed", async () => {
        db.membership.findUnique.mockResolvedValue({ role: "OWNER" });
        db.membership.count.mockResolvedValue(0);

        await expect(service.remove(ctx(), "user_owner")).rejects.toThrow(
            /only owner/i,
        );
        expect(db.membership.delete).not.toHaveBeenCalled();
    });

    it("can be demoted once there is another owner", async () => {
        db.membership.findUnique.mockResolvedValue({ role: "OWNER" });
        db.membership.count.mockResolvedValue(1);

        await service.updateRole(ctx(), "user_owner", { role: "ADMIN" });

        expect(db.membership.update.mock.calls[0][0].data).toEqual({
            role: "ADMIN",
        });
    });
});

describe("changing a role", () => {
    it("drops every reviewer grant when the role is no longer REVIEWER", async () => {
        db.membership.findUnique.mockResolvedValue({ role: "REVIEWER" });

        await service.updateRole(ctx(), "user_2", { role: "MEMBER" });

        expect(db.siteReviewer.deleteMany.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            userId: "user_2",
        });
        expect(db.siteReviewer.upsert).not.toHaveBeenCalled();
    });

    it("replaces the granted sites rather than adding to them", async () => {
        db.membership.findUnique.mockResolvedValue({ role: "REVIEWER" });
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
        db.membership.findUnique.mockResolvedValue({ role: "REVIEWER" });
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
        expect(result).toEqual({ removed: true, revokedLinks: 2 });
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
        db.membership.findUnique.mockResolvedValue({ role: "stock-clerk" });
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
        db.membership.findUnique.mockResolvedValue({ role: "OWNER" });
        const actor = clerk(["member:role:update"]);
        await expect(
            service.updateRole(actor, "user_owner", { role: "MEMBER" }),
        ).rejects.toThrow(/cannot change a role that can do more/);
        expect(db.membership.update).not.toHaveBeenCalled();
    });

    it("will not let an invented role remove an Admin", async () => {
        db.membership.findUnique.mockResolvedValue({ role: "ADMIN" });
        const actor = clerk(["member:remove", "member:read"]);
        await expect(service.remove(actor, "user_admin")).rejects.toThrow(
            /cannot remove a role that can do more/,
        );
        expect(db.membership.delete).not.toHaveBeenCalled();
    });

    it("lets a role act on roles within its own reach", async () => {
        // A shift lead with the roster and orders may move someone onto the
        // Stock clerk role, which can do less than they can.
        db.membership.findUnique.mockResolvedValue({ role: "MEMBER" });
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
        db.membership.findUnique.mockResolvedValue({ role: "deleted-role" });
        await service.updateRole(ctx("OWNER"), "user_x", { role: "MEMBER" });
        expect(db.membership.update).toHaveBeenCalled();
    });

    describe("the built-ins", () => {
        it("an Admin can no longer make someone an Owner", async () => {
            // Deliberate: Owner can close the business and Admin cannot. An
            // Owner is made by an Owner.
            db.membership.findUnique.mockResolvedValue({ role: "MEMBER" });
            await expect(
                service.updateRole(ctx("ADMIN"), "user_x", { role: "OWNER" }),
            ).rejects.toThrow(/can do more than you can/);
        });

        it("an Owner still can", async () => {
            db.membership.findUnique.mockResolvedValue({ role: "MEMBER" });
            await service.updateRole(ctx("OWNER"), "user_x", { role: "OWNER" });
            expect(db.membership.update.mock.calls[0][0].data).toEqual({
                role: "OWNER",
            });
        });

        it("an Admin can still manage everyone below Owner", async () => {
            db.membership.findUnique.mockResolvedValue({ role: "MEMBER" });
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
        expect(preview.grants).toEqual(["See orders", "Change orders"]);
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
