/**
 * Someone stops being an owner of a business billed to their billing
 * profile (DEC-167, plan U7): moved to another role, removed or leaving.
 * Billing stays where it is — the business keeps its profile — and one
 * Admin › Billing › Needs action row (with the admin note beside it) tells
 * operators an owner should choose their own profile. Nothing is raised
 * when the person wasn't the profile's owner.
 * Runs in the integration project (TEST_DATABASE_URL).
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

import { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { AuditService } from "../audit/audit.service";
import { BILLING_PROFILE_OWNER_LEFT } from "../billing/billing-profile-owner";
import { OrganizationContextService } from "./organization-context.service";
import { OrganizationMembersService } from "./organization-members.service";

const tag = `${process.pid}-${Date.now()}`;
const audit = { record: jest.fn() } as unknown as AuditService;
const members = new OrganizationMembersService(audit);
const contexts = new OrganizationContextService();

let seq = 0;

async function person(label: string) {
    seq += 1;
    return (
        await prisma.user.create({
            data: { email: `${label}-${seq}-${tag}@example.com` },
        })
    ).id;
}

/**
 * A business with two owners, billed to the first one's profile; and the
 * profile's id.
 */
async function twoOwners() {
    const asha = await person("asha");
    const ravi = await person("ravi");
    seq += 1;
    const profile = await prisma.billingProfile.create({
        data: {
            ownerUserId: asha,
            legalName: "Asha Rao Enterprises",
            billingEmail: `accounts-${seq}-${tag}@example.com`,
            provider: "RAZORPAY",
            providerCustomerId: `cust_owner${seq}x${process.pid}`,
        },
    });
    const org = await prisma.organization.create({
        data: {
            name: `Two owners ${seq}`,
            slug: `two-owners-${seq}-${tag}`,
            billingProfileId: profile.id,
        },
    });
    await prisma.membership.createMany({
        data: [
            { organizationId: org.id, userId: asha, role: "OWNER" },
            { organizationId: org.id, userId: ravi, role: "OWNER" },
        ],
    });
    return { orgId: org.id, asha, ravi, profileId: profile.id };
}

const notices = (organizationId: string) =>
    prisma.billingAction.findMany({
        where: { organizationId, code: BILLING_PROFILE_OWNER_LEFT },
    });

async function expectBilledTo(organizationId: string, profileId: string) {
    const org = await prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { billingProfileId: true },
    });
    expect(org.billingProfileId).toBe(profileId);
    const profile = await prisma.billingProfile.findUniqueOrThrow({
        where: { id: profileId },
    });
    expect(profile.providerCustomerId).not.toBeNull();
}

beforeAll(() => {
    // The notice's ERROR line is expected here.
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
});

describe("the profile's owner stops being an owner (DEC-167)", () => {
    it("moved to Admin: one Needs action, billing unchanged", async () => {
        const b = await twoOwners();
        const ctx = await contexts.resolve(b.ravi, b.orgId);
        await members.updateRole(ctx, b.asha, { role: "ADMIN" });

        const rows = await notices(b.orgId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.refs).toEqual({
            billingProfileId: b.profileId,
            userId: b.asha,
        });
        expect(rows[0]!.note).toMatch(/still billed to the billing profile/);
        expect(rows[0]!.note).toMatch(/Plan & billing/);
        expect(
            await prisma.adminOrganizationNote.count({
                where: { organizationId: b.orgId },
            }),
        ).toBe(1);
        await expectBilledTo(b.orgId, b.profileId);
    });

    it("removed: one Needs action, billing unchanged", async () => {
        const b = await twoOwners();
        const ctx = await contexts.resolve(b.ravi, b.orgId);
        await members.remove(ctx, b.asha);

        expect(await notices(b.orgId)).toHaveLength(1);
        await expectBilledTo(b.orgId, b.profileId);
    });

    it("leaving: one Needs action, billing unchanged", async () => {
        const b = await twoOwners();
        const ctx = await contexts.resolve(b.asha, b.orgId);
        await members.leave(ctx);

        expect(await notices(b.orgId)).toHaveLength(1);
        await expectBilledTo(b.orgId, b.profileId);
    });

    it("raises nothing when the owner who goes isn't the profile's", async () => {
        const b = await twoOwners();
        const ctx = await contexts.resolve(b.asha, b.orgId);
        await members.updateRole(ctx, b.ravi, { role: "ADMIN" });
        await members.remove(ctx, b.ravi);

        expect(await notices(b.orgId)).toHaveLength(0);
        await expectBilledTo(b.orgId, b.profileId);
    });

    it("raises nothing when the last owner is refused", async () => {
        const b = await twoOwners();
        const ctx = await contexts.resolve(b.asha, b.orgId);
        await members.remove(ctx, b.ravi);
        await expect(
            members.updateRole(ctx, b.asha, { role: "ADMIN" }),
        ).rejects.toThrow(/only owner/);

        expect(await notices(b.orgId)).toHaveLength(0);
    });
});
