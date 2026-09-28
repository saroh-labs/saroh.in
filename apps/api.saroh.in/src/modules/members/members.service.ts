import { randomBytes } from "node:crypto";

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendStoreInvitationEmail } from "../../common/email";
import { env } from "../../env";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { allows, outOfReach } from "../organizations/organization-policy";
import {
    joinTeamFromStorefront,
    STOREFRONT_TEAM_ROLE_KEY,
    STOREFRONT_TEAM_ROLE_LABEL,
    storefrontTeamCapabilities,
} from "../organizations/storefront-team-role";
import type { MemberRole } from "./dto";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Store team management — owners (StoreOwner) and staff (StoreMembers), plus
 * email invitations (StoreInvitation). Like StoresService, every method takes
 * an explicit caller `userId` resolved from the session, never client input.
 * Management actions require the caller to be a StoreOwner; the store's
 * existence is never leaked to non-members (404, not 403).
 *
 * One roster underneath (DEC-048, F16): a storefront's people are on the
 * business's team. Inviting someone to a storefront therefore also needs
 * `member:invite` in the business, within the inviter's reach, and
 * accepting puts them on the team as "Storefront team" unless they are on
 * it already. What they do inside the storefront still comes from their
 * storefront role.
 */
@Injectable()
export class MembersService {
    constructor(
        // Optional so the specs that build this with no arguments keep
        // working; it holds no state.
        @Optional()
        private readonly contexts: OrganizationContextService = new OrganizationContextService(),
    ) {}

    /** True if the caller owns the store (StoreOwner row exists). */
    private async isOwner(storeId: string, userId: string): Promise<boolean> {
        const owner = await prisma.storeOwner.findUnique({
            where: { storeId_userId: { storeId, userId } },
        });
        return Boolean(owner);
    }

    /** True if the caller is an owner or a staff member of the store. */
    private async hasAccess(storeId: string, userId: string): Promise<boolean> {
        if (await this.isOwner(storeId, userId)) return true;
        const member = await prisma.storeMembers.findUnique({
            where: { storeId_userId: { storeId, userId } },
        });
        return Boolean(member);
    }

    /** Throw 404 (no existence leak) unless the caller owns the store. */
    private async requireOwner(storeId: string, userId: string): Promise<void> {
        if (!(await this.isOwner(storeId, userId))) {
            throw new NotFoundException("Store not found");
        }
    }

    /** The team: owners + staff, each with their user's email/name. */
    async listMembers(storeId: string, callerId: string) {
        if (!(await this.hasAccess(storeId, callerId))) {
            throw new NotFoundException("Store not found");
        }

        const [owners, members] = await Promise.all([
            prisma.storeOwner.findMany({
                where: { storeId },
                include: { user: { select: { email: true, name: true } } },
            }),
            prisma.storeMembers.findMany({
                where: { storeId },
                include: { user: { select: { email: true, name: true } } },
            }),
        ]);

        return [
            ...owners.map((o) => ({
                userId: o.userId,
                email: o.user.email,
                name: o.user.name,
                role: o.role,
                kind: "owner" as const,
            })),
            ...members.map((m) => ({
                userId: m.userId,
                email: m.user.email,
                name: m.user.name,
                role: m.role,
                kind: "member" as const,
            })),
        ];
    }

    /** Change a staff member's role. Owner only; owners aren't editable here. */
    async updateMemberRole(
        storeId: string,
        callerId: string,
        targetUserId: string,
        role: MemberRole,
    ) {
        await this.requireOwner(storeId, callerId);
        const member = await prisma.storeMembers.findUnique({
            where: { storeId_userId: { storeId, userId: targetUserId } },
        });
        if (!member) {
            throw new NotFoundException("Member not found");
        }
        await prisma.storeMembers.update({
            where: { id: member.id },
            data: { role },
        });
        return { userId: targetUserId, role };
    }

    /** Remove a staff member. Owner only. */
    async removeMember(
        storeId: string,
        callerId: string,
        targetUserId: string,
    ) {
        await this.requireOwner(storeId, callerId);
        const member = await prisma.storeMembers.findUnique({
            where: { storeId_userId: { storeId, userId: targetUserId } },
        });
        if (!member) {
            throw new NotFoundException("Member not found");
        }
        await prisma.storeMembers.delete({ where: { id: member.id } });
        return { userId: targetUserId };
    }

    /** Invite someone by email. Owner only. Sends the accept link by email. */
    async createInvitation(
        storeId: string,
        callerId: string,
        email: string,
        role: MemberRole,
    ) {
        await this.requireOwner(storeId, callerId);
        await this.assertMayBringOntoTeam(storeId, callerId);

        // Already a member? (matched by their account email, if they have one)
        const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });
        if (existingUser) {
            const alreadyOwner = await this.isOwner(storeId, existingUser.id);
            const alreadyMember = await prisma.storeMembers.findUnique({
                where: {
                    storeId_userId: { storeId, userId: existingUser.id },
                },
            });
            if (alreadyOwner || alreadyMember) {
                throw new ConflictException({
                    message: "That person is already on the team",
                    field: "email",
                });
            }
        }

        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

        // One live invite per (store, email): re-inviting refreshes it.
        const invitation = await prisma.storeInvitation.upsert({
            where: { storeId_email: { storeId, email } },
            create: {
                storeId,
                email,
                role,
                token,
                status: "PENDING",
                invitedById: callerId,
                expiresAt,
            },
            update: {
                role,
                token,
                status: "PENDING",
                invitedById: callerId,
                expiresAt,
            },
        });

        const store = await prisma.store.findUnique({
            where: { id: storeId },
            select: { name: true },
        });
        const appUrl = env.APP_URL ?? "https://app.saroh.localhost";
        await sendStoreInvitationEmail(
            email,
            `${appUrl}/invitations/${token}`,
            store?.name ?? "a store",
        );

        return {
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            status: invitation.status,
            expiresAt: invitation.expiresAt,
        };
    }

    /** Pending invitations for a store. Owner only. */
    async listInvitations(storeId: string, callerId: string) {
        await this.requireOwner(storeId, callerId);
        const invites = await prisma.storeInvitation.findMany({
            where: { storeId, status: "PENDING" },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
                expiresAt: true,
                createdAt: true,
            },
        });
        return invites;
    }

    /** Revoke a pending invitation. Owner only. */
    async revokeInvitation(
        storeId: string,
        callerId: string,
        invitationId: string,
    ) {
        await this.requireOwner(storeId, callerId);
        const invite = await prisma.storeInvitation.findFirst({
            where: { id: invitationId, storeId },
        });
        if (!invite) {
            throw new NotFoundException("Invitation not found");
        }
        await prisma.storeInvitation.update({
            where: { id: invite.id },
            data: { status: "REVOKED" },
        });
        return { id: invite.id };
    }

    /**
     * Accept an invitation. The accepting session's email MUST equal the
     * invited email (no open-token hijack). Creates a StoreMembers row
     * idempotently and marks the invite accepted. Returns the store id so the
     * caller can redirect into it.
     */
    async acceptInvitation(token: string, user: { id: string; email: string }) {
        const invite = await prisma.storeInvitation.findUnique({
            where: { token },
            include: {
                store: { select: { name: true, organizationId: true } },
            },
        });
        if (!invite || invite.status === "REVOKED") {
            throw new NotFoundException("Invitation not found");
        }
        if (invite.status === "ACCEPTED") {
            // Idempotent: already accepted by this user.
            return { storeId: invite.storeId };
        }
        if (invite.expiresAt.getTime() < Date.now()) {
            await prisma.storeInvitation.update({
                where: { id: invite.id },
                data: { status: "EXPIRED" },
            });
            throw new BadRequestException("This invitation has expired");
        }
        if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
            throw new ForbiddenException(
                "This invitation was sent to a different email",
            );
        }

        // Accepting puts them on the business's team (F16), so the inviter
        // must still be allowed to bring someone on — an invite sent before
        // that rule, or by someone whose reach has since shrunk, is not
        // enough on its own.
        try {
            await this.assertMayBringOntoTeam(
                invite.storeId,
                invite.invitedById,
            );
        } catch (err) {
            if (!(err instanceof ForbiddenException)) throw err;
            throw new ForbiddenException(
                "This invitation can no longer be accepted. Ask the business for a new one.",
            );
        }

        // Already an owner? Just mark accepted, don't add a staff row.
        const alreadyOwner = await this.isOwner(invite.storeId, user.id);
        // One transaction: the storefront role, the team membership and its
        // Activity entry land together or not at all (DEC-048).
        const outcome = await prisma.$transaction(async (tx) => {
            // Claimed first, and only while still PENDING: a revoke (or a
            // removal from the team) that landed meanwhile, or a second
            // accept, changes nothing here.
            const claimed = await tx.storeInvitation.updateMany({
                where: { id: invite.id, status: "PENDING" },
                data: { status: "ACCEPTED" },
            });
            if (claimed.count === 0) {
                const now = await tx.storeInvitation.findUnique({
                    where: { id: invite.id },
                    select: { status: true },
                });
                return now?.status === "ACCEPTED" ? "already" : "gone";
            }
            if (!alreadyOwner) {
                await tx.storeMembers.upsert({
                    where: {
                        storeId_userId: {
                            storeId: invite.storeId,
                            userId: user.id,
                        },
                    },
                    create: {
                        storeId: invite.storeId,
                        userId: user.id,
                        role: invite.role,
                    },
                    update: { role: invite.role },
                });
            }
            // On the business's team too, as Storefront team — unless they
            // are on it already, in which case their role stays as it is.
            await joinTeamFromStorefront(tx, {
                organizationId: invite.store.organizationId,
                userId: user.id,
                store: { id: invite.storeId, name: invite.store.name },
                source: "invite",
                actorUserId: user.id,
            });
            return "accepted";
        });
        if (outcome === "gone") {
            throw new NotFoundException("Invitation not found");
        }
        return { storeId: invite.storeId };
    }

    /**
     * Inviting someone to a storefront also brings them onto the business's
     * team, so it needs what inviting to the team needs: `member:invite` in
     * the business, and a role within the inviter's reach (F19) — here the
     * "Storefront team" role as the business has it, which the owner may
     * have widened. Checked after `requireOwner`, so a stranger still learns
     * nothing about the store.
     */
    private async assertMayBringOntoTeam(
        storeId: string,
        callerId: string,
    ): Promise<void> {
        const store = await prisma.store.findUnique({
            where: { id: storeId },
            select: { organizationId: true },
        });
        if (!store) throw new NotFoundException("Store not found");
        // Not on the business's team at all: a 403 like any other refusal.
        const ctx = await this.contexts
            .resolve(callerId, store.organizationId)
            .catch(() => null);
        if (!ctx || !allows(ctx, "member:invite")) {
            throw new ForbiddenException(
                "Inviting someone to a storefront also adds them to your team, and you can't invite people to the team. Ask an owner or admin.",
            );
        }
        const role = await prisma.organizationRole.findUnique({
            where: {
                organizationId_key: {
                    organizationId: store.organizationId,
                    key: STOREFRONT_TEAM_ROLE_KEY,
                },
            },
            select: { label: true, actions: true },
        });
        const beyond = outOfReach(
            ctx,
            storefrontTeamCapabilities(role?.actions),
        );
        if (beyond.length > 0) {
            throw new ForbiddenException(
                `Someone invited here joins your team as ${role?.label ?? STOREFRONT_TEAM_ROLE_LABEL}, and that role can do more than you can. Ask an owner or admin.`,
            );
        }
    }
}
