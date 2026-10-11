/**
 * "Updates in your customers' Messages" (12 Oct 2026) against a real
 * Postgres: on by default, with or without a business profile; turned off
 * and on by someone who manages messaging setup, and by nobody else;
 * offered only while the account area and the business's rollout flag are
 * on; and the rule the posts follow (`accountThreadOn`) reading all three.
 *
 * The rollout flag is turned on per business (an override), never for
 * everyone, so no other spec's flag row is touched. Only the app env is
 * stubbed (the account area's switch). Runs in the integration project.
 */
const mockEnv: Record<string, string | undefined> = {
    NODE_ENV: "test",
    SITE_ACCOUNT_AREA: "on",
};
jest.mock("../../env", () => ({ env: mockEnv }));

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FlagKey } from "../feature-flags/flags";
import { accountThreadOn, accountUpdatesChosen } from "./account-thread";
import { CommunicationsService } from "./communications.service";

const service = new CommunicationsService();
let n = 0;

async function business(
    role: "OWNER" | "ADMIN" | "MEMBER" = "OWNER",
): Promise<OrganizationContext> {
    n += 1;
    const org = await prisma.organization.create({
        data: {
            name: "Rye & Co.",
            slug: `account-updates-${process.pid}-${Date.now()}-${n}`,
        },
    });
    return { organizationId: org.id, userId: "user_1", role };
}

/** The `ACCOUNT_THREAD` rollout flag, for this business alone. */
async function rollout(organizationId: string, enabled: boolean) {
    const flagKey = FlagKey.ACCOUNT_THREAD;
    await prisma.featureFlag.upsert({
        where: { key: flagKey },
        create: { key: flagKey, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.upsert({
        where: { flagKey_organizationId: { flagKey, organizationId } },
        create: { flagKey, organizationId, enabled },
        update: { enabled },
    });
}

afterEach(() => {
    mockEnv.SITE_ACCOUNT_AREA = "on";
});

describe("the business's choice (real database)", () => {
    it("is on by default, with no profile and with one made before it existed", async () => {
        const bare = await business();
        expect(await accountUpdatesChosen(bare.organizationId)).toBe(true);
        const withProfile = await business();
        await prisma.businessProfile.create({
            data: { organizationId: withProfile.organizationId },
        });
        expect(await accountUpdatesChosen(withProfile.organizationId)).toBe(
            true,
        );
    });

    it("an owner turns it off and on; the profile is made if missing and nothing else on it moves", async () => {
        const ctx = await business();
        await rollout(ctx.organizationId, true);
        expect(await service.accountUpdates(ctx)).toEqual({
            on: true,
            offered: true,
            emailConnected: false,
        });
        expect(await service.setAccountUpdates(ctx, false)).toEqual({
            on: false,
            offered: true,
            emailConnected: false,
        });
        expect(await accountUpdatesChosen(ctx.organizationId)).toBe(false);

        await prisma.businessProfile.update({
            where: { organizationId: ctx.organizationId },
            data: { legalName: "Rye and Company" },
        });
        expect(await service.setAccountUpdates(ctx, true)).toMatchObject({
            on: true,
        });
        expect(
            await prisma.businessProfile.findUniqueOrThrow({
                where: { organizationId: ctx.organizationId },
                select: {
                    accountUpdates: true,
                    legalName: true,
                    membersCanPause: true,
                },
            }),
        ).toEqual({
            accountUpdates: true,
            legalName: "Rye and Company",
            membersCanPause: true,
        });
    });

    it("an admin may; a member may neither read nor change it", async () => {
        const admin = await business("ADMIN");
        expect(await service.setAccountUpdates(admin, false)).toMatchObject({
            on: false,
        });

        const member = await business("MEMBER");
        await expect(service.accountUpdates(member)).rejects.toThrow(
            ForbiddenException,
        );
        await expect(service.setAccountUpdates(member, false)).rejects.toThrow(
            ForbiddenException,
        );
        expect(await accountUpdatesChosen(member.organizationId)).toBe(true);
    });

    it("one business's choice is its own", async () => {
        const one = await business();
        const other = await business();
        await service.setAccountUpdates(one, false);
        expect(await accountUpdatesChosen(one.organizationId)).toBe(false);
        expect(await accountUpdatesChosen(other.organizationId)).toBe(true);
    });
});

describe("whether it is offered, and the rule the posts follow (real database)", () => {
    it("the three gates together", async () => {
        const ctx = await business();
        const id = ctx.organizationId;

        // The rollout flag off for this business: nothing to offer.
        await rollout(id, false);
        expect((await service.accountUpdates(ctx)).offered).toBe(false);
        expect(await accountThreadOn(id)).toBe(false);

        // On for it: offered, and posted to.
        await rollout(id, true);
        expect((await service.accountUpdates(ctx)).offered).toBe(true);
        expect(await accountThreadOn(id)).toBe(true);

        // The business turns its updates off: still offered, not posted to.
        await service.setAccountUpdates(ctx, false);
        expect((await service.accountUpdates(ctx)).offered).toBe(true);
        expect(await accountThreadOn(id)).toBe(false);

        // And on again.
        await service.setAccountUpdates(ctx, true);
        expect(await accountThreadOn(id)).toBe(true);

        // The account area off for the instance: neither, whatever it chose.
        mockEnv.SITE_ACCOUNT_AREA = "off";
        expect((await service.accountUpdates(ctx)).offered).toBe(false);
        expect(await accountThreadOn(id)).toBe(false);
    });

    it("a choice made before the thread is live is kept for when it is", async () => {
        const ctx = await business();
        await rollout(ctx.organizationId, false);
        await service.setAccountUpdates(ctx, false);
        await rollout(ctx.organizationId, true);
        expect(await service.accountUpdates(ctx)).toMatchObject({
            on: false,
            offered: true,
        });
        expect(await accountThreadOn(ctx.organizationId)).toBe(false);
    });
});
