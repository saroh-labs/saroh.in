/**
 * Staff invites against a real Postgres (DEC-169, admin console U24, R32):
 * who may send, resend and withdraw one; what accepting checks (the
 * person's own verified email, the sender's reach then); what it makes (the
 * grant, the roles, the profile and a ledger row); and every way a link
 * stops working.
 *
 * Route permissions are pinned by `admin.controller.permissions.spec.ts`;
 * here the real guard runs over the controller's own metadata. Runs in the
 * integration project (TEST_DATABASE_URL), and under `TEST_RLS=on`, where
 * the migrations' CHECKs apply.
 */
// The controllers are loaded for their route metadata only; their guards
// pull in Better Auth, which these specs never call.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/platform-admin.guard", () => ({
    PlatformAdminGuard: class PlatformAdminGuard {},
    isBootstrapAdmin: () => false,
}));

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { prisma } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { EmailOutcome } from "../../common/email";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { AdminAuditService } from "./admin-audit.service";
import type { AdminRole } from "./admin-permissions";
import {
    AdminPermission,
    AdminRole as Roles,
    permissionsFor,
} from "./admin-permissions";
import { AdminStaffInvitesService } from "./admin-staff-invites.service";
import { AdminStaffController } from "./admin-staff.controller";
import { hashStaffInviteToken } from "./staff-invite";
import { StaffInviteMailer } from "./staff-invite-mailer";
import { MANAGER_CODE_PATTERN } from "./staff-profile";

const tag = `${process.pid}-${Date.now()}`;
const address = (label: string) => `${label}-${tag}@example.com`;

/** Stands in for the email: keeps the token a real send would carry. */
class FakeMailer extends StaffInviteMailer {
    readonly sent: { to: string; token: string; url: string }[] = [];
    outcome: EmailOutcome = "sent";

    override accountsBase(): string {
        return "https://accounts.example.com";
    }

    override send(
        to: string,
        details: { base: string; token: string },
    ): Promise<EmailOutcome> {
        this.sent.push({
            to,
            token: details.token,
            url: this.link(details.base, details.token),
        });
        return Promise.resolve(this.outcome);
    }

    lastTo(to: string): string {
        const token = this.sent.filter((s) => s.to === to).at(-1)?.token;
        if (!token) throw new Error(`No invite was sent to ${to}`);
        return token;
    }
}

const mailer = new FakeMailer();
const service = new AdminStaffInvitesService(new AdminAuditService(), mailer);

const as = (userId: string, roles: AdminRole[]): PlatformAdminInfo => ({
    userId,
    platformAdminId: "pa_actor",
    roles,
    permissions: permissionsFor(roles),
    viaBootstrap: false,
});

let ownerUserId: string;
const owner = () => as(ownerUserId, [Roles.PlatformOwner]);

/** A person with a Saroh account, verified their own way, by staff, or not at all. */
async function person(
    label: string,
    verified: "self" | "staff" | "no" = "self",
) {
    const user = await prisma.user.create({
        data: {
            email: address(label),
            name: verified === "self" ? `${label} Rao` : null,
            emailVerified: verified !== "no",
            emailVerifiedByStaffAt: verified === "staff" ? new Date() : null,
        },
    });
    return { id: user.id, email: user.email };
}

/** Someone on the team, by a real grant the accept re-check can read. */
async function teammate(label: string, roles: AdminRole[]) {
    const user = await person(label);
    const admin = await prisma.platformAdmin.create({
        data: { userId: user.id },
    });
    await prisma.platformAdminRoleAssignment.createMany({
        data: roles.map((role) => ({
            platformAdminId: admin.id,
            role,
            reason: "seeded for the invite spec",
        })),
    });
    return { userId: user.id, platformAdminId: admin.id, email: user.email };
}

async function sendInvite(
    label: string,
    overrides: Partial<Parameters<typeof service.invite>[0]> = {},
) {
    const email = address(label);
    const sent = await service.invite({
        staff: owner(),
        email: email.toUpperCase(),
        name: `${label} Rao`,
        roles: [Roles.AccountManager],
        worksAs: "ACCOUNT_MANAGER_JOB",
        onCommission: true,
        reason: "Joins the sales team",
        ...overrides,
    });
    return { ...sent, email, token: mailer.lastTo(email) };
}

describe("staff invites (DB, U24)", () => {
    beforeAll(async () => {
        ownerUserId = (await teammate("owner", [Roles.PlatformOwner])).userId;
    });

    it("sends an invite: stored by the token's hash, never the token", async () => {
        const sent = await sendInvite("asha");
        expect(sent.emailed).toBe(true);
        expect(sent.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(mailer.sent.at(-1)?.url).toBe(
            `https://accounts.example.com/staff-invite/open?token=${sent.token}`,
        );

        const row = await prisma.staffInvite.findUniqueOrThrow({
            where: { id: sent.inviteId },
        });
        expect(row).toMatchObject({
            email: sent.email,
            roles: [Roles.AccountManager],
            worksAs: "ACCOUNT_MANAGER_JOB",
            onCommission: true,
            invitedByUserId: ownerUserId,
            tokenHash: hashStaffInviteToken(sent.token),
        });
        expect(JSON.stringify(row)).not.toContain(sent.token);
        const days = (row.expiresAt.getTime() - row.sentAt.getTime()) / 864e5;
        expect(days).toBeCloseTo(7, 5);

        const ledger = await prisma.adminAuditEvent.findFirstOrThrow({
            where: { targetId: sent.inviteId, action: "staff.invite.created" },
        });
        expect(ledger).toMatchObject({
            actorUserId: ownerUserId,
            permission: AdminPermission.StaffGrant,
            targetType: "staff_invite",
            reason: "Joins the sales team",
            outcome: "SUCCESS",
        });
        expect(JSON.stringify(ledger)).not.toContain(sent.token);

        const listed = (await service.list()).find(
            (i) => i.id === sent.inviteId,
        );
        expect(listed).toMatchObject({ state: "waiting", sendCount: 1 });
        expect(JSON.stringify(listed)).not.toContain(row.tokenHash);
    });

    it("shows the link's holder what they were invited to", async () => {
        const sent = await sendInvite("preview");
        await expect(service.preview(sent.token)).resolves.toMatchObject({
            email: sent.email,
            name: "preview Rao",
            roles: [Roles.AccountManager],
            worksAs: "ACCOUNT_MANAGER_JOB",
            invitedByName: "owner Rao",
        });
        await expect(service.preview("not-a-token")).rejects.toMatchObject({
            status: 404,
        });
    });

    it("refuses a second invite to an address with one waiting", async () => {
        await sendInvite("twice");
        await expect(sendInvite("twice")).rejects.toMatchObject({
            status: 409,
            response: { details: { code: "INVITE_WAITING" } },
        });
    });

    it("refuses an invite with a role that can do more than the sender can, on the ledger", async () => {
        // Someone holding staff:grant without every power: no fixed role is
        // that today, so the reach rule is what is tried here.
        const narrow: PlatformAdminInfo = {
            ...as(ownerUserId, [Roles.Support]),
            permissions: [
                ...permissionsFor([Roles.Support]),
                AdminPermission.StaffGrant,
            ],
        };
        await expect(
            service.invite({
                staff: narrow,
                email: address("beyond"),
                name: "Beyond",
                roles: [Roles.Support, Roles.Billing],
                worksAs: "OTHER",
                reason: "Joins billing",
            }),
        ).rejects.toMatchObject({
            status: 403,
            response: { details: { roles: [Roles.Billing] } },
        });
        expect(
            await prisma.staffInvite.count({
                where: { email: address("beyond") },
            }),
        ).toBe(0);
        const denied = await prisma.adminAuditEvent.findFirst({
            where: {
                actorUserId: ownerUserId,
                action: "staff.invite.create",
                outcome: "DENIED",
            },
        });
        expect(denied?.metadata).toEqual({ beyondReach: [Roles.Billing] });
    });

    it("refuses create, resend and withdraw to someone without staff:grant", async () => {
        const sent = await sendInvite("nogrant");
        const support = as(ownerUserId, [Roles.Support]);
        await expect(
            service.invite({
                staff: support,
                email: address("nogrant-2"),
                name: "No",
                roles: [Roles.Support],
                worksAs: "OTHER",
                reason: "Joins support",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.resend({
                staff: support,
                inviteId: sent.inviteId,
                reason: "Lost the email",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.withdraw({
                staff: support,
                inviteId: sent.inviteId,
                reason: "Changed our minds",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("accepts with a matching, self-verified email: access, roles, profile and a ledger row", async () => {
        const sent = await sendInvite("joiner");
        const user = await person("joiner");

        const accepted = await service.accept({ id: user.id }, sent.token);
        expect(accepted.outcome).toBe("joined");

        const admin = await prisma.platformAdmin.findUniqueOrThrow({
            where: { userId: user.id },
            include: { roleAssignments: true, staffProfile: true },
        });
        expect(admin.id).toBe(accepted.platformAdminId);
        expect(admin).toMatchObject({
            revokedAt: null,
            grantedByUserId: ownerUserId,
        });
        expect(admin.roleAssignments).toEqual([
            expect.objectContaining({
                role: Roles.AccountManager,
                assignedByUserId: ownerUserId,
                reason: "Joins the sales team",
                revokedAt: null,
                expiresAt: null,
            }),
        ]);
        expect(admin.staffProfile).toMatchObject({
            worksAs: "ACCOUNT_MANAGER_JOB",
            workEmail: sent.email,
            onCommission: true,
        });
        expect(admin.staffProfile?.managerCode).toMatch(MANAGER_CODE_PATTERN);

        await expect(
            prisma.staffInvite.findUniqueOrThrow({
                where: { id: sent.inviteId },
            }),
        ).resolves.toMatchObject({
            acceptedByUserId: user.id,
            platformAdminId: admin.id,
        });
        const ledger = await prisma.adminAuditEvent.findFirstOrThrow({
            where: { targetId: admin.id, action: "staff.invite.accepted" },
        });
        expect(ledger).toMatchObject({
            actorUserId: user.id,
            permission: AdminPermission.StaffGrant,
            targetType: "platform_admin",
            outcome: "SUCCESS",
        });
        expect(ledger.metadata).toMatchObject({
            inviteId: sent.inviteId,
            invitedByUserId: ownerUserId,
            roles: [Roles.AccountManager],
        });
    });

    it("does nothing the second time the same person accepts", async () => {
        const sent = await sendInvite("double");
        const user = await person("double");
        const first = await service.accept({ id: user.id }, sent.token);
        const second = await service.accept({ id: user.id }, sent.token);

        expect(second).toEqual({
            outcome: "already-joined",
            platformAdminId: first.platformAdminId,
        });
        expect(
            await prisma.platformAdminRoleAssignment.count({
                where: { platformAdminId: first.platformAdminId },
            }),
        ).toBe(1);
        expect(
            await prisma.adminAuditEvent.count({
                where: {
                    targetId: first.platformAdminId,
                    action: "staff.invite.accepted",
                },
            }),
        ).toBe(1);
    });

    it("gives a name to someone who had none", async () => {
        const sent = await sendInvite("nameless");
        const user = await prisma.user.create({
            data: { email: address("nameless"), emailVerified: true },
        });
        await service.accept({ id: user.id }, sent.token);
        await expect(
            prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
        ).resolves.toMatchObject({ name: "nameless Rao" });
    });

    it.each([
        ["marked verified by staff", "staff", "INVITE_EMAIL_NOT_CONFIRMED"],
        ["not verified", "no", "INVITE_EMAIL_NOT_CONFIRMED"],
    ] as const)(
        "refuses an account whose email is %s",
        async (_, verified, code) => {
            const label = `unverified-${verified}`;
            const sent = await sendInvite(label);
            const user = await person(label, verified);
            await expect(
                service.accept({ id: user.id }, sent.token),
            ).rejects.toMatchObject({
                status: 403,
                response: { details: { code } },
            });
            expect(
                await prisma.platformAdmin.count({
                    where: { userId: user.id },
                }),
            ).toBe(0);
            const denied = await prisma.adminAuditEvent.findFirst({
                where: {
                    actorUserId: user.id,
                    action: "staff.invite.accept",
                    outcome: "DENIED",
                },
            });
            expect(denied?.metadata).toEqual({ refusal: code });
        },
    );

    it("refuses an account with a different email", async () => {
        const sent = await sendInvite("meant-for");
        const other = await person("someone-else");
        await expect(
            service.accept({ id: other.id }, sent.token),
        ).rejects.toMatchObject({
            status: 403,
            response: { details: { code: "INVITE_WRONG_ACCOUNT" } },
        });
        await expect(service.preview(sent.token)).resolves.toBeDefined();
    });

    it("refuses an expired link", async () => {
        const sent = await sendInvite("expired");
        const user = await person("expired");
        await prisma.staffInvite.update({
            where: { id: sent.inviteId },
            data: { expiresAt: new Date(Date.now() - 1000) },
        });
        await expect(
            service.accept({ id: user.id }, sent.token),
        ).rejects.toMatchObject({
            status: 404,
            response: { details: { code: "INVITE_GONE" } },
        });
        await expect(service.preview(sent.token)).rejects.toMatchObject({
            status: 404,
        });
        expect(
            (await service.list()).find((i) => i.id === sent.inviteId)?.state,
        ).toBe("expired");
    });

    it("refuses a link already used, to anyone else", async () => {
        const sent = await sendInvite("used");
        const user = await person("used");
        await service.accept({ id: user.id }, sent.token);
        const other = await person("used-other");
        await expect(
            service.accept({ id: other.id }, sent.token),
        ).rejects.toMatchObject({ status: 404 });
        await expect(service.preview(sent.token)).rejects.toMatchObject({
            status: 404,
        });
    });

    it("kills the old link on resend; the new one works", async () => {
        const sent = await sendInvite("resend");
        const resent = await service.resend({
            staff: owner(),
            inviteId: sent.inviteId,
            reason: "Lost the first email",
        });
        expect(resent.emailed).toBe(true);
        const fresh = mailer.lastTo(sent.email);
        expect(fresh).not.toBe(sent.token);

        const user = await person("resend");
        await expect(
            service.accept({ id: user.id }, sent.token),
        ).rejects.toMatchObject({ status: 404 });
        await expect(service.preview(sent.token)).rejects.toMatchObject({
            status: 404,
        });
        await expect(service.accept({ id: user.id }, fresh)).resolves.toEqual(
            expect.objectContaining({ outcome: "joined" }),
        );

        const row = await prisma.staffInvite.findUniqueOrThrow({
            where: { id: sent.inviteId },
        });
        expect(row.sendCount).toBe(2);
        expect(
            await prisma.adminAuditEvent.count({
                where: {
                    targetId: sent.inviteId,
                    action: "staff.invite.resent",
                },
            }),
        ).toBe(1);
    });

    it("refuses an accept once the sender lost staff:grant", async () => {
        const sender = await teammate("sender", [Roles.PlatformOwner]);
        const sent = await sendInvite("orphan", {
            staff: as(sender.userId, [Roles.PlatformOwner]),
        });
        // Revoked before the invitee got to it.
        await prisma.platformAdmin.update({
            where: { id: sender.platformAdminId },
            data: { revokedAt: new Date() },
        });
        const user = await person("orphan");
        await expect(
            service.accept({ id: user.id }, sent.token),
        ).rejects.toMatchObject({
            status: 403,
            response: { details: { code: "INVITE_SENDER_CANNOT_GRANT" } },
        });
        expect(
            await prisma.platformAdmin.count({ where: { userId: user.id } }),
        ).toBe(0);

        // Resent by someone who still can, it works.
        await service.resend({
            staff: owner(),
            inviteId: sent.inviteId,
            reason: "Their sender left",
        });
        await expect(
            service.accept({ id: user.id }, mailer.lastTo(sent.email)),
        ).resolves.toMatchObject({ outcome: "joined" });
    });

    it("refuses an accept once the sender no longer reaches the invited role", async () => {
        const sender = await teammate("narrowed", [Roles.PlatformOwner]);
        const sent = await sendInvite("narrowed-invitee", {
            staff: as(sender.userId, [Roles.PlatformOwner]),
            roles: [Roles.Billing],
        });
        // Their Platform owner role went; Support alone can't grant.
        await prisma.platformAdminRoleAssignment.updateMany({
            where: { platformAdminId: sender.platformAdminId },
            data: { revokedAt: new Date() },
        });
        await prisma.platformAdminRoleAssignment.create({
            data: {
                platformAdminId: sender.platformAdminId,
                role: Roles.Support,
                reason: "moved to support",
            },
        });
        const user = await person("narrowed-invitee");
        await expect(
            service.accept({ id: user.id }, sent.token),
        ).rejects.toMatchObject({
            response: { details: { code: "INVITE_SENDER_CANNOT_GRANT" } },
        });
    });

    it("says already on the team, at the invite and at the accept", async () => {
        const member = await teammate("member", [Roles.Support]);
        await expect(
            service.invite({
                staff: owner(),
                email: member.email,
                name: "Member",
                roles: [Roles.Billing],
                worksAs: "OTHER",
                reason: "More roles",
            }),
        ).rejects.toMatchObject({
            status: 409,
            response: { details: { code: "ALREADY_ON_TEAM" } },
        });

        // Granted another way while the invite waited.
        const sent = await sendInvite("granted-meanwhile");
        const user = await person("granted-meanwhile");
        const admin = await prisma.platformAdmin.create({
            data: { userId: user.id },
        });
        await prisma.platformAdminRoleAssignment.create({
            data: {
                platformAdminId: admin.id,
                role: Roles.Auditor,
                reason: "granted directly",
            },
        });
        await expect(
            service.accept({ id: user.id }, sent.token),
        ).rejects.toMatchObject({
            status: 409,
            response: { details: { code: "ALREADY_ON_TEAM" } },
        });
    });

    it("reopens a grant revoked before, rather than making a second", async () => {
        const former = await teammate("former", [Roles.Support]);
        await prisma.platformAdmin.update({
            where: { id: former.platformAdminId },
            data: { revokedAt: new Date() },
        });
        await prisma.platformAdminRoleAssignment.updateMany({
            where: { platformAdminId: former.platformAdminId },
            data: { revokedAt: new Date() },
        });
        const sent = await sendInvite("former", { roles: [Roles.Auditor] });
        const accepted = await service.accept(
            { id: former.userId },
            sent.token,
        );
        expect(accepted.platformAdminId).toBe(former.platformAdminId);
        await expect(
            prisma.platformAdmin.findUniqueOrThrow({
                where: { id: former.platformAdminId },
            }),
        ).resolves.toMatchObject({ revokedAt: null });
    });

    it("withdraws an invite: the link stops working, and twice changes nothing", async () => {
        const sent = await sendInvite("withdrawn");
        await expect(
            service.withdraw({
                staff: owner(),
                inviteId: sent.inviteId,
                reason: "Hired someone else",
            }),
        ).resolves.toEqual({ inviteId: sent.inviteId, changed: true });
        await expect(
            service.withdraw({
                staff: owner(),
                inviteId: sent.inviteId,
                reason: "Hired someone else",
            }),
        ).resolves.toEqual({ inviteId: sent.inviteId, changed: false });

        const user = await person("withdrawn");
        await expect(
            service.accept({ id: user.id }, sent.token),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
            service.resend({
                staff: owner(),
                inviteId: sent.inviteId,
                reason: "Again after all",
            }),
        ).rejects.toMatchObject({ status: 409 });
        expect((await service.list()).some((i) => i.id === sent.inviteId)).toBe(
            false,
        );
    });

    it("says when the email didn't leave, and keeps the invite for Resend", async () => {
        mailer.outcome = "failed";
        try {
            const sent = await sendInvite("bounced");
            expect(sent.emailed).toBe(false);
            expect(
                (await service.list()).find((i) => i.id === sent.inviteId)
                    ?.state,
            ).toBe("waiting");
        } finally {
            mailer.outcome = "sent";
        }
    });

    (isRlsTestMode() ? it : it.skip)(
        "the migration refuses a stored token that isn't a hash",
        async () => {
            await expect(
                prisma.staffInvite.create({
                    data: {
                        email: address("raw"),
                        name: "Raw",
                        roles: [Roles.Support],
                        worksAs: "OTHER",
                        reason: "Tries to store a token",
                        tokenHash: "a-plain-token",
                        expiresAt: new Date(Date.now() + 864e5),
                        invitedByUserId: ownerUserId,
                    },
                }),
            ).rejects.toThrow(/StaffInvite_tokenHash_check/);
        },
    );
});

describe("staff invite routes refuse without staff:grant (U24)", () => {
    const guard = new PlatformPermissionGuard(new Reflector());
    const proto = AdminStaffController.prototype as unknown as Record<
        string,
        () => unknown
    >;
    const context = (handler: string, roles: AdminRole[]) =>
        ({
            getHandler: () => proto[handler],
            getClass: () => AdminStaffController,
            switchToHttp: () => ({
                getRequest: () => ({ platformAdmin: as("u", roles) }),
            }),
        }) as unknown as ExecutionContext;

    it.each(
        (["inviteTeammate", "resendInvite", "withdrawInvite"] as const).flatMap(
            (handler) =>
                [
                    Roles.Support,
                    Roles.Billing,
                    Roles.Auditor,
                    Roles.AccountManager,
                ].map((role) => [handler, role] as const),
        ),
    )("refuses %s to %s with 403", (handler, role) => {
        expect(() => guard.canActivate(context(handler, [role]))).toThrow(
            ForbiddenException,
        );
    });

    it.each(["inviteTeammate", "resendInvite", "withdrawInvite"] as const)(
        "lets %s through for a Platform owner",
        (handler) => {
            expect(
                guard.canActivate(context(handler, [Roles.PlatformOwner])),
            ).toBe(true);
        },
    );

    it("lists invites for staff:read holders", () => {
        expect(guard.canActivate(context("listInvites", [Roles.Auditor]))).toBe(
            true,
        );
        expect(() =>
            guard.canActivate(context("listInvites", [Roles.Support])),
        ).toThrow(ForbiddenException);
    });
});
