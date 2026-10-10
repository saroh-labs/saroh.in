/**
 * A deleted business against a real Postgres (#921): the deletion sweep
 * queues its clean-up, the clean-up shuts its access off — Saroh's
 * subscription at the provider, custom hostnames, payment keys, pending
 * jobs — and keeps its data and its files for the 180 days (DEC-119); its
 * site answers as never published and its members are refused. On legal
 * hold the clean-up removes nothing. A business inside its window is charged no
 * renewal but keeps its site and its door. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PublicSiteOnlineGuard } from "../../common/guards/public-site-online.guard";
import {
    assertBillingMayStart,
    DeletedBusinessBilling,
} from "../billing/business-closing";
import type { EntitlementService } from "../billing/entitlement.service";
import { BILLING_PROVIDER_CANCEL_TYPE } from "../billing/provider-cancel.job";
import type { BillingProviderFactory } from "../billing/providers/billing-provider.port";
import type { ModuleLifecycleService } from "../capabilities/module-lifecycle.service";
import type { DomainVerifier } from "../domains/domain-verifier";
import { DomainsService } from "../domains/domains.service";
import { FakeDomainHosting } from "../domains/providers/fake-hosting";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { resolveSiteHost } from "../site-accounts/site-host";
import { siteRootDomain } from "../sites/site-host-mode";
import { SitesService } from "../sites/sites.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminLifecycleService } from "./admin-lifecycle.service";
import {
    ORGANIZATION_DELETION_CLEANUP_TYPE,
    OrganizationDeletionCleanupHandler,
} from "./organization-deletion-cleanup.handler";
import { OrganizationDeletionHandler } from "./organization-deletion.handler";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;
const DAY = 86_400_000;

const cancelSubscription = jest.fn(async () => undefined);
const providers = {
    get: jest.fn(() => ({ cancelSubscription })),
} as unknown as BillingProviderFactory;
const storage = createMemoryStorage();
const hosting = new FakeDomainHosting();
const domains = new DomainsService(
    {} as DomainVerifier,
    {} as EntitlementService,
    hosting,
);
const cleanup = new OrganizationDeletionCleanupHandler(
    new DeletedBusinessBilling(providers),
    domains,
);
const sweep = new OrganizationDeletionHandler(new AdminAuditService());
const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);
const contexts = new OrganizationContextService();

/** A business with everything a deletion has to deal with. */
async function business(lifecycleStatus: string) {
    const owner = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.com`, name: "Owner" },
    });
    const org = await prisma.organization.create({
        data: {
            name: "Rye",
            slug: uniq("rye"),
            lifecycleStatus,
            deletionScheduledAt:
                lifecycleStatus === "PENDING_DELETION"
                    ? new Date(Date.now() - DAY)
                    : null,
            deletionScheduledBy:
                lifecycleStatus === "PENDING_DELETION" ? "staff_1" : null,
        },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const plan = await prisma.plan.create({
        data: {
            key: uniq("pro"),
            name: "Pro",
            priceCents: 99_900,
            currency: "INR",
            interval: "month",
            entitlements: {},
            // Never offered: a fixture, not a plan anyone could pick.
            active: false,
        },
    });
    const sub = await prisma.subscription.create({
        data: {
            organizationId: org.id,
            planId: plan.id,
            status: "ACTIVE",
            provider: "RAZORPAY",
            providerSubscriptionId: uniq("rzp_sub"),
            currentPeriodEnd: new Date(Date.now() + 10 * DAY),
        },
    });
    const subdomain = uniq("rye");
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Rye",
            slug: uniq("site"),
            subdomain,
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            snapshot: { pages: [] },
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    const hostname = `${uniq("shop")}.example.com`;
    const hosted = await hosting.register(hostname);
    await prisma.domain.create({
        data: {
            organizationId: org.id,
            siteId: site.id,
            hostname,
            status: "VERIFIED",
            verificationToken: "t",
            verifiedAt: new Date(),
            hostingId: hosted.id,
            hostingStatus: "ACTIVE",
        },
    });
    const upload = await storage.createSignedUploadUrl({
        organizationId: org.id,
        contentType: "image/png",
        contentLength: 2048,
        filename: "photo.png",
    });
    await prisma.media.create({
        data: {
            organizationId: org.id,
            key: upload.key,
            contentType: "image/png",
            sizeBytes: 2048,
            filename: "photo.png",
            status: "READY",
        },
    });
    await prisma.merchantPaymentProvider.create({
        data: {
            organizationId: org.id,
            provider: "RAZORPAY",
            encryptedCredentials: "sealed",
            credentialsIv: "iv",
            credentialsAuthTag: "tag",
        },
    });
    const pendingJob = await prisma.job.create({
        data: {
            organizationId: org.id,
            type: "enquiry.notify",
            payload: {},
        },
    });
    const providerCancel = await prisma.job.create({
        data: {
            organizationId: org.id,
            type: BILLING_PROVIDER_CANCEL_TYPE,
            payload: {},
            runAt: new Date(Date.now() + DAY),
        },
    });
    const contact = await prisma.contact.create({
        data: {
            organizationId: org.id,
            firstName: "Asha",
            email: `${uniq("asha")}@example.com`,
        },
    });
    return {
        org,
        owner,
        sub,
        site,
        subdomain,
        hostname,
        key: upload.key,
        pendingJob,
        providerCancel,
        contact,
    };
}

beforeEach(() => {
    cancelSubscription.mockClear();
});

describe("the deletion sweep queues the clean-up (#921)", () => {
    it("on the transaction that marks the business deleted", async () => {
        const b = await business("PENDING_DELETION");
        expect(await sweep.deleteOne(b.org.id, new Date())).toBe(true);
        const queued = await prisma.job.findMany({
            where: {
                organizationId: b.org.id,
                type: ORGANIZATION_DELETION_CLEANUP_TYPE,
            },
        });
        expect(queued).toHaveLength(1);
        expect(queued[0]?.maxAttempts).toBeGreaterThan(5);
    });
});

describe("the clean-up of a deleted business (#921)", () => {
    it("shuts its access off and keeps its data and its files (DEC-119)", async () => {
        const b = await business("DELETED_RETAINED");

        const result = await cleanup.run(b.org.id);

        expect(result.failed).toEqual([]);
        // Saroh's subscription: cancelled at the provider now, then recorded.
        expect(cancelSubscription).toHaveBeenCalledWith(
            b.sub.providerSubscriptionId,
            { atCycleEnd: false },
        );
        const sub = await prisma.subscription.findUniqueOrThrow({
            where: { id: b.sub.id },
        });
        expect(sub.status).toBe("CANCELLED");
        // Its custom hostname gone from the host, its claim released.
        expect(
            [...hosting.hostnames.values()].some(
                (h) => h.hostname === b.hostname,
            ),
        ).toBe(false);
        expect(
            await prisma.domain.count({ where: { organizationId: b.org.id } }),
        ).toBe(0);
        // Its files stay, in storage and as rows: they go with its data,
        // 180 days on (`organization.retention.erase`). Until DEC-119 this
        // run deleted them on day one.
        expect(storage.has(b.key)).toBe(true);
        expect(
            await prisma.media.count({ where: { organizationId: b.org.id } }),
        ).toBe(1);
        expect(result.counts).not.toHaveProperty("mediaRemoved");
        // Its payment keys go at once: secrets, not records.
        expect(
            await prisma.merchantPaymentProvider.count({
                where: { organizationId: b.org.id },
            }),
        ).toBe(0);
        // Its pending jobs called off — but Saroh's own provider cancel runs.
        const jobs = await prisma.job.findMany({
            where: { id: { in: [b.pendingJob.id, b.providerCancel.id] } },
            select: { id: true, status: true },
        });
        expect(Object.fromEntries(jobs.map((j) => [j.id, j.status]))).toEqual({
            [b.pendingJob.id]: "CANCELLED",
            [b.providerCancel.id]: "PENDING",
        });
        // Kept: the business, its customers with their details, its site row.
        expect(
            await prisma.organization.count({ where: { id: b.org.id } }),
        ).toBe(1);
        expect(
            await prisma.contact.findUniqueOrThrow({
                where: { id: b.contact.id },
                select: { firstName: true, removedAt: true },
            }),
        ).toEqual({ firstName: "Asha", removedAt: null });
        expect(await prisma.site.count({ where: { id: b.site.id } })).toBe(1);
    });

    it("removes nothing of a business on legal hold, and runs when the hold is lifted (DEC-119)", async () => {
        const b = await business("DELETED_RETAINED");
        await prisma.organization.update({
            where: { id: b.org.id },
            data: {
                legalHoldAt: new Date(),
                legalHoldReason: "Police notice 14/2026",
                legalHoldByUserId: "staff_1",
            },
        });

        const held = await cleanup.run(b.org.id);

        expect(held.ran).toBe(false);
        expect(held.failed).toEqual([]);
        expect(held.held).toEqual([
            "jobs",
            "billing",
            "domains",
            "memberships",
            "keys",
        ]);
        expect(cancelSubscription).not.toHaveBeenCalled();
        expect(
            [...hosting.hostnames.values()].some(
                (h) => h.hostname === b.hostname,
            ),
        ).toBe(true);
        expect(
            await prisma.domain.count({ where: { organizationId: b.org.id } }),
        ).toBe(1);
        expect(
            await prisma.merchantPaymentProvider.count({
                where: { organizationId: b.org.id },
            }),
        ).toBe(1);
        expect(
            (
                await prisma.job.findUniqueOrThrow({
                    where: { id: b.pendingJob.id },
                })
            ).status,
        ).toBe("PENDING");
        expect(storage.has(b.key)).toBe(true);
        // Said on the ledger, for the console's deletion trail.
        const noted = await prisma.adminAuditEvent.findFirst({
            where: {
                organizationId: b.org.id,
                action: "organization.deletion.cleanup",
            },
            orderBy: { createdAt: "desc" },
        });
        expect(noted?.outcome).toBe("FAILURE");
        expect(noted?.metadata).toMatchObject({ legalHold: true });

        // A Platform Owner lifts it: the clean-up is queued again and runs.
        const owner: PlatformAdminInfo = {
            userId: "staff_owner",
            platformAdminId: null,
            roles: ["PLATFORM_OWNER"],
            permissions: [],
            viaBootstrap: true,
        };
        await new AdminLifecycleService(
            new AdminAuditService(),
            {} as ModuleLifecycleService,
            {} as EntitlementService,
        ).liftLegalHold({
            staff: owner,
            organizationId: b.org.id,
            reason: "Case closed, order of 2 Dec",
        });
        expect(
            await prisma.job.count({
                where: {
                    organizationId: b.org.id,
                    type: ORGANIZATION_DELETION_CLEANUP_TYPE,
                    status: "PENDING",
                },
            }),
        ).toBe(1);

        const after = await cleanup.run(b.org.id);
        expect(after.ran).toBe(true);
        expect(after.held).toEqual([]);
        expect(
            await prisma.merchantPaymentProvider.count({
                where: { organizationId: b.org.id },
            }),
        ).toBe(0);
        expect(
            await prisma.domain.count({ where: { organizationId: b.org.id } }),
        ).toBe(0);
        // Still its files: those wait for the eraser.
        expect(storage.has(b.key)).toBe(true);
    });

    it("runs again safely: nothing left to do, nothing asked of the provider", async () => {
        const b = await business("DELETED_RETAINED");
        await cleanup.run(b.org.id);
        cancelSubscription.mockClear();

        const again = await cleanup.run(b.org.id);

        expect(again.failed).toEqual([]);
        expect(again.counts).toMatchObject({
            jobsCancelled: 0,
            billingSubscriptionCancelled: 0,
            domainsReleased: 0,
            keysDeleted: 0,
        });
        expect(cancelSubscription).not.toHaveBeenCalled();
    });

    it("leaves the subscription as it is when the provider doesn't answer, and says so", async () => {
        const b = await business("DELETED_RETAINED");
        cancelSubscription.mockRejectedValueOnce(new Error("timeout"));

        const result = await cleanup.run(b.org.id);

        expect(result.failed).toEqual(["billing"]);
        const sub = await prisma.subscription.findUniqueOrThrow({
            where: { id: b.sub.id },
        });
        expect(sub.status).toBe("ACTIVE");
        // The other steps still ran.
        expect(
            await prisma.domain.count({ where: { organizationId: b.org.id } }),
        ).toBe(0);
        expect(
            await prisma.merchantPaymentProvider.count({
                where: { organizationId: b.org.id },
            }),
        ).toBe(0);
    });

    it.each(["ACTIVE", "PENDING_DELETION"])(
        "touches nothing of a %s business",
        async (state) => {
            const b = await business(state);
            const result = await cleanup.run(b.org.id);
            expect(result.ran).toBe(false);
            expect(cancelSubscription).not.toHaveBeenCalled();
            expect(storage.has(b.key)).toBe(true);
            expect(
                await prisma.domain.count({
                    where: { organizationId: b.org.id },
                }),
            ).toBe(1);
        },
    );
});

describe("a deleted business is offline and closed (#921)", () => {
    it("its site answers as never published, from every address", async () => {
        const b = await business("DELETED_RETAINED");
        await expect(
            sites.getPublicationBySubdomain(b.subdomain),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            sites.getPublicationBySiteId(b.site.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            resolveSiteHost(`${b.subdomain}.${siteRootDomain()}`),
        ).rejects.toBeInstanceOf(NotFoundException);
        const guard = new PublicSiteOnlineGuard();
        await expect(
            guard.canActivate({
                switchToHttp: () => ({
                    getRequest: () => ({ params: { siteId: b.site.id } }),
                }),
            } as never),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("its members can't open it, and it isn't listed for them", async () => {
        const b = await business("DELETED_RETAINED");
        await expect(
            contexts.resolve(b.owner.id, b.org.id),
        ).rejects.toBeInstanceOf(ForbiddenException);
        const listed = await contexts.listForUser(b.owner.id);
        expect(listed.map((o) => o.id)).not.toContain(b.org.id);
    });

    it("nothing that charges can start", async () => {
        const b = await business("DELETED_RETAINED");
        await expect(
            assertBillingMayStart(prisma, b.org.id),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe("inside the window (#921)", () => {
    it("keeps its site and its door, and charges nothing new", async () => {
        const b = await business("PENDING_DELETION");
        await expect(
            sites.getPublicationBySubdomain(b.subdomain),
        ).resolves.toMatchObject({ siteId: b.site.id });
        await expect(
            contexts.resolve(b.owner.id, b.org.id),
        ).resolves.toMatchObject({ organizationId: b.org.id });
        await expect(
            assertBillingMayStart(prisma, b.org.id),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("scheduling deletion ends the provider subscription with the period paid", async () => {
        const b = await business("ACTIVE");
        const lifecycle = new AdminLifecycleService(
            new AdminAuditService(),
            {} as ModuleLifecycleService,
            {} as EntitlementService,
        );
        await lifecycle.scheduleDeletion({
            organizationId: b.org.id,
            staff: { userId: "staff_1" } as PlatformAdminInfo,
            reason: "Owner asked",
            idempotencyKey: uniq("key"),
            confirmName: "Rye",
            retentionDays: 30,
        } as never);

        const sub = await prisma.subscription.findUniqueOrThrow({
            where: { id: b.sub.id },
        });
        expect(sub.cancelAtPeriodEnd).toBe(true);
        expect(sub.status).toBe("ACTIVE");
        const cancels = await prisma.job.findMany({
            where: {
                organizationId: b.org.id,
                type: BILLING_PROVIDER_CANCEL_TYPE,
                payload: {
                    path: ["providerSubscriptionId"],
                    equals: b.sub.providerSubscriptionId,
                },
            },
        });
        expect(cancels).toHaveLength(1);
        expect(cancels[0]?.payload).toMatchObject({ atCycleEnd: true });
    });
});
