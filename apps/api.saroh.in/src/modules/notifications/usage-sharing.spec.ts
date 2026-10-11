// "Help improve Saroh" (DEC-125): the person's own choice, read and written
// for the session's user only, and nothing but a boolean accepted.
jest.mock("@saroh/database", () => ({
    prisma: {
        user: {
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
    },
}));

import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import { UpdateUsageSharingDto } from "./usage-sharing.dto";
import { UsageSharingService } from "./usage-sharing.service";

const db = prisma as unknown as { user: Record<string, jest.Mock> };

const ctx = {
    organizationId: "org_1",
    userId: "user_1",
    role: "STAFF",
} as unknown as OrganizationContext;

const SELECT = { sharesUsage: true, usageNoticeSeenAt: true };
const SEEN = new Date("2026-10-10T09:30:00.000Z");

describe("UsageSharingService (DEC-125)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("reads the session's own user, and only those two columns", async () => {
        db.user.findUnique.mockResolvedValue({
            sharesUsage: false,
            usageNoticeSeenAt: SEEN,
        });
        await expect(new UsageSharingService().read(ctx)).resolves.toEqual({
            sharesUsage: false,
            noticeSeenAt: SEEN.toISOString(),
        });
        expect(db.user.findUnique).toHaveBeenCalledWith({
            where: { id: "user_1" },
            select: SELECT,
        });
    });

    it("says null for someone who has never chosen", async () => {
        db.user.findUnique.mockResolvedValue({
            sharesUsage: null,
            usageNoticeSeenAt: null,
        });
        await expect(new UsageSharingService().read(ctx)).resolves.toEqual({
            sharesUsage: null,
            noticeSeenAt: null,
        });
        db.user.findUnique.mockResolvedValue(null);
        await expect(new UsageSharingService().read(ctx)).resolves.toEqual({
            sharesUsage: null,
            noticeSeenAt: null,
        });
    });

    it("keeps the first time the notice was dismissed, for the session's own user", async () => {
        db.user.updateMany.mockResolvedValue({ count: 1 });
        db.user.findUnique.mockResolvedValue({
            sharesUsage: null,
            usageNoticeSeenAt: SEEN,
        });
        await expect(
            new UsageSharingService().noticeSeen(ctx, SEEN),
        ).resolves.toEqual({
            sharesUsage: null,
            noticeSeenAt: SEEN.toISOString(),
        });
        // Only while it is still unset: a second dismissal changes nothing.
        expect(db.user.updateMany).toHaveBeenCalledWith({
            where: { id: "user_1", usageNoticeSeenAt: null },
            data: { usageNoticeSeenAt: SEEN },
        });
    });

    it.each([true, false])(
        "writes %s on the session's own user",
        async (sharesUsage) => {
            db.user.update.mockResolvedValue({
                sharesUsage,
                usageNoticeSeenAt: null,
            });
            await expect(
                new UsageSharingService().update(ctx, { sharesUsage }),
            ).resolves.toEqual({ sharesUsage, noticeSeenAt: null });
            expect(db.user.update).toHaveBeenCalledWith({
                where: { id: "user_1" },
                data: { sharesUsage },
                select: SELECT,
            });
        },
    );

    it("accepts a boolean and nothing else, and no other field", async () => {
        const pipe = new ValidationPipe(validationPipeOptions);
        const meta = { type: "body" as const, metatype: UpdateUsageSharingDto };
        await expect(
            pipe.transform({ sharesUsage: false }, meta),
        ).resolves.toEqual({ sharesUsage: false });
        for (const bad of [
            {},
            { sharesUsage: "no" },
            { sharesUsage: null },
            { sharesUsage: true, userId: "user_2" },
        ])
            await expect(pipe.transform(bad, meta)).rejects.toBeInstanceOf(
                BadRequestException,
            );
    });
});
