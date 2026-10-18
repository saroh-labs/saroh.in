/**
 * Billing profiles (DEC-167) through their service, against a real
 * Postgres and the fake billing provider (no Razorpay call is ever made):
 *
 * - only its owner reads or changes a profile; anyone else gets a 404;
 * - one billing email per owner, asked before anything is saved or sent;
 * - every save queues one `billing.profile.sync`, whose run makes the
 *   profile's customer once and then keeps it current;
 * - an edit says how many businesses it changes;
 * - the first business gets its owner's first profile at sign-up, and a
 *   save of Settings › Business no longer touches billing.
 *
 * Integration project (TEST_DATABASE_URL).
 */
import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import { OrganizationOnboardingService } from "../organizations/organization-onboarding.service";
import { OrganizationSettingsService } from "../organizations/organization-settings.service";
import { BillingProfileSyncHandler } from "./billing-customer";
import { BILLING_CUSTOMER_SYNC_TYPE } from "./billing-customer-sync";
import {
    BILLING_PROFILE_SYNC_MAX_ATTEMPTS,
    BILLING_PROFILE_SYNC_TYPE,
} from "./billing-profile-sync";
import {
    BILLING_EMAIL_TAKEN,
    BillingProfilesService,
    firstBillingProfileInTx,
} from "./billing-profiles.service";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";

const audit = new AuditService();
const onboarding = new OrganizationOnboardingService(audit);
const settings = new OrganizationSettingsService(audit, {} as MediaService);
const profiles = new BillingProfilesService();

let fake: FakeBillingProvider;
let handler: BillingProfileSyncHandler;

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

beforeEach(async () => {
    fake = new FakeBillingProvider();
    handler = new BillingProfileSyncHandler(
        new FakeBillingProviderFactory(fake),
    );
    await prisma.job.deleteMany({});
});

async function person(email = `${uniq("owner-")}@example.com`) {
    return prisma.user.create({ data: { email, name: "Asha Rao" } });
}

const syncJobs = (billingProfileId?: string) =>
    prisma.job.findMany({
        where: {
            type: BILLING_PROFILE_SYNC_TYPE,
            ...(billingProfileId
                ? {
                      payload: {
                          path: ["billingProfileId"],
                          equals: billingProfileId,
                      },
                  }
                : {}),
        },
    });

/** Run the profile's waiting sync, as the worker would, and mark it done. */
async function runSync(billingProfileId: string) {
    const waiting = (await syncJobs(billingProfileId)).filter(
        (j) => j.status === "PENDING",
    );
    expect(waiting).toHaveLength(1);
    await handler.handle(waiting[0]!);
    await prisma.job.update({
        where: { id: waiting[0]!.id },
        data: { status: "DONE" },
    });
}

const details = (billingEmail: string) => ({
    legalName: "Asha Foods LLP",
    gstin: "29ABCDE1234F1ZW",
    addressLine1: "3 Hill Road",
    city: "Bengaluru",
    postalCode: "560038",
    billingEmail,
    phone: "+91 98000 00000",
});

async function business(billingProfileId: string, name = "Asha's Kitchen") {
    return prisma.organization.create({
        data: { name, slug: uniq("asha-"), billingProfileId },
    });
}

describe("one billing email per owner (R3, AE1)", () => {
    it("refuses a second profile with an email the owner uses, in any case, before anything is saved or queued", async () => {
        const owner = await person();
        const email = `${uniq("accounts-")}@example.com`;
        await profiles.create(owner.id, details(email));
        await prisma.job.deleteMany({});

        const second = profiles.create(
            owner.id,
            details(`  ${email.toUpperCase()} `),
        );
        await expect(second).rejects.toBeInstanceOf(ConflictException);
        await expect(second).rejects.toMatchObject({
            response: {
                message: BILLING_EMAIL_TAKEN,
                details: { field: "billingEmail" },
            },
        });
        expect(
            await prisma.billingProfile.count({
                where: { ownerUserId: owner.id },
            }),
        ).toBe(1);
        expect(await syncJobs()).toHaveLength(0);
        expect(fake.customers.created).toHaveLength(0);
    });

    it("refuses an edit to the email of the owner's other profile, and lets another owner use it", async () => {
        const owner = await person();
        const a = await profiles.create(
            owner.id,
            details(`${uniq("a-")}@example.com`),
        );
        const b = await profiles.create(
            owner.id,
            details(`${uniq("b-")}@example.com`),
        );
        await expect(
            profiles.update(owner.id, b.id, { billingEmail: a.billingEmail }),
        ).rejects.toMatchObject({ response: { message: BILLING_EMAIL_TAKEN } });

        const other = await person();
        await expect(
            profiles.create(other.id, details(a.billingEmail)),
        ).resolves.toMatchObject({ billingEmail: a.billingEmail });
    });

    it("keeps the email trimmed and lower-case", async () => {
        const owner = await person();
        const made = await profiles.create(
            owner.id,
            details(` ${uniq("Mixed-")}@Example.COM `),
        );
        expect(made.billingEmail).toBe(made.billingEmail.trim().toLowerCase());
    });
});

describe("a profile's customer at the provider (R10, R11)", () => {
    it("a new profile queues one sync; its run makes one customer with the profile's details and notes naming it", async () => {
        const owner = await person();
        const email = `${uniq("make-")}@example.com`;
        const made = await profiles.create(owner.id, details(email));

        const queued = await syncJobs(made.id);
        expect(queued).toHaveLength(1);
        expect(queued[0]).toMatchObject({
            organizationId: null,
            maxAttempts: BILLING_PROFILE_SYNC_MAX_ATTEMPTS,
            payload: { billingProfileId: made.id },
        });
        expect(BILLING_PROFILE_SYNC_MAX_ATTEMPTS).toBeGreaterThanOrEqual(10);

        await runSync(made.id);
        expect(fake.customers.created).toEqual([
            {
                withContact: true,
                input: expect.objectContaining({
                    name: "Asha Foods LLP",
                    email,
                    contact: "+919800000000",
                    gstin: "29ABCDE1234F1ZW",
                    billingProfileId: made.id,
                    ownerUserId: owner.id,
                }),
            },
        ]);
        expect(
            await prisma.billingProfile.findUniqueOrThrow({
                where: { id: made.id },
            }),
        ).toMatchObject({
            providerCustomerId: `fake_cus_${made.id}`,
            contactWithheld: false,
            lastError: null,
        });
    });

    it("an edit of the GSTIN on a profile three businesses use says three, and updates the customer rather than making another (R9, AE3)", async () => {
        const owner = await person();
        const made = await profiles.create(
            owner.id,
            details(`${uniq("three-")}@example.com`),
        );
        await runSync(made.id);
        for (const name of ["Rohtak Gym", "Gurugram Gym", "Faridabad Gym"]) {
            await business(made.id, name);
        }

        const edited = await profiles.update(owner.id, made.id, {
            gstin: "29AAPFU0939F1ZR",
        });
        expect(edited.businesses).toBe(3);
        expect(edited.profile).toMatchObject({
            gstin: "29AAPFU0939F1ZR",
            businesses: 3,
        });
        // A second save before the job runs: still one waiting.
        await profiles.update(owner.id, made.id, { city: "Bangalore" });

        await runSync(made.id);
        expect(fake.customers.created).toHaveLength(1);
        expect(fake.customers.updated).toEqual([
            expect.objectContaining({
                providerCustomerId: `fake_cus_${made.id}`,
                withContact: true,
                input: expect.objectContaining({
                    gstin: "29AAPFU0939F1ZR",
                    businessName: "Rohtak Gym",
                }),
            }),
        ]);
    });

    it("two profiles of one owner with different emails and the same phone are two customers", async () => {
        const owner = await person();
        const a = await profiles.create(
            owner.id,
            details(`${uniq("gym-a-")}@example.com`),
        );
        const b = await profiles.create(
            owner.id,
            details(`${uniq("gym-b-")}@example.com`),
        );
        await runSync(a.id);
        await runSync(b.id);
        expect(fake.customers.created).toHaveLength(2);
        expect(fake.customers.created.map((c) => c.withContact)).toEqual([
            true,
            true,
        ]);
        const ids = await prisma.billingProfile.findMany({
            where: { id: { in: [a.id, b.id] } },
            select: { providerCustomerId: true, contactWithheld: true },
        });
        expect(new Set(ids.map((r) => r.providerCustomerId)).size).toBe(2);
        expect(ids.every((r) => !r.contactWithheld)).toBe(true);
    });
});

describe("only its owner (R2, AE6)", () => {
    it("another user reading or editing a profile gets a 404, and changes nothing", async () => {
        const owner = await person();
        const made = await profiles.create(
            owner.id,
            details(`${uniq("mine-")}@example.com`),
        );
        await prisma.job.deleteMany({});
        const teammate = await person();

        await expect(profiles.get(teammate.id, made.id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            profiles.update(teammate.id, made.id, { legalName: "Not Mine" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(await profiles.listMine(teammate.id)).toEqual([]);
        expect(
            await prisma.billingProfile.findUniqueOrThrow({
                where: { id: made.id },
            }),
        ).toMatchObject({ legalName: "Asha Foods LLP" });
        expect(await syncJobs()).toHaveLength(0);
    });

    it("lists the owner's own profiles, oldest first, with their businesses", async () => {
        const owner = await person();
        const a = await profiles.create(
            owner.id,
            details(`${uniq("first-")}@example.com`),
        );
        const b = await profiles.create(
            owner.id,
            details(`${uniq("second-")}@example.com`),
        );
        await business(a.id);
        await profiles.create(
            (await person()).id,
            details(`${uniq("theirs-")}@example.com`),
        );

        const mine = await profiles.listMine(owner.id);
        expect(mine.map((p) => [p.id, p.businesses])).toEqual([
            [a.id, 1],
            [b.id, 0],
        ]);
    });
});

describe("what a profile is made of (R1)", () => {
    it("names the field of a detail it can't take", async () => {
        const owner = await person();
        const email = `${uniq("bad-")}@example.com`;
        await expect(
            profiles.create(owner.id, { ...details(email), gstin: "29ABC" }),
        ).rejects.toMatchObject({ response: { details: { field: "gstin" } } });
        await expect(
            profiles.create(owner.id, { ...details(email), postalCode: "12" }),
        ).rejects.toMatchObject({
            response: { details: { field: "postalCode" } },
        });
        await expect(
            profiles.create(owner.id, { ...details("not-an-email") }),
        ).rejects.toMatchObject({
            response: { details: { field: "billingEmail" } },
        });
        await expect(
            profiles.create(owner.id, { ...details(email), legalName: " " }),
        ).rejects.toMatchObject({
            response: { details: { field: "legalName" } },
        });
        expect(
            await prisma.billingProfile.count({
                where: { ownerUserId: owner.id },
            }),
        ).toBe(0);
    });

    it("takes the state from the GSTIN when none is given, and refuses a GSTIN of another state", async () => {
        const owner = await person();
        const made = await profiles.create(
            owner.id,
            details(`${uniq("state-")}@example.com`),
        );
        expect(made.gstState).toBe("29");
        await expect(
            profiles.update(owner.id, made.id, { gstin: "27AAPFU0939F1ZV" }),
        ).rejects.toMatchObject({ response: { details: { field: "gstin" } } });
        // Cleared, it stays optional.
        await expect(
            profiles.update(owner.id, made.id, { gstin: "" }),
        ).resolves.toMatchObject({ profile: { gstin: null } });
    });
});

describe("the first business's profile (R6, F1)", () => {
    const onboard = (userId: string, name = "Asha's Kitchen") =>
        onboarding.onboard(userId, { name, address: uniq("asha-") });

    it("signing up makes one profile from the business, billed to the owner's email, with one sync queued", async () => {
        const email = `${uniq("First-")}@Example.com`;
        const owner = await person(email);
        const org = await onboard(owner.id);

        const mine = await prisma.billingProfile.findMany({
            where: { ownerUserId: owner.id },
        });
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({
            legalName: "Asha's Kitchen",
            billingEmail: email.toLowerCase(),
            provider: "RAZORPAY",
        });
        expect(
            await prisma.organization.findUniqueOrThrow({
                where: { id: org.id },
            }),
        ).toMatchObject({ billingProfileId: mine[0]!.id });
        expect(await syncJobs()).toHaveLength(1);
        // DEC-165's per-business job is no longer queued.
        expect(
            await prisma.job.count({
                where: { type: BILLING_CUSTOMER_SYNC_TYPE },
            }),
        ).toBe(0);
    });

    it("a later business of an owner with a profile gets none until it is chosen (U4)", async () => {
        const owner = await person();
        await onboard(owner.id);
        await prisma.job.deleteMany({});
        const later = await onboard(owner.id, "Asha's Bakery");

        expect(
            await prisma.billingProfile.count({
                where: { ownerUserId: owner.id },
            }),
        ).toBe(1);
        expect(
            (
                await prisma.organization.findUniqueOrThrow({
                    where: { id: later.id },
                })
            ).billingProfileId,
        ).toBeNull();
        expect(await syncJobs()).toHaveLength(0);
    });

    it("is made once: asked again for the same owner and email it hands back the profile, queueing nothing", async () => {
        const owner = await person();
        const org = await onboard(owner.id);
        await prisma.job.deleteMany({});
        const again = await prisma.$transaction((tx) =>
            firstBillingProfileInTx(tx, {
                ownerUserId: owner.id,
                organizationId: org.id,
            }),
        );
        const mine = await prisma.billingProfile.findMany({
            where: { ownerUserId: owner.id },
        });
        expect(mine).toHaveLength(1);
        expect(again).toBe(mine[0]!.id);
        expect(await syncJobs()).toHaveLength(0);
    });

    it("copies the business's details once; a save of Settings › Business later queues nothing (DEC-167)", async () => {
        const owner = await person();
        const org = await onboard(owner.id);
        const [profile] = await prisma.billingProfile.findMany({
            where: { ownerUserId: owner.id },
        });
        await runSync(profile!.id);

        await settings.update(
            { organizationId: org.id, userId: owner.id, role: "OWNER" },
            {
                name: "Asha's Kitchen and Bar",
                profile: {
                    legalName: "Asha Foods Pvt Ltd",
                    phone: "+919811111111",
                    taxId: "29ABCDE1234F1ZW",
                },
            },
        );
        expect(
            await prisma.job.count({
                where: {
                    type: {
                        in: [
                            BILLING_PROFILE_SYNC_TYPE,
                            BILLING_CUSTOMER_SYNC_TYPE,
                        ],
                    },
                    status: "PENDING",
                },
            }),
        ).toBe(0);
        expect(
            await prisma.billingProfile.findUniqueOrThrow({
                where: { id: profile!.id },
            }),
        ).toMatchObject({ legalName: "Asha's Kitchen", phone: null });
    });
});
