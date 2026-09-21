import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { randomBytes } from "node:crypto";

import { sendOrganizationInvitationEmail } from "../../common/email";
import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { env } from "../../env";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { CAPABILITY_BY_ACTION } from "./capability-catalogue";
import { hashInviteToken } from "./invite-token";
import type { InviteMemberDto, UpdateMemberRoleDto } from "./members.dto";
import type { OrgAction } from "./organization-actions";
import {
    allows,
    authorize,
    isBuiltInRole,
    resolveCapabilities,
} from "./organization-policy";

/** A week. Long enough to survive a holiday, short enough to expire. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface MemberView {
    userId: string;
    name: string | null;
    email: string;
    /** The built-in this maps to; MEMBER for a role the business invented. */
    role: OrgRole;
    /** The role as stored — a built-in name, or an invented role's key. */
    roleKey: string;
    /** Sites this person may review. Empty for every role but REVIEWER. */
    siteIds: string[];
    /** Whether this row is the caller, so the UI can say "you". */
    isSelf: boolean;
}

export interface InvitationView {
    id: string;
    email: string;
    /** The built-in this maps to; MEMBER for a role the business invented. */
    role: OrgRole;
    /** The role as stored — a built-in name, or an invented role's key. */
    roleKey: string;
    siteIds: string[];
    status: string;
    expiresAt: Date;
    createdAt: Date;
}

/**
 * The organization's roster: who is in it, at what role, and who has been
 * asked (#276).
 *
 * Until this existed a Saroh organization had exactly one kind of member — the
 * OWNER created at onboarding — because nothing anywhere wrote a Membership
 * row with any other role. ADMIN, MEMBER and REVIEWER were all equally
 * unassignable, which is why the Review feature had no second person in it.
 *
 * Two invariants live here rather than in the policy:
 *
 *  - **The last OWNER cannot be demoted or removed.** This is the S1-006
 *    invariant `organization-policy.ts` explicitly defers to the write layer:
 *    it is about the state of the roster, not about what a role may do, so no
 *    role→action map can express it. Checked inside a serializable transaction,
 *    because two concurrent demotions that each see the other owner would both
 *    pass an unserialized check and leave the org ownerless.
 *
 *  - **A REVIEWER is granted named sites.** The role's site:read is org-wide;
 *    `SiteReviewer` is what narrows it. A REVIEWER with no grants can reach no
 *    site at all, which is the safe direction for a mistake to fall.
 */
@Injectable()
export class OrganizationMembersService {
    constructor(private readonly audit: AuditService) {}

    /** Everyone in the org, with a reviewer's granted sites. */
    async list(ctx: OrganizationContext): Promise<MemberView[]> {
        authorize(ctx, "member:read");

        const [memberships, grants] = await Promise.all([
            prisma.membership.findMany({
                where: { organizationId: ctx.organizationId },
                select: {
                    userId: true,
                    role: true,
                    user: { select: { name: true, email: true } },
                },
            }),
            prisma.siteReviewer.findMany({
                where: { organizationId: ctx.organizationId },
                select: { userId: true, siteId: true },
            }),
        ]);

        const byUser = new Map<string, string[]>();
        for (const grant of grants) {
            byUser.set(grant.userId, [
                ...(byUser.get(grant.userId) ?? []),
                grant.siteId,
            ]);
        }

        return memberships.map((m) => ({
            userId: m.userId,
            name: m.user.name,
            email: m.user.email,
            role: toRole(m.role),
            roleKey: m.role,
            siteIds: byUser.get(m.userId) ?? [],
            isSelf: m.userId === ctx.userId,
        }));
    }

    /**
     * Invitations that have not been accepted yet. Gated on `member:invite`,
     * not `member:read`: the roster is a floor every role sees, while who has
     * been asked and not yet answered is the inviter's business.
     */
    async listInvitations(ctx: OrganizationContext): Promise<InvitationView[]> {
        authorize(ctx, "member:invite");

        const invitations = await prisma.organizationInvitation.findMany({
            where: { organizationId: ctx.organizationId, status: "PENDING" },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                email: true,
                role: true,
                siteIds: true,
                status: true,
                expiresAt: true,
                createdAt: true,
            },
        });
        // No token, hashed or otherwise. It is in the invitee's inbox and
        // nowhere else; a roster screen is not a place to re-read it from.
        return invitations.map((i) => ({
            ...i,
            role: toRole(i.role),
            roleKey: i.role,
        }));
    }

    /**
     * Invite someone by email. Re-inviting the same address refreshes the
     * invitation in place — role, sites, token and expiry — rather than
     * stacking rows, so the newest email is the one that works.
     */
    async invite(ctx: OrganizationContext, dto: InviteMemberDto) {
        authorize(ctx, "member:invite");
        await this.assertWithinReach(ctx, dto.role, "invite someone as");

        const siteIds = await this.resolveSiteIds(ctx, dto.role, dto.siteIds);

        const existing = await prisma.membership.findFirst({
            where: {
                organizationId: ctx.organizationId,
                user: { email: dto.email },
            },
            select: { userId: true },
        });
        if (existing) {
            throw new ConflictException({
                message: "That person is already in this workspace.",
                field: "email",
            });
        }

        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
        const invitation = await prisma.organizationInvitation.upsert({
            where: {
                organizationId_email: {
                    organizationId: ctx.organizationId,
                    email: dto.email,
                },
            },
            create: {
                organizationId: ctx.organizationId,
                email: dto.email,
                role: dto.role,
                siteIds,
                tokenHash: hashInviteToken(token),
                invitedByUserId: ctx.userId,
                expiresAt,
            },
            update: {
                role: dto.role,
                siteIds,
                tokenHash: hashInviteToken(token),
                invitedByUserId: ctx.userId,
                expiresAt,
                status: "PENDING",
                acceptedAt: null,
            },
            select: { id: true, email: true, role: true, expiresAt: true },
        });

        const organization = await prisma.organization.findUnique({
            where: { id: ctx.organizationId },
            select: { name: true },
        });

        await sendOrganizationInvitationEmail(
            dto.email,
            `${env.APP_URL ?? "https://app.saroh.localhost"}/join/${token}`,
            organization?.name ?? "a Saroh workspace",
        );

        await this.audit.record({
            action: AuditAction.MembershipInvite,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "invitation",
            targetId: invitation.id,
            outcome: AuditOutcome.Success,
            // The role and how many sites, never the invitee's address.
            metadata: { role: dto.role, siteCount: siteIds.length },
        });

        return {
            ...invitation,
            role: toRole(invitation.role),
            roleKey: invitation.role,
        };
    }

    /** Withdraw an invitation that has not been accepted. */
    async revokeInvitation(ctx: OrganizationContext, invitationId: string) {
        authorize(ctx, "member:invite");

        const invitation = await prisma.organizationInvitation.findFirst({
            where: { id: invitationId, organizationId: ctx.organizationId },
            select: { id: true },
        });
        if (!invitation) {
            throw new NotFoundException("That invitation no longer exists.");
        }

        // The token hash goes with it: a revoked invitation's link must not
        // work, and the row is kept only to say the invitation happened.
        await prisma.organizationInvitation.update({
            where: { id: invitation.id },
            data: {
                status: "REVOKED",
                tokenHash: `revoked:${invitation.id}`,
            },
        });
        return { revoked: true };
    }

    /**
     * Accept an invitation. Session-scoped, not org-scoped: the whole point is
     * that the caller is not a member yet, so there is no context to resolve.
     */
    /**
     * What an invitation says, to whoever holds its link — before they have an
     * account, and therefore before there is any session to authorize.
     *
     * The link IS the credential: the token is high-entropy and stored only as
     * a hash, so a holder is the intended reader. What comes back is still the
     * minimum that lets someone decide whether to join — the business, who
     * asked, the role, and the address it was sent to. Not the organization
     * id, not the sites a reviewer would get, nothing that would be useful to
     * someone who stole the link rather than received it.
     *
     * The address is included deliberately. `accept` already refuses a
     * mismatch by naming it ("That invitation was sent to …"), so a token
     * holder can learn it anyway — and showing it up front turns a dead end at
     * the last step into a prefilled field at the first.
     *
     * One answer for missing, revoked, used and expired. A stranger holding a
     * token learns nothing from the difference.
     */
    async preview(token: string) {
        const invitation = await prisma.organizationInvitation.findUnique({
            where: { tokenHash: hashInviteToken(token) },
            select: {
                email: true,
                role: true,
                status: true,
                expiresAt: true,
                organizationId: true,
                organization: { select: { name: true } },
                invitedBy: { select: { name: true } },
            },
        });
        if (
            invitation?.status !== "PENDING" ||
            invitation.expiresAt.getTime() < Date.now()
        ) {
            throw new NotFoundException(
                "That invitation is no longer valid. Ask for a new one.",
            );
        }

        /*
         * An invented role is described by what it GRANTS, because that is
         * the only true thing to say about it. Narrowing it to MEMBER here —
         * which is what `toRole` does — told someone invited as "Stock clerk"
         * that they were joining as a Member and listed a Member's powers:
         * a false account of what they were agreeing to, on the one page
         * they read before they have an account at all.
         */
        const invented = isBuiltInRole(invitation.role)
            ? null
            : await prisma.organizationRole.findUnique({
                  where: {
                      organizationId_key: {
                          organizationId: invitation.organizationId,
                          key: invitation.role,
                      },
                  },
                  select: { label: true, actions: true },
              });

        return {
            organizationName: invitation.organization.name,
            invitedByName: invitation.invitedBy?.name ?? null,
            role: toRole(invitation.role),
            roleKey: invitation.role,
            roleLabel: invented?.label ?? null,
            // Null for a built-in, which the page already describes in words.
            grants: invented
                ? invented.actions.flatMap((a) => {
                      const c = CAPABILITY_BY_ACTION.get(a as OrgAction);
                      return c ? [c.label] : [];
                  })
                : null,
            email: invitation.email,
            expiresAt: invitation.expiresAt,
        };
    }

    async accept(user: { id: string; email: string }, token: string) {
        const invitation = await prisma.organizationInvitation.findUnique({
            where: { tokenHash: hashInviteToken(token) },
            select: {
                id: true,
                organizationId: true,
                email: true,
                role: true,
                siteIds: true,
                status: true,
                expiresAt: true,
                organization: { select: { name: true, slug: true } },
            },
        });
        // One message for "no such invitation" and "already used", so a
        // stranger holding a token learns nothing either way.
        if (invitation?.status !== "PENDING") {
            throw new NotFoundException(
                "That invitation is no longer valid. Ask for a new one.",
            );
        }
        if (invitation.expiresAt.getTime() < Date.now()) {
            await prisma.organizationInvitation.update({
                where: { id: invitation.id },
                data: { status: "EXPIRED" },
            });
            throw new BadRequestException(
                "That invitation has expired. Ask for a new one.",
            );
        }
        // Addressed to a person, not to whoever opens the link. Signing in as
        // someone else and following it must not join the wrong account.
        if (invitation.email !== user.email.toLowerCase()) {
            throw new ForbiddenException(
                `That invitation was sent to ${invitation.email}. Sign in as that person to accept it.`,
            );
        }

        const role = toRole(invitation.role);
        // Sites deleted since the invite was sent are dropped rather than
        // failing the accept: the person still belongs in the workspace.
        const sites = await prisma.site.findMany({
            where: {
                id: { in: invitation.siteIds },
                organizationId: invitation.organizationId,
                deletedAt: null,
            },
            select: { id: true },
        });

        await prisma.$transaction(async (tx) => {
            await tx.membership.upsert({
                where: {
                    organizationId_userId: {
                        organizationId: invitation.organizationId,
                        userId: user.id,
                    },
                },
                create: {
                    organizationId: invitation.organizationId,
                    userId: user.id,
                    role,
                },
                update: { role },
            });
            for (const site of sites) {
                await tx.siteReviewer.upsert({
                    where: {
                        siteId_userId: { siteId: site.id, userId: user.id },
                    },
                    create: {
                        organizationId: invitation.organizationId,
                        siteId: site.id,
                        userId: user.id,
                    },
                    update: {},
                });
            }
            await tx.organizationInvitation.update({
                where: { id: invitation.id },
                data: {
                    status: "ACCEPTED",
                    acceptedAt: new Date(),
                    // Spent: the link cannot be replayed.
                    tokenHash: `accepted:${invitation.id}`,
                },
            });
        });

        await this.audit.record({
            action: AuditAction.MembershipAccept,
            actorUserId: user.id,
            organizationId: invitation.organizationId,
            targetType: "membership",
            targetId: user.id,
            outcome: AuditOutcome.Success,
            metadata: { role, siteCount: sites.length },
        });

        return {
            organizationId: invitation.organizationId,
            organization: invitation.organization,
            role,
            // Where to send them: the site they were asked to look at.
            siteId: sites[0]?.id ?? null,
        };
    }

    /** Change someone's role, and a reviewer's sites along with it. */
    async updateRole(
        ctx: OrganizationContext,
        userId: string,
        dto: UpdateMemberRoleDto,
    ) {
        authorize(ctx, "member:role:update");

        const membership = await this.requireMembership(ctx, userId);
        // Both ends. Changing someone who can do more than you is how a role
        // takes over the business from below; giving a role that can do more
        // than you is how it promotes itself.
        await this.assertWithinReach(ctx, membership.role, "change", {
            mustExist: false,
        });
        await this.assertWithinReach(ctx, dto.role, "give someone");
        const siteIds = await this.resolveSiteIds(ctx, dto.role, dto.siteIds);
        if (membership.role === "OWNER" && dto.role !== "OWNER") {
            await this.assertNotLastOwner(ctx.organizationId, userId, "demote");
        }

        await prisma.$transaction(
            async (tx) => {
                await tx.membership.update({
                    where: {
                        organizationId_userId: {
                            organizationId: ctx.organizationId,
                            userId,
                        },
                    },
                    data: { role: dto.role },
                });
                // Replaced outright, and dropped entirely for a role that is
                // not REVIEWER: a stale grant would keep a former reviewer's
                // access to a site after they were moved off it.
                await tx.siteReviewer.deleteMany({
                    where: {
                        organizationId: ctx.organizationId,
                        userId,
                        ...(siteIds.length > 0
                            ? { siteId: { notIn: siteIds } }
                            : {}),
                    },
                });
                for (const siteId of siteIds) {
                    await tx.siteReviewer.upsert({
                        where: { siteId_userId: { siteId, userId } },
                        create: {
                            organizationId: ctx.organizationId,
                            siteId,
                            userId,
                            grantedByUserId: ctx.userId,
                        },
                        update: {},
                    });
                }
            },
            { isolationLevel: "Serializable" },
        );

        await this.audit.record({
            action: AuditAction.MembershipRoleUpdate,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "membership",
            targetId: userId,
            outcome: AuditOutcome.Success,
            metadata: {
                from: membership.role,
                to: dto.role,
                siteCount: siteIds.length,
            },
        });

        return { userId, role: dto.role, siteIds };
    }

    /**
     * Remove someone from the organization.
     *
     * Their share links go with them (#284): a preview link is a URL that works
     * for anyone holding it, so leaving a departed member's links live would
     * hand them a way back into a draft they can no longer open.
     *
     * Their notes and approvals stay. Those are a record of what was said
     * about the site, and deleting them would rewrite the review history.
     */
    async remove(ctx: OrganizationContext, userId: string) {
        authorize(ctx, "member:remove");

        const membership = await this.requireMembership(ctx, userId);
        await this.assertWithinReach(ctx, membership.role, "remove", {
            mustExist: false,
        });
        if (membership.role === "OWNER") {
            await this.assertNotLastOwner(ctx.organizationId, userId, "remove");
        }

        const revokedLinks = await prisma.$transaction(
            async (tx) => {
                await tx.membership.delete({
                    where: {
                        organizationId_userId: {
                            organizationId: ctx.organizationId,
                            userId,
                        },
                    },
                });
                await tx.siteReviewer.deleteMany({
                    where: { organizationId: ctx.organizationId, userId },
                });
                const { count } = await tx.sitePreviewLink.updateMany({
                    where: {
                        organizationId: ctx.organizationId,
                        createdByUserId: userId,
                        revokedAt: null,
                    },
                    data: { revokedAt: new Date() },
                });
                return count;
            },
            { isolationLevel: "Serializable" },
        );

        await this.audit.record({
            action: AuditAction.MembershipRemove,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "membership",
            targetId: userId,
            outcome: AuditOutcome.Success,
            metadata: { role: membership.role, revokedLinks },
        });

        return { removed: true, revokedLinks };
    }

    // -----------------------------------------------------------------------

    private async requireMembership(ctx: OrganizationContext, userId: string) {
        const membership = await prisma.membership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId: ctx.organizationId,
                    userId,
                },
            },
            select: { role: true },
        });
        if (!membership) {
            throw new NotFoundException(
                "That person is not in this workspace.",
            );
        }
        return membership;
    }

    /**
     * The S1-006 invariant: an organization always has an OWNER.
     *
     * Without it an ADMIN could demote the only owner — or the last owner could
     * remove themselves — and leave a workspace nobody can delete, bill or hand
     * on.
     */
    private async assertNotLastOwner(
        organizationId: string,
        userId: string,
        what: "demote" | "remove",
    ) {
        const otherOwners = await prisma.membership.count({
            where: { organizationId, role: "OWNER", userId: { not: userId } },
        });
        if (otherOwners === 0) {
            throw new BadRequestException(
                `This is the workspace's only owner. Make someone else an owner first, then ${what} this one.`,
            );
        }
    }

    /**
     * Sites a grant may name: required for REVIEWER, refused for anyone else,
     * and each one proven to be in this org so an id from another tenant
     * cannot be granted.
     */
    private async resolveSiteIds(
        ctx: OrganizationContext,
        // Any role key: only REVIEWER takes site grants, and an invented
        // role never does — its site access is whatever it was granted.
        role: string,
        siteIds: string[] | undefined,
    ): Promise<string[]> {
        const wanted = [...new Set(siteIds ?? [])];
        if (role !== "REVIEWER") {
            if (wanted.length > 0) {
                throw new BadRequestException(
                    "Only a reviewer is given particular sites.",
                );
            }
            return [];
        }
        if (wanted.length === 0) {
            throw new BadRequestException(
                "Choose at least one site for this reviewer to review.",
            );
        }
        const found = await prisma.site.findMany({
            where: {
                id: { in: wanted },
                organizationId: ctx.organizationId,
                deletedAt: null,
            },
            select: { id: true },
        });
        if (found.length !== wanted.length) {
            throw new NotFoundException("One of those sites no longer exists.");
        }
        return found.map((s) => s.id);
    }

    /**
     * Refuse to act on a role that can do more than the actor can.
     *
     * The rule roles need once a business can invent them. `member:role:update`
     * can be granted to a role like "Stock clerk"; without this, whoever holds
     * it could give themselves Owner, or demote the Owner, and the owner who
     * granted it would have handed over the business by ticking one box. The
     * catalogue WARNS about that permission; this is what makes the warning
     * true rather than merely honest.
     *
     * It also changes one thing for the built-ins, deliberately: an Admin can
     * no longer make someone an Owner, because Owner can close the business
     * and Admin cannot. An Owner is still made by an Owner.
     *
     * `mustExist` is false for a person's CURRENT role, which may name a role
     * that has since been removed — that resolves to the read-only floor
     * rather than blocking anyone from ever changing them again.
     */
    private async assertWithinReach(
        ctx: OrganizationContext,
        roleKey: string,
        verb: string,
        { mustExist = true }: { mustExist?: boolean } = {},
    ): Promise<void> {
        const theirs = await this.actionsOf(
            ctx.organizationId,
            roleKey,
            mustExist,
        );
        const beyond = [...theirs].filter((a) => !allows(ctx, a));
        if (beyond.length > 0) {
            throw new ForbiddenException(
                `You cannot ${verb} a role that can do more than you can.`,
            );
        }
    }

    /** What a role in this business may do; 400 if it must exist and does not. */
    private async actionsOf(
        organizationId: string,
        roleKey: string,
        mustExist: boolean,
    ): Promise<ReadonlySet<OrgAction>> {
        if (isBuiltInRole(roleKey)) return resolveCapabilities(roleKey);
        const row = await prisma.organizationRole.findUnique({
            where: { organizationId_key: { organizationId, key: roleKey } },
            select: { actions: true },
        });
        if (!row && mustExist) {
            throw new BadRequestException({
                message: "That role does not exist in this business.",
                field: "role",
            });
        }
        return resolveCapabilities(roleKey, row?.actions);
    }
}

/** Narrow a stored role string, defaulting the unrecognized to MEMBER. */
function toRole(role: string): OrgRole {
    return role === "OWNER" || role === "ADMIN" || role === "REVIEWER"
        ? role
        : "MEMBER";
}
