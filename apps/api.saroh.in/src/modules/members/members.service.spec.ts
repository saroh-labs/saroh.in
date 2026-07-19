import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { StoresService } from "../stores/stores.service";
import { MembersService } from "./members.service";

// Integration against the dev DB. Creates throwaway users + a store, cleans up.
const ownerEmail = `mem-owner-${process.pid}@example.com`;
const inviteeEmail = `mem-invitee-${process.pid}@example.com`;
const strangerEmail = `mem-stranger-${process.pid}@example.com`;

describe("MembersService (dev DB)", () => {
    const members = new MembersService();
    const stores = new StoresService(new FeatureFlagService());
    let ownerId = "";
    let inviteeId = "";
    let strangerId = "";
    let storeId = "";
    let orgId = "";

    beforeAll(async () => {
        ownerId = (await prisma.user.create({ data: { email: ownerEmail } }))
            .id;
        inviteeId = (
            await prisma.user.create({ data: { email: inviteeEmail } })
        ).id;
        strangerId = (
            await prisma.user.create({ data: { email: strangerEmail } })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: {
                    name: "Members Test Org",
                    slug: `memtest-org-${process.pid}`,
                },
            })
        ).id;
        const store = await stores.createForUser(ownerId, orgId, {
            name: "Members Test",
            slug: `memtest-${process.pid}`,
        });
        storeId = store.id;
    });

    afterAll(async () => {
        await prisma.storeInvitation.deleteMany({ where: { storeId } });
        await prisma.storeMembers.deleteMany({ where: { storeId } });
        await prisma.storeOwner.deleteMany({ where: { storeId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.organization.deleteMany({ where: { id: orgId } });
        await prisma.user.deleteMany({
            where: { email: { in: [ownerEmail, inviteeEmail, strangerEmail] } },
        });
        await prisma.$disconnect();
    });

    it("lets an owner invite by email and lists it pending", async () => {
        const invite = await members.createInvitation(
            storeId,
            ownerId,
            inviteeEmail,
            "EDITOR",
        );
        expect(invite.status).toBe("PENDING");
        expect(invite.role).toBe("EDITOR");
        const pending = await members.listInvitations(storeId, ownerId);
        expect(pending.some((i) => i.email === inviteeEmail)).toBe(true);
    });

    it("denies a non-owner from inviting (404, no leak)", async () => {
        await expect(
            members.createInvitation(
                storeId,
                strangerId,
                "x@example.com",
                "VIEWER",
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses accept when the session email differs", async () => {
        const inv = await prisma.storeInvitation.findFirst({
            where: { storeId, email: inviteeEmail },
        });
        await expect(
            members.acceptInvitation(inv!.token, {
                id: strangerId,
                email: strangerEmail,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("accepts on email match and creates a StoreMembers row", async () => {
        const inv = await prisma.storeInvitation.findFirst({
            where: { storeId, email: inviteeEmail },
        });
        const res = await members.acceptInvitation(inv!.token, {
            id: inviteeId,
            email: inviteeEmail,
        });
        expect(res.storeId).toBe(storeId);
        const member = await prisma.storeMembers.findUnique({
            where: { storeId_userId: { storeId, userId: inviteeId } },
        });
        expect(member?.role).toBe("EDITOR");
    });

    it("now lists the invitee as a member and excludes pending", async () => {
        const team = await members.listMembers(storeId, ownerId);
        expect(team.find((m) => m.email === ownerEmail)?.kind).toBe("owner");
        expect(team.find((m) => m.email === inviteeEmail)?.kind).toBe("member");
        const pending = await members.listInvitations(storeId, ownerId);
        expect(pending.some((i) => i.email === inviteeEmail)).toBe(false);
    });

    it("rejects inviting someone already on the team", async () => {
        await expect(
            members.createInvitation(storeId, ownerId, inviteeEmail, "VIEWER"),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("grants an EDITOR member store access (list + write)", async () => {
        const list = await stores.listForUser(inviteeId);
        expect(list.some((s) => s.id === storeId)).toBe(true);
        expect(await stores.canWrite(storeId, inviteeId)).toBe(true);
    });

    it("downgrades to VIEWER → read-only (no write)", async () => {
        await members.updateMemberRole(storeId, ownerId, inviteeId, "VIEWER");
        expect(await stores.canWrite(storeId, inviteeId)).toBe(false);
        // still readable
        await expect(
            stores.getForUser(storeId, inviteeId),
        ).resolves.not.toBeNull();
    });

    it("expires an old invitation on accept", async () => {
        const expired = await prisma.storeInvitation.create({
            data: {
                storeId,
                email: strangerEmail,
                role: "VIEWER",
                token: `expired-${process.pid}`,
                status: "PENDING",
                invitedById: ownerId,
                expiresAt: new Date(Date.now() - 1000),
            },
        });
        await expect(
            members.acceptInvitation(expired.token, {
                id: strangerId,
                email: strangerEmail,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("removes a member", async () => {
        await members.removeMember(storeId, ownerId, inviteeId);
        const gone = await prisma.storeMembers.findUnique({
            where: { storeId_userId: { storeId, userId: inviteeId } },
        });
        expect(gone).toBeNull();
    });
});
