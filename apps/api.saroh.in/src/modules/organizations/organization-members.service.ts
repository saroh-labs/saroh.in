import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { ensureCalendarOnlyRole, prisma } from "@saroh/database";
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
import { openInvitations } from "../billing/metering";
import { planMeter } from "../billing/metering.service";
import type { SeatKind } from "../billing/seats";
import {
    BOOKABLE_STAFF,
    countedOnDiary,
    roleActionsOf,
    seatKindOf,
    seatModule,
    seatOf,
} from "../billing/seats";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import { isCalendarOnly } from "./calendar-only-role";
import { CAPABILITY_BY_ACTION } from "./capability-catalogue";
import type { DiaryPerson } from "./diary-invite";
import {
    assertDiaryInvitable,
    inviteRoleFor,
    joinsBookable,
    linkDiaryPerson,
} from "./diary-invite";
import { hashInviteToken } from "./invite-token";
import type {
    InviteMemberDto,
    SetExtraActionsDto,
    UpdateMemberRoleDto,
} from "./members.dto";
import type { OrgAction } from "./organization-actions";
import {
    allows,
    authorize,
    extraActionsFor,
    isBuiltInRole,
    isNeverExtra,
    outOfReach,
    resolveCapabilities,
    REVIEWER_EXTRA_ACTIONS,
    withinReach,
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
    /**
     * When this person last used Saroh — the newest `Session.updatedAt` they
     * hold — or `null` when they hold no session (never signed in, or every
     * session has expired and been cleared).
     *
     * Sessions belong to a person, not to a business, so this is their last
     * activity anywhere in Saroh, not in this organization. Accepted: the
     * roster asks "is this person still around?", and Saroh has no per-
     * business activity record to answer it more narrowly. Better Auth moves
     * `updatedAt` at sign-in and when it refreshes a session (at most daily),
     * so it is a floor — they were here at least this recently.
     *
     * Only for a viewer who may remove people (`member:remove`, Owner and
     * Admin by default): whether someone still needs access is theirs to
     * ask. Everyone else gets `null` — a colleague's Saroh-wide activity is
     * not the whole team's to watch.
     */
    lastActiveAt: Date | null;
    /**
     * The storefronts this person works on, and their role at each (Admin,
     * Manager, Editor or Viewer; DEC-048). A narrower grant on top of their
     * business role: Team shows it under their name. Closed storefronts are
     * left out.
     */
    storefronts: StorefrontRoleView[];
    /**
     * What this person holds beyond their role (F17, DEC-039): their extra
     * permissions as action keys, leaving out any their role already grants
     * (an extra the role gives is not an extra) and anything that can't be
     * held as one. Empty for almost everyone; Team shows its column only
     * when someone has one.
     */
    extraActions: OrgAction[];
    /**
     * Whether they use one of the plan's team seats (DEC-105): their role or
     * extras can change something, or they take bookings. False for someone
     * who can only look, who counts toward the plan's view-only people.
     */
    usesSeat: boolean;
}

export interface StorefrontRoleView {
    storeId: string;
    name: string;
    role: string;
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
    /**
     * Whether the role invited to uses a team seat (DEC-105) — or the
     * person does: someone on the diary takes bookings whatever the role.
     */
    usesSeat: boolean;
    /** The person on the diary it gives a login to (#868), if any. */
    staff: { id: string; name: string } | null;
    /**
     * Already counted as that diary person, who takes bookings with no
     * login and so holds a seat (#868): Team doesn't count the invite again.
     */
    countedOnDiary: boolean;
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
        const seesActivity = allows(ctx, "member:remove");

        const [memberships, grants, storefrontRoles, sessions, roleRows] =
            await Promise.all([
                prisma.membership.findMany({
                    where: { organizationId: ctx.organizationId },
                    select: {
                        userId: true,
                        role: true,
                        extraActions: true,
                        user: { select: { name: true, email: true } },
                        // On the diary: someone who takes bookings uses a
                        // seat whatever their role (DEC-105).
                        staffMember: { select: { status: true } },
                    },
                }),
                prisma.siteReviewer.findMany({
                    where: { organizationId: ctx.organizationId },
                    select: { userId: true, siteId: true },
                }),
                // One read for the roster's storefront roles (DEC-048).
                prisma.storeMembers.findMany({
                    where: {
                        store: {
                            organizationId: ctx.organizationId,
                            deletedAt: null,
                        },
                    },
                    orderBy: { createdAt: "asc" },
                    select: {
                        userId: true,
                        role: true,
                        store: { select: { id: true, name: true } },
                    },
                }),
                // One grouped read for the whole roster, not one per person —
                // and none for a viewer who is not shown it.
                seesActivity
                    ? prisma.session.groupBy({
                          by: ["userId"],
                          where: {
                              user: {
                                  memberships: {
                                      some: {
                                          organizationId: ctx.organizationId,
                                      },
                                  },
                              },
                          },
                          _max: { updatedAt: true },
                      })
                    : Promise.resolve([]),
                // The business's own roles, to leave out of each person's
                // extras whatever their role already grants (F17).
                prisma.organizationRole.findMany({
                    where: { organizationId: ctx.organizationId },
                    select: { key: true, actions: true },
                }),
            ]);

        const roleActions = roleActionsOf(roleRows);
        const lastActive = new Map(
            sessions.map((s) => [s.userId, s._max.updatedAt]),
        );

        const byUser = new Map<string, string[]>();
        for (const grant of grants) {
            byUser.set(grant.userId, [
                ...(byUser.get(grant.userId) ?? []),
                grant.siteId,
            ]);
        }
        const storefrontsOf = new Map<string, StorefrontRoleView[]>();
        for (const s of storefrontRoles) {
            storefrontsOf.set(s.userId, [
                ...(storefrontsOf.get(s.userId) ?? []),
                { storeId: s.store.id, name: s.store.name, role: s.role },
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
            lastActiveAt: lastActive.get(m.userId) ?? null,
            storefronts: storefrontsOf.get(m.userId) ?? [],
            // A built-in's permissions are the shipped policy (a stored row
            // for one is a rename at most), as the reach checks read them.
            extraActions: extrasBeyondRole(
                m.role,
                isBuiltInRole(m.role) ? null : roleActions.get(m.role),
                m.extraActions,
            ),
            usesSeat:
                seatOf(
                    roleActions,
                    m.role,
                    m.extraActions,
                    m.staffMember?.status === BOOKABLE_STAFF,
                ) === "seat",
        }));
    }

    /**
     * Invitations that have not been accepted yet. Gated on `member:invite`,
     * not `member:read`: the roster is a floor every role sees, while who has
     * been asked and not yet answered is the inviter's business.
     */
    async listInvitations(ctx: OrganizationContext): Promise<InvitationView[]> {
        authorize(ctx, "member:invite");

        const [invitations, roleRows] = await Promise.all([
            prisma.organizationInvitation.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    status: "PENDING",
                },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    email: true,
                    role: true,
                    siteIds: true,
                    status: true,
                    expiresAt: true,
                    createdAt: true,
                    // Who on the diary it gives a login to (#868).
                    staffMember: {
                        select: {
                            id: true,
                            name: true,
                            status: true,
                            membershipId: true,
                        },
                    },
                },
            }),
            prisma.organizationRole.findMany({
                where: { organizationId: ctx.organizationId },
                select: { key: true, actions: true },
            }),
        ]);
        const roleActions = roleActionsOf(roleRows);
        // No token, hashed or otherwise. It is in the invitee's inbox and
        // nowhere else; a roster screen is not a place to re-read it from.
        return invitations.map(({ staffMember, ...i }) => ({
            ...i,
            role: toRole(i.role),
            roleKey: i.role,
            // Someone joining to take bookings uses a seat whatever the
            // role (DEC-105).
            usesSeat:
                seatOf(
                    roleActions,
                    i.role,
                    undefined,
                    joinsBookable(staffMember),
                ) === "seat",
            staff: staffMember
                ? { id: staffMember.id, name: staffMember.name }
                : null,
            countedOnDiary: countedOnDiary(staffMember),
        }));
    }

    /**
     * Invite someone by email. Re-inviting the same address refreshes the
     * invitation in place — role, sites, token and expiry — rather than
     * stacking rows, so the newest email is the one that works.
     */
    async invite(ctx: OrganizationContext, dto: InviteMemberDto) {
        authorize(ctx, "member:invite");
        // Someone on the diary given a login (#868): checked first, and
        // Calendar only unless another role was picked.
        const staff = dto.staffId
            ? await this.diaryPersonToInvite(ctx, dto.staffId, dto.email)
            : null;
        const role = inviteRoleFor(dto);
        if (isCalendarOnly(role)) {
            // The role the default names exists before it is checked.
            await ensureCalendarOnlyRole(prisma, ctx.organizationId);
        }
        await this.assertWithinReach(ctx, role, "invite someone as");

        const siteIds = await this.resolveSiteIds(ctx, role, dto.siteIds);

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
        // The plan's team seats count people and open invitations whose
        // role can change something (DEC-105): a new invitation is checked;
        // sending a live one again adds nobody. A role that only looks is
        // checked against the plan's view-only people instead, the same way.
        // Someone on the diary joins taking bookings, so on a seat whatever
        // the role — and, with no login yet, already holds it (#868).
        const kind = await this.seatKindFor(
            ctx.organizationId,
            role,
            undefined,
            joinsBookable(staff),
        );
        const invitation = await planMeter.withRoom(
            ctx.organizationId,
            seatModule(kind),
            (tx) =>
                tx.organizationInvitation.upsert({
                    where: {
                        organizationId_email: {
                            organizationId: ctx.organizationId,
                            email: dto.email,
                        },
                    },
                    create: {
                        organizationId: ctx.organizationId,
                        email: dto.email,
                        role,
                        siteIds,
                        staffId: staff?.id ?? null,
                        tokenHash: hashInviteToken(token),
                        invitedByUserId: ctx.userId,
                        expiresAt,
                    },
                    update: {
                        role,
                        siteIds,
                        // Sent again without a diary person keeps the one
                        // it names; with one, names that.
                        ...(staff ? { staffId: staff.id } : {}),
                        tokenHash: hashInviteToken(token),
                        invitedByUserId: ctx.userId,
                        expiresAt,
                        status: "PENDING",
                        acceptedAt: null,
                    },
                    select: {
                        id: true,
                        email: true,
                        role: true,
                        expiresAt: true,
                    },
                }),
            {
                // A live invitation of the same kind already counts this person.
                addingIn: async (tx) => {
                    // Taking bookings with no login, they hold a seat
                    // already: the invite is them, not one more (#868).
                    if (staff && !staff.membershipId && joinsBookable(staff)) {
                        return 0;
                    }
                    const live = await tx.organizationInvitation.findFirst({
                        where: {
                            organizationId: ctx.organizationId,
                            email: dto.email,
                            status: "PENDING",
                            expiresAt: { gt: new Date() },
                        },
                        select: { role: true },
                    });
                    if (!live) return 1;
                    const was = await this.seatKindFor(
                        ctx.organizationId,
                        live.role,
                    );
                    return was === kind ? 0 : 1;
                },
            },
        );

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
            actorRoleKey: ctx.roleKey,
            organizationId: ctx.organizationId,
            targetType: "invitation",
            targetId: invitation.id,
            outcome: AuditOutcome.Success,
            // The role and how many sites, never the invitee's address.
            metadata: {
                role,
                siteCount: siteIds.length,
                // That it names someone on the diary; not who.
                ...(staff ? { onDiary: true } : {}),
            },
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
                staffId: true,
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

        // The role as invited: a built-in, or a role the business made
        // (UX-004). Narrowing a made role to MEMBER here is how "Front desk"
        // joined as a Member everywhere, its permissions never reaching them.
        const roleKey = await invitedRoleKey(
            invitation.organizationId,
            invitation.role,
        );
        const role = toRole(roleKey);
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

        let linkedStaff = false;
        await prisma.$transaction(async (tx) => {
            // Calendar only exists before anyone holds it (#868): a key
            // with no row would read as the role's list, but Team names a
            // role by its row.
            if (isCalendarOnly(roleKey)) {
                await ensureCalendarOnlyRole(tx, invitation.organizationId);
            }
            const membership = await tx.membership.upsert({
                where: {
                    organizationId_userId: {
                        organizationId: invitation.organizationId,
                        userId: user.id,
                    },
                },
                create: {
                    organizationId: invitation.organizationId,
                    userId: user.id,
                    role: roleKey,
                },
                update: { role: roleKey },
                select: { id: true },
            });
            // The diary person this login is for (#868): theirs now.
            if (invitation.staffId) {
                linkedStaff = await linkDiaryPerson(
                    tx,
                    invitation.organizationId,
                    invitation.staffId,
                    membership.id,
                );
            }
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
            // The team's "Someone joins the team" (F14), with the join.
            await enqueueTeamAlert(tx, invitation.organizationId, {
                event: "team",
                userId: user.id,
                invitationId: invitation.id,
            });
        });

        await this.audit.record({
            action: AuditAction.MembershipAccept,
            actorUserId: user.id,
            organizationId: invitation.organizationId,
            targetType: "membership",
            targetId: user.id,
            outcome: AuditOutcome.Success,
            metadata: {
                role: roleKey,
                siteCount: sites.length,
                ...(invitation.staffId ? { linkedStaff } : {}),
            },
        });

        return {
            organizationId: invitation.organizationId,
            organization: invitation.organization,
            role,
            roleKey,
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
        // The person as they stand counts their extras (F17): someone given
        // more than their role is judged on everything they can do.
        await this.assertWithinReach(ctx, membership.role, "change", {
            mustExist: false,
            extras: membership.extraActions,
        });
        await this.assertWithinReach(ctx, dto.role, "give someone");
        const siteIds = await this.resolveSiteIds(ctx, dto.role, dto.siteIds);
        if (membership.role === "OWNER" && dto.role !== "OWNER") {
            await this.assertNotLastOwner(ctx.organizationId, userId, "demote");
        }
        // A Reviewer holds nothing beyond the website (DEC-006): moving
        // someone to Reviewer drops any extra that isn't a review power.
        const kept = extraActionsFor(dto.role, membership.extraActions);
        const extrasChanged = kept.length !== membership.extraActions.length;

        // Someone who only looks uses no team seat (DEC-105): moved to a
        // role that can change something, they are one more seat; moved the
        // other way, one more view-only person. Checked first on the
        // transaction, as it takes the meter's lock.
        const bookable = membership.staffMember?.status === BOOKABLE_STAFF;
        const [was, becomes] = await Promise.all([
            this.seatKindFor(
                ctx.organizationId,
                membership.role,
                membership.extraActions,
                bookable,
            ),
            this.seatKindFor(ctx.organizationId, dto.role, kept, bookable),
        ]);

        await prisma.$transaction(
            async (tx) => {
                if (was !== becomes) {
                    await planMeter.roomInTx(
                        tx,
                        ctx.organizationId,
                        seatModule(becomes),
                    );
                }
                await tx.membership.update({
                    where: {
                        organizationId_userId: {
                            organizationId: ctx.organizationId,
                            userId,
                        },
                    },
                    data: {
                        role: dto.role,
                        ...(extrasChanged ? { extraActions: kept } : {}),
                    },
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
            actorRoleKey: ctx.roleKey,
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
     * Set a person's extra permissions: the whole list they should hold
     * beyond their role (F17, DEC-039; permission matrix §5).
     *
     * `member:role:update` is necessary, not sufficient. The reach rule holds
     * for every actor, an Owner included:
     *
     *  - nobody changes their own extras — an owner who wants more changes
     *    role, through someone else;
     *  - nobody changes the extras of someone who can already do more than
     *    they can (the person's role AND current extras, implied holds
     *    counted), the rule role changes already follow;
     *  - nobody gives what they don't hold: everything the person could do
     *    afterwards must be within the actor's reach, implied holds counted,
     *    so an extra can't carry a power it implies past the rule;
     *  - an owner-only power (closing the business) is never an extra, and a
     *    Reviewer is given nothing beyond reviewing websites (DEC-006).
     *
     * An extra the role already grants is not stored. Taking one away is
     * always within reach once the person is. The write is conditional on the
     * role and the list being as they were checked, so a change made by
     * someone else in between is never silently overwritten. Every change is
     * audited, naming who made it, what was given and what was taken away.
     */
    async setExtraActions(
        ctx: OrganizationContext,
        userId: string,
        dto: SetExtraActionsDto,
    ) {
        if (!allows(ctx, "member:role:update")) {
            throw new ForbiddenException(
                "Your role can't change what people can do.",
            );
        }
        if (userId === ctx.userId) {
            throw new ForbiddenException(
                "Your role can't change your own permissions — no role can. Ask someone else on the team.",
            );
        }

        const membership = await this.requireMembership(ctx, userId);
        const wanted = [...new Set(dto.actions)].filter((a): a is OrgAction =>
            CAPABILITY_BY_ACTION.has(a as OrgAction),
        );

        const ownerOnly = wanted.filter(isNeverExtra);
        if (ownerOnly.length > 0) {
            throw new BadRequestException(
                `${listed(labelsOf(ownerOnly))} stays with the owner. It can't be given as an extra permission.`,
            );
        }
        if (
            membership.role === "REVIEWER" &&
            wanted.some((a) => !REVIEWER_EXTRA_ACTIONS.includes(a))
        ) {
            throw new BadRequestException(
                "A reviewer only looks at the websites they were asked to review, so they can't be given anything beyond that.",
            );
        }

        const { organizationId } = ctx;
        const [roleSet, before] = await Promise.all([
            this.actionsOf(organizationId, membership.role, false),
            this.actionsOf(
                organizationId,
                membership.role,
                false,
                membership.extraActions,
            ),
        ]);
        if (!withinReach(ctx, before)) {
            throw new ForbiddenException(
                "Your role can't change the permissions of someone who can do more than you can.",
            );
        }

        const next = wanted.filter((a) => !roleSet.has(a)).sort();
        const after = await this.actionsOf(
            organizationId,
            membership.role,
            false,
            next,
        );
        const beyond = outOfReach(ctx, after);
        if (beyond.length > 0) {
            const ticked = beyond.filter((a) => next.includes(a));
            throw new ForbiddenException(
                `Your role can't give a permission you don't have: ${listed(labelsOf(ticked.length > 0 ? ticked : beyond))}.`,
            );
        }

        const current = extraActionsFor(
            membership.role,
            membership.extraActions,
        ).filter((a) => !roleSet.has(a));
        const given = next.filter((a) => !current.includes(a));
        const taken = current.filter((a) => !next.includes(a));
        if (given.length === 0 && taken.length === 0) {
            return { userId, extraActions: next };
        }
        // Giving someone more than their role is a role of their own, the
        // plan's "Custom roles" row (UX-030): refused where the plan leaves
        // it off. Taking extras away never asks, so a business that moved
        // down can still tidy up.
        if (given.length > 0) {
            await planMeter.assertIncluded(organizationId, "roles");
        }
        // An extra that changes something takes a view-only person onto a
        // team seat (DEC-105): checked as the change is written.
        const bookable = membership.staffMember?.status === BOOKABLE_STAFF;
        const joinsSeats =
            seatKindOf(before, bookable) === "viewOnly" &&
            seatKindOf(after, bookable) === "seat";

        const { count } = await planMeter.withRoom(
            organizationId,
            "members",
            (tx) =>
                tx.membership.updateMany({
                    where: {
                        organizationId,
                        userId,
                        role: membership.role,
                        extraActions: { equals: membership.extraActions },
                    },
                    data: { extraActions: next },
                }),
            { adding: joinsSeats ? 1 : 0 },
        );
        if (count === 0) {
            throw new ConflictException(
                "Someone changed this person's role or permissions while you were editing. Reload to see them, then try again.",
            );
        }

        await this.audit.record({
            action: AuditAction.MembershipExtrasUpdate,
            actorUserId: ctx.userId,
            actorRoleKey: ctx.roleKey,
            organizationId,
            targetType: "membership",
            targetId: userId,
            outcome: AuditOutcome.Success,
            // Keys to read back, labels to say in Activity as they were
            // called when it happened.
            metadata: {
                role: membership.role,
                given,
                taken,
                givenLabels: labelsOf(given),
                takenLabels: labelsOf(taken),
            },
        });

        return { userId, extraActions: next };
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
     *
     * Their storefront roles go too (DEC-048): one roster underneath, so
     * someone off the team is off every storefront of this business. Deleted
     * in the same serializable transaction as the last-owner check, so a
     * refused removal leaves every storefront role where it was. Their
     * storefront invitations still pending are revoked with them.
     */
    async remove(ctx: OrganizationContext, userId: string) {
        authorize(ctx, "member:remove");

        const membership = await this.requireMembership(ctx, userId);
        await this.assertWithinReach(ctx, membership.role, "remove", {
            mustExist: false,
            extras: membership.extraActions,
        });
        if (membership.role === "OWNER") {
            await this.assertNotLastOwner(ctx.organizationId, userId, "remove");
        }

        const { revokedLinks, storefrontRoles } = await prisma.$transaction(
            async (tx) => {
                if (membership.role === "OWNER") {
                    // Again inside the transaction: two owners removing each
                    // other at once must not both pass.
                    await this.assertNotLastOwner(
                        ctx.organizationId,
                        userId,
                        "remove",
                        tx,
                    );
                }
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
                // Closed storefronts included: a storefront reopened later
                // must not bring a removed person back with it.
                const storefronts = await tx.storeMembers.deleteMany({
                    where: {
                        userId,
                        store: { organizationId: ctx.organizationId },
                    },
                });
                // Their storefront invites still waiting go too: accepting
                // one would put them back on the team (F16).
                const person = await tx.user.findUnique({
                    where: { id: userId },
                    select: { email: true },
                });
                if (person?.email) {
                    await tx.storeInvitation.updateMany({
                        where: {
                            status: "PENDING",
                            email: {
                                equals: person.email,
                                mode: "insensitive",
                            },
                            store: { organizationId: ctx.organizationId },
                        },
                        data: { status: "REVOKED" },
                    });
                }
                return {
                    revokedLinks: count,
                    storefrontRoles: storefronts.count,
                };
            },
            { isolationLevel: "Serializable" },
        );

        await this.audit.record({
            action: AuditAction.MembershipRemove,
            actorUserId: ctx.userId,
            actorRoleKey: ctx.roleKey,
            organizationId: ctx.organizationId,
            targetType: "membership",
            targetId: userId,
            outcome: AuditOutcome.Success,
            metadata: { role: membership.role, revokedLinks, storefrontRoles },
        });

        return { removed: true, revokedLinks, storefrontRoles };
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
            select: {
                role: true,
                extraActions: true,
                staffMember: { select: { status: true } },
            },
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
        db: Pick<typeof prisma, "membership"> = prisma,
    ) {
        const otherOwners = await db.membership.count({
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
     * role editor asks the same question of what a role may be given (F19);
     * both go through `withinReach` in the policy.
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
        {
            mustExist = true,
            extras,
        }: { mustExist?: boolean; extras?: readonly string[] } = {},
    ): Promise<void> {
        const theirs = await this.actionsOf(
            ctx.organizationId,
            roleKey,
            mustExist,
            extras,
        );
        if (!withinReach(ctx, theirs)) {
            throw new ForbiddenException(
                extras && extraActionsFor(roleKey, extras).length > 0
                    ? `You cannot ${verb} someone who can do more than you can.`
                    : `You cannot ${verb} a role that can do more than you can.`,
            );
        }
    }

    /**
     * The diary person an invite gives a login to (#868): this business's,
     * with no login yet, and no other invite out for them. Refused in
     * words otherwise.
     */
    private async diaryPersonToInvite(
        ctx: OrganizationContext,
        staffId: string,
        email: string,
    ): Promise<DiaryPerson> {
        const person = await prisma.staffMember.findFirst({
            where: { id: staffId, organizationId: ctx.organizationId },
            select: { id: true, name: true, status: true, membershipId: true },
        });
        const other = person
            ? await prisma.organizationInvitation.findFirst({
                  where: {
                      organizationId: ctx.organizationId,
                      staffId,
                      email: { not: email },
                      ...openInvitations(new Date()),
                  },
                  select: { email: true },
              })
            : null;
        assertDiaryInvitable(person, other?.email ?? null);
        return person as DiaryPerson;
    }

    /**
     * Whether someone at this role, with these extras, uses a team seat or
     * is view-only (DEC-105): by what they can do, never the role's name.
     */
    private async seatKindFor(
        organizationId: string,
        roleKey: string,
        extras?: readonly string[],
        bookable = false,
    ): Promise<SeatKind> {
        return seatKindOf(
            await this.actionsOf(organizationId, roleKey, false, extras),
            bookable,
        );
    }

    /**
     * What a role in this business may do, with a person's extras when
     * given (F17); 400 if the role must exist and does not.
     */
    private async actionsOf(
        organizationId: string,
        roleKey: string,
        mustExist: boolean,
        extras?: readonly string[],
    ): Promise<ReadonlySet<OrgAction>> {
        if (isBuiltInRole(roleKey)) {
            return resolveCapabilities(roleKey, null, extras);
        }
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
        return resolveCapabilities(roleKey, row?.actions, extras);
    }
}

/**
 * A person's extras that add something: what can be held as an extra
 * (`extraActionsFor`), less whatever their role already grants. An extra the
 * role gives is not an extra; Team never shows one as such.
 */
function extrasBeyondRole(
    roleKey: string,
    stored: readonly string[] | null | undefined,
    extras: readonly string[],
): OrgAction[] {
    const own = extraActionsFor(roleKey, extras);
    if (own.length === 0) return [];
    const role = resolveCapabilities(roleKey, stored);
    return own.filter((a) => !role.has(a)).sort();
}

/** Permissions as the owner reads them: "Refund orders, See invoices". */
function labelsOf(actions: readonly OrgAction[]): string[] {
    return actions.map((a) => CAPABILITY_BY_ACTION.get(a)?.label ?? a);
}

/** "Refund orders, See invoices and Export orders". */
function listed(labels: readonly string[]): string {
    return new Intl.ListFormat("en", { type: "conjunction" }).format(labels);
}

/**
 * The role key a membership made from an invitation holds: the built-in it
 * names, or the business's own role when it still exists. A role removed
 * since the invite was sent leaves the read-only floor (MEMBER), which is
 * what a dangling key would resolve to anyway — stored as MEMBER, so Team
 * names it rather than showing a key nobody can pick.
 */
export async function invitedRoleKey(
    organizationId: string,
    invited: string,
): Promise<string> {
    if (isBuiltInRole(invited)) return invited;
    // Shipped, and made in the accept's transaction if it isn't there
    // (#868): never the floor, which reads the whole diary.
    if (isCalendarOnly(invited)) return invited;
    const made = await prisma.organizationRole.findUnique({
        where: { organizationId_key: { organizationId, key: invited } },
        select: { key: true },
    });
    return made?.key ?? "MEMBER";
}

/** Narrow a stored role string, defaulting the unrecognized to MEMBER. */
function toRole(role: string): OrgRole {
    return role === "OWNER" || role === "ADMIN" || role === "REVIEWER"
        ? role
        : "MEMBER";
}
