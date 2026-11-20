/**
 * Invitation mail counted per send (A-02), through the real invite and
 * withdraw paths: withdrawing and inviting again used to mail the same
 * stranger without end, since seats bound only the live invites. Runs in
 * the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        SITE_ACCOUNT_AREA: "off",
    },
}));
jest.mock("../../common/email", () => ({
    sendOrganizationInvitationEmail: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@saroh/database";

import { sendOrganizationInvitationEmail } from "../../common/email";
import type { AuditService } from "../audit/audit.service";
import { FixedWindowRateLimiter } from "../rate-limits/fixed-window";
import { InviteSendLimit } from "./invite-send-limit";
import { OrganizationContextService } from "./organization-context.service";
import { OrganizationMembersService } from "./organization-members.service";

const tag = `${process.pid}-${Date.now()}`;
const audit = { record: jest.fn() } as unknown as AuditService;
const members = new OrganizationMembersService(
    audit,
    new InviteSendLimit({
        business: new FixedWindowRateLimiter(100, 60_000),
        businessAddress: new FixedWindowRateLimiter(3, 60_000),
        address: new FixedWindowRateLimiter(100, 60_000),
        inviter: new FixedWindowRateLimiter(100, 60_000),
        overall: new FixedWindowRateLimiter(1000, 60_000),
    }),
);
const contexts = new OrganizationContextService();

it("refuses the fourth send to one address, withdrawn or not, and mails nothing for it", async () => {
    const owner = await prisma.user.create({
        data: { email: `a02-owner-${tag}@example.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Relay Test", slug: `a02-${tag}` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const ctx = await contexts.resolve(owner.id, org.id);
    const send = sendOrganizationInvitationEmail as jest.Mock;
    send.mockClear();
    const email = `a02-stranger-${tag}@example.com`;
    for (let i = 0; i < 3; i++) {
        const invite = await members.invite(ctx, { email, role: "MEMBER" });
        await members.revokeInvitation(ctx, invite.id);
    }
    await expect(
        members.invite(ctx, { email, role: "MEMBER" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(send).toHaveBeenCalledTimes(3);
});
