/**
 * Who Saroh bills for a new business (DEC-167, R6, R7), through onboarding
 * against a real Postgres:
 *
 * - a first business gets its owner's first profile, with one sync (F1);
 * - an owner with two or more profiles must choose: none is refused
 *   naming the choice, and nothing is made (AE2); with one, no choice
 *   (an app from before profiles) bills it to that one; their own
 *   profile bills it;
 * - a new profile is made with the business, or, with an email the owner
 *   already uses, neither is (AE7);
 * - another person's profile is a 404, and nothing is made.
 *
 * Integration project (TEST_DATABASE_URL).
 */
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { AuditService } from "../audit/audit.service";
import { BILLING_PROFILE_SYNC_TYPE } from "../billing/billing-profile-sync";
import {
    BILLING_EMAIL_TAKEN,
    BILLING_PROFILE_CHOICE_NEEDED,
} from "../billing/billing-profiles.service";
import type { OnboardOrganizationDto } from "./dto";
import { OrganizationOnboardingService } from "./organization-onboarding.service";

const onboarding = new OrganizationOnboardingService(new AuditService());

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

beforeEach(async () => {
    await prisma.job.deleteMany({});
});

async function person() {
    return prisma.user.create({
        data: { email: `${uniq("owner-")}@example.com`, name: "Asha Rao" },
    });
}

const onboard = (userId: string, extra: Partial<OnboardOrganizationDto> = {}) =>
    onboarding.onboard(userId, {
        name: "Asha's Kitchen",
        ...extra,
        address: uniq("asha-"),
    });

const syncJobs = () =>
    prisma.job.findMany({ where: { type: BILLING_PROFILE_SYNC_TYPE } });

const profilesOf = (ownerUserId: string) =>
    prisma.billingProfile.findMany({
        where: { ownerUserId },
        orderBy: { createdAt: "asc" },
    });

const businessesOf = (userId: string) =>
    prisma.organization.findMany({
        where: { memberships: { some: { userId } } },
        select: { id: true, name: true, billingProfileId: true },
    });

/** An owner with one business, billed to the profile it made. */
async function ownerWithOne() {
    const owner = await person();
    const first = await onboard(owner.id);
    const [profile] = await profilesOf(owner.id);
    await prisma.job.deleteMany({});
    return { owner, first, profile: profile! };
}

describe("a first business (R6, F1)", () => {
    it("gets one profile from its details, points at it, and queues one sync", async () => {
        const owner = await person();
        const org = await onboard(owner.id);

        const mine = await profilesOf(owner.id);
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({
            legalName: "Asha's Kitchen",
            billingEmail: owner.email,
        });
        expect(await businessesOf(owner.id)).toEqual([
            expect.objectContaining({
                id: org.id,
                billingProfileId: mine[0]!.id,
            }),
        ]);
        expect(await syncJobs()).toHaveLength(1);
    });

    it("may be billed to a new profile of its own instead, made from what was typed", async () => {
        const owner = await person();
        const org = await onboard(owner.id, {
            name: "Asha's Kitchen",
            newBillingProfile: {
                legalName: "Asha Foods LLP",
                billingEmail: "Accounts@Example.com",
                gstin: "29ABCDE1234F1ZW",
            },
        });

        const mine = await profilesOf(owner.id);
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({
            legalName: "Asha Foods LLP",
            billingEmail: "accounts@example.com",
            gstin: "29ABCDE1234F1ZW",
            gstState: "29",
        });
        expect(
            (await businessesOf(owner.id)).find((b) => b.id === org.id),
        ).toMatchObject({ billingProfileId: mine[0]!.id });
        expect(await syncJobs()).toHaveLength(1);
    });
});

describe("a later business must choose (R7)", () => {
    it("bills it to the owner's only profile when no choice was sent (an app from before profiles)", async () => {
        const { owner, profile } = await ownerWithOne();

        const later = await onboard(owner.id, { name: "Asha's Bakery" });

        expect(
            (await businessesOf(owner.id)).find((b) => b.id === later.id),
        ).toMatchObject({ billingProfileId: profile.id });
        expect(await profilesOf(owner.id)).toHaveLength(1);
        expect(await syncJobs()).toHaveLength(0);
    });

    it("refuses one with no choice from an owner with two profiles, naming it, and makes nothing (AE2)", async () => {
        const { owner, profile } = await ownerWithOne();
        const other = await prisma.billingProfile.create({
            data: {
                ownerUserId: owner.id,
                legalName: "Asha Foods LLP",
                billingEmail: `${uniq("accounts-")}@example.com`,
                provider: "RAZORPAY",
            },
        });

        const made = onboard(owner.id, { name: "Asha's Bakery" });
        await expect(made).rejects.toBeInstanceOf(BadRequestException);
        await expect(made).rejects.toMatchObject({
            response: {
                message: BILLING_PROFILE_CHOICE_NEEDED,
                details: { field: "billingProfile" },
            },
        });
        expect(await businessesOf(owner.id)).toHaveLength(1);
        expect(await profilesOf(owner.id)).toEqual([
            expect.objectContaining({ id: profile.id }),
            expect.objectContaining({ id: other.id }),
        ]);
        expect(await syncJobs()).toHaveLength(0);
    });

    it("bills it to the owner's own profile when chosen, and makes no other (AE2)", async () => {
        const { owner, profile } = await ownerWithOne();

        const later = await onboard(owner.id, {
            name: "Asha's Bakery",
            billingProfileId: profile.id,
        });

        expect(
            (await businessesOf(owner.id)).find((b) => b.id === later.id),
        ).toMatchObject({ billingProfileId: profile.id });
        expect(await profilesOf(owner.id)).toHaveLength(1);
        expect(await syncJobs()).toHaveLength(0);
    });

    it("makes a new profile with it, and queues its sync (F2)", async () => {
        const { owner, profile } = await ownerWithOne();

        const later = await onboard(owner.id, {
            name: "Asha's Gym Gurugram",
            newBillingProfile: {
                legalName: "Asha Fitness Haryana LLP",
                billingEmail: `${uniq("haryana-")}@example.com`,
                gstState: "06",
                addressLine1: "12 Sohna Road",
                city: "Gurugram",
                postalCode: "122018",
            },
        });

        const mine = await profilesOf(owner.id);
        expect(mine).toHaveLength(2);
        const made = mine.find((p) => p.id !== profile.id)!;
        expect(made).toMatchObject({
            legalName: "Asha Fitness Haryana LLP",
            gstState: "06",
            city: "Gurugram",
        });
        expect(
            (await businessesOf(owner.id)).find((b) => b.id === later.id),
        ).toMatchObject({ billingProfileId: made.id });
        const jobs = await syncJobs();
        expect(jobs).toHaveLength(1);
        expect(jobs[0]!.payload).toMatchObject({ billingProfileId: made.id });
    });

    it("refuses a new profile with an email the owner already uses, in any case, and makes neither (AE7)", async () => {
        const { owner, profile } = await ownerWithOne();

        const made = onboard(owner.id, {
            name: "Asha's Bakery",
            newBillingProfile: {
                legalName: "Asha Bakes LLP",
                billingEmail: ` ${profile.billingEmail.toUpperCase()} `,
            },
        });
        await expect(made).rejects.toBeInstanceOf(ConflictException);
        await expect(made).rejects.toMatchObject({
            response: {
                message: BILLING_EMAIL_TAKEN,
                details: { field: "billingEmail" },
            },
        });
        expect(await businessesOf(owner.id)).toHaveLength(1);
        expect(await profilesOf(owner.id)).toHaveLength(1);
        expect(await syncJobs()).toHaveLength(0);
    });

    it("names the field of a new profile's detail it can't take, and makes nothing", async () => {
        const { owner } = await ownerWithOne();

        await expect(
            onboard(owner.id, {
                name: "Asha's Bakery",
                newBillingProfile: {
                    legalName: "Asha Bakes LLP",
                    billingEmail: `${uniq("bakes-")}@example.com`,
                    postalCode: "5600",
                },
            }),
        ).rejects.toMatchObject({
            response: { details: { field: "postalCode" } },
        });
        expect(await businessesOf(owner.id)).toHaveLength(1);
        expect(await profilesOf(owner.id)).toHaveLength(1);
    });

    it("refuses another person's profile as if it didn't exist, and makes nothing", async () => {
        const { profile: theirs } = await ownerWithOne();
        const { owner } = await ownerWithOne();

        const made = onboard(owner.id, {
            name: "Asha's Bakery",
            billingProfileId: theirs.id,
        });
        await expect(made).rejects.toBeInstanceOf(NotFoundException);
        await expect(made).rejects.toMatchObject({
            response: { details: { field: "billingProfile" } },
        });
        expect(await businessesOf(owner.id)).toHaveLength(1);
        expect(
            await prisma.organization.count({
                where: { billingProfileId: theirs.id },
            }),
        ).toBe(1);
    });

    it("refuses another person's profile from someone with none, rather than make their first", async () => {
        const { profile: theirs } = await ownerWithOne();
        const newcomer = await person();

        await expect(
            onboard(newcomer.id, { billingProfileId: theirs.id }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(await businessesOf(newcomer.id)).toHaveLength(0);
        expect(await profilesOf(newcomer.id)).toHaveLength(0);
    });
});
