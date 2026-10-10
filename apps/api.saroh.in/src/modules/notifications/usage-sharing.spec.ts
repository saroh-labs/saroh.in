// "Help improve Saroh" (DEC-125): the person's own choice, read and written
// for the session's user only, and nothing but a boolean accepted.
jest.mock("@saroh/database", () => ({
    prisma: { user: { findUnique: jest.fn(), update: jest.fn() } },
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

describe("UsageSharingService (DEC-125)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("reads the session's own user, and only that column", async () => {
        db.user.findUnique.mockResolvedValue({ sharesUsage: false });
        await expect(new UsageSharingService().read(ctx)).resolves.toEqual({
            sharesUsage: false,
        });
        expect(db.user.findUnique).toHaveBeenCalledWith({
            where: { id: "user_1" },
            select: { sharesUsage: true },
        });
    });

    it("says null for someone who has never chosen", async () => {
        db.user.findUnique.mockResolvedValue({ sharesUsage: null });
        await expect(new UsageSharingService().read(ctx)).resolves.toEqual({
            sharesUsage: null,
        });
        db.user.findUnique.mockResolvedValue(null);
        await expect(new UsageSharingService().read(ctx)).resolves.toEqual({
            sharesUsage: null,
        });
    });

    it.each([true, false])(
        "writes %s on the session's own user",
        async (sharesUsage) => {
            db.user.update.mockResolvedValue({ sharesUsage });
            await expect(
                new UsageSharingService().update(ctx, { sharesUsage }),
            ).resolves.toEqual({ sharesUsage });
            expect(db.user.update).toHaveBeenCalledWith({
                where: { id: "user_1" },
                data: { sharesUsage },
                select: { sharesUsage: true },
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
