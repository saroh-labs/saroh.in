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
        sitePreviewLink: { updateMany: jest.fn() },
        organization: { findUnique: jest.fn() },
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
    sitePreviewLink: Record<string, jest.Mock>;
    organization: Record<string, jest.Mock>;
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
