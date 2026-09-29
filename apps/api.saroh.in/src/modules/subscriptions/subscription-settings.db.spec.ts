/**
 * "Members can pause from their account" (round-2 A8) against a real
 * Postgres: on by default, with or without a business profile; turned off
 * and on by someone who may change subscriptions; and it says whether the
 * account area is live at all. Runs in the integration project.
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { InvoicesService } from "../invoices/invoices.service";
import { membersCanPause } from "./subscription-settings";
import { SubscriptionsService } from "./subscriptions.service";

const service = new SubscriptionsService(new InvoicesService());
const originalSwitch = env.SITE_ACCOUNT_AREA;
let n = 0;

async function business(role: "OWNER" | "MEMBER" = "OWNER") {
    n += 1;
    const org = await prisma.organization.create({
        data: { name: "Pulse", slug: `a8-settings-${process.pid}-${n}` },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: "user_1",
        role,
    };
    return ctx;
}

afterEach(() => {
    env.SITE_ACCOUNT_AREA = originalSwitch;
});

describe("subscription settings (A8)", () => {
    it("is on by default, with no profile and with one made before it existed", async () => {
        const bare = await business();
        expect(await membersCanPause(bare.organizationId)).toBe(true);
        const withProfile = await business();
        await prisma.businessProfile.create({
            data: { organizationId: withProfile.organizationId },
        });
        expect(await membersCanPause(withProfile.organizationId)).toBe(true);
    });

    it("an owner turns it off and on; the profile is made if missing", async () => {
        env.SITE_ACCOUNT_AREA = "on";
        const ctx = await business();
        expect(await service.settings(ctx)).toEqual({
            membersCanPause: true,
            accountArea: true,
        });
        expect(
            await service.updateSettings(ctx, { membersCanPause: false }),
        ).toEqual({ membersCanPause: false, accountArea: true });
        expect(await membersCanPause(ctx.organizationId)).toBe(false);
        await service.updateSettings(ctx, { membersCanPause: true });
        expect(await membersCanPause(ctx.organizationId)).toBe(true);
    });

    it("says when the account area isn't live, so the workspace can leave the row out", async () => {
        env.SITE_ACCOUNT_AREA = undefined;
        const ctx = await business();
        expect((await service.settings(ctx)).accountArea).toBe(false);
    });

    it("someone who can't change subscriptions can't change it", async () => {
        const owner = await business();
        const member: OrganizationContext = { ...owner, role: "MEMBER" };
        await expect(
            service.updateSettings(member, { membersCanPause: false }),
        ).rejects.toThrow(ForbiddenException);
        expect(await membersCanPause(owner.organizationId)).toBe(true);
    });
});
