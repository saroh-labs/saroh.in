import { randomBytes } from "node:crypto";

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendStoreInvitationEmail } from "../../common/email";
import { env } from "../../env";
import type { MemberRole } from "./dto";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Store team management — owners (StoreOwner) and staff (StoreMembers), plus
 * email invitations (StoreInvitation). Like StoresService, every method takes
 * an explicit caller `userId` resolved from the session, never client input.
 * Management actions require the caller to be a StoreOwner; the store's
 * existence is never leaked to non-members (404, not 403).
 */
@Injectable()
export class MembersService {
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
        const appUrl = env.APP_URL ?? "http://localhost:3003";
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

        // Already an owner? Just mark accepted, don't add a staff row.
        const alreadyOwner = await this.isOwner(invite.storeId, user.id);
        if (!alreadyOwner) {
            await prisma.storeMembers.upsert({
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
        await prisma.storeInvitation.update({
            where: { id: invite.id },
            data: { status: "ACCEPTED" },
        });
        return { storeId: invite.storeId };
    }
}
